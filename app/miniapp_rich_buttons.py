from __future__ import annotations

import asyncio
import html
import secrets
import time
from typing import Any

from aiohttp import web
from aiogram.types import KeyboardButton, KeyboardButtonRequestUsers, ReplyKeyboardMarkup

from app.services.page_registry import page_registry


class MiniAppUserPickerRegistry:
    def __init__(self) -> None:
        self._lock = asyncio.Lock()
        self._pending: dict[int, dict[str, Any]] = {}

    async def create(self, owner_id: int, page_id: str, block_id: str) -> int:
        async with self._lock:
            now = int(time.time())
            self._pending = {
                request_id: item
                for request_id, item in self._pending.items()
                if now - int(item.get("created_at", 0)) <= 1800
            }
            request_id = secrets.randbelow(2_147_483_647) + 1
            while request_id in self._pending:
                request_id = secrets.randbelow(2_147_483_647) + 1
            self._pending[request_id] = {
                "owner_id": owner_id,
                "page_id": page_id,
                "block_id": block_id,
                "created_at": now,
            }
            return request_id

    async def take(self, owner_id: int, request_id: int) -> dict[str, Any] | None:
        async with self._lock:
            item = self._pending.get(request_id)
            if not isinstance(item, dict) or int(item.get("owner_id", 0)) != owner_id:
                return None
            self._pending.pop(request_id, None)
            return dict(item)


miniapp_user_picker_registry = MiniAppUserPickerRegistry()


def _find_block(blocks: list[dict[str, Any]], block_id: str) -> dict[str, Any] | None:
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if str(block.get("id")) == str(block_id):
            return block
        data = block.get("data")
        if not isinstance(data, dict):
            continue
        children = data.get("children")
        if isinstance(children, list):
            found = _find_block(children, block_id)
            if found is not None:
                return found
        items = data.get("items")
        if isinstance(items, list):
            for item in items:
                if not isinstance(item, dict) or not isinstance(item.get("blocks"), list):
                    continue
                found = _find_block(item["blocks"], block_id)
                if found is not None:
                    return found
    return None


def _clean_title(value: Any) -> str:
    title = str(value or "زر").replace("{", "").replace("}", "").replace("\n", " ").strip()
    return title[:64] or "زر"


def _button_marker(data: dict[str, Any]) -> str:
    rich = data.get("_rich_button")
    if not isinstance(rich, dict):
        return ""
    title = _clean_title(rich.get("title"))
    button_type = str(rich.get("button_type") or "url")
    value = str(rich.get("value") or "")
    color = str(rich.get("color") or "")
    suffix = f" #{color}" if color in {"r", "b", "p", "g"} else ""
    type_name = {
        "page_callback": "cbd",
        "switch_inline_query": "switch_inline_query",
        "switch_inline_query_current_chat": "switch_inline_query_current_chat",
    }.get(button_type, button_type)
    return f"{{{title}:{type_name}:{value}{suffix}}}"


def sync_rich_button_block(block: dict[str, Any]) -> None:
    data = block.setdefault("data", {})
    rich = data.get("_rich_button")
    if not isinstance(rich, dict):
        return
    marker = _button_marker(data)
    data["text"] = marker
    data["html"] = f"<p>{html.escape(marker)}</p>"
    data["rich_text"] = None


async def request_user_picker(request: web.Request) -> web.Response:
    user = request.app["developer_user"](request)
    try:
        payload = await request.json()
    except Exception as exc:
        raise web.HTTPBadRequest(text="Invalid JSON") from exc
    if not isinstance(payload, dict):
        raise web.HTTPBadRequest(text="JSON object required")

    page_id = str(payload.get("page_id") or "")
    block_id = str(payload.get("block_id") or "")
    if not page_id or not block_id:
        raise web.HTTPBadRequest(text="page_id and block_id are required")

    owner_id = int(user["id"])
    page = await page_registry.get(page_id)
    if not page or int(page.get("owner_id", 0)) != owner_id:
        raise web.HTTPNotFound(text="Page not found")
    block = _find_block(page.get("blocks") or [], block_id)
    rich = block.get("data", {}).get("_rich_button") if block else None
    if not isinstance(rich, dict) or str(rich.get("button_type")) != "user":
        raise web.HTTPBadRequest(text="This block is not a user rich button")

    request_id = await miniapp_user_picker_registry.create(owner_id, page_id, block_id)
    title = _clean_title(rich.get("title"))
    keyboard = ReplyKeyboardMarkup(
        keyboard=[[
            KeyboardButton(
                text=f"👤 تحديد مستخدم لزر «{title}»",
                request_users=KeyboardButtonRequestUsers(
                    request_id=request_id,
                    max_quantity=1,
                    request_name=True,
                    request_username=True,
                    request_photo=True,
                ),
            )
        ]],
        resize_keyboard=True,
        one_time_keyboard=True,
        selective=True,
    )
    await request.app["bot"].send_message(
        chat_id=owner_id,
        text=f"اختر المستخدم الذي تريد ربطه بالزر «{title}»: ",
        reply_markup=keyboard,
    )
    return web.json_response({"ok": True, "request_id": request_id, "page_id": page_id})


async def complete_user_picker(
    owner_id: int,
    request_id: int,
    selected_user_id: int,
    username: str | None,
) -> dict[str, Any] | None:
    pending = await miniapp_user_picker_registry.take(owner_id, request_id)
    if pending is None:
        return None

    page_id = str(pending["page_id"])
    page = await page_registry.get(page_id)
    if not page or int(page.get("owner_id", 0)) != owner_id:
        return None
    blocks = page.get("blocks") or []
    block = _find_block(blocks, str(pending["block_id"]))
    if block is None:
        return None
    data = block.setdefault("data", {})
    rich = data.get("_rich_button")
    if not isinstance(rich, dict) or str(rich.get("button_type")) != "user":
        return None

    rich["value"] = str(selected_user_id)
    rich["target_user_id"] = selected_user_id
    if username:
        rich["target_username"] = str(username).lstrip("@")
    rich["target_label"] = f"@{str(username).lstrip('@')}" if username else str(selected_user_id)
    rich["configured"] = True
    sync_rich_button_block(block)

    await page_registry.save(
        owner_id,
        str(page.get("title") or page_id),
        blocks,
        page.get("buttons") or [],
        int(page.get("buttons_per_row") or 1),
        str(page.get("buttons_align") or "center"),
        page_id=page_id,
    )
    return {
        "page_id": page_id,
        "block_id": str(pending["block_id"]),
        "button_title": _clean_title(rich.get("title")),
        "target_label": rich.get("target_label"),
    }


def register_rich_button_routes(app: web.Application) -> None:
    app.router.add_post("/miniapp/api/rich-buttons/user-picker", request_user_picker)
