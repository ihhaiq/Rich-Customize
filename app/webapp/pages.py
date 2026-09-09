from __future__ import annotations

import json

from aiohttp import web
from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError

from app.services.buttons import MAX_BUTTONS
from app.services.chat_registry import managed_chat_registry
from app.services.page_registry import page_registry
from app.services.popup_registry import popup_registry
from app.services.renderer import RichMessageRenderError, send_rich_message_post
from app.webapp.auth import miniapp_user

_ADMIN_STATUSES = {"administrator", "creator"}
MAX_PAGE_BLOCKS = 100


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


async def _eligible_destinations(
    bot: Bot,
    user_id: int,
    private_title: str,
) -> list[dict]:
    result = [{"kind": "private", "chat_id": user_id, "title": private_title, "type": "private"}]
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


async def _json_payload(request: web.Request) -> dict:
    try:
        value = await request.json()
    except (json.JSONDecodeError, ValueError):
        raise web.HTTPBadRequest(text="Invalid JSON")
    if not isinstance(value, dict):
        raise web.HTTPBadRequest(text="JSON object required")
    return value


def page_content(
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


async def api_me(request: web.Request) -> web.Response:
    user = miniapp_user(request)
    return web.json_response({"ok": True, "user": user})


async def api_pages(request: web.Request) -> web.Response:
    user = miniapp_user(request)
    pages = await page_registry.list_for_user(int(user["id"]))
    return web.json_response({
        "ok": True,
        "pages": [{
            "page_id": page["page_id"],
            "title": page.get("title") or page["page_id"],
            "updated_at": page.get("updated_at"),
            "block_count": len(page.get("blocks") or []),
        } for page in pages],
    })


async def api_page(request: web.Request) -> web.Response:
    user = miniapp_user(request)
    page_id = request.match_info["page_id"]
    page = await page_registry.get(page_id)
    if not page or int(page.get("owner_id", 0)) != int(user["id"]):
        raise web.HTTPNotFound(text="Page not found")
    return web.json_response({"ok": True, "page": {"page_id": page_id, **page}})


async def api_create_page(request: web.Request) -> web.Response:
    user = miniapp_user(request)
    payload = await _json_payload(request)
    blocks, buttons, buttons_per_row, buttons_align = page_content(payload)
    title = str(payload.get("title") or "Untitled")[:64]
    code = await page_registry.save(
        int(user["id"]),
        title,
        blocks,
        buttons,
        buttons_per_row,
        buttons_align,
    )
    return web.json_response({"ok": True, "page_id": code, "title": title})


async def api_save_page(request: web.Request) -> web.Response:
    user = miniapp_user(request)
    page_id = request.match_info["page_id"]
    current = await page_registry.get(page_id)
    if not current or int(current.get("owner_id", 0)) != int(user["id"]):
        raise web.HTTPNotFound(text="Page not found")
    payload = await _json_payload(request)
    blocks, buttons, buttons_per_row, buttons_align = page_content(payload, current=current)
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
    return web.json_response({"ok": True, "page_id": code, "title": title})


async def api_destinations(request: web.Request) -> web.Response:
    user = miniapp_user(request)
    user_id = int(user["id"])
    private_title = str(user.get("first_name") or user.get("username") or user_id)
    destinations = await _eligible_destinations(
        request.app["bot"],
        user_id,
        private_title,
    )
    return web.json_response({"ok": True, "destinations": destinations})


async def api_send_page(request: web.Request) -> web.Response:
    user = miniapp_user(request)
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


def register_page_routes(app: web.Application) -> None:
    app.router.add_get("/miniapp/api/me", api_me)
    app.router.add_get("/miniapp/api/pages", api_pages)
    app.router.add_post("/miniapp/api/pages", api_create_page)
    app.router.add_get("/miniapp/api/pages/{page_id}", api_page)
    app.router.add_put("/miniapp/api/pages/{page_id}", api_save_page)
    app.router.add_get("/miniapp/api/destinations", api_destinations)
    app.router.add_post("/miniapp/api/send", api_send_page)


__all__ = [
    "MAX_PAGE_BLOCKS",
    "api_create_page",
    "api_destinations",
    "api_me",
    "api_page",
    "api_pages",
    "api_save_page",
    "api_send_page",
    "page_content",
    "register_page_routes",
]
