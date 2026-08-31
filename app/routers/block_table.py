from __future__ import annotations

import copy

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.keyboards import build_table_cell_keyboard, build_table_options_keyboard
from app.services.blocks import (
    set_all_table_cells_style,
    set_table_cell_style,
    table_rows,
)

from app.editor.session import load_editor_session, user_locks
from app.routers.editor_ui import edit_ui
from app.routers.block_support import block_by_id, replace_payload


router = Router(name="block_table")

TABLE_CELL_ACTIONS = {
    "sh": (True, None, "تم تظليل الخلية"),
    "uh": (False, None, "تم إلغاء تظليل الخلية"),
    "ce": (None, True, "تم توسيط نص الخلية"),
    "ue": (None, False, "تم إلغاء توسيط نص الخلية"),
}
TABLE_ALL_ACTIONS = {
    "sha": (True, None, "تم تظليل جميع الخلايا"),
    "uha": (False, None, "تم إلغاء تظليل جميع الخلايا"),
    "cea": (None, True, "تم توسيط نص جميع الخلايا"),
    "uea": (None, False, "تم إلغاء توسيط نص جميع الخلايا"),
}


def _editable_table(block: dict) -> dict:
    editable = copy.deepcopy(block)
    editable["source"] = "generated"
    data = editable.setdefault("data", {})
    for key in ("native", "native_data", "native_type"):
        data.pop(key, None)
    return editable


@router.callback_query(F.data.startswith("r:tm:"))
async def table_options(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table" or not table_rows(block):
        await callback.answer("هذا الجدول لم يعد موجودًا أو لا يحتوي خلايا.", show_alert=True)
        return
    await edit_ui(
        callback.message,
        "إعدادات خلايا الجدول\n\nاختر العملية التي تريد تطبيقها:",
        build_table_options_keyboard(block_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:ta:"))
async def choose_table_action(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    try:
        _, _, block_id, action = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    block = block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return

    if action in TABLE_ALL_ACTIONS:
        shaded, centered, notice = TABLE_ALL_ACTIONS[action]
        editable = _editable_table(block)
        if not set_all_table_cells_style(editable, shaded=shaded, centered=centered):
            await callback.answer("تعذر تعديل خلايا الجدول.", show_alert=True)
            return
        updated = await replace_payload(
            state,
            blocks,
            block_id,
            editable.get("data", {}),
        )
        if updated is None:
            await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
            return
        await edit_ui(
            callback.message,
            "إعدادات خلايا الجدول\n\nاختر العملية التي تريد تطبيقها:",
            build_table_options_keyboard(block_id),
        )
        await callback.answer(notice)
        return

    if action not in TABLE_CELL_ACTIONS or not table_rows(block):
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    await edit_ui(
        callback.message,
        "اختر الخلية المطلوبة\n\nالرقم الأول للصف، والثاني للعمود:",
        build_table_cell_keyboard(block, action),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:tc:"))
async def apply_table_cell_action(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session:
            return
        _, blocks = session
        try:
            _, _, block_id, action, raw_row, raw_column = callback.data.split(":", 5)
            row_index, column_index = int(raw_row), int(raw_column)
        except (ValueError, TypeError):
            await callback.answer("اختيار خلية غير صالح.", show_alert=True)
            return
        block = block_by_id(blocks, block_id)
        settings = TABLE_CELL_ACTIONS.get(action)
        if block is None or block.get("type") != "table" or settings is None:
            await callback.answer("هذا الجدول أو الإجراء لم يعد موجودًا.", show_alert=True)
            return
        shaded, centered, notice = settings
        editable = _editable_table(block)
        if not set_table_cell_style(
            editable,
            row_index,
            column_index,
            shaded=shaded,
            centered=centered,
        ):
            await callback.answer("هذه الخلية لم تعد موجودة.", show_alert=True)
            return
        updated = await replace_payload(
            state,
            blocks,
            block_id,
            editable.get("data", {}),
        )
        if updated is None:
            await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
            return
        await edit_ui(
            callback.message,
            "إعدادات خلايا الجدول\n\nاختر العملية التي تريد تطبيقها:",
            build_table_options_keyboard(block_id),
        )
        await callback.answer(notice)


__all__ = [
    "TABLE_ALL_ACTIONS",
    "TABLE_CELL_ACTIONS",
    "apply_table_cell_action",
    "choose_table_action",
    "router",
    "table_options",
]
