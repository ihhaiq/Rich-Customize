from __future__ import annotations

import secrets
from typing import Any

from aiogram import Bot
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.editor.draft_store import EditorDraft, draft_store
from app.editor.history import remember
from app.i18n import preserve_user_content, t, tr
from app.keyboards.message_buttons import build_button_input_keyboard, build_message_buttons_keyboard
from app.services.buttons import (
    BUTTON_TYPES,
    get_button_type,
    get_button_value,
    normalize_button_url,
    normalize_https_url,
    normalize_page_code,
)
from app.services.popup_registry import popup_registry

from app.routers.editor_ui import (
    delete_input_message as remove_input_message,
    edit_ui as edit_button_ui,
    edit_saved_ui as edit_saved_button_ui,
)


def buttons_per_row(data: dict[str, Any]) -> int:
    try:
        return max(1, min(8, int(data.get("buttons_per_row", 1))))
    except (TypeError, ValueError):
        return 1


async def save_changed_draft(
    state: FSMContext,
    before: EditorDraft,
    after: EditorDraft,
) -> bool:
    if before.as_state() == after.as_state():
        return False
    await remember(state)
    await draft_store.save(state, after)
    return True


async def prepare_message_buttons(
    buttons: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    prepared = [dict(button) for button in buttons]
    for button in prepared:
        if get_button_type(button) == "popup":
            token = secrets.token_hex(10)
            button["popup_token"] = token
            await popup_registry.remember(token, get_button_value(button))
    return prepared


def normalize_button_value(button_type: str, value: str) -> tuple[str | None, str | None]:
    if button_type == "disabled":
        return "", None
    if button_type == "url":
        normalized = normalize_button_url(value)
        if normalized is None or len(normalized) > 256:
            return None, tr("الرابط غير صالح. أرسل @username أو رابطًا يبدأ بـ http:// أو https:// أو tg://")
        return normalized, None
    if button_type in {"web_app", "login_url"}:
        normalized = normalize_https_url(value)
        if normalized is None or len(normalized) > 256:
            return None, tr("هذا النوع يحتاج إلى رابط HTTPS صالح.")
        return normalized, None
    if button_type == "page":
        code = normalize_page_code(value)
        if code is None:
            return None, tr("كود الصفحة غير صالح.")
        return code, None
    if button_type == "copy" and len(value) > 256:
        return None, tr("نص النسخ طويل جدًا؛ الحد الأقصى 256 حرفًا.")
    if button_type == "callback_data" and not 1 <= len(value.encode("utf-8")) <= 64:
        return None, tr("قيمة callback_data يجب أن تكون بين 1 و64 بايت.")
    if button_type == "popup" and len(value) > 200:
        return None, tr("نص التنبيه طويل جدًا؛ الحد الأقصى 200 حرف.")
    if button_type in {"switch_inline", "switch_inline_current"}:
        normalized = "" if value.strip().lower() == "/empty" else value
        if len(normalized) > 256:
            return None, tr("استعلام Inline طويل جدًا؛ الحد الأقصى 256 حرفًا.")
        return normalized, None
    if button_type not in BUTTON_TYPES:
        return None, tr("نوع الزر غير صالح لهذه العملية.")
    return value, None


async def prompt_button_input(
    message: Message, state: FSMContext, prompt: str,
) -> None:
    await edit_button_ui(message, prompt, build_button_input_keyboard())
    await state.update_data(
        management_chat_id=message.chat.id,
        management_message_id=message.message_id,
    )


async def delete_input_message(message: Message) -> None:
    await remove_input_message(message)


async def preview_buttons(
    bot: Bot,
    user_id: int,
    buttons: list[dict[str, Any]],
    width: int,
) -> Message:
    with preserve_user_content():
        return await bot.send_message(
            chat_id=user_id,
            text=t("button_preview"),
            parse_mode=None,
            reply_markup=build_message_buttons_keyboard(
                buttons,
                buttons_per_row=width,
                include_back=True,
                back_text=t("ux.common.back"),
            ),
        )


__all__ = [
    "buttons_per_row",
    "delete_input_message",
    "edit_button_ui",
    "edit_saved_button_ui",
    "normalize_button_value",
    "prepare_message_buttons",
    "prompt_button_input",
    "preview_buttons",
    "save_changed_draft",
]
