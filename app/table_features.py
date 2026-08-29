from __future__ import annotations

import copy
from typing import Any

from aiogram import Bot, F, Router
from aiogram.enums import ButtonStyle
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, InlineKeyboardButton, InlineKeyboardMarkup, Message

from app.services.blocks import get_block_by_id, table_rows
from app.services.page_registry import page_registry
from app.services import renderer as rich_renderer
from app.states import RichEditorStates

# Reuse the compatibility editor's session/UI helpers while table-specific
# controls are kept isolated in this feature module.
from app.routers import editor_core


router = Router(name="table_features")
_original_editor_input_block = rich_renderer._editor_input_block


def _table_data_for_edit(block: dict[str, Any]) -> dict[str, Any] | None:
    """Detach a received native table before changing table-level properties."""
    if block.get("type") != "table":
        return None
    old = block.setdefault("data", {})
    rows = copy.deepcopy(table_rows(block))
    if not rows:
        return None
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
        "is_compact": old.get("is_compact", native.get("is_compact")),
        "caption_rich_text": old.get("caption_rich_text", native.get("caption")),
        "native": False,
    }
    block["data"] = data
    return data


def _table_flag(block: dict[str, Any], field: str) -> bool:
    data = block.get("data", {})
    native = data.get("native_data") if isinstance(data.get("native_data"), dict) else {}
    if field == "is_bordered":
        return bool(data.get(field, native.get(field, True)))
    return bool(data.get(field, native.get(field, False)))


def build_table_options_keyboard(block_id: str) -> InlineKeyboardMarkup:
    """Existing cell tools plus current table-level Bot API features."""
    choices = [
        ("🟨 تظليل خلية", "sh"), ("⬜ إلغاء تظليل خلية", "uh"),
        ("↔️ توسيط خلية", "ce"), ("↩️ إلغاء توسيط خلية", "ue"),
        ("🟨 تظليل الجميع", "sha"), ("⬜ إلغاء تظليل الجميع", "uha"),
        ("↔️ توسيط الجميع", "cea"), ("↩️ إلغاء توسيط الجميع", "uea"),
    ]
    rows = [
        [InlineKeyboardButton(text=text, callback_data=f"r:ta:{block_id}:{action}")
         for text, action in choices[index:index + 2]]
        for index in range(0, len(choices), 2)
    ]
    rows.append([
        InlineKeyboardButton(
            text="🧱 إعدادات مظهر الجدول",
            callback_data=f"r:tdisplay:{block_id}",
            style=ButtonStyle.PRIMARY,
        )
    ])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:b:{block_id}")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_table_display_keyboard(block: dict[str, Any]) -> InlineKeyboardMarkup:
    block_id = str(block["id"])
    bordered = _table_flag(block, "is_bordered")
    striped = _table_flag(block, "is_striped")
    compact = _table_flag(block, "is_compact")
    data = block.get("data", {})
    has_caption = bool(
        data.get("caption_rich_text")
        or data.get("caption_html")
        or data.get("caption_text")
        or (isinstance(data.get("native_data"), dict) and data["native_data"].get("caption"))
    )
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=f"{'✅' if bordered else '❌'} الحدود",
            callback_data=f"r:ttoggle:{block_id}:is_bordered",
        )],
        [InlineKeyboardButton(
            text=f"{'✅' if striped else '❌'} صفوف مخططة",
            callback_data=f"r:ttoggle:{block_id}:is_striped",
        )],
        [InlineKeyboardButton(
            text=f"{'✅' if compact else '❌'} وضع مضغوط",
            callback_data=f"r:ttoggle:{block_id}:is_compact",
        )],
        [InlineKeyboardButton(
            text=f"✏️ {'تعديل عنوان الجدول' if has_caption else 'إضافة عنوان للجدول'}",
            callback_data=f"r:tcaption:{block_id}",
        )],
        [InlineKeyboardButton(text="🔙 رجوع", callback_data=f"r:tm:{block_id}")],
    ])


def _editor_input_block_with_table_features(block: dict[str, Any], path: str) -> dict[str, Any]:
    """Keep renderer behavior intact and add/normalize current table properties."""
    payload = _original_editor_input_block(block, path)
    if block.get("type") != "table" or payload.get("type") != "table":
        return payload
    data = block.get("data", {})
    native = data.get("native_data") if isinstance(data.get("native_data"), dict) else {}
    values = {
        "is_bordered": data.get("is_bordered", native.get("is_bordered", True)),
        "is_striped": data.get("is_striped", native.get("is_striped")),
        "is_compact": data.get("is_compact", native.get("is_compact")),
    }
    for field, value in values.items():
        # Bot API defines these as optional True fields; omission means disabled.
        payload[field] = True if value else None
    return payload


def install() -> None:
    """Install table controls and Bot API 10.3 serialization support."""
    editor_core.build_table_options_keyboard = build_table_options_keyboard
    rich_renderer._editor_input_block = _editor_input_block_with_table_features


@router.callback_query(F.data.startswith("r:tdisplay:"))
async def open_table_display(callback: CallbackQuery, state: FSMContext) -> None:
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
        "إعدادات مظهر الجدول:",
        build_table_display_keyboard(block),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:ttoggle:"))
async def toggle_table_display(callback: CallbackQuery, state: FSMContext) -> None:
    session = await editor_core._session(callback, state)
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
    block = get_block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return
    current = _table_flag(block, field)
    data = _table_data_for_edit(block)
    if data is None:
        await callback.answer("تعذر تعديل الجدول.", show_alert=True)
        return
    data[field] = not current
    await state.update_data(blocks=blocks)
    await editor_core._edit_ui(
        callback.message,
        "إعدادات مظهر الجدول:",
        build_table_display_keyboard(block),
    )
    labels = {
        "is_bordered": "الحدود",
        "is_striped": "الصفوف المخططة",
        "is_compact": "الوضع المضغوط",
    }
    await callback.answer(f"تم {'تفعيل' if not current else 'إلغاء'} {labels[field]}")


@router.callback_query(F.data.startswith("r:tcaption:"))
async def request_table_caption(callback: CallbackQuery, state: FSMContext) -> None:
    session = await editor_core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return
    await state.set_state(RichEditorStates.editing_table_caption)
    await state.update_data(table_caption_block_id=block_id)
    await editor_core._send_add_prompt(
        callback.message,
        state,
        "أرسل عنوان الجدول. لإزالة العنوان أرسل /empty",
    )
    await callback.answer()


@router.message(RichEditorStates.editing_table_caption)
async def receive_table_caption(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    block_id = str(data.get("table_caption_block_id") or "")
    blocks = data.get("blocks") or []
    block = get_block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await state.set_state(RichEditorStates.managing)
        await message.answer("هذا الجدول لم يعد موجودًا.")
        return
    table_data = _table_data_for_edit(block)
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
    await state.update_data(blocks=blocks, table_caption_block_id=None)
    await editor_core._delete_add_step_messages(bot, message, data, state)
    await state.set_state(RichEditorStates.managing)
    await editor_core._edit_saved_ui(
        bot,
        state,
        "إعدادات مظهر الجدول:",
        build_table_display_keyboard(block),
    )


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
