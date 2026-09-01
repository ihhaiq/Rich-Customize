from __future__ import annotations

import copy

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.session import load_editor_session
from app.keyboards import (
    build_button_style_keyboard,
    build_buttons_manager_keyboard,
    build_page_target_keyboard,
)
from app.i18n import t
from app.routers.button_support import answer_with_button_guide, edit_button_ui, save_changed_draft
from app.services.buttons import BUTTON_TYPES, MAX_BUTTONS, add_message_button, change_message_button_type, get_message_button
from app.services.page_registry import page_registry
from app.states import RichEditorStates

router = Router(name="button_create")


@router.callback_query(F.data == "r:ba")
async def start_add_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session:
        return
    draft = await draft_store.load(state)
    if len(draft.message_buttons) >= MAX_BUTTONS:
        await callback.answer("وصلت إلى الحد الأقصى للأزرار.", show_alert=True)
        return
    await state.set_state(RichEditorStates.editing_button)
    await state.update_data(pending_button_action="add_title", current_button_id=None)
    if isinstance(callback.message, Message):
        await answer_with_button_guide(callback.message, t("ux.buttons.step.title"))
    await callback.answer()


@router.callback_query(F.data.startswith("r:bat:"))
async def choose_new_button_type(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    button_type = callback.data.rsplit(":", 1)[-1]
    if button_type not in BUTTON_TYPES or not data.get("pending_button_text"):
        await callback.answer("انتهت عملية إضافة الزر. حاول مجدداً.", show_alert=True)
        return
    if button_type == "page":
        pages = await page_registry.list_for_user(callback.from_user.id)
        if not pages:
            await callback.answer("احفظ صفحة أولاً، بعدها تقدر تربطها بزر CBD.", show_alert=True)
            return
        await state.update_data(pending_button_type="page")
        await edit_button_ui(
            callback.message,
            "اختر الصفحة التي يفتحها زر CBD كرسالة Ephemeral خاصة بالضاغط:",
            build_page_target_keyboard(pages, "add"),
        )
        await callback.answer()
        return
    prompts = {
        "url": "أرسل الرابط؛ يقبل @username أو http:// أو https:// أو tg://",
        "callback_data": "أرسل callback_data؛ الحد الأقصى 64 بايت.",
        "copy": "أرسل النص الذي تريد نسخه عند الضغط على الزر؛ الحد الأقصى 256 حرف.",
        "popup": "أرسل نص التنبيه الذي سيظهر عند الضغط؛ الحد الأقصى 200 حرف.",
        "web_app": "أرسل رابط Web App يبدأ بـ https://",
        "login_url": "أرسل رابط HTTPS من الدومين المربوط بالبوت عبر @BotFather ثم /setdomain.",
        "switch_inline": "أرسل الاستعلام الذي يُكتب بعد اختيار المحادثة؛ يمكن إرسال /empty لتركه فارغًا.",
        "switch_inline_current": "أرسل الاستعلام الذي يُكتب في المحادثة الحالية؛ يمكن إرسال /empty.",
    }
    if button_type == "disabled":
        before = await draft_store.load(state)
        after = copy.deepcopy(before)
        button = add_message_button(
            after.message_buttons,
            str(data.get("pending_button_text", "زر")),
            "",
            "disabled",
        )
        if button is None or not await save_changed_draft(state, before, after):
            await callback.answer("تعذر إضافة الزر؛ وصلت إلى الحد الأقصى.", show_alert=True)
            return
        await state.set_state(RichEditorStates.managing)
        await state.update_data(
            pending_button_action=None,
            pending_button_text=None,
            pending_button_type=None,
        )
        await edit_button_ui(
            callback.message,
            "✅ تمت إضافة الزر المعطّل. اختر لونه:",
            build_button_style_keyboard(button["id"], "default"),
        )
        await callback.answer("تمت إضافة الزر")
        return
    await state.set_state(RichEditorStates.editing_button)
    await state.update_data(
        pending_button_action=f"add_{button_type}",
        pending_button_type=button_type,
    )
    await answer_with_button_guide(
        callback.message,
        t("ux.buttons.step.value", prompt=prompts[button_type]),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:bpg:"))
async def select_button_page(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    parts = callback.data.split(":")
    action = parts[2] if len(parts) > 2 else ""
    if action == "add" and len(parts) == 4:
        button_id, page_id = None, parts[3]
    elif action == "change" and len(parts) == 5:
        button_id, page_id = parts[3], parts[4]
    else:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    page = await page_registry.get(page_id)
    if page is None or int(page.get("owner_id", 0)) != callback.from_user.id:
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    if action == "add":
        button = add_message_button(
            after.message_buttons,
            str(data.get("pending_button_text") or "صفحة"),
            page_id,
            "page",
        )
        if button is None:
            await callback.answer("تعذر إضافة الزر؛ وصلت إلى الحد الأقصى.", show_alert=True)
            return
    else:
        button = get_message_button(after.message_buttons, str(button_id))
        if button is None:
            await callback.answer("هذا الزر لم يعد موجودًا.", show_alert=True)
            return
        change_message_button_type(button, "page", page_id)
    await save_changed_draft(state, before, after)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        current_button_id=None,
        pending_button_action=None,
        pending_button_text=None,
        pending_button_type=None,
    )
    await edit_button_ui(
        callback.message,
        f"✅ تم ربط الزر بالصفحة «{page.get('title') or page_id}».\n\nإدارة أزرار الرسالة الغنية",
        build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
    )
    await callback.answer("تم ربط الصفحة")


__all__ = ["choose_new_button_type", "router", "select_button_page", "start_add_button"]
