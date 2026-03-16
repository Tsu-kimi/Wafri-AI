"""
backend/streaming/bridge.py

Bidirectional streaming bridge: WebSocket ↔ ADK run_live() ↔ Gemini Live API.

Architecture
────────────
Each connected WebSocket spawns two concurrent tasks:

  upstream_task   — reads messages from the browser and forwards them into the
                    LiveRequestQueue. Binary frames are treated as 16-bit PCM
                    audio at 16 kHz. Text frames are parsed as JSON and may
                    carry a base64-encoded JPEG frame or a raw text message.

  downstream_task — iterates the run_live() async generator, applies the
                    is_interrupted state machine, and sends structured JSON
                    events (plus raw binary audio) back to the browser.

Interruption state machine
──────────────────────────
  is_interrupted is set to True when event.interrupted is received.
  While True:
    - Audio inline_data events are discarded (do not forward stale audio)
    - AUDIO_FLUSH is sent to the browser immediately on first interrupt
  is_interrupted is reset to False when event.turn_complete is received.

Tool-response routing
─────────────────────
ADK executes all five tools automatically.  The downstream task intercepts
function_response events and maps each tool to the appropriate frontend event:

  search_disease_matches  → no UI event (agent narrates results in audio)
  recommend_products      → PRODUCTS_RECOMMENDED
  manage_cart             → CART_UPDATED
  generate_checkout_link  → CHECKOUT_LINK
  update_location         → LOCATION_CONFIRMED

Logger contract
───────────────
Every log record carries: session_id, user_id, event_type.
The elapsed_ms field is the milliseconds since run_bridge() was called.
"""
from __future__ import annotations

import asyncio
import base64
import contextlib
import json
import logging
import time
import traceback as _traceback
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from google.adk.agents.live_request_queue import LiveRequestQueue
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from backend.streaming.events import (
    audio_flush_event,
    cart_updated_event,
    checkout_link_event,
    clinics_found_event,
    location_confirmed_event,
    payment_confirmed_event,
    products_recommended_event,
    scanning_product_event,
    tool_call_debug_event,
    tool_error_event,
    turn_complete_event,
)

logger = logging.getLogger("wafrivet.streaming.bridge")

# MIME type expected by Gemini Live for raw PCM audio from the browser
_AUDIO_MIME = "audio/pcm;rate=16000"


def _normalise_products_payload(products: Any) -> list[dict[str, Any]]:
    """Coerce tool product rows to the stable frontend card shape."""
    if not isinstance(products, list):
        return []

    normalised: list[dict[str, Any]] = []
    for row in products:
        if not isinstance(row, dict):
            continue

        # search_products returns product_name; recommend_products returns name.
        name = (row.get("name") or row.get("product_name") or "").strip()
        base_price = row.get("base_price")
        if base_price is None:
            base_price = row.get("price_ngn", row.get("price", 0))

        price = row.get("price")
        if price is None:
            price = row.get("price_ngn")

        normalised.append(
            {
                "id": row.get("id") or row.get("product_id") or "",
                "name": name,
                "base_price": base_price,
                "price": price,
                "image_url": row.get("image_url") or "",
                "description": row.get("description") or "",
                "dosage_notes": row.get("dosage_notes") or "",
                "rrf_rank": row.get("rrf_rank"),
                "distributor_id": row.get("distributor_id"),
            }
        )

    return normalised


def _summarize_tool_data(data: dict[str, Any]) -> dict[str, Any]:
    """Return a small, non-sensitive summary of tool response data."""
    if not isinstance(data, dict):
        return {"data_type": type(data).__name__}

    summary: dict[str, Any] = {"keys": sorted(list(data.keys()))[:20]}
    if "products" in data and isinstance(data.get("products"), list):
        summary["products_count"] = len(data["products"])
    if "items" in data and isinstance(data.get("items"), list):
        summary["items_count"] = len(data["items"])
    if "cart_total" in data:
        summary["cart_total"] = data.get("cart_total")
    # Intentionally avoid echoing location, payment_reference, or other
    # user-specific fields here; only coarse, non-identifying metadata.
    if "checkout_url" in data:
        summary["has_checkout_url"] = bool(data.get("checkout_url"))
    return summary


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_bridge(
    websocket: WebSocket,
    user_id: str,
    session_id: str,
    runner: Runner,
    session_service: InMemorySessionService,
    run_config: Any,
    auth_session_id: str = "",
) -> None:
    """
    Manage the full lifetime of one WebSocket streaming session.

    auth_session_id is the JWT-verified session ID (from the HttpOnly cookie).
    It differs from session_id (the Gemini/ADK session URL parameter) and is
    used as the Redis key for AWAITING_PIN state checks and pub/sub channels.

    Raises nothing — all exceptions are caught internally; the WebSocket is
    closed in the finally block.
    """
    start_ns = time.monotonic_ns()
    live_request_queue: LiveRequestQueue = LiveRequestQueue()
    log_ctx = {"user_id": user_id, "session_id": session_id}

    def _log(level: str, msg: str, event_type: str = "-", **kw: Any) -> None:
        elapsed_ms = (time.monotonic_ns() - start_ns) // 1_000_000
        # Passing exc_info=True alongside extra= causes KeyError in Python's
        # LogRecord when exc_info is already set as a record attribute.
        # Callers should pass traceback text via kw["tb"] as a plain string.
        kw.pop("exc_info", None)
        getattr(logger, level)(
            msg,
            extra={**log_ctx, "event_type": event_type, "elapsed_ms": elapsed_ms, **kw},
        )

    _log("info", "bridge started")

    # Lightweight session-level flags tracked inside the bridge lifetime.
    # is_ai_speaking mirrors whether Gemini is currently producing audio so
    # barge-in handling can discard in-flight chunks immediately.
    session_state: dict = {"is_ai_speaking": False}

    # Resolve the auth_session_id for Redis state checks.
    # Falls back to session_id if not explicitly provided (Phase 3 compat).
    _auth_sid: str = auth_session_id or session_id

    # ------------------------------------------------------------------
    # Proactive greeting — Fatima speaks first on every session open.
    # Enqueue the trigger message BEFORE starting the tasks so it arrives
    # as the very first input the run_live() loop processes.
    # Include stable session context so the greeting can be personalized.
    # ------------------------------------------------------------------
    farmer_name = ""
    farmer_state = ""
    try:
        active_session = await session_service.get_session(
            app_name=runner.app_name,
            user_id=user_id,
            session_id=session_id,
        )
        if active_session:
            farmer_name = str(active_session.state.get("farmer_name") or "").strip()
            farmer_state = str(active_session.state.get("farmer_state") or "").strip()
    except Exception as exc:
        _log("warning", f"failed to load session context for greeting: {exc}", "GREETING_CTX_ERR")

    greeting_parts = [
        "The session has just started.",
        "Greet the user warmly as Fatima and ask what is wrong with their animal or what you can help with today.",
    ]
    if farmer_name:
        greeting_parts.append(f"The farmer's name is {farmer_name}. Use it in the greeting.")
    if farmer_state:
        greeting_parts.append(f"The farmer is already associated with {farmer_state} state. Keep that context in mind.")

    live_request_queue.send_content(
        types.Content(
            role="user",
            parts=[types.Part(text=" ".join(greeting_parts))],
        )
    )
    _log("info", "proactive greeting enqueued", "GREETING")

    # ------------------------------------------------------------------
    # Upstream: WebSocket → LiveRequestQueue
    # ------------------------------------------------------------------
    async def upstream_task() -> None:
        try:
            while True:
                message = await websocket.receive()

                if message["type"] == "websocket.disconnect":
                    _log("info", "client disconnected (upstream)", "DISCONNECT")
                    break

                if "bytes" in message and message["bytes"] is not None:
                    # Binary frame → raw PCM audio chunk
                    audio_bytes: bytes = message["bytes"]
                    blob = types.Blob(mime_type=_AUDIO_MIME, data=audio_bytes)
                    live_request_queue.send_realtime(blob)
                    _log("debug", "sent audio chunk", "AUDIO_IN", bytes=len(audio_bytes))

                elif "text" in message and message["text"] is not None:
                    # Text frame → JSON envelope
                    try:
                        payload: dict = json.loads(message["text"])
                    except json.JSONDecodeError as exc:
                        _log("warning", f"invalid JSON from client: {exc}", "BAD_JSON")
                        continue

                    msg_type = payload.get("type", "")

                    if msg_type == "IMAGE":
                        # base64-encoded JPEG video frame
                        raw_b64: str = payload.get("data", "")
                        if raw_b64:
                            image_bytes = base64.b64decode(raw_b64)
                            blob = types.Blob(mime_type="image/jpeg", data=image_bytes)
                            live_request_queue.send_realtime(blob)
                            _log("debug", "sent image frame", "IMAGE_IN")

                    elif msg_type == "TEXT":
                        # Text message (fallback for non-audio clients)
                        text_body: str = payload.get("text", "").strip()
                        if text_body:
                            content = types.Content(
                                parts=[types.Part(text=text_body)],
                                role="user",
                            )
                            live_request_queue.send_content(content)
                            _log("debug", "sent text message", "TEXT_IN")

                    elif msg_type == "INTERRUPT":
                        # User tapped the stop button. Send 100 ms of silence so
                        # Gemini's VAD detects end-of-speech and fires event.interrupted,
                        # which the downstream state machine converts to AUDIO_FLUSH.
                        silence_100ms = bytes(3200)  # 16kHz × 1ch × 2B × 0.1 s
                        live_request_queue.send_realtime(
                            types.Blob(mime_type=_AUDIO_MIME, data=silence_100ms)
                        )
                        _log("info", "user interrupt – silence barge-in sent", "INTERRUPT")

                    elif msg_type == "LOCATION_DATA":
                        # Browser sends GPS coordinates once geolocation resolves.
                        # Write them into the ADK in-memory session state so the
                        # find_nearest_vet_clinic tool can read them via tool_context.state.
                        lat = payload.get("lat")
                        lon = payload.get("lon")
                        if lat is not None and lon is not None:
                            try:
                                session = await session_service.get_session(
                                    app_name=runner.app_name,
                                    user_id=user_id,
                                    session_id=session_id,
                                )
                                if session:
                                    session.state["farmer_lat"] = float(lat)
                                    session.state["farmer_lon"] = float(lon)
                                    lga_val = payload.get("lga")
                                    if lga_val:
                                        session.state["farmer_lga"] = str(lga_val)
                                    state_val = payload.get("state")
                                    if state_val:
                                        session.state["farmer_state"] = str(state_val)
                                    phone_val = str(session.state.get("farmer_phone") or "").strip()
                                    if not phone_val and _auth_sid:
                                        try:
                                            from backend.services.farmer_service import _resolve_phone_from_session

                                            phone_val = (await _resolve_phone_from_session(_auth_sid)) or ""
                                            if phone_val:
                                                session.state["farmer_phone"] = phone_val
                                        except Exception:
                                            phone_val = ""

                                    if phone_val and _auth_sid:
                                        try:
                                            from backend.db.rls import rls_context as _rls

                                            async with _rls(_auth_sid, phone=phone_val) as _conn:
                                                await _conn.execute(
                                                    """
                                                    UPDATE public.carts
                                                       SET last_known_lat   = $1,
                                                           last_known_lng   = $2,
                                                           last_known_state = $3,
                                                           last_known_lga   = $4,
                                                           updated_at       = NOW()
                                                     WHERE id = (
                                                           SELECT id
                                                             FROM public.carts
                                                            WHERE phone = $5
                                                            ORDER BY updated_at DESC, created_at DESC
                                                            LIMIT 1
                                                     )
                                                    """,
                                                    float(lat),
                                                    float(lon),
                                                    str(state_val) if state_val else None,
                                                    str(lga_val) if lga_val else None,
                                                    phone_val,
                                                )
                                        except Exception as db_exc:
                                            _log("warning", f"Failed to persist GPS to DB: {db_exc}", "LOCATION_DATA_DB_ERR")
                                    _log("info", "GPS coordinates stored for active session", "LOCATION_DATA")
                                else:
                                    _log("warning", "LOCATION_DATA received but no session found", "LOCATION_DATA_NO_SESSION")
                            except Exception as exc:
                                _log("warning", f"Failed to store GPS in session: {exc}", "LOCATION_DATA_ERR")

                    else:
                        _log("warning", f"unknown message type: {msg_type!r}", "UNKNOWN_MSG")

        except WebSocketDisconnect:
            _log("info", "WebSocket disconnected during upstream", "DISCONNECT")
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            _log("error", f"upstream error: {exc}", "UPSTREAM_ERR")
        finally:
            # Signal run_live() to stop once upstream ends
            live_request_queue.close()

    # ------------------------------------------------------------------
    # Downstream: run_live() → WebSocket
    # ------------------------------------------------------------------
    async def downstream_task() -> None:
        is_interrupted = False

        try:
            async for event in runner.run_live(
                user_id=user_id,
                session_id=session_id,
                live_request_queue=live_request_queue,
                run_config=run_config,
            ):
                # ── Priority 1: Model / connection error ──────────────────
                if event.error_code:
                    _log(
                        "error",
                        f"model error {event.error_code}: {event.error_message}",
                        "MODEL_ERR",
                    )
                    terminal_codes = {"SAFETY", "PROHIBITED_CONTENT", "BLOCKLIST", "MAX_TOKENS", "CANCELLED"}
                    if event.error_code in terminal_codes:
                        await websocket.send_json(
                            {"type": "ERROR", "code": event.error_code, "message": event.error_message}
                        )
                        break
                    # Transient error — keep processing
                    continue

                # ── Priority 2: Tool function responses (ALWAYS routed first) ─
                fn_responses = event.get_function_responses() if hasattr(event, "get_function_responses") else []
                for fn_resp in (fn_responses or []):
                    fn_name: str = fn_resp.name or ""
                    await _route_tool_response(
                        websocket=websocket,
                        tool_name=fn_name,
                        response=fn_resp.response,
                        log_fn=_log,
                        session_id=session_id,
                    )

                # ── Priority 3: Interruption (barge-in) ──────────────────
                if event.interrupted:
                    if not is_interrupted:
                        is_interrupted = True
                        # 1. Mark Fatima as no longer speaking so subsequent audio
                        #    chunks are discarded rather than forwarded.
                        session_state["is_ai_speaking"] = False
                        # 2. Tell the browser to stop the audio player and cancel
                        #    all scheduled AudioBufferSourceNode instances, then
                        #    also send the canonical AUDIO_FLUSH envelope.
                        await websocket.send_json({"type": "interrupted"})
                        await websocket.send_json(audio_flush_event())
                        # 3. Emit a structured log line for the Cloud Run log stream.
                        logger.info(
                            {"event": "barge_in", "session_id": session_id, "timestamp": time.time()}
                        )
                        _log("info", "barge-in → interrupted + AUDIO_FLUSH sent", "BARGE_IN")
                    continue

                # ── Priority 3: Turn complete ────────────────────────────
                if event.turn_complete:
                    is_interrupted = False
                    session_state["is_ai_speaking"] = False
                    await websocket.send_json(turn_complete_event())
                    _log("info", "turn complete", "TURN_COMPLETE")
                    continue

                # ── While interrupted: discard content events ────────────
                if is_interrupted:
                    continue

                # ── Priority 4: Content parts (audio only) ───────────────────
                if event.content and event.content.parts:
                    content_role = (getattr(event.content, "role", None) or "model").lower()
                    for part in event.content.parts:
                        if part.inline_data and part.inline_data.data:
                            # Only forward model audio output to the browser.
                            # User-role inline_data would be an echo of mic input — discard it.
                            if content_role != "model":
                                continue
                            # Mark Fatima as speaking so the barge-in handler
                            # knows there is live audio in flight.
                            session_state["is_ai_speaking"] = True
                            # Send raw PCM as binary WebSocket frame for low latency
                            await websocket.send_bytes(part.inline_data.data)
                            _log(
                                "debug",
                                "sent audio chunk to client",
                                "AUDIO_OUT",
                                bytes=len(part.inline_data.data),
                            )

        except WebSocketDisconnect:
            _log("info", "WebSocket disconnected during downstream", "DISCONNECT")
        except asyncio.CancelledError:
            pass
        except Exception as exc:
            exc_str = str(exc)
            if "RESOURCE_EXHAUSTED" in exc_str or "Maximum concurrent sessions" in exc_str:
                _log("warning", "Gemini Live quota exceeded — max concurrent sessions reached", "QUOTA_EXCEEDED")
                with contextlib.suppress(Exception):
                    await websocket.send_json({
                        "type": "ERROR",
                        "code": "RESOURCE_EXHAUSTED",
                        "message": "The AI service is at capacity. Please wait 30 seconds and try again.",
                    })
            elif "1000" in exc_str or "operation was cancelled" in exc_str.lower():
                # Code 1000 = Gemini Live clean session timeout (~5 min idle).
                # This is expected behaviour, not an application error.
                _log("info", "Gemini Live session closed (1000 — normal timeout)", "SESSION_TIMEOUT")
                with contextlib.suppress(Exception):
                    await websocket.send_json({"type": "SESSION_EXPIRED", "message": "Session timed out. Please reconnect."})
            else:
                _log("error", f"downstream error: {exc}", "DOWNSTREAM_ERR", tb=_traceback.format_exc())
        finally:
            live_request_queue.close()

    # ------------------------------------------------------------------
    # Run both tasks concurrently
    # ------------------------------------------------------------------
    up_task   = asyncio.create_task(upstream_task(), name=f"upstream-{session_id}")
    down_task = asyncio.create_task(downstream_task(), name=f"downstream-{session_id}")
    sub_task  = asyncio.create_task(
        _redis_payment_subscriber(websocket, _auth_sid, _log, live_request_queue),
        name=f"redis-sub-{session_id}",
    )

    try:
        done, pending = await asyncio.wait(
            [up_task, down_task, sub_task],
            return_when=asyncio.FIRST_COMPLETED,
        )
        # IMPORTANT: Always retrieve results from completed tasks.
        # Otherwise, exceptions raised inside a task (e.g. Gemini Live closing
        # with code 1000) will be logged as "Task exception was never retrieved"
        # by the event loop / uvicorn, even if the task had its own try/except.
        for t in done:
            try:
                t.result()
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                exc_str = str(exc)
                if "1000" in exc_str or "operation was cancelled" in exc_str.lower():
                    _log("info", "bridge task ended (1000 — normal cancellation)", "TASK_CANCELLED")
                else:
                    _log("error", f"bridge task ended with exception: {exc}", "TASK_ERR", tb=_traceback.format_exc())
        for t in pending:
            t.cancel()
            try:
                await t
            except (asyncio.CancelledError, Exception):
                pass
    finally:
        live_request_queue.close()
        _log("info", "bridge closed")


# ---------------------------------------------------------------------------
# Redis pub/sub subscriber — delivers PAYMENT_CONFIRMED to the WebSocket
# ---------------------------------------------------------------------------

async def _redis_payment_subscriber(
    websocket: WebSocket,
    auth_session_id: str,
    log_fn: Any,
    live_request_queue: LiveRequestQueue,
) -> None:
    """
    Subscribe to Redis channel session:{auth_session_id} and forward any
    PAYMENT_CONFIRMED message to the connected WebSocket as a typed event.
    Also injects a spoken cue into the live session so Fatima congratulates
    the farmer verbally — closing the commerce loop in audio, not just UI.

    This task runs for the full lifetime of the WebSocket connection alongside
    upstream_task and downstream_task. It is cancelled when either of those
    tasks completes (i.e., at disconnect).

    The payment webhook (/payments/webhook) publishes to this channel after
    verifying the HMAC signature and updating the cart status to payment_received.
    """
    if not auth_session_id:
        log_fn("warning", "redis subscriber skipped — no auth_session_id", "REDIS_SUB_SKIP")
        return

    try:
        from backend.services.redis_client import get_redis
        redis = get_redis()
    except RuntimeError:
        log_fn("warning", "redis not initialised — payment events unavailable", "REDIS_NOT_INIT")
        return

    channel = f"session:{auth_session_id}"
    pubsub = redis.pubsub()

    try:
        await pubsub.subscribe(channel)
        log_fn("info", f"redis subscriber active on {channel!r}", "REDIS_SUB_START")

        async for message in pubsub.listen():
            # listen() yields subscription confirmations and data messages alike.
            if not isinstance(message, dict) or message.get("type") != "message":
                continue

            raw_data = message.get("data", "")
            if not isinstance(raw_data, str):
                # decode_responses=True ensures all values are str, but guard anyway.
                try:
                    raw_data = raw_data.decode("utf-8")
                except Exception:
                    continue

            try:
                payload = json.loads(raw_data)
            except json.JSONDecodeError:
                log_fn("warning", "redis message not valid JSON", "REDIS_BAD_MSG")
                continue

            msg_type = payload.get("type", "")

            if msg_type == "PAYMENT_CONFIRMED":
                ref: str = payload.get("payment_reference", "")
                amount_ngn = float(payload.get("amount_ngn") or 0)
                try:
                    await websocket.send_json(
                        payment_confirmed_event(
                            payment_reference=ref,
                            amount_ngn=amount_ngn,
                        )
                    )
                    log_fn("info", "PAYMENT_CONFIRMED delivered", "PAYMENT_CONFIRMED")
                except Exception as send_exc:
                    log_fn(
                        "warning",
                        f"failed to deliver PAYMENT_CONFIRMED: {send_exc}",
                        "PAYMENT_DELIVER_ERR",
                    )

                # Inject a verbal cue into the live conversation so Fatima
                # speaks the payment confirmation aloud — the farmer hears
                # success in audio, not just reads a silent UI toast.
                try:
                    amount_fmt = f"{amount_ngn:,.0f}"
                    live_request_queue.send_content(
                        types.Content(
                            role="user",
                            parts=[
                                types.Part(
                                    text=(
                                        f"[SYSTEM] Payment confirmed. "
                                        f"Amount: ₦{amount_fmt} NGN. "
                                        f"Reference: {ref}. "
                                        "Please congratulate the farmer warmly, "
                                        "confirm their order is now being processed, "
                                        "and tell them to expect an SMS confirmation."
                                    )
                                )
                            ],
                        )
                    )
                    log_fn("info", "PAYMENT_CONFIRMED injected into live conversation", "PAYMENT_INJECT")
                except Exception as inject_exc:
                    log_fn(
                        "warning",
                        f"failed to inject PAYMENT_CONFIRMED into live queue: {inject_exc}",
                        "PAYMENT_INJECT_ERR",
                    )

    except asyncio.CancelledError:
        pass
    except Exception as exc:
        log_fn("error", f"redis subscriber error: {exc}", "REDIS_SUB_ERR")
    finally:
        with contextlib.suppress(Exception):
            await pubsub.unsubscribe(channel)
        with contextlib.suppress(Exception):
            await pubsub.aclose()
        log_fn("info", "redis subscriber closed", "REDIS_SUB_STOP")


# ---------------------------------------------------------------------------
# Tool-response router
# ---------------------------------------------------------------------------

async def _route_tool_response(
    websocket: WebSocket,
    tool_name: str,
    response: Any,
    log_fn: Any,
    session_id: str = "",
) -> None:
    """
    Inspect a tool function response and send the corresponding UI event.

    Tool response shapes (all wrap status + data + message):
        recommend_products      → data.products [list]
        manage_cart             → data.cart_total, data.items [list]
        generate_checkout_link  → data.checkout_url, data.payment_reference
        update_location         → data.state (str)
        search_disease_matches  → no UI event (agent narrates)
    """
    # Normalise: response may be a dict or a Pydantic object
    if hasattr(response, "model_dump"):
        resp_dict: dict = response.model_dump()
    elif isinstance(response, dict):
        resp_dict = response
    else:
        resp_dict = {"status": "unknown", "data": {}, "message": str(response)}

    status: str  = resp_dict.get("status", "error")
    data:   dict = resp_dict.get("data", {}) or {}
    message: str = resp_dict.get("message", "")

    if status != "success":
        # Tool errors are never pushed to the frontend as UI events — doing so
        # would pop up a visible "Tool error" toast that breaks the seamless
        # voice experience.  All error detail is logged server-side and the
        # agent (Fatima) narrates any relevant failure to the user via audio.
        is_intermediate = bool(data.get("_intermediate"))
        if not is_intermediate:
            await websocket.send_json(
                tool_call_debug_event(
                    tool_name=tool_name,
                    status="error",
                    message=message or f"{tool_name} returned non-success status",
                    details={"status": status, "data": _summarize_tool_data(data)},
                )
            )
        logger.info(
            {
                "event": "tool_error",
                "tool": tool_name,
                "error": message,
                "intermediate": is_intermediate,
                "session_id": session_id,
            }
        )
        log_fn("warning", f"tool {tool_name!r} returned non-success", "TOOL_ERROR")
        return

    try:
        await websocket.send_json(
            tool_call_debug_event(
                tool_name=tool_name,
                status="success",
                message=message or f"{tool_name} succeeded",
                details={"status": status, "data": _summarize_tool_data(data)},
            )
        )

        if tool_name == "recommend_products":
            products = _normalise_products_payload(data.get("products", []))
            # Retrieve the disease/location context from the data dict if available
            disease_category = data.get("disease_category", "")
            location = data.get("location", "")
            await websocket.send_json(products_recommended_event(products=products, message=message))
            logger.info(
                {
                    "event": "tool_call",
                    "tool": "recommend_products",
                    "products_returned": len(products),
                    "session_id": session_id,
                }
            )
            log_fn("info", f"PRODUCTS_RECOMMENDED ({len(products)} items)", "PRODUCTS_RECOMMENDED")

        elif tool_name == "manage_cart":
            await websocket.send_json(
                cart_updated_event(
                    items=data.get("items", []),
                    cart_total=data.get("cart_total", 0.0),
                    message=message,
                )
            )
            log_fn("info", "CART_UPDATED", "CART_UPDATED")

        elif tool_name == "generate_checkout_link":
            await websocket.send_json(
                checkout_link_event(
                    checkout_url=data.get("checkout_url", ""),
                    payment_reference=data.get("payment_reference", ""),
                    message=message,
                )
            )
            log_fn("info", "CHECKOUT_LINK sent", "CHECKOUT_LINK")

        elif tool_name == "update_location":
            state_val = data.get("state", "")
            await websocket.send_json(location_confirmed_event(state=state_val, message=message))
            log_fn("info", "LOCATION_CONFIRMED event sent", "LOCATION_CONFIRMED")

        elif tool_name == "search_disease_matches":
            # Agent narrates results; no separate UI event.
            # Emit the structured log judges will see in the Cloud Run stream.
            matches = data.get("matches", [])
            low_confidence = data.get("low_confidence", False)
            top_match = matches[0] if matches else {}
            logger.info(
                {
                    "event": "tool_call",
                    "tool": "search_disease_matches",
                    "top_match": top_match.get("disease_name", ""),
                    "similarity": top_match.get("similarity", 0.0),
                    "low_confidence": low_confidence,
                    "session_id": session_id,
                }
            )
            log_fn("info", f"disease search returned {len(matches)} matches", "DISEASE_SEARCH")

        elif tool_name == "find_nearest_vet_clinic":
            clinics = data.get("clinics", [])
            radius_m = data.get("radius_m", 0)
            fallback_message = data.get("fallback_message")
            await websocket.send_json(
                clinics_found_event(
                    clinics=clinics,
                    radius_m=radius_m,
                    fallback_message=fallback_message,
                    message=message,
                )
            )
            log_fn("info", f"CLINICS_FOUND ({len(clinics)} clinics, radius={radius_m}m)", "CLINICS_FOUND")

        # ── Phase 3 tool routes ──────────────────────────────────────

        elif tool_name in ("search_products", "find_cheaper_option"):
            products = _normalise_products_payload(data.get("products", []))
            await websocket.send_json(products_recommended_event(products=products, message=message))
            logger.info(
                {
                    "event": "tool_call",
                    "tool": tool_name,
                    "products_returned": len(products),
                    "session_id": session_id,
                }
            )
            log_fn("info", f"PRODUCTS_RECOMMENDED ({len(products)} items) via {tool_name}", "PRODUCTS_RECOMMENDED")

        elif tool_name == "identify_product_from_frame":
            # The tool sets is_scanning_product=True in session state and returns
            # action="EXAMINE_PRODUCT_IN_FRAME". Signal the frontend to show the
            # scanning indicator. The model will read the frame and call
            # search_products next, which clears the scanning state.
            await websocket.send_json(scanning_product_event(message=message))
            log_fn("info", "SCANNING_PRODUCT event sent", "SCANNING_PRODUCT")

        elif tool_name == "update_cart":
            await websocket.send_json(
                cart_updated_event(
                    items=data.get("items", []),
                    cart_total=data.get("cart_total", 0.0),
                    message=message,
                )
            )
            log_fn("info", "CART_UPDATED (update_cart)", "CART_UPDATED")

        elif tool_name == "place_order":
            logger.info(
                {
                    "event": "tool_call",
                    "tool": "place_order",
                    "sms_sent": data.get("sms_sent", False),
                    "session_id": session_id,
                }
            )
            log_fn(
                "info",
                "place_order acknowledged; waiting for PAYMENT_CONFIRMED webhook before UI confirmation",
                "PLACE_ORDER",
            )

        # ── Phase 5 tool routes ─────────────────────────────────────────────────

        elif tool_name == "get_order_history":
            # Fatima narrates the order history aloud — no UI card is emitted.
            # Just log the structured event for Cloud Run observability.
            total = data.get("total_orders", 0)
            logger.info(
                {
                    "event": "tool_call",
                    "tool": "get_order_history",
                    "total_orders": total,
                    "session_id": session_id,
                }
            )
            log_fn("info", "ORDER_HISTORY fetched", "ORDER_HISTORY")

        else:
            log_fn("warning", f"unrecognised tool: {tool_name!r}", "UNKNOWN_TOOL")

    except Exception as exc:
        # Routing exceptions are logged server-side and sent to the browser
        # console only via TOOL_CALL_DEBUG — no visible UI toast is generated.
        await websocket.send_json(
            tool_call_debug_event(
                tool_name=tool_name,
                status="exception",
                message=str(exc),
                details={"status": status, "data": _summarize_tool_data(data)},
            )
        )
        logger.info(
            {
                "event": "tool_error",
                "tool": tool_name,
                "error": str(exc),
                "session_id": session_id,
            }
        )
        log_fn("error", f"error routing tool response for {tool_name!r}: {exc}", "TOOL_ROUTE_ERR")
