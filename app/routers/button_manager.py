from __future__ import annotations

import copy

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.session import load_editor_session
from app.keyboards import (
    build_button_picker_keyboard,
    build_button_position_keyboard,
    build_button_style_keyboard,
    build_button_type_keyboard,
    build_buttons_manager_keyboard,
)
from app.routers.button_support import answer_with_button_guide, edit_button_ui, save_changed_draft
from app.services.buttons import delete_message_button, get_button_type, get_message_button
from app.states import RichEditorStates

router = Router(name="button_manager")


def manager_text(count: int) -> str:
    return f"إدارة أزرار الرسالة الغنية\n\nعدد الأزرار: {count}\nاختر العملية:"


@router.callback_query(F.data == "r:buttons")
async def open_buttons_manager(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    draft = await draft_store.load(state)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(current_button_id=None, pending_button_action=None)
    await edit_button_ui(
        callback.message,
        manager_text(len(draft.message_buttons)),
        build_buttons_manager_keyboard(draft.message_buttons, draft.buttons_per_row),
    )
    await callback.answer()


@router.callback_query(F.data == "r:brow")
async def change_buttons_per_row(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    after.buttons_per_row = 1 if before.buttons_per_row >= 8 else before.buttons_per_row + 1
    await save_changed_draft(state, before, after)
    await edit_button_ui(
        callback.message,
        manager_text(len(after.message_buttons)),
        build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
    )
    await callback.answer(f"عدد الأزرار في الصف: {after.buttons_per_row}")


@router.callback_query(F.data.startswith("r:bs:"))
async def choose_button_action(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    draft = await draft_store.load(state)
    action = callback.data.rsplit(":", 1)[-1]
    if action not in {"delete", "style", "move", "value", "url", "title", "type"}:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    if not draft.message_buttons:
        await callback.answer("لا توجد أزرار بعد. أضف زرًا أولًا.", show_alert=True)
        return
    labels = {
        "delete": "اختر الزر الذي تريد إزالته:",
        "style": "اختر الزر الذي تريد تغيير لونه:",
        "move": "اختر الزر الذي تريد تغيير ترتيبه:",
        "value": "اختر الزر الذي تريد تغيير محتواه:",
        "url": "اختر الزر الذي تريد تغيير محتواه:",
        "title": "اختر الزر الذي تريد تغيير عنوانه:",
        "type": "اختر الزر الذي تريد تغيير نوعه:",
    }
    await edit_button_ui(
        callback.message,
        labels[action],
        build_button_picker_keyboard(draft.message_buttons, action),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:bt:"))
async def select_message_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    try:
        _, _, action, button_id = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    before = await draft_store.load(state)
    button = get_message_button(before.message_buttons, button_id)
    if button is None:
        await callback.answer("هذا الزر لم يعد موجودًا.", show_alert=True)
        return
    if action == "delete":
        after = copy.deepcopy(before)
        if not delete_message_button(after.message_buttons, button_id):
            await callback.answer("هذا الزر لم يعد موجودًا.", show_alert=True)
            return
        await save_changed_draft(state, before, after)
        await state.update_data(current_button_id=None)
        await edit_button_ui(
            callback.message,
            f"✅ تم إزالة الزر.\n\nإدارة أزرار الرسالة الغنية\nعدد الأزرار: {len(after.message_buttons)}",
            build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
        )
        await callback.answer("تم إزالة الزر")
        return
    if action == "style":
        await edit_button_ui(
            callback.message,
            f"تغيير لون الزر: {button['text']}\n\nاختر اللون:",
            build_button_style_keyboard(
                button_id,
                str(button.get("style", "default")),
                allow_link=get_button_type(button) == "popup",
            ),
        )
        await callback.answer()
        return
    if action == "move":
        await edit_button_ui(
            callback.message,
            f"تغيير ترتيب الزر: {button['text']}\n\nاختر الموقع الجديد:",
            build_button_position_keyboard(before.message_buttons, button_id),
        )
        await callback.answer()
        return
    if action == "type":
        await state.update_data(current_button_id=button_id)
        await edit_button_ui(
            callback.message,
            f"تغيير نوع الزر: {button['text']}\n\nاختر النوع الجديد:",
            build_button_type_keyboard(f"r:bct:{button_id}"),
        )
        await callback.answer()
        return
    if action not in {"value", "url", "title"}:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    await state.set_state(RichEditorStates.editing_button)
    pending_action = "value" if action in {"value", "url"} else "title"
    await state.update_data(pending_button_action=pending_action, current_button_id=button_id)
    prompt = (
        "أرسل العنوان الجديد للزر."
        if pending_action == "title"
        else "أرسل المحتوى الجديد. يكتشف البوت النوع تلقائيًا من الصيغة؛ مثلاً LINK: الرابط أو callback_data: الكود أو copy: النص. إذا أرسلت قيمة بلا نوع فسيبقى نوع الزر الحالي."
    )
    await answer_with_button_guide(callback.message, prompt)
    await callback.answer()


__all__ = [
    "change_buttons_per_row",
    "choose_button_action",
    "manager_text",
    "open_buttons_manager",
    "router",
    "select_message_button",
]
