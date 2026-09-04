from __future__ import annotations

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.session import load_editor_session, user_locks
from app.editor.view_state import normalize_block_scroll_offset
from app.i18n import t
from app.keyboards import build_editor_tools_keyboard, build_rich_editor_keyboard
from app.routers.editor_ui import (
    delete_stored_block_prompt,
    edit_saved_ui,
    edit_ui,
    editor_dashboard_text,
)
from app.services.chat_registry import managed_chat_registry
from app.states import RichEditorStates


router = Router(name="editor_navigation")


@router.callback_query(F.data == "r:no")
async def no_op(callback: CallbackQuery) -> None:
    await callback.answer(t("editor.current_position"))


@router.callback_query(F.data == "r:back")
async def back_to_main(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, blocks = session
    management_message_id = data.get("management_message_id")
    management_chat_id = data.get("management_chat_id")
    is_management_callback = bool(
        management_message_id == callback.message.message_id
        and management_chat_id == callback.message.chat.id
    )
    await delete_stored_block_prompt(
        bot,
        state,
        data,
        protected_message=callback.message if is_management_callback else None,
    )
    draft = await draft_store.load(state)
    block_scroll_offset = normalize_block_scroll_offset(
        len(blocks),
        data.get("block_scroll_offset"),
    )
    await state.update_data(block_scroll_offset=block_scroll_offset)
    if not is_management_callback:
        try:
            await callback.message.delete()
        except TelegramBadRequest:
            pass
    await edit_saved_ui(
        bot,
        state,
        editor_dashboard_text(draft),
        build_rich_editor_keyboard(
            blocks,
            draft.message_buttons,
            block_offset=block_scroll_offset,
        ),
    )
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        current_block_id=None,
        current_button_id=None,
        pending_button_action=None,
        pending_button_text=None,
        pending_add_type=None,
        pending_child_type=None,
        add_step=None,
        add_payload=None,
        nested_details_id=None,
        nested_child_id=None,
        nested_action=None,
        block_scroll_enabled=True,
    )
    await managed_chat_registry.clear_panel(callback.from_user.id)
    await callback.answer()


@router.callback_query(F.data.startswith("r:blockscroll:"))
async def scroll_blocks(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        await callback.answer()
        return
    try:
        requested_offset = int((callback.data or "").rsplit(":", 1)[1])
    except (TypeError, ValueError, IndexError):
        await callback.answer()
        return

    await callback.answer()
    async with user_locks[callback.from_user.id]:
        if await state.get_state() != RichEditorStates.managing.state:
            return
        data = await state.get_data()
        if not isinstance(data.get("blocks"), list):
            return
        if data.get("block_scroll_enabled", True) is not True:
            return
        if data.get("current_block_id") is not None:
            return
        management_message_id = data.get("management_message_id")
        management_chat_id = data.get("management_chat_id")
        if (
            management_message_id != callback.message.message_id
            or management_chat_id != callback.message.chat.id
        ):
            return

        draft = await draft_store.load(state)
        block_scroll_offset = normalize_block_scroll_offset(
            len(draft.blocks),
            requested_offset,
        )
        await state.update_data(block_scroll_offset=block_scroll_offset)
        draft = await draft_store.load(state)
        await edit_ui(
            callback.message,
            editor_dashboard_text(draft),
            build_rich_editor_keyboard(
                draft.blocks,
                draft.message_buttons,
                block_offset=block_scroll_offset,
            ),
        )


@router.callback_query(F.data == "r:tools")
async def open_editor_tools(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    await state.update_data(block_scroll_enabled=False)
    await edit_ui(
        callback.message,
        t("editor.tools_text"),
        build_editor_tools_keyboard(),
    )
    await callback.answer()


__all__ = [
    "back_to_main",
    "no_op",
    "open_editor_tools",
    "router",
    "scroll_blocks",
]
