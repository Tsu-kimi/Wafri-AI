"""
backend/routers/farmers.py

FastAPI router: farmer authentication and PIN lifecycle endpoints.

Endpoints:
    POST /farmers/login
        Authenticate a farmer with phone number + 6-digit PIN.
        Verifies the PIN hash, links the session to the farmer, and returns
        the farmer's profile so the frontend can redirect to the main session.

    POST /farmers/pin
        Set or configure the farmer's 6-digit PIN (first-time setup or after
        a successful OTP reset). Called from the login page when pin_set is False.

    POST /farmers/pin/reset/request
        Send a PIN reset OTP via Termii SMS to the farmer's registered phone.

    POST /farmers/pin/reset/verify
        Verify the OTP and, on success, hash and store the new PIN.

Security:
    - All phone number inputs are validated as E.164 before any service call.
    - PIN values NEVER appear in any log record or error response.
    - All endpoints require a valid wafrivet_session cookie via get_session.
    - Rate limiting on /login and /otp endpoints via PinService and OtpService
      lockout mechanisms (Redis-backed).
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.auth.dependencies import get_session
from backend.services import farmer_service, otp_service, pin_service
from backend.services.session_state_service import transition_to_active

log = logging.getLogger("wafrivet.routers.farmers")

router = APIRouter(prefix="/farmers", tags=["farmers"])

# ── Request / response models ─────────────────────────────────────────────────

_PHONE_PATTERN = r"^\+[1-9]\d{6,14}$"
_PIN_PATTERN = r"^\d{6}$"


class LoginRequest(BaseModel):
    phone_number: str = Field(
        ...,
        pattern=_PHONE_PATTERN,
        description="E.164 formatted phone number e.g. +2348012345678",
    )
    pin: str = Field(..., pattern=_PIN_PATTERN, description="Exactly 6 digits.")


class LoginResponse(BaseModel):
    farmer_id: str
    phone_number: str
    name: Optional[str]
    pin_set: bool
    needs_pin_setup: bool = False
    message: str


class SetPinRequest(BaseModel):
    phone_number: str = Field(..., pattern=_PHONE_PATTERN)
    pin: str = Field(..., pattern=_PIN_PATTERN, description="Exactly 6 digits.")


class SetPinResponse(BaseModel):
    ok: bool


class OtpRequestBody(BaseModel):
    phone_number: str = Field(..., pattern=_PHONE_PATTERN)


class OtpRequestResponse(BaseModel):
    sent: bool
    message: str


class OtpVerifyRequest(BaseModel):
    phone_number: str = Field(..., pattern=_PHONE_PATTERN)
    otp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    new_pin: str = Field(..., pattern=_PIN_PATTERN)


class OtpVerifyResponse(BaseModel):
    ok: bool
    message: str


# ── Routes ────────────────────────────────────────────────────────────────────


@router.post(
    "/login",
    status_code=status.HTTP_200_OK,
    response_model=LoginResponse,
    summary="Authenticate farmer with phone + PIN",
)
async def login_farmer(
    body: LoginRequest,
    session_id: str = Depends(get_session),
) -> dict:
    """
    Verify phone + PIN and link the current session to the farmer.

    On success:
        - Updates sessions.phone_number so the WebSocket server can populate
          farmer_phone in ADK initial_state on connection.
        - Returns the farmer's profile (id, name, phone_number, pin_set).

    On failure:
        - Returns 401 with remaining attempt count or lockout info.

    PIN value is NEVER logged.
    """
    try:
        result = await pin_service.verify_pin(
            phone_number=body.phone_number,
            raw_pin=body.pin,
            session_id=session_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception:
        log.exception("login_verify_failed", extra={"session_id": session_id})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Login failed. Please try again.",
        )

    if result.get("locked"):
        lockout_seconds = result.get("lockout_seconds", 0)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Account locked. Try again in {lockout_seconds} seconds.",
        )

    if result.get("no_pin"):
        # Farmer exists but has never set a PIN — send them to setup.
        return {
            "farmer_id": "",
            "phone_number": body.phone_number,
            "name": None,
            "pin_set": False,
            "needs_pin_setup": True,
            "message": "PIN not set. Please create your PIN.",
        }

    if not result.get("verified"):
        attempt = result.get("attempt", 0)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Incorrect PIN. Attempt {attempt}.",
        )

    farmer = result.get("farmer") or {}

    # Link the auth session to the farmer's phone number so the WebSocket
    # server can read it when the user opens a new session.
    try:
        await farmer_service.upsert_by_phone(
            phone_number=body.phone_number,
            session_id=session_id,
        )
    except Exception:
        log.exception("login_session_link_failed", extra={"session_id": session_id})
        # Non-fatal — farmer is authenticated even if we can't update the session row.

    log.info(
        "farmer_logged_in",
        extra={"session_id": session_id, "farmer_id": str(farmer.get("id", ""))},
    )
    return {
        "farmer_id": str(farmer.get("id", "")),
        "phone_number": body.phone_number,
        "name": farmer.get("name"),
        "pin_set": True,
        "needs_pin_setup": False,
        "message": "Login successful.",
    }


@router.post(
    "/pin",
    status_code=status.HTTP_200_OK,
    response_model=SetPinResponse,
    summary="Set the farmer's 6-digit PIN (first-time setup)",
)
async def set_farmer_pin(
    body: SetPinRequest,
    session_id: str = Depends(get_session),
) -> dict:
    """
    Hash and store the PIN for *phone_number*.

    Called from the login page when pin_set is False (new farmer, first PIN).
    The farmer row is upserted so this also serves as registration.
    The confirmation match is verified client-side; server-side only validates format.

    PIN value is NEVER logged.
    """
    try:
        # Ensure farmer row exists before setting PIN.
        await farmer_service.upsert_by_phone(
            phone_number=body.phone_number,
            session_id=session_id,
        )
        await pin_service.set_pin(
            phone_number=body.phone_number,
            raw_pin=body.pin,
            session_id=session_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception:
        log.exception("set_pin_failed", extra={"session_id": session_id})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PIN could not be saved. Please try again.",
        )

    log.info("pin_set_ok", extra={"session_id": session_id})
    return {"ok": True}


@router.post(
    "/pin/reset/request",
    status_code=status.HTTP_200_OK,
    response_model=OtpRequestResponse,
    summary="Request a PIN reset OTP SMS",
)
async def request_pin_reset(
    body: OtpRequestBody,
    session_id: str = Depends(get_session),
) -> dict:
    """
    Generate and dispatch a 6-digit OTP to the farmer's registered phone.

    The OTP is stored in Redis with a 10-minute TTL. Call /farmers/pin/reset/verify
    with the OTP and new PIN to complete the reset.
    """
    try:
        sent = await otp_service.send_reset_otp(phone_number=body.phone_number)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception:
        log.exception("otp_request_failed", extra={"session_id": session_id})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OTP could not be dispatched. Please try again.",
        )

    if not sent:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="SMS delivery failed. Please check the phone number and try again.",
        )

    log.info("otp_dispatched", extra={"session_id": session_id})
    return {"sent": True, "message": "OTP sent to your registered phone number."}


@router.post(
    "/pin/reset/verify",
    status_code=status.HTTP_200_OK,
    response_model=OtpVerifyResponse,
    summary="Verify OTP and set new PIN",
)
async def verify_otp_and_reset_pin(
    body: OtpVerifyRequest,
    session_id: str = Depends(get_session),
) -> dict:
    """
    Verify the OTP and, on success, hash and store the new PIN.

    Full reset sequence:
        1. Verify the OTP with constant-time compare (hmac.compare_digest).
        2. Delete the OTP key immediately (single-use).
        3. Hash the new PIN with bcrypt (work factor ≥ 12).
        4. Clear the failed_pin_attempts counter and locked_until.
        5. Mark the session as ACTIVE in Redis.

    The OTP value is NEVER logged. The PIN value is NEVER logged.
    """
    try:
        otp_valid = await otp_service.verify_otp(
            phone_number=body.phone_number,
            otp_guess=body.otp,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception:
        log.exception("otp_verify_error", extra={"session_id": session_id})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="OTP verification failed. Please try again.",
        )

    if not otp_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired OTP.",
        )

    try:
        await pin_service.set_pin(
            phone_number=body.phone_number,
            raw_pin=body.new_pin,
            session_id=session_id,
        )
        await farmer_service.clear_pin_lock(
            phone_number=body.phone_number,
            session_id=session_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except Exception:
        log.exception("pin_reset_set_failed", extra={"session_id": session_id})
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="PIN reset failed. Please try again.",
        )

    await transition_to_active(session_id)
    log.info("pin_reset_complete", extra={"session_id": session_id})
    return {"ok": True, "message": "PIN reset successfully. You can now log in."}
