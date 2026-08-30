from __future__ import annotations

import copy

from aiogram import Bot, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.editor.draft_store import draft_store
from app.keyboards import build_button_type_keyboard, build_buttons_manager_keyboard
from app.services.buttons import (
    add_message_button,
    change_message_button_type,
    get_button_type,
    get_message_button,
    infer_button_type_and_value,
)
from app.services.page_registry import page_registry
from app.states import RichEditorStates

from app.routers.button_support import (
    delete_input_message,
    edit_saved_button_ui,
    normalize_button_value,
    save_changed_draft,
)


router = Router(name="button_input")


@router.message(RichEditorStates.editing_button)
async def receive_button_value(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    action = data.get("pending_button_action")
    value = (message.text or "").strip()
    if not value:
        await message.answer("أرسل قيمة نصية صحيحة.")
        return
    if action in {"add_title", "title"} and len(value) > 64:
        await message.answer("عنوان الزر طويل جدًا؛ الحد الأقصى 64 حرفًا.")
        return
    if action == "add_title":
        await state.update_data(
            pending_button_action="add_type",
            pending_button_text=value,
            pending_button_type=None,
        )
        await edit_saved_button_ui(
            bot,
            state,
            f"نوع الزر الجديد: {value}\n\nاختر وظيفة الزر:",
            build_button_type_keyboard(),
        )
        await delete_input_message(message)
        return

    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    buttons = after.message_buttons
    if isinstance(action, str) and action.startswith("add_") and action != "add_title":
        button_type = str(data.get("pending_button_type") or action.removeprefix("add_"))
        normalized_value, error = normalize_button_value(button_type, value)
        if error or normalized_value is None:
            await message.answer(error or "قيمة الزر غير صالحة.")
            return
        button = add_message_button(
            buttons,
            str(data.get("pending_button_text", "زر")),
            normalized_value,
            button_type,
        )
        if button is None:
            await message.answer("تعذر إضافة الزر؛ وصلت إلى الحد الأقصى.")
            await state.set_state(RichEditorStates.managing)
            return
        notice = "✅ تمت إضافة الزر. اختر لونه من لوحة التعديل."
    else:
        button = get_message_button(buttons, str(data.get("current_button_id", "")))
        if button is None:
            await message.answer("هذا الزر لم يعد موجودًا.")
            await state.set_state(RichEditorStates.managing)
            return
        if action == "change_type_value":
            button_type = str(data.get("pending_button_type") or "")
            normalized_value, error = normalize_button_value(button_type, value)
            if error or normalized_value is None:
                await message.answer(error or "قيمة الزر غير صالحة.")
                return
            change_message_button_type(button, button_type, normalized_value)
            notice = "✅ تم تغيير نوع الزر."
        elif action == "title":
            button["text"] = value
            notice = "✅ تم تغيير عنوان الزر."
        elif action == "value":
            old_type = get_button_type(button)
            button_type, inferred_value = infer_button_type_and_value(value, old_type)
            normalized_value, error = normalize_button_value(button_type, inferred_value)
            if error or normalized_value is None:
                await message.answer(error or "قيمة الزر غير صالحة.")
                return
            if button_type == "page":
                page = await page_registry.get(normalized_value)
                user_id = message.from_user.id if message.from_user else 0
                if page is None or int(page.get("owner_id", 0)) != int(user_id):
                    await message.answer("كود الصفحة غير موجود أو لا يخصك.")
                    return
            change_message_button_type(button, button_type, normalized_value)
            notice = (
                "✅ تم تغيير محتوى الزر ونوعه تلقائيًا."
                if button_type != old_type
                else "✅ تم تغيير محتوى الزر."
            )
        else:
            await message.answer("انتهت عملية تعديل الزر. ارجع إلى لوحة الإدارة وحاول مجددًا.")
            await state.set_state(RichEditorStates.managing)
            return

    await save_changed_draft(state, before, after)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        current_button_id=None,
        pending_button_action=None,
        pending_button_text=None,
        pending_button_type=None,
    )
    await edit_saved_button_ui(
        bot,
        state,
        f"{notice}\n\nإدارة أزرار الرسالة الغنية\nعدد الأزرار: {len(buttons)}",
        build_buttons_manager_keyboard(buttons, after.buttons_per_row),
    )
    await delete_input_message(message)


__all__ = ["receive_button_value", "router"]
