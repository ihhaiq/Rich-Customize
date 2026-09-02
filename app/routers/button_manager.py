from __future__ import annotations

import copy

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.session import load_editor_session
from app.keyboards import (
    build_button_delete_confirmation_keyboard,
    build_button_editor_keyboard,
    build_button_picker_keyboard,
    build_button_position_keyboard,
    build_button_style_keyboard,
    build_button_type_keyboard,
    build_buttons_manager_keyboard,
)
from app.i18n import t
from app.routers.button_support import answer_with_button_guide, edit_button_ui, save_changed_draft
from app.services.buttons import delete_message_button, get_button_type, get_message_button
from app.states import RichEditorStates

router = Router(name="button_manager")


def manager_text(count: int) -> str:
    lines = [t("ux.buttons.title"), t("ux.buttons.count", count=count), ""]
    lines.append(t("ux.buttons.empty") if count == 0 else t("common.choose_action"))
    return "\n".join(lines)


def button_editor_text(button: dict) -> str:
    return "\n".join([
        t("ux.buttons.editing", title=str(button.get("text") or "Button")),
        t("ux.buttons.current_type", type=t({
            "url": "ux.buttons.type.url",
            "callback_data": "ux.buttons.type.callback",
            "copy": "ux.buttons.type.copy",
            "popup": "ux.buttons.type.popup",
            "web_app": "ux.buttons.type.web_app",
            "login_url": "ux.buttons.type.login_url",
            "switch_inline": "ux.buttons.type.inline",
            "switch_inline_current": "ux.buttons.type.inline_here",
            "disabled": "ux.buttons.type.disabled",
            "page": "ux.buttons.type.page",
        }.get(get_button_type(button), "ux.buttons.type.url"))),
        "",
        t("common.choose_action"),
    ])


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


@router.callback_query(F.data.startswith("r:bed:"))
async def open_button_editor(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    draft = await draft_store.load(state)
    button_id = callback.data.rsplit(":", 1)[-1]
    button = get_message_button(draft.message_buttons, button_id)
    if button is None:
        await callback.answer(t("ux.buttons.missing"), show_alert=True)
        return
    await state.update_data(current_button_id=button_id)
    await edit_button_ui(
        callback.message, button_editor_text(button), build_button_editor_keyboard(button),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:bdel:"))
async def ask_delete_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    draft = await draft_store.load(state)
    button_id = callback.data.rsplit(":", 1)[-1]
    button = get_message_button(draft.message_buttons, button_id)
    if button is None:
        await callback.answer(t("ux.buttons.missing"), show_alert=True)
        return
    await edit_button_ui(
        callback.message,
        t("ux.buttons.delete_confirm", title=str(button.get("text") or "Button")),
        build_button_delete_confirmation_keyboard(button_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:bdelok:"))
async def confirm_delete_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    button_id = callback.data.rsplit(":", 1)[-1]
    if not delete_message_button(after.message_buttons, button_id):
        await callback.answer(t("ux.buttons.missing"), show_alert=True)
        return
    await save_changed_draft(state, before, after)
    await state.update_data(current_button_id=None)
    await edit_button_ui(
        callback.message,
        f"{t('ux.buttons.deleted')}\n\n{manager_text(len(after.message_buttons))}",
        build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
    )
    await callback.answer(t("ux.buttons.deleted"))


@router.callback_query(F.data.startswith("r:bedit:"))
async def edit_selected_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    try:
        _, _, action, button_id = callback.data.split(":", 3)
    except ValueError:
        await callback.answer(t("invalid"), show_alert=True)
        return
    before = await draft_store.load(state)
    button = get_message_button(before.message_buttons, button_id)
    if button is None:
        await callback.answer(t("ux.buttons.missing"), show_alert=True)
        return
    if action == "style":
        await edit_button_ui(
            callback.message,
            t("ux.buttons.editing", title=str(button.get("text") or "Button")),
            build_button_style_keyboard(
                button_id, str(button.get("style", "default")),
                allow_link=get_button_type(button) == "popup",
            ),
        )
    elif action == "move":
        await edit_button_ui(
            callback.message,
            t("ux.buttons.editing", title=str(button.get("text") or "Button")),
            build_button_position_keyboard(before.message_buttons, button_id),
        )
    elif action == "type":
        await state.update_data(current_button_id=button_id)
        await edit_button_ui(
            callback.message,
            t("ux.buttons.editing", title=str(button.get("text") or "Button")),
            build_button_type_keyboard(f"r:bct:{button_id}"),
        )
    elif action in {"title", "value"}:
        await state.set_state(RichEditorStates.editing_button)
        await state.update_data(
            pending_button_action=action, current_button_id=button_id,
        )
        prompt = (
            t("ux.buttons.send_new_title")
            if action == "title"
            else t("ux.buttons.send_new_value")
        )
        await answer_with_button_guide(callback.message, prompt)
    else:
        await callback.answer(t("invalid"), show_alert=True)
        return
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
        await edit_button_ui(
            callback.message,
            t("ux.buttons.delete_confirm", title=str(button.get("text") or "Button")),
            build_button_delete_confirmation_keyboard(button_id),
        )
        await callback.answer()
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
    "ask_delete_button",
    "button_editor_text",
    "change_buttons_per_row",
    "choose_button_action",
    "confirm_delete_button",
    "edit_selected_button",
    "manager_text",
    "open_button_editor",
    "open_buttons_manager",
    "router",
    "select_message_button",
]
