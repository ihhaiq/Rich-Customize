from __future__ import annotations

import copy

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.keyboards import (
    build_table_cell_keyboard,
    build_table_display_keyboard,
    build_table_options_keyboard,
)
from app.services.blocks import (
    editable_table_data,
    set_all_table_cells_style,
    set_table_cell_style,
    table_flag,
    table_rows,
)

from app.editor.session import load_editor_session, user_locks
from app.routers.editor_ui import (
    delete_add_step_messages,
    edit_saved_ui,
    edit_ui,
    send_add_prompt,
)
from app.routers.block_support import block_by_id, replace_payload
from app.states import RichEditorStates


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

TABLE_DISPLAY_HELP_TEXT = (
    "🧱 إعدادات مظهر الجدول\n\n"
    "اختر الخاصية التي تريد تغييرها:\n\n"
    "• الحدود — إظهار أو إخفاء الخطوط المحيطة بالجدول وبين الخلايا.\n"
    "• صفوف مخططة — تمييز الصفوف بالتناوب لتسهيل قراءة الجدول.\n"
    "• وضع مضغوط — تقليل المسافات داخل الخلايا ليظهر الجدول بحجم أصغر وأكثر كثافة.\n"
    "• عنوان الجدول — إضافة نص وصفي يظهر كعنوان للجدول أو تعديل العنوان الحالي.\n\n"
    "✅ = مفعّل   |   ❌ = غير مفعّل"
)


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
        editable = copy.deepcopy(block)
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
        editable = copy.deepcopy(block)
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


@router.callback_query(F.data.startswith("r:tdisplay:"))
async def open_table_display(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return
    await edit_ui(
        callback.message,
        TABLE_DISPLAY_HELP_TEXT,
        build_table_display_keyboard(block),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:ttoggle:"))
async def toggle_table_display(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    try:
        _, _, block_id, field = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    if field not in {"is_bordered", "is_striped", "is_compact"}:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    block = block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return
    current = table_flag(block, field)
    editable = copy.deepcopy(block)
    table_data = editable_table_data(editable)
    if table_data is None:
        await callback.answer("تعذر تعديل الجدول.", show_alert=True)
        return
    table_data[field] = not current
    updated = await replace_payload(state, blocks, block_id, table_data)
    if updated is None:
        await callback.answer("تعذر تعديل الجدول.", show_alert=True)
        return
    await edit_ui(
        callback.message,
        TABLE_DISPLAY_HELP_TEXT,
        build_table_display_keyboard(updated),
    )
    labels = {
        "is_bordered": "الحدود",
        "is_striped": "الصفوف المخططة",
        "is_compact": "الوضع المضغوط",
    }
    await callback.answer(f"تم {'تفعيل' if not current else 'إلغاء'} {labels[field]}")


@router.callback_query(F.data.startswith("r:tcaption:"))
async def request_table_caption(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return
    await state.set_state(RichEditorStates.editing_table_caption)
    await state.update_data(table_caption_block_id=block_id)
    await send_add_prompt(
        callback.message,
        state,
        "أرسل عنوان الجدول. لإزالة العنوان أرسل /empty",
    )
    await callback.answer()


@router.message(RichEditorStates.editing_table_caption)
async def receive_table_caption(message: Message, state: FSMContext, bot: Bot) -> None:
    state_data = await state.get_data()
    block_id = str(state_data.get("table_caption_block_id") or "")
    blocks = state_data.get("blocks") or []
    block = block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await state.set_state(RichEditorStates.managing)
        await message.answer("هذا الجدول لم يعد موجودًا.")
        return
    editable = copy.deepcopy(block)
    table_data = editable_table_data(editable)
    if table_data is None:
        await state.set_state(RichEditorStates.managing)
        await message.answer("تعذر تعديل الجدول.")
        return
    text = (message.text or "").strip()
    if text.casefold() == "/empty":
        table_data["caption_rich_text"] = None
        table_data["caption_html"] = None
        table_data["caption_text"] = None
    elif not text:
        await message.answer("أرسل عنوانًا صحيحًا أو /empty لإزالته.")
        return
    else:
        table_data["caption_rich_text"] = None
        table_data["caption_html"] = message.html_text or text
        table_data["caption_text"] = text
    updated = await replace_payload(state, blocks, block_id, table_data)
    if updated is None:
        await state.set_state(RichEditorStates.managing)
        await message.answer("تعذر تعديل الجدول.")
        return
    await state.update_data(table_caption_block_id=None)
    await delete_add_step_messages(bot, message, state_data, state)
    await state.set_state(RichEditorStates.managing)
    await edit_saved_ui(
        bot,
        state,
        TABLE_DISPLAY_HELP_TEXT,
        build_table_display_keyboard(updated),
    )


__all__ = [
    "TABLE_ALL_ACTIONS",
    "TABLE_CELL_ACTIONS",
    "TABLE_DISPLAY_HELP_TEXT",
    "apply_table_cell_action",
    "choose_table_action",
    "open_table_display",
    "receive_table_caption",
    "request_table_caption",
    "router",
    "table_options",
    "toggle_table_display",
]
