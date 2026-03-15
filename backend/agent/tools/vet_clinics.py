"""
backend/agent/tools/vet_clinics.py

ADK tool: find_nearest_vet_clinic

Searches for the nearest veterinary clinics using the Google Places API (New)
Nearby Search endpoint.  Called by Fatima when a diagnosed condition has
severity "critical" or when the farmer explicitly asks for a nearby vet.

Works by reading the farmer's GPS coordinates (farmer_lat, farmer_lon) that
the frontend wrote into session state via the LOCATION_DATA WebSocket message
at the start of the session.

Radius fallback strategy:
    1. 10 000 m  (10 km)  — most rural areas have something within 10 km
    2. 25 000 m  (25 km)  — extended search for more remote locations
    3. 50 000 m  (50 km)  — maximum radius (API hard limit)

Returns up to 5 results ordered by proximity (DISTANCE rankPreference).

If no GPS coordinates are stored in session state, returns a structured
empty result with a fallback message that Fatima can speak aloud.

FieldMask is strictly limited to the fields we display:
    places.displayName
    places.formattedAddress
    places.nationalPhoneNumber
    places.currentOpeningHours
    places.googleMapsUri
    places.location

Using only these fields keeps billing at the Nearby Search Pro SKU tier for
the first three fields and rolls up to Enterprise for nationalPhoneNumber and
currentOpeningHours — photos and reviews are explicitly excluded.

Environment variables required:
    GOOGLE_MAPS_KEY — Google Maps Platform API key with Places API (New) enabled.
                      Must NOT be set as NEXT_PUBLIC_ anywhere; injected at
                      Cloud Run deploy time via Secret Manager GOOGLE_MAPS_KEY:latest.
"""

from __future__ import annotations

import logging
import os
from typing import Any, Optional

import httpx
from google.adk.tools.tool_context import ToolContext

logger = logging.getLogger("wafrivet.tools.vet_clinics")

# Google Places API (New) Nearby Search endpoint.
# Never use the legacy maps.googleapis.com endpoint.
_PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"

# FieldMask controls billing tier — only request what we display.
# nationalPhoneNumber + currentOpeningHours → Enterprise SKU.
# No photos, reviews, or atmosphere fields.
_FIELD_MASK = (
    "places.displayName,"
    "places.formattedAddress,"
    "places.nationalPhoneNumber,"
    "places.currentOpeningHours,"
    "places.googleMapsUri,"
    "places.location"
)

# veterinary_care is confirmed in Table A of the Places API (New) place types.
# pet_care is also in Table A (Services category) as a secondary catch-all.
_INCLUDED_TYPES = ["veterinary_care", "pet_care"]

# Radius fallback ladder (metres).  Max is 50 000 m per the API spec.
_RADIUS_FALLBACK = [10_000.0, 25_000.0, 50_000.0]

# Max results per API call (must be between 1 and 20).
_MAX_RESULTS = 5

# NAFDAC animal health helpline (Nigeria) — spoken when no clinics found.
_NAFDAC_HELPLINE = "0800-162-3232"


def _api_key() -> str:
    key = os.environ.get("GOOGLE_MAPS_KEY", "").strip()
    if not key:
        raise EnvironmentError(
            "GOOGLE_MAPS_KEY environment variable is not set. "
            "Add it to Cloud Run via --set-secrets=GOOGLE_MAPS_KEY=GOOGLE_MAPS_KEY:latest."
        )
    return key


def _search_nearby(lat: float, lon: float, radius_m: float) -> list[dict[str, Any]]:
    """
    Call the Places API (New) Nearby Search for veterinary clinics.

    Returns the raw list of place dicts from the response, or [] on error.
    Never raises — errors are logged and surfaced as empty results.
    """
    body = {
        "includedTypes": _INCLUDED_TYPES,
        "maxResultCount": _MAX_RESULTS,
        "rankPreference": "DISTANCE",
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lon},
                "radius": radius_m,
            }
        },
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": _api_key(),
        "X-Goog-FieldMask": _FIELD_MASK,
    }
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(_PLACES_URL, json=body, headers=headers)
        resp.raise_for_status()
        return resp.json().get("places", [])
    except httpx.HTTPStatusError as exc:
        # Log sanitised error — never expose the key in logs.
        logger.warning(
            "Places API error: %s %s",
            exc.response.status_code,
            exc.response.text[:200],
        )
        return []
    except Exception as exc:
        logger.warning("Places API unexpected error: %s", exc)
        return []


def _normalise_clinic(place: dict[str, Any]) -> dict[str, Any]:
    """
    Map a raw Places API (New) place dict to the CLINICS_FOUND event shape.

    Frontend contract (must match ClinicCardRow.tsx expectations):
        name          — str
        address       — str
        phone         — str | None
        openNow       — bool | None
        googleMapsUri — str | None
        lat           — float | None
        lon           — float | None
    """
    display_name = place.get("displayName") or {}
    name: str = display_name.get("text", "Veterinary Clinic")

    address: str = place.get("formattedAddress", "")
    phone: Optional[str] = place.get("nationalPhoneNumber") or None
    google_maps_uri: Optional[str] = place.get("googleMapsUri") or None

    opening_hours = place.get("currentOpeningHours") or {}
    open_now: Optional[bool] = opening_hours.get("openNow")

    location = place.get("location") or {}
    lat: Optional[float] = location.get("latitude")
    lon: Optional[float] = location.get("longitude")

    return {
        "name": name,
        "address": address,
        "phone": phone,
        "openNow": open_now,
        "googleMapsUri": google_maps_uri,
        "lat": lat,
        "lon": lon,
    }


async def find_nearest_vet_clinic(tool_context: ToolContext) -> dict[str, Any]:
    """
    ADK tool — find the nearest veterinary clinics for the farmer's GPS location.

    Reads farmer_lat and farmer_lon from session state (stored by the bridge
    when the frontend sends a LOCATION_DATA WebSocket message).

    Returns:
        {
            "status": "success" | "error" | "no_results",
            "data": {
                "clinics": [...],   # up to 5 clinic objects
                "radius_m": float,  # effective search radius used
                "fallback_message": str | None
            },
            "message": str
        }
    """
    state = tool_context.state

    lat = state.get("farmer_lat")
    lon = state.get("farmer_lon")

    if lat is None or lon is None:
        logger.warning("find_nearest_vet_clinic: no GPS coordinates in session state")
        # Return success so bridge does not send tool_error; agent can ask user to allow location and try again.
        fallback_msg = (
            "I don't have your location yet. Please allow location access in your browser and try again in a moment, "
            f"or call the NAFDAC animal health helpline at {_NAFDAC_HELPLINE} for emergency veterinary support."
        )
        return {
            "status": "success",
            "data": {
                "clinics": [],
                "radius_m": 0,
                "fallback_message": fallback_msg,
            },
            "message": fallback_msg,
        }

    try:
        lat_f = float(lat)
        lon_f = float(lon)
    except (TypeError, ValueError):
        return {
            "status": "error",
            "data": {
                "clinics": [],
                "radius_m": 0,
                "fallback_message": (
                    f"I had trouble reading your location. "
                    f"Please call the NAFDAC animal health helpline at {_NAFDAC_HELPLINE}."
                ),
            },
            "message": "Invalid GPS coordinates in session state.",
        }

    clinics: list[dict[str, Any]] = []
    effective_radius = 0.0

    # Radius fallback ladder: 10 km → 25 km → 50 km
    for radius_m in _RADIUS_FALLBACK:
        raw_places = _search_nearby(lat_f, lon_f, radius_m)
        if raw_places:
            clinics = [_normalise_clinic(p) for p in raw_places]
            effective_radius = radius_m
            break
        logger.info(
            "No vet clinics within %.0f m — expanding search radius", radius_m
        )

    if not clinics:
        fallback_msg = (
            f"I searched up to 50 km around you but couldn't find a registered "
            f"veterinary clinic nearby. Please call the NAFDAC animal health helpline "
            f"at {_NAFDAC_HELPLINE} for emergency veterinary referrals."
        )
        return {
            "status": "success",
            "data": {
                "clinics": [],
                "radius_m": 50_000.0,
                "fallback_message": fallback_msg,
            },
            "message": fallback_msg,
        }

    nearest = clinics[0]
    name = nearest["name"]
    address = nearest.get("address") or "no address on record"
    phone_note = f", phone: {nearest['phone']}" if nearest.get("phone") else ""

    summary = (
        f"Nearest veterinary clinic: {name}, at {address}{phone_note}. "
        f"Found {len(clinics)} clinic(s) within {int(effective_radius / 1000)} km."
    )

    logger.info(
        "find_nearest_vet_clinic: %d clinic(s) found within %.0f m",
        len(clinics),
        effective_radius,
    )

    return {
        "status": "success",
        "data": {
            "clinics": clinics,
            "radius_m": effective_radius,
            "fallback_message": None,
        },
        "message": summary,
    }
