from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.history import redo, undo
from app.i18n import t
from app.keyboards import build_rich_editor_keyboard
from app.states import RichEditorStates

from app.routers.editor_ui import edit_ui, editor_dashboard_text


router = Router(name="editor_history")


@router.callback_query(F.data == "r:undo")
async def undo_editor_action(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if not isinstance(callback.message, Message):
        return

    restored = await undo(state)
    if restored is None:
        await callback.answer(t("editor.undo_empty"), show_alert=True)
        return

    draft = await draft_store.load(state)
    await state.set_state(RichEditorStates.managing)
    await edit_ui(
        callback.message,
        t("editor.empty_hint") if not draft.blocks else editor_dashboard_text(draft),
        build_rich_editor_keyboard(draft.blocks, draft.message_buttons),
    )
    await callback.answer(t("editor.undo_done"))


@router.callback_query(F.data == "r:redo")
async def redo_editor_action(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if not isinstance(callback.message, Message):
        return

    restored = await redo(state)
    if restored is None:
        await callback.answer(t("editor.redo_empty"), show_alert=True)
        return

    draft = await draft_store.load(state)
    await state.set_state(RichEditorStates.managing)
    await edit_ui(
        callback.message,
        t("editor.empty_hint") if not draft.blocks else editor_dashboard_text(draft),
        build_rich_editor_keyboard(draft.blocks, draft.message_buttons),
    )
    await callback.answer(t("editor.redo_done"))


__all__ = [
    "redo_editor_action",
    "router",
    "undo_editor_action",
]
