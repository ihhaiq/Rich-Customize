from __future__ import annotations

from typing import Any

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.history import undo
from app.i18n import t
from app.keyboards import build_rich_editor_keyboard
from app.services.blocks import normalize_block_positions
from app.states import RichEditorStates

from app.routers.editor_ui import edit_ui, editor_dashboard_text


router = Router(name="editor_history")
LEGACY_HISTORY_CALLBACKS = frozenset({"undo_last_block_action"})


def _handler_name(handler: Any) -> str:
    return str(getattr(getattr(handler, "callback", None), "__name__", ""))


def detach_legacy_history_handlers(legacy_module: Any) -> tuple[str, ...]:
    observer = legacy_module.router.callback_query
    removed: list[str] = []
    kept = []
    for handler in observer.handlers:
        name = _handler_name(handler)
        if name in LEGACY_HISTORY_CALLBACKS:
            removed.append(name)
        else:
            kept.append(handler)
    observer.handlers[:] = kept
    return tuple(removed)


@router.callback_query(F.data == "r:undo")
async def undo_editor_action(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if not isinstance(callback.message, Message):
        return

    restored = await undo(state)
    if restored is None:
        # Compatibility fallback for legacy handlers that still store exactly
        # one snapshot in undo_blocks. New routers must use app.editor.history.
        data = await state.get_data()
        old_snapshot = data.get("undo_blocks")
        if not isinstance(old_snapshot, list):
            await callback.answer(t("editor.undo_empty"), show_alert=True)
            return
        blocks = normalize_block_positions(old_snapshot)
        await state.update_data(
            blocks=blocks,
            undo_blocks=None,
            current_block_id=None,
        )

    draft = await draft_store.load(state)
    await state.set_state(RichEditorStates.managing)
    await edit_ui(
        callback.message,
        t("editor.empty_hint") if not draft.blocks else editor_dashboard_text(draft),
        build_rich_editor_keyboard(draft.blocks, draft.message_buttons),
    )
    await callback.answer(t("editor.undo_done"))


__all__ = [
    "LEGACY_HISTORY_CALLBACKS",
    "detach_legacy_history_handlers",
    "router",
]
