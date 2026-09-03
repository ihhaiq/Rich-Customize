from __future__ import annotations

import copy
import logging

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.history import remember
from app.editor.session import load_editor_session, user_locks
from app.i18n import t
from app.keyboards import build_error_recovery_keyboard, build_rich_editor_keyboard
from app.routers.button_support import prepare_message_buttons
from app.routers.editor_ui import (
    delete_input_message,
    edit_saved_ui,
    editor_dashboard_text,
    friendly_rich_error,
    repost_saved_ui,
)
from app.services.parser import message_to_blocks
from app.services.renderer import RichMessageRenderError, send_rich_message_preview
from app.states import RichEditorStates


router = Router(name="editor_preview")
logger = logging.getLogger(__name__)


@router.callback_query(F.data == "r:result")
async def preview(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await load_editor_session(callback, state)
    if not session:
        return
    data, blocks = session
    draft = await draft_store.load(state)
    await callback.answer("جاري إنشاء المعاينة…")
    panel_notice = "✅ المعاينة جاهزة."
    try:
        prepared_buttons = await prepare_message_buttons(draft.message_buttons)
        sent_messages = await send_rich_message_preview(
            bot,
            callback.from_user.id,
            blocks,
            buttons=prepared_buttons,
            buttons_per_row=draft.buttons_per_row,
            buttons_align=draft.buttons_align,
            source_page_id=draft.current_page_id,
        ) or []
        if sent_messages:
            for message_id in data.get("preview_message_ids", []):
                try:
                    await bot.delete_message(
                        chat_id=callback.from_user.id, message_id=message_id,
                    )
                except TelegramBadRequest as error:
                    logger.debug(
                        "Could not remove an old preview message %s: %s",
                        message_id,
                        error,
                    )
            await state.update_data(
                preview_message_ids=[message.message_id for message in sent_messages]
            )
    except RichMessageRenderError as error:
        logger.exception(
            "Telegram rejected the single rich preview for user_id=%s",
            callback.from_user.id,
        )
        await bot.send_message(
            callback.from_user.id,
            "تعذر إرسال النتيجة كرسالة غنية واحدة؛ لم يتم تقسيمها إلى رسائل منفصلة.\n"
            f"السبب: {friendly_rich_error(error)}",
            reply_markup=build_error_recovery_keyboard(),
        )
        panel_notice = "⚠️ تعذرت المعاينة."
    except Exception:
        logger.exception(
            "Failed to render preview for user_id=%s", callback.from_user.id,
        )
        await bot.send_message(
            callback.from_user.id,
            "تعذر إنشاء المعاينة. راجع السجل لمعرفة الخطأ.",
            reply_markup=build_error_recovery_keyboard(),
        )
        panel_notice = "⚠️ تعذرت المعاينة."

    async with user_locks[callback.from_user.id]:
        if await state.get_state() != RichEditorStates.managing.state:
            return
        latest_data = await state.get_data()
        if latest_data.get("block_scroll_enabled", True) is not True:
            return
        if latest_data.get("current_block_id") is not None:
            return
        latest_draft = await draft_store.load(state)
        latest_data = await state.get_data()
        if isinstance(callback.message, Message):
            management_id = latest_data.get("management_message_id")
            if callback.message.message_id != management_id:
                try:
                    await callback.message.delete()
                except TelegramBadRequest:
                    pass
        await repost_saved_ui(
            bot,
            state,
            editor_dashboard_text(latest_draft, panel_notice),
            build_rich_editor_keyboard(
                latest_draft.blocks,
                latest_draft.message_buttons,
            ),
        )


@router.message(RichEditorStates.managing, F.rich_message)
async def import_rich_message_into_editor(
    message: Message,
    state: FSMContext,
    bot: Bot,
) -> None:
    blocks = message_to_blocks(message)
    if not blocks:
        await message.answer(t("editor.rich_import_failed"))
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    after.blocks = blocks
    after.message_buttons = []
    after.buttons_per_row = 1
    after.buttons_align = "center"
    after.current_page_id = None
    after.current_page_title = None
    changed = before.as_state() != after.as_state()
    if changed:
        await remember(state)
    await state.update_data(block_scroll_offset=0, block_scroll_enabled=True)
    if changed:
        await draft_store.save(state, after)
    else:
        await draft_store.load(state)
    await state.update_data(current_block_id=None)
    await delete_input_message(message)
    await edit_saved_ui(
        bot,
        state,
        editor_dashboard_text(after),
        build_rich_editor_keyboard(
            blocks,
            after.message_buttons,
            block_offset=0,
        ),
    )


__all__ = ["import_rich_message_into_editor", "preview", "router"]
