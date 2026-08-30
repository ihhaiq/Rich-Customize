from __future__ import annotations

import copy

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.keyboards import (
    build_button_picker_keyboard,
    build_button_position_keyboard,
    build_button_style_keyboard,
    build_button_type_keyboard,
    build_buttons_manager_keyboard,
    build_page_target_keyboard,
)
from app.services.buttons import (
    BUTTON_STYLES,
    BUTTON_TYPES,
    MAX_BUTTONS,
    add_message_button,
    change_message_button_type,
    delete_message_button,
    get_button_type,
    get_message_button,
    move_message_button,
)
from app.services.page_registry import page_registry
from app.services.popup_registry import popup_registry
from app.states import RichEditorStates

from app.routers import editor_core as core
from app.routers.button_support import (
    answer_with_button_guide,
    edit_button_ui,
    prepare_message_buttons,
    preview_buttons,
    save_changed_draft,
)


router = Router(name="button_actions")


def _manager_text(count: int) -> str:
    return f"إدارة أزرار الرسالة الغنية\n\nعدد الأزرار: {count}\nاختر العملية:"


@router.callback_query(F.data == "r:buttons")
async def open_buttons_manager(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    draft = await draft_store.load(state)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(current_button_id=None, pending_button_action=None)
    await edit_button_ui(
        callback.message,
        _manager_text(len(draft.message_buttons)),
        build_buttons_manager_keyboard(draft.message_buttons, draft.buttons_per_row),
    )
    await callback.answer()


@router.callback_query(F.data == "r:brow")
async def change_buttons_per_row(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    after.buttons_per_row = 1 if before.buttons_per_row >= 8 else before.buttons_per_row + 1
    await save_changed_draft(state, before, after)
    await edit_button_ui(
        callback.message,
        _manager_text(len(after.message_buttons)),
        build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
    )
    await callback.answer(f"عدد الأزرار في الصف: {after.buttons_per_row}")


@router.callback_query(F.data == "r:ba")
async def start_add_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session:
        return
    draft = await draft_store.load(state)
    if len(draft.message_buttons) >= MAX_BUTTONS:
        await callback.answer("وصلت إلى الحد الأقصى للأزرار.", show_alert=True)
        return
    await state.set_state(RichEditorStates.editing_button)
    await state.update_data(pending_button_action="add_title", current_button_id=None)
    if isinstance(callback.message, Message):
        await answer_with_button_guide(callback.message, "أرسل عنوان الزر الجديد.")
    await callback.answer()


@router.callback_query(F.data.startswith("r:bat:"))
async def choose_new_button_type(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
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
    await answer_with_button_guide(callback.message, prompts[button_type])
    await callback.answer()


@router.callback_query(F.data.startswith("r:bs:"))
async def choose_button_action(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
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
    session = await core._session(callback, state)
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


@router.callback_query(F.data.startswith("r:bct:"))
async def change_button_type(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    try:
        _, _, button_id, button_type = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    before = await draft_store.load(state)
    button = get_message_button(before.message_buttons, button_id)
    if button is None or button_type not in BUTTON_TYPES:
        await callback.answer("هذا الزر أو النوع لم يعد موجودًا.", show_alert=True)
        return
    if button_type == "disabled":
        after = copy.deepcopy(before)
        target = get_message_button(after.message_buttons, button_id)
        change_message_button_type(target, "disabled", "")
        await save_changed_draft(state, before, after)
        await state.set_state(RichEditorStates.managing)
        await state.update_data(current_button_id=None)
        await edit_button_ui(
            callback.message,
            "✅ تم تغيير نوع الزر إلى زر معطّل.\n\nإدارة أزرار الرسالة الغنية",
            build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
        )
        await callback.answer("تم تغيير النوع")
        return
    if button_type == "page":
        pages = await page_registry.list_for_user(callback.from_user.id)
        if not pages:
            await callback.answer("احفظ صفحة أولاً حتى تربط الزر بها.", show_alert=True)
            return
        await edit_button_ui(
            callback.message,
            f"اختر الصفحة التي يفتحها الزر: {button['text']}",
            build_page_target_keyboard(pages, "change", button_id),
        )
        await callback.answer()
        return
    prompts = {
        "url": "أرسل الرابط الجديد؛ يقبل @username أيضًا.",
        "callback_data": "أرسل callback_data الجديدة؛ الحد الأقصى 64 بايت.",
        "copy": "أرسل النص الذي تريد نسخه؛ الحد الأقصى 256 حرفًا.",
        "popup": "أرسل نص التنبيه؛ الحد الأقصى 200 حرف.",
        "web_app": "أرسل رابط Web App يبدأ بـ https://",
        "login_url": "أرسل رابط HTTPS من الدومين المربوط عبر @BotFather ثم /setdomain.",
        "switch_inline": "أرسل استعلام Inline، أو /empty.",
        "switch_inline_current": "أرسل استعلام Inline للمحادثة الحالية، أو /empty.",
    }
    await state.set_state(RichEditorStates.editing_button)
    await state.update_data(
        current_button_id=button_id,
        pending_button_action="change_type_value",
        pending_button_type=button_type,
    )
    await answer_with_button_guide(callback.message, prompts[button_type])
    await callback.answer()


@router.callback_query(F.data.startswith("r:bpg:"))
async def select_button_page(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
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


@router.callback_query(F.data.startswith("r:bsc:"))
async def change_button_style(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    try:
        _, _, button_id, style = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    before = await draft_store.load(state)
    current = get_message_button(before.message_buttons, button_id)
    if (
        current is None
        or style not in BUTTON_STYLES
        or (style == "link" and get_button_type(current) != "popup")
    ):
        await callback.answer("هذا الزر أو اللون لم يعد موجودًا.", show_alert=True)
        return
    after = copy.deepcopy(before)
    get_message_button(after.message_buttons, button_id)["style"] = style
    await save_changed_draft(state, before, after)
    await edit_button_ui(
        callback.message,
        "✅ تم تغيير لون الزر.\n\nإدارة أزرار الرسالة الغنية",
        build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
    )
    await callback.answer("تم تغيير اللون")


@router.callback_query(F.data.startswith("r:bmv:"))
async def change_button_position(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    try:
        _, _, button_id, raw_index = callback.data.split(":", 3)
        new_index = int(raw_index)
    except (ValueError, TypeError):
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    if not move_message_button(after.message_buttons, button_id, new_index):
        await callback.answer("تعذر تغيير ترتيب الزر.", show_alert=True)
        return
    await save_changed_draft(state, before, after)
    await edit_button_ui(
        callback.message,
        "✅ تم تغيير ترتيب الزر.\n\nإدارة أزرار الرسالة الغنية",
        build_buttons_manager_keyboard(after.message_buttons, after.buttons_per_row),
    )
    await callback.answer("تم تغيير الترتيب")


@router.callback_query(F.data == "r:bpreview")
async def preview_message_buttons(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await core._session(callback, state)
    if not session:
        return
    data, _ = session
    draft = await draft_store.load(state)
    if not draft.message_buttons:
        await callback.answer("لا توجد أزرار لمعاينتها.", show_alert=True)
        return
    prepared = await prepare_message_buttons(draft.message_buttons)
    old_preview_id = data.get("button_preview_message_id")
    if old_preview_id:
        try:
            await bot.delete_message(chat_id=callback.from_user.id, message_id=old_preview_id)
        except TelegramBadRequest:
            pass
    sent = await preview_buttons(
        bot,
        callback.from_user.id,
        prepared,
        draft.buttons_per_row,
    )
    await state.update_data(button_preview_message_id=sent.message_id)
    await callback.answer("تم فتح المعاينة")


@router.callback_query(F.data == "r:bpback")
async def close_buttons_preview(callback: CallbackQuery, state: FSMContext) -> None:
    if isinstance(callback.message, Message):
        try:
            await callback.message.delete()
        except TelegramBadRequest:
            pass
    await state.update_data(button_preview_message_id=None)
    await callback.answer("تم إغلاق المعاينة")


@router.callback_query(F.data.startswith("r:popup:"))
async def show_popup_button(callback: CallbackQuery) -> None:
    button_id = callback.data.rsplit(":", 1)[-1]
    popup_text = await popup_registry.get(button_id)
    if popup_text is None:
        await callback.answer("هذا التنبيه لم يعد متاحاً.", show_alert=True)
        return
    await callback.answer(popup_text[:200], show_alert=True)


@router.callback_query(F.data.startswith("r:poptext:"))
async def show_inline_popup_button(callback: CallbackQuery) -> None:
    await callback.answer(callback.data.removeprefix("r:poptext:"), show_alert=True)


__all__ = [
    "change_button_position",
    "change_button_style",
    "change_button_type",
    "change_buttons_per_row",
    "choose_button_action",
    "choose_new_button_type",
    "close_buttons_preview",
    "open_buttons_manager",
    "preview_message_buttons",
    "router",
    "select_button_page",
    "select_message_button",
    "show_inline_popup_button",
    "show_popup_button",
    "start_add_button",
]
