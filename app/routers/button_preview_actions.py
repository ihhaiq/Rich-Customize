from __future__ import annotations

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.session import load_editor_session
from app.routers.button_support import prepare_message_buttons, preview_buttons
from app.services.popup_registry import popup_registry

router = Router(name="button_preview_actions")


@router.callback_query(F.data == "r:bpreview")
async def preview_message_buttons(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await load_editor_session(callback, state)
    if not session:
        return
    data, _ = session
    draft = await draft_store.load(state)
    if not draft.message_buttons:
        await callback.answer("لا توجد أزرار لمعاينتها.", show_alert=True)
        return
    prepared = await prepare_message_buttons(draft.message_buttons)
    old_preview_id = data.get("button_preview_message_id")
    if old_preview_id:
        try:
            await bot.delete_message(chat_id=callback.from_user.id, message_id=old_preview_id)
        except TelegramBadRequest:
            pass
    sent = await preview_buttons(bot, callback.from_user.id, prepared, draft.buttons_per_row)
    await state.update_data(button_preview_message_id=sent.message_id)
    await callback.answer("تم فتح المعاينة")


@router.callback_query(F.data == "r:bpback")
async def close_buttons_preview(callback: CallbackQuery, state: FSMContext) -> None:
    if isinstance(callback.message, Message):
        try:
            await callback.message.delete()
        except TelegramBadRequest:
            pass
    await state.update_data(button_preview_message_id=None)
    await callback.answer("تم إغلاق المعاينة")


@router.callback_query(F.data.startswith("r:popup:"))
async def show_popup_button(callback: CallbackQuery) -> None:
    button_id = callback.data.rsplit(":", 1)[-1]
    popup_text = await popup_registry.get(button_id)
    if popup_text is None:
        await callback.answer("هذا التنبيه لم يعد متاحاً.", show_alert=True)
        return
    await callback.answer(popup_text[:200], show_alert=True)


@router.callback_query(F.data.startswith("r:poptext:"))
async def show_inline_popup_button(callback: CallbackQuery) -> None:
    await callback.answer(callback.data.removeprefix("r:poptext:"), show_alert=True)


__all__ = [
    "close_buttons_preview",
    "preview_message_buttons",
    "router",
    "show_inline_popup_button",
    "show_popup_button",
]
