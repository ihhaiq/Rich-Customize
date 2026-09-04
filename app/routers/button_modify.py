from __future__ import annotations

import copy

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.session import load_editor_session
from app.i18n import t, tr
from app.keyboards import build_buttons_manager_keyboard, build_page_target_keyboard
from app.routers.button_support import answer_with_button_guide, edit_button_ui, save_changed_draft
from app.services.buttons import (
    BUTTON_STYLES,
    BUTTON_TYPES,
    change_message_button_type,
    get_button_type,
    get_message_button,
    move_message_button,
)
from app.services.page_registry import page_registry
from app.states import RichEditorStates

router = Router(name="button_modify")


def _manager_notice(text: str) -> str:
    return f"{tr(text)}\n\n{t('buttons_manage')}"


@router.callback_query(F.data.startswith("r:bct:"))
async def change_button_type(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    try:
        _, _, button_id, button_type = callback.data.split(":", 3)
    except ValueError:
        await callback.answer(t("invalid"), show_alert=True)
        return
    before = await draft_store.load(state)
    button = get_message_button(before.message_buttons, button_id)
    if button is None or button_type not in BUTTON_TYPES:
        await callback.answer(tr("هذا الزر أو النوع لم يعد موجودًا."), show_alert=True)
        return
    if button_type == "disabled":
        after = copy.deepcopy(before)
        target = get_message_button(after.message_buttons, button_id)
        assert target is not None
        change_message_button_type(target, "disabled", "")
        await save_changed_draft(state, before, after)
        await state.set_state(RichEditorStates.managing)
        await state.update_data(current_button_id=None)
        await edit_button_ui(
            callback.message,
            _manager_notice("✅ تم تغيير نوع الزر إلى زر معطّل."),
            build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
        )
        await callback.answer(tr("تم تغيير النوع"))
        return
    if button_type == "page":
        pages = await page_registry.list_for_user(callback.from_user.id)
        if not pages:
            await callback.answer(tr("احفظ صفحة أولاً حتى تربط الزر بها."), show_alert=True)
            return
        await edit_button_ui(
            callback.message,
            f"{tr('اختر الصفحة التي يفتحها الزر: ')}{button['text']}",
            build_page_target_keyboard(pages, "change", button_id),
        )
        await callback.answer()
        return
    prompts = {
        "url": tr("أرسل الرابط الجديد؛ يقبل @username أيضًا."),
        "callback_data": tr("أرسل callback_data الجديدة؛ الحد الأقصى 64 بايت."),
        "copy": tr("أرسل النص الذي تريد نسخه؛ الحد الأقصى 256 حرفًا."),
        "popup": tr("أرسل نص التنبيه؛ الحد الأقصى 200 حرف."),
        "web_app": tr("أرسل رابط Web App يبدأ بـ https://"),
        "login_url": tr("أرسل رابط HTTPS من الدومين المربوط عبر @BotFather ثم /setdomain."),
        "switch_inline": tr("أرسل استعلام Inline، أو /empty."),
        "switch_inline_current": tr("أرسل استعلام Inline للمحادثة الحالية، أو /empty."),
    }
    await state.set_state(RichEditorStates.editing_button)
    await state.update_data(
        current_button_id=button_id,
        pending_button_action="change_type_value",
        pending_button_type=button_type,
    )
    await answer_with_button_guide(callback.message, prompts[button_type])
    await callback.answer()


@router.callback_query(F.data.startswith("r:bsc:"))
async def change_button_style(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    try:
        _, _, button_id, style = callback.data.split(":", 3)
    except ValueError:
        await callback.answer(t("invalid"), show_alert=True)
        return
    before = await draft_store.load(state)
    current = get_message_button(before.message_buttons, button_id)
    if (
        current is None
        or style not in BUTTON_STYLES
        or (style == "link" and get_button_type(current) != "popup")
    ):
        await callback.answer(tr("هذا الزر أو اللون لم يعد موجودًا."), show_alert=True)
        return
    after = copy.deepcopy(before)
    target = get_message_button(after.message_buttons, button_id)
    assert target is not None
    target["style"] = style
    await save_changed_draft(state, before, after)
    await edit_button_ui(
        callback.message,
        _manager_notice("✅ تم تغيير لون الزر."),
        build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
    )
    await callback.answer(tr("تم تغيير اللون"))


@router.callback_query(F.data.startswith("r:bmv:"))
async def change_button_position(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    try:
        _, _, button_id, raw_index = callback.data.split(":", 3)
        new_index = int(raw_index)
    except (ValueError, TypeError):
        await callback.answer(t("invalid"), show_alert=True)
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    if not move_message_button(after.message_buttons, button_id, new_index):
        await callback.answer(tr("تعذر تغيير ترتيب الزر."), show_alert=True)
        return
    await save_changed_draft(state, before, after)
    await edit_button_ui(
        callback.message,
        _manager_notice("✅ تم تغيير ترتيب الزر."),
        build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
    )
    await callback.answer(tr("تم تغيير الترتيب"))


__all__ = ["change_button_position", "change_button_style", "change_button_type", "router"]
