from __future__ import annotations

import copy
from typing import Any

from aiogram import F, Router
from aiogram.enums import ButtonStyle
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from app.services.blocks import get_block_by_id, table_rows
from app.services.page_registry import page_registry
from app.states import RichEditorStates

# Import the editor module itself so we can reuse its session/UI helpers and patch
# the table-options keyboard that it imported directly at module load time.
from app.routers import editor_core


router = Router(name="table_direction")


def build_table_options_keyboard(block_id: str) -> InlineKeyboardMarkup:
    """Table options plus a dedicated whole-table direction control."""
    choices = [
        ("🟨 تظليل خلية", "sh"), ("⬜ إلغاء تظليل خلية", "uh"),
        ("↔️ توسيط خلية", "ce"), ("↩️ إلغاء توسيط خلية", "ue"),
        ("🟨 تظليل الجميع", "sha"), ("⬜ إلغاء تظليل الجميع", "uha"),
        ("↔️ توسيط الجميع", "cea"), ("↩️ إلغاء توسيط الجميع", "uea"),
    ]
    rows = [
        [
            InlineKeyboardButton(
                text=text,
                callback_data=f"r:ta:{block_id}:{action}",
            )
            for text, action in choices[index:index + 2]
        ]
        for index in range(0, len(choices), 2)
    ]
    rows.append([
        InlineKeyboardButton(
            text="↔️ تحديد اتجاه الجدول",
            callback_data=f"r:tdir:{block_id}",
            style=ButtonStyle.PRIMARY,
        )
    ])
    rows.append([
        InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:b:{block_id}")
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _table_alignment(block: dict[str, Any]) -> str | None:
    """Return a common cell alignment if all visible cells share one."""
    alignments: set[str] = set()
    for row in table_rows(block):
        for raw_cell in row:
            if isinstance(raw_cell, dict):
                align = str(raw_cell.get("align") or "left")
            else:
                align = "left"
            if align not in {"left", "center", "right"}:
                align = "left"
            alignments.add(align)
            if len(alignments) > 1:
                return None
    return next(iter(alignments), "left")


def build_table_direction_keyboard(block: dict[str, Any]) -> InlineKeyboardMarkup:
    block_id = str(block["id"])
    current = _table_alignment(block)
    choices = [
        ("⬅️ لليسار", "left"),
        ("↔️ توسيط", "center"),
        ("➡️ لليمين", "right"),
    ]
    rows = [[InlineKeyboardButton(
        text=f"{'✅ ' if current == value else ''}{label}",
        callback_data=f"r:tdset:{block_id}:{value}",
        style=ButtonStyle.SUCCESS if current == value else None,
    )] for label, value in choices]
    rows.append([
        InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:tm:{block_id}")
    ])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def _set_table_alignment(block: dict[str, Any], alignment: str) -> bool:
    """Apply one horizontal alignment to every table cell.

    Telegram's Rich Table API exposes horizontal alignment per cell rather than
    on the table block itself. Rebuilding editor rows here also safely detaches
    received native tables before editing, while preserving cell metadata.
    """
    if alignment not in {"left", "center", "right"} or block.get("type") != "table":
        return False

    old = block.setdefault("data", {})
    rows = copy.deepcopy(table_rows(block))
    if not rows:
        return False

    native = old.get("native_data") if isinstance(old.get("native_data"), dict) else {}
    data = {
        **{
            key: value
            for key, value in old.items()
            if key not in {"native", "native_data", "html", "rows"}
        },
        "rows": rows,
        "is_bordered": old.get("is_bordered", native.get("is_bordered", True)),
        "is_striped": old.get("is_striped", native.get("is_striped")),
        "caption_rich_text": old.get("caption_rich_text", native.get("caption")),
        "native": False,
        "table_alignment": alignment,
    }

    for row in rows:
        for column_index, raw_cell in enumerate(row):
            cell = copy.deepcopy(raw_cell) if isinstance(raw_cell, dict) else {"text": str(raw_cell)}
            cell.pop("_previous_align", None)
            cell["align"] = alignment
            cell.setdefault("valign", "middle")
            row[column_index] = cell

    block["data"] = data
    return True


def install() -> None:
    """Patch the editor's imported table-options builder."""
    editor_core.build_table_options_keyboard = build_table_options_keyboard


@router.callback_query(F.data.startswith("r:tdir:"))
async def open_table_direction(callback: CallbackQuery, state: FSMContext) -> None:
    session = await editor_core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return
    await editor_core._edit_ui(
        callback.message,
        "حدد اتجاه محتوى الجدول:",
        build_table_direction_keyboard(block),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:tdset:"))
async def set_table_direction(callback: CallbackQuery, state: FSMContext) -> None:
    session = await editor_core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    try:
        _, _, block_id, alignment = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return

    block = get_block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return
    if not _set_table_alignment(block, alignment):
        await callback.answer("تعذر تغيير اتجاه الجدول.", show_alert=True)
        return

    await state.update_data(blocks=blocks)
    await editor_core._edit_ui(
        callback.message,
        "حدد اتجاه محتوى الجدول:",
        build_table_direction_keyboard(block),
    )
    label = {"left": "لليسار", "center": "توسيط", "right": "لليمين"}[alignment]
    await callback.answer(f"تم ضبط اتجاه الجدول: {label}")


@router.callback_query(F.data == "r:savepage")
async def save_or_update_page(callback: CallbackQuery, state: FSMContext) -> None:
    """Update an opened saved page immediately; ask for a title only for new pages."""
    session = await editor_core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    if not blocks:
        await callback.answer("لا توجد أجزاء لحفظها.", show_alert=True)
        return

    data = await state.get_data()
    existing_id = str(data.get("current_page_id") or "")
    if not existing_id:
        await state.set_state(RichEditorStates.saving_page_name)
        await editor_core._send_add_prompt(
            callback.message,
            state,
            "أرسل اسم الصفحة لحفظها؛ الحد الأقصى 64 حرفًا.",
        )
        await callback.answer()
        return

    existing = await page_registry.get(existing_id)
    if existing is None or int(existing.get("owner_id", 0)) != callback.from_user.id:
        # The saved page vanished; fall back to a new save instead of silently
        # creating a different code under an old current_page_id.
        await state.update_data(current_page_id=None, current_page_title=None)
        await state.set_state(RichEditorStates.saving_page_name)
        await editor_core._send_add_prompt(
            callback.message,
            state,
            "الصفحة الأصلية لم تعد موجودة. أرسل اسمًا لحفظها كصفحة جديدة.",
        )
        await callback.answer("الصفحة الأصلية لم تعد موجودة.", show_alert=True)
        return

    title = str(data.get("current_page_title") or existing.get("title") or existing_id)[:64]
    code = await page_registry.save(
        callback.from_user.id,
        title,
        blocks,
        data.get("message_buttons") or [],
        editor_core._buttons_per_row(data),
        str(data.get("buttons_align", "center")),
        page_id=existing_id,
    )
    await state.set_state(RichEditorStates.managing)
    await state.update_data(current_page_id=code, current_page_title=title)
    await editor_core._edit_ui(
        callback.message,
        f"✅ تم تحديث الصفحة المحفوظة «{title}».\n\n{editor_core.MAIN_TEXT}",
        editor_core.build_rich_editor_keyboard(blocks),
    )
    await callback.answer("✅ تم حفظ التعديلات بنفس الكود")
