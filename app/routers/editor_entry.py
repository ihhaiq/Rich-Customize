from __future__ import annotations

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.session import albums
from app.i18n import t
from app.keyboards import build_start_editor_keyboard, build_welcome_keyboard
from app.routers.button_target_picker import ask_for_button_user
from app.routers.editor_ui import open_editor
from app.services.inline_buttons import find_user_button_markers
from app.services.parser import message_to_blocks, messages_to_blocks
from app.states import RichEditorStates


router = Router(name="editor_entry")


@router.message(CommandStart())
async def start(message: Message) -> None:
    await message.answer(
        f"{t('welcome')}\n{t('start_editor')}",
        reply_markup=build_welcome_keyboard(),
    )


@router.message(Command("editor"))
async def new_editor(message: Message, state: FSMContext) -> None:
    await state.clear()
    await open_editor(message, state, [])


@router.callback_query(F.data == "r:starteditor")
async def start_editor_from_button(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        await callback.answer()
        return
    await state.clear()
    await open_editor(callback.message, state, [])
    try:
        await callback.message.delete()
    except TelegramBadRequest:
        pass
    await callback.answer()


@router.message(RichEditorStates.waiting_input)
async def receive_source(message: Message, state: FSMContext) -> None:
    if message.media_group_id:
        collected = await albums.collect(message)
        if collected is None:
            return
        blocks = messages_to_blocks(collected)
    else:
        blocks = message_to_blocks(message)
    if not blocks:
        await message.answer(t("unsupported"))
        return
    user_markers = find_user_button_markers(message.text)
    if user_markers:
        await state.set_state(RichEditorStates.selecting_button_user)
        await state.update_data(
            pending_user_blocks=blocks,
            pending_user_markers=user_markers,
            pending_user_marker_index=0,
            pending_user_resume="open_editor",
        )
        await ask_for_button_user(message, state, user_markers[0])
        return
    await open_editor(message, state, blocks)


@router.message(StateFilter(RichEditorStates.managing))
@router.message(StateFilter(None), F.chat.type == "private")
async def managing_extra_message(message: Message) -> None:
    await message.answer(
        t("editor.closed_hint"),
        reply_markup=build_start_editor_keyboard(),
    )


__all__ = [
    "managing_extra_message",
    "new_editor",
    "receive_source",
    "router",
    "start",
    "start_editor_from_button",
]
