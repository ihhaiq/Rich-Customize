from __future__ import annotations

import asyncio
import secrets
from typing import Any
from weakref import WeakValueDictionary

from aiogram import Bot, F, Router
from aiogram.enums import ButtonStyle
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from app.editor.builders import container_data, new_block
from app.editor.session import albums
from app.i18n import t
from app.routers.editor_ui import delete_stored_block_prompt, send_add_prompt
from app.services.parser import message_to_blocks, messages_to_blocks
from app.states import RichEditorStates


router = Router(name="slideshow")
SLIDESHOW_LIMIT = 50
_locks: WeakValueDictionary[StorageKey, asyncio.Lock] = WeakValueDictionary()


def _lock(state: FSMContext) -> asyncio.Lock:
    return _locks.setdefault(state.key, asyncio.Lock())


def _active(data: dict[str, Any]) -> bool:
    return (
        data.get("pending_add_type") == "slideshow" and data.get("add_step") == "content"
    ) or (
        data.get("pending_add_type") == "details"
        and data.get("pending_child_type") == "slideshow"
        and data.get("add_step") == "details_child_content"
    )


async def start_slideshow(state: FSMContext) -> None:
    await state.update_data(slideshow={"token": secrets.token_hex(6), "children": [], "pending": 0})


def _keyboard(token: str, count: int, nested: bool) -> InlineKeyboardMarkup:
    row = [InlineKeyboardButton(
        text=t("slideshow.continue"), callback_data=f"r:slides:done:{token}",
        style=ButtonStyle.SUCCESS,
    )]
    if count < SLIDESHOW_LIMIT:
        row.append(InlineKeyboardButton(
            text=t("slideshow.more"), callback_data=f"r:slides:more:{token}",
            style=ButtonStyle.PRIMARY,
        ))
    return InlineKeyboardMarkup(inline_keyboard=[row, [InlineKeyboardButton(
        text=t("common.back"), callback_data="r:details:add" if nested else "r:back",
    )]])


async def receive_slideshow(message: Message, state: FSMContext, bot: Bot) -> None:
    async with _lock(state):
        data = await state.get_data()
        upload = dict(data.get("slideshow") or {})
        if not _active(data) or not upload:
            return
        token = upload["token"]
        upload["pending"] += 1
        await state.update_data(slideshow=upload)
    try:
        if message.media_group_id:
            collected = await albums.collect(message)
            children = messages_to_blocks(collected) if collected is not None else None
        else:
            children = message_to_blocks(message)
    except BaseException:
        async with _lock(state):
            data = await state.get_data()
            upload = dict(data.get("slideshow") or {})
            if upload.get("token") == token:
                upload["pending"] -= 1
                await state.update_data(slideshow=upload)
        raise
    async with _lock(state):
        data = await state.get_data()
        upload = dict(data.get("slideshow") or {})
        if upload.get("token") == token:
            upload["pending"] -= 1
            await state.update_data(slideshow=upload)
        if (
            await state.get_state() != RichEditorStates.adding_block.state
            or not _active(data) or upload.get("token") != token
        ):
            return
        if children is None:
            return
        children = [child for child in children if child.get("type") in {"photo", "video"}]
        if not children:
            await message.answer(t("slideshow.send_more", limit=SLIDESHOW_LIMIT))
            return
        accumulated = list(upload["children"])
        remaining = SLIDESHOW_LIMIT - len(accumulated)
        overflow = len(children) > remaining
        for child in children[:remaining]:
            accumulated.append({**child, "position": len(accumulated)})
        upload["children"] = accumulated
        await state.update_data(slideshow=upload)
        count = len(accumulated)
        text = t("slideshow.received", count=count, limit=SLIDESHOW_LIMIT)
        if count == SLIDESHOW_LIMIT:
            text += "\n\n" + t("slideshow.full", limit=SLIDESHOW_LIMIT)
        if overflow:
            text += "\n" + t("slideshow.overflow", count=len(children) - remaining)
        await delete_stored_block_prompt(bot, state, data)
        await send_add_prompt(
            message, state, text,
            _keyboard(token, count, data.get("pending_add_type") == "details"),
        )


@router.callback_query(F.data.startswith("r:slides:"))
async def confirm_slideshow(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    if not isinstance(callback.message, Message):
        return
    async with _lock(state):
        data = await state.get_data()
        upload = dict(data.get("slideshow") or {})
        parts = (callback.data or "").split(":")
        if (
            len(parts) != 4 or parts[2] not in {"done", "more"}
            or await state.get_state() != RichEditorStates.adding_block.state
            or not _active(data) or upload.get("token") != parts[-1]
            or not upload.get("children")
            or data.get("add_prompt_message_id") != callback.message.message_id
            or data.get("add_prompt_chat_id") != callback.message.chat.id
        ):
            await callback.answer(t("navigation.expired"), show_alert=True)
            return
        if upload["pending"]:
            await callback.answer(t("slideshow.busy"), show_alert=True)
            return
        if parts[2] == "more":
            if len(upload["children"]) >= SLIDESHOW_LIMIT:
                await callback.answer(t("slideshow.full", limit=SLIDESHOW_LIMIT), show_alert=True)
                return
            await delete_stored_block_prompt(bot, state, data)
            await send_add_prompt(
                callback.message, state, t("slideshow.send_more", limit=SLIDESHOW_LIMIT),
                _keyboard(upload["token"], len(upload["children"]), data.get("pending_add_type") == "details"),
            )
            await callback.answer()
            return
        await callback.answer()
        block = new_block("slideshow", container_data(upload["children"]))
        if data.get("pending_add_type") == "details":
            from app.routers.details_builder import store_pending_details_child

            await store_pending_details_child(callback.message, state, bot, block)
        else:
            from app.routers.block_support import finish_add

            await finish_add(callback.message, state, bot, block)
        await state.update_data(slideshow=None)
