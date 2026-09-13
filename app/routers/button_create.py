from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.session import load_editor_session
from app.i18n import t, tr
from app.routers.button_support import prompt_button_input
from app.services.buttons import MAX_BUTTONS
from app.states import RichEditorStates

router = Router(name="button_create")


@router.callback_query(F.data == "r:ba")
async def start_add_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    draft = await draft_store.load(state)
    if len(draft.message_buttons) >= MAX_BUTTONS:
        await callback.answer(tr("وصلت إلى الحد الأقصى للأزرار."), show_alert=True)
        return
    await state.set_state(RichEditorStates.editing_button)
    await state.update_data(
        pending_button_action="add_spec", current_button_id=None,
        pending_button_text=None, pending_button_type=None,
    )
    await prompt_button_input(
        callback.message, state,
        t("buttons.send_format", label="{ " + t("buttons.format_parts") + " }"),
    )
    await callback.answer()


__all__ = ["router", "start_add_button"]
