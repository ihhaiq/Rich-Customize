from __future__ import annotations

import copy
from typing import Any

from aiogram import Bot, F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.i18n import t
from app.keyboards import build_heading_level_keyboard
from app.editor.builders import map_data, quote_data, text_data
from app.editor.specs import MEDIA_CAPTION_TYPES, QUOTE_TYPES
from app.services.parser import message_to_blocks, messages_to_blocks, replacement_data
from app.services.anchors import set_anchor_display_name
from app.states import RichEditorStates

from app.editor.session import albums, load_editor_session
from app.routers.block_input_support import (
    code_input_prompt,
    math_input_prompt,
    quote_media_payload,
)
from app.routers.block_keyboard import build_managed_block_keyboard
from app.routers.block_support import block_by_id, replace_payload
from app.routers.block_view import block_page
from app.routers.button_target_picker import defer_text_for_user_buttons
from app.routers.editor_ui import (
    delete_add_step_messages,
    edit_saved_ui,
    edit_ui,
    send_add_prompt,
)


router = Router(name="block_edit")


@router.callback_query(F.data.startswith("r:e:"))
async def edit_block(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session:
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = block_by_id(blocks, block_id)
    if block is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        return
    if block.get("type") == "details":
        raise SkipHandler
    if block.get("type") == "heading":
        if isinstance(callback.message, Message):
            await send_add_prompt(
                callback.message,
                state,
                "اختر مستوى العنوان الجديد:",
                reply_markup=build_heading_level_keyboard("edit", block_id),
            )
        await callback.answer()
        return

    prompts = {
        "text": "أرسل النص الجديد",
        "caption": "أرسل الوصف الجديد",
        "photo": "أرسل الصورة الجديدة",
        "paragraph": "أرسل نص الفقرة الجديد",
        "preformatted": code_input_prompt(editing=True),
        "footer": "أرسل التذييل الجديد",
        "mathematical_expression": math_input_prompt(editing=True),
        "anchor": t("details.send_anchor"),
        "list": "أرسل عناصر القائمة؛ كل عنصر في سطر",
        "table": "أرسل صفوف الجدول؛ افصل الأعمدة بعلامة |",
        "blockquote": "أرسل نص الاقتباس الجديد، أو وسائط/ملفًا جديدًا لوضعه داخله",
        "pullquote": "أرسل نص الاقتباس الجديد، أو وسائط/ملفًا جديدًا لإرفاقه به",
        "collage": "أرسل صور/فيديو أو Album جديدًا للكولاج",
        "slideshow": "أرسل صور/فيديو أو Album جديدًا لعرض الشرائح",
        "map": "أرسل الموقع الجديد من مرفقات Telegram",
        "video": "أرسل الفيديو الجديد",
        "animation": "أرسل GIF جديدًا",
        "audio": "أرسل Audio جديدًا",
        "voice": "أرسل بصمة صوتية جديدة",
        "document": "أرسل الملف الجديد",
        "sticker": "أرسل الملصق الجديد",
        "video_note": "أرسل فيديو دائريًا جديدًا",
    }
    if block.get("type") == "list":
        list_kind = str(block.get("data", {}).get("kind", "bullet"))
        prompts["list"] = t(f"list.{list_kind}_prompt")
    await state.update_data(
        current_block_id=block_id,
        expected_type=block.get("type"),
        edit_field=None,
    )
    await state.set_state(RichEditorStates.editing_block)
    if isinstance(callback.message, Message):
        await send_add_prompt(
            callback.message,
            state,
            prompts.get(str(block.get("type")), "أرسل المحتوى الجديد من النوع نفسه"),
        )
    await callback.answer()


@router.callback_query(F.data.startswith("r:f:"))
async def edit_block_field(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session:
        return
    _, blocks = session
    try:
        _, _, block_id, field = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("هذا الحقل لم يعد موجودًا.", show_alert=True)
        return
    block = block_by_id(blocks, block_id)
    if block is not None and block.get("type") == "details":
        raise SkipHandler
    field_allowed = block is not None and (
        (field == "caption" and block.get("type") in MEDIA_CAPTION_TYPES)
        or (field == "credit" and block.get("type") in MEDIA_CAPTION_TYPES | QUOTE_TYPES)
    )
    if not field_allowed:
        await callback.answer("هذا الحقل لم يعد موجودًا.", show_alert=True)
        return
    assert block is not None
    prompts = {
        "caption": "أرسل تذييل الوسائط الجديد، أو /remove لحذفه",
        "credit": "أرسل اسم الكاتب/المصدر الجديد، أو /remove لحذفه",
    }
    await state.update_data(
        current_block_id=block_id,
        expected_type=block.get("type"),
        edit_field=field,
    )
    await state.set_state(RichEditorStates.editing_block)
    if isinstance(callback.message, Message):
        await send_add_prompt(callback.message, state, prompts[field])
    await callback.answer()


@router.message(RichEditorStates.editing_block)
async def receive_replacement(
    message: Message,
    state: FSMContext,
    bot: Bot,
) -> None:
    data = await state.get_data()
    if data.get("nested_details_id") or data.get("expected_type") == "details":
        raise SkipHandler
    if await defer_text_for_user_buttons(message, state, "editing_block"):
        return

    blocks = data.get("blocks", [])
    block_id = data.get("current_block_id")
    expected = data.get("expected_type")
    edit_field = data.get("edit_field")
    block = block_by_id(blocks, str(block_id) if block_id else None)
    if block is None:
        await message.answer("هذا الجزء لم يعد موجودًا.")
        await state.set_state(RichEditorStates.managing)
        return

    replacement: dict[str, Any] | None
    if edit_field:
        if not message.text:
            await message.answer("أرسل نصًا لهذا الحقل.")
            return
        remove = message.text.strip().lower() == "/remove"
        key = {"caption": "caption_html", "credit": "credit_html"}.get(str(edit_field))
        if key is None:
            raise SkipHandler
        replacement = copy.deepcopy(block.get("data", {}))
        replacement[key] = None if remove else message.html_text
    elif expected in {"collage", "slideshow"}:
        if message.media_group_id:
            collected = await albums.collect(message)
            if collected is None:
                return
            children = messages_to_blocks(collected)
        else:
            children = message_to_blocks(message)
        children = [item for item in children if item.get("type") in {"photo", "video"}]
        replacement = {**block.get("data", {}), "children": children} if children else None
    elif expected == "map":
        if message.location:
            old_data = block.get("data", {})
            replacement = map_data(
                message.location.latitude,
                message.location.longitude,
            )
            replacement["caption_html"] = old_data.get("caption_html")
            replacement["credit_html"] = old_data.get("credit_html")
        else:
            replacement = None
    elif expected in QUOTE_TYPES:
        if message.text:
            replacement = quote_data(
                message,
                block.get("data", {}).get("credit_html"),
            )
            replacement["media_children"] = block.get("data", {}).get("media_children", [])
        else:
            if message.media_group_id:
                collected = await albums.collect(message)
                if collected is None:
                    return
                parsed = messages_to_blocks(collected)
            else:
                parsed = message_to_blocks(message)
            media_children, caption = quote_media_payload(parsed)
            if media_children:
                replacement = {**block.get("data", {}), "media_children": media_children}
                if caption:
                    replacement["quote_text"] = caption["data"].get("text", "")
                    replacement["quote_html"] = caption["data"].get("html", "")
            else:
                replacement = None
    elif expected == "anchor":
        replacement = copy.deepcopy(block.get("data", {}))
        if not message.text or not set_anchor_display_name(
            {"type": "anchor", "data": replacement},
            message.text,
        ):
            await message.answer(t("anchor.name_required"))
            return
    elif expected in {
        "paragraph", "heading", "preformatted", "footer",
        "mathematical_expression", "list", "table",
    }:
        replacement = (
            text_data(
                message,
                str(expected),
                data.get("heading_size", block.get("data", {}).get("size", 2)),
                str(block.get("data", {}).get("kind", "bullet")),
            )
            if message.text
            else None
        )
        if expected == "list" and replacement is not None and not replacement.get("items"):
            await message.answer(t("list.empty"))
            return
    else:
        replacement = replacement_data(message, str(expected or ""))
        if replacement is not None and expected in MEDIA_CAPTION_TYPES:
            replacement["caption_html"] = block.get("data", {}).get("caption_html")
            replacement["credit_html"] = block.get("data", {}).get("credit_html")

    if replacement is None:
        await message.answer("نوع المحتوى غير صحيح. أرسل نفس نوع الجزء المطلوب.")
        return

    for key in ("native", "native_data", "native_type"):
        replacement.pop(key, None)

    updated = await replace_payload(
        state,
        blocks,
        str(block["id"]),
        replacement,
        source="generated",
    )
    if updated is None:
        await message.answer("هذا الجزء لم يعد موجودًا.")
        await state.set_state(RichEditorStates.managing)
        return

    await delete_add_step_messages(bot, message, data, state)
    await state.update_data(
        current_block_id=None,
        expected_type=None,
        edit_field=None,
        heading_size=None,
    )
    await state.set_state(RichEditorStates.managing)
    await edit_saved_ui(
        bot,
        state,
        block_page(updated, blocks),
        build_managed_block_keyboard(updated, blocks),
    )


@router.callback_query(F.data.startswith("r:ct:"))
async def toggle_checklist_task(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    try:
        _, _, block_id, raw_index = callback.data.split(":", 3)
        item_index = int(raw_index)
    except (TypeError, ValueError):
        await callback.answer(t("list.invalid"), show_alert=True)
        return
    block = block_by_id(blocks, block_id)
    items = block.get("data", {}).get("items", []) if block else []
    if (
        block is None
        or block.get("type") != "list"
        or block.get("data", {}).get("kind") != "checklist"
        or not 0 <= item_index < len(items)
        or not isinstance(items[item_index], dict)
    ):
        await callback.answer(t("list.missing_task"), show_alert=True)
        return

    replacement = copy.deepcopy(block.get("data", {}))
    replacement_items = replacement.get("items", [])
    item = replacement_items[item_index]
    item["has_checkbox"] = True
    item["is_checked"] = not bool(item.get("is_checked"))
    for key in ("native", "native_data", "native_type"):
        replacement.pop(key, None)
    updated = await replace_payload(state, blocks, block_id, replacement)
    if updated is None:
        await callback.answer(t("list.missing_task"), show_alert=True)
        return
    await edit_ui(
        callback.message,
        block_page(updated, blocks),
        build_managed_block_keyboard(updated, blocks),
    )
    await callback.answer(
        t("list.marked_done") if item["is_checked"] else t("list.marked_pending"),
    )


__all__ = [
    "edit_block",
    "edit_block_field",
    "receive_replacement",
    "router",
    "toggle_checklist_task",
]
