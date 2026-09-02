from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from urllib.parse import parse_qsl

from aiohttp import web
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

from app.miniapp_rich_buttons import register_rich_button_routes
from app.miniapp_uploads import register_upload_routes
from app.services.buttons import MAX_BUTTONS
from app.services.chat_registry import managed_chat_registry
from app.services.page_registry import page_registry
from app.services.popup_registry import popup_registry
from app.services.renderer import RichMessageRenderError, send_rich_message_post

STATIC_DIR = Path(__file__).with_name("miniapp_static")
_ADMIN_STATUSES = {"administrator", "creator"}
BETA_VERSION = "0.3"
MAX_PAGE_BLOCKS = 100


def mini_app_url() -> str | None:
    explicit = os.getenv("MINI_APP_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    domain = os.getenv("RAILWAY_PUBLIC_DOMAIN", "").strip()
    if domain:
        return f"https://{domain}/miniapp"
    return None


def _verify_init_data(init_data: str, bot_token: str, max_age: int = 86400) -> dict:
    if not init_data:
        raise web.HTTPUnauthorized(text="Missing Telegram initData")
    fields = dict(parse_qsl(init_data, keep_blank_values=True))
    received_hash = fields.pop("hash", "")
    if not received_hash:
        raise web.HTTPUnauthorized(text="Missing initData hash")
    check = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received_hash):
        raise web.HTTPUnauthorized(text="Invalid Telegram initData")
    auth_date = int(fields.get("auth_date") or 0)
    if not auth_date or abs(int(time.time()) - auth_date) > max_age:
        raise web.HTTPUnauthorized(text="Expired Telegram initData")
    try:
        user = json.loads(fields.get("user") or "{}")
    except json.JSONDecodeError as exc:
        raise web.HTTPUnauthorized(text="Invalid Telegram user") from exc
    if not isinstance(user, dict) or not user.get("id"):
        raise web.HTTPUnauthorized(text="Missing Telegram user")
    return user


def _miniapp_user(request: web.Request) -> dict:
    """Return any authenticated Telegram user opening the Mini App."""
    init_data = request.headers.get("X-Telegram-Init-Data", "")
    return _verify_init_data(init_data, request.app["bot_token"])


# Compatibility key used by upload/rich-button route modules. It now means
# authenticated Mini App user, not developer-only access.
_developer_user = _miniapp_user


def _status_value(member) -> str:
    status = getattr(member, "status", "")
    return str(getattr(status, "value", status))


async def _can_publish_to_chat(bot: Bot, chat_id: int, user_id: int) -> bool:
    try:
        bot_member = await bot.get_chat_member(chat_id=chat_id, user_id=bot.id)
        user_member = await bot.get_chat_member(chat_id=chat_id, user_id=user_id)
        chat = await bot.get_chat(chat_id)
    except (TelegramBadRequest, TelegramForbiddenError):
        return False
    if _status_value(bot_member) not in _ADMIN_STATUSES:
        return False
    if _status_value(user_member) not in _ADMIN_STATUSES:
        return False
    chat_type = str(getattr(getattr(chat, "type", ""), "value", getattr(chat, "type", "")))
    if chat_type == "channel" and not bool(getattr(bot_member, "can_post_messages", False)):
        return False
    return True


async def _eligible_destinations(bot: Bot, user_id: int) -> list[dict]:
    result = [{"kind": "private", "chat_id": user_id, "title": "المحادثة الخاصة", "type": "private"}]
    for item in await managed_chat_registry.list_for_user(user_id):
        try:
            chat_id = int(item.get("chat_id", 0))
        except (TypeError, ValueError):
            continue
        if not chat_id:
            continue
        if await _can_publish_to_chat(bot, chat_id, user_id):
            result.append({
                "kind": "chat",
                "chat_id": chat_id,
                "title": str(item.get("title") or chat_id),
                "type": str(item.get("type") or "chat"),
            })
        else:
            await managed_chat_registry.remove(user_id, chat_id)
    return result


async def index(_: web.Request) -> web.FileResponse:
    return web.FileResponse(STATIC_DIR / "index.html")


async def health(_: web.Request) -> web.Response:
    """Lightweight unauthenticated probe for Railway/container health checks."""
    return web.json_response({"ok": True, "service": "rich-customize", "beta": BETA_VERSION})


async def api_me(request: web.Request) -> web.Response:
    user = _miniapp_user(request)
    return web.json_response({"ok": True, "user": user, "beta": BETA_VERSION})


async def api_pages(request: web.Request) -> web.Response:
    user = _miniapp_user(request)
    pages = await page_registry.list_for_user(int(user["id"]))
    return web.json_response({
        "ok": True,
        "beta": BETA_VERSION,
        "pages": [{
            "page_id": page["page_id"],
            "title": page.get("title") or page["page_id"],
            "updated_at": page.get("updated_at"),
            "block_count": len(page.get("blocks") or []),
        } for page in pages],
    })


async def api_page(request: web.Request) -> web.Response:
    user = _miniapp_user(request)
    page_id = request.match_info["page_id"]
    page = await page_registry.get(page_id)
    if not page or int(page.get("owner_id", 0)) != int(user["id"]):
        raise web.HTTPNotFound(text="Page not found")
    return web.json_response({"ok": True, "page": {"page_id": page_id, **page}})


async def _json_payload(request: web.Request) -> dict:
    try:
        value = await request.json()
    except (json.JSONDecodeError, ValueError):
        raise web.HTTPBadRequest(text="Invalid JSON")
    if not isinstance(value, dict):
        raise web.HTTPBadRequest(text="JSON object required")
    return value


def _page_content(
    payload: dict,
    *,
    current: dict | None = None,
) -> tuple[list[dict], list[dict], int, str]:
    """Validate the common editable page fields at the HTTP boundary."""
    fallback = current or {}
    blocks = payload.get("blocks")
    buttons = payload.get("buttons", fallback.get("buttons") or [])
    if not isinstance(blocks, list):
        raise web.HTTPBadRequest(text="blocks must be a list")
    if len(blocks) > MAX_PAGE_BLOCKS or any(not isinstance(block, dict) for block in blocks):
        raise web.HTTPBadRequest(text=f"blocks must contain at most {MAX_PAGE_BLOCKS} objects")
    if not isinstance(buttons, list):
        raise web.HTTPBadRequest(text="buttons must be a list")
    if len(buttons) > MAX_BUTTONS or any(not isinstance(button, dict) for button in buttons):
        raise web.HTTPBadRequest(text=f"buttons must contain at most {MAX_BUTTONS} objects")

    raw_per_row = payload.get("buttons_per_row", fallback.get("buttons_per_row", 1))
    try:
        buttons_per_row = int(raw_per_row or 1)
    except (TypeError, ValueError) as error:
        raise web.HTTPBadRequest(text="buttons_per_row must be an integer") from error
    if not 1 <= buttons_per_row <= 8:
        raise web.HTTPBadRequest(text="buttons_per_row must be between 1 and 8")

    buttons_align = str(
        payload.get("buttons_align") or fallback.get("buttons_align") or "center"
    )
    if buttons_align not in {"left", "center", "right"}:
        raise web.HTTPBadRequest(text="buttons_align must be left, center, or right")
    return blocks, buttons, buttons_per_row, buttons_align


async def api_create_page(request: web.Request) -> web.Response:
    user = _miniapp_user(request)
    payload = await _json_payload(request)
    blocks, buttons, buttons_per_row, buttons_align = _page_content(payload)
    title = str(payload.get("title") or "Untitled")[:64]
    code = await page_registry.save(
        int(user["id"]),
        title,
        blocks,
        buttons,
        buttons_per_row,
        buttons_align,
    )
    return web.json_response({"ok": True, "beta": BETA_VERSION, "page_id": code, "title": title})


async def api_save_page(request: web.Request) -> web.Response:
    user = _miniapp_user(request)
    page_id = request.match_info["page_id"]
    current = await page_registry.get(page_id)
    if not current or int(current.get("owner_id", 0)) != int(user["id"]):
        raise web.HTTPNotFound(text="Page not found")
    payload = await _json_payload(request)
    blocks, buttons, buttons_per_row, buttons_align = _page_content(
        payload,
        current=current,
    )
    title = str(payload.get("title") or current.get("title") or page_id)[:64]
    code = await page_registry.save(
        int(user["id"]),
        title,
        blocks,
        buttons,
        buttons_per_row,
        buttons_align,
        page_id=page_id,
    )
    return web.json_response({"ok": True, "beta": BETA_VERSION, "page_id": code, "title": title})


async def api_destinations(request: web.Request) -> web.Response:
    user = _miniapp_user(request)
    destinations = await _eligible_destinations(request.app["bot"], int(user["id"]))
    return web.json_response({"ok": True, "destinations": destinations})


async def api_send_page(request: web.Request) -> web.Response:
    user = _miniapp_user(request)
    payload = await _json_payload(request)
    page_id = str(payload.get("page_id") or "")
    page = await page_registry.get(page_id)
    user_id = int(user["id"])
    if not page or int(page.get("owner_id", 0)) != user_id:
        raise web.HTTPNotFound(text="Page not found")

    kind = str(payload.get("kind") or "private")
    if kind == "private":
        target_chat_id = user_id
    elif kind == "chat":
        raw_chat_id = payload.get("chat_id")
        try:
            target_chat_id = int(raw_chat_id) if raw_chat_id is not None else 0
        except (TypeError, ValueError):
            raise web.HTTPBadRequest(text="Invalid chat_id")
        known = {
            int(item.get("chat_id", 0))
            for item in await managed_chat_registry.list_for_user(user_id)
            if item.get("chat_id") is not None
        }
        if target_chat_id not in known or not await _can_publish_to_chat(
            request.app["bot"], target_chat_id, user_id,
        ):
            raise web.HTTPForbidden(text="Publishing is not allowed in this chat")
    else:
        raise web.HTTPBadRequest(text="Invalid destination kind")

    buttons = [dict(button) for button in (page.get("buttons") or [])]
    for button in buttons:
        if str(button.get("type")) == "popup" and button.get("id"):
            await popup_registry.remember(str(button["id"]), str(button.get("value") or ""))

    try:
        sent = await send_rich_message_post(
            request.app["bot"],
            target_chat_id,
            page.get("blocks") or [],
            buttons,
            int(page.get("buttons_per_row") or 1),
            str(page.get("buttons_align") or "center"),
            source_page_id=page_id,
        )
    except RichMessageRenderError as error:
        raise web.HTTPBadRequest(text=str(error))

    return web.json_response({
        "ok": True,
        "chat_id": target_chat_id,
        "message_id": getattr(sent, "message_id", None),
    })


def build_web_app(bot: Bot, bot_token: str) -> web.Application:
    # 55 MB supports ordinary video/audio/document uploads. Per-kind limits are
    # still enforced by app/miniapp_uploads.py for every authenticated user.
    app = web.Application(client_max_size=55 * 1024 * 1024)
    app["bot"] = bot
    app["bot_token"] = bot_token
    app["miniapp_user"] = _miniapp_user
    # Compatibility for route modules written while the beta was developer-only.
    app["developer_user"] = _miniapp_user
    app.router.add_get("/healthz", health)
    app.router.add_get("/miniapp", index)
    app.router.add_get("/miniapp/", index)
    app.router.add_static("/miniapp/static", STATIC_DIR)
    app.router.add_get("/miniapp/api/me", api_me)
    app.router.add_get("/miniapp/api/pages", api_pages)
    app.router.add_post("/miniapp/api/pages", api_create_page)
    app.router.add_get("/miniapp/api/pages/{page_id}", api_page)
    app.router.add_put("/miniapp/api/pages/{page_id}", api_save_page)
    app.router.add_get("/miniapp/api/destinations", api_destinations)
    app.router.add_post("/miniapp/api/send", api_send_page)
    register_upload_routes(app)
    register_rich_button_routes(app)
    return app


async def start_mini_app_server(bot: Bot, bot_token: str) -> web.AppRunner:
    app = build_web_app(bot, bot_token)
    runner = web.AppRunner(app, access_log=None)
    await runner.setup()
    port = int(os.getenv("PORT", "8080"))
    site = web.TCPSite(runner, host="0.0.0.0", port=port)
    await site.start()
    return runner
