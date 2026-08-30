from __future__ import annotations

import copy
import html

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.i18n import t
from app.keyboards import (
    build_page_delete_confirmation_keyboard,
    build_rich_editor_keyboard,
)
from app.states import RichEditorStates

from app.routers import editor_core as core
from app.routers.page_support import (
    opened_page_text,
    pages_for_user,
    render_pages_screen,
    save_changed_draft,
)


router = Router(name="page_actions")


@router.callback_query(F.data == "r:savepage")
async def save_page(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    if not blocks:
        await callback.answer("لا توجد أجزاء لحفظها.", show_alert=True)
        return
    await state.set_state(RichEditorStates.saving_page_name)
    await core._send_add_prompt(
        callback.message,
        state,
        "أرسل اسم الصفحة لحفظها؛ الحد الأقصى 64 حرفًا.",
    )
    await callback.answer()


@router.message(RichEditorStates.saving_page_name)
async def receive_page_name(message: Message, state: FSMContext, bot: Bot) -> None:
    title = (message.text or "").strip()
    if not title:
        await message.answer("اسم الصفحة يجب أن يكون نصًا.")
        return
    if len(title) > 64:
        await message.answer("اسم الصفحة طويل جدًا؛ الحد الأقصى 64 حرفًا.")
        return
    data = await state.get_data()
    before = await draft_store.load(state)
    if not before.blocks:
        await state.clear()
        await message.answer("انتهت جلسة المحرّر. أرسل /editor وابدأ من جديد.")
        return
    existing_id = before.current_page_id
    code = await core.page_registry.save(
        message.from_user.id,
        title,
        before.blocks,
        before.message_buttons,
        before.buttons_per_row,
        before.buttons_align,
        page_id=existing_id,
    )
    await core._delete_add_step_messages(bot, message, data, state)
    after = copy.deepcopy(before)
    after.current_page_id = code
    after.current_page_title = title
    await save_changed_draft(state, before, after)
    await state.set_state(RichEditorStates.managing)
    prefix = (
        "✅ تم تحديث الصفحة المحفوظة.\n\nالكود: "
        if existing_id == code
        else "✅ تم حفظ الصفحة.\n\nالكود: "
    )
    await message.answer(
        f"{prefix}{code}\n\nتقدر تستعمله داخل النص هكذا:\n"
        f"{{التالي:cbd {code}#b}}\n\nأو اختَر «CBD — فتح صفحة» من قائمة الأزرار."
    )
    await core._edit_saved_ui(
        bot,
        state,
        f"✅ تم حفظ الصفحة «{title}».\n\n{core.MAIN_TEXT}",
        build_rich_editor_keyboard(after.blocks),
    )


@router.callback_query(F.data.startswith("r:prename:"))
async def request_page_rename(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    try:
        _, _, page_id, raw_index = callback.data.split(":", 3)
        page_index = max(0, int(raw_index))
    except (ValueError, TypeError):
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    page = await core.page_registry.get(page_id)
    if page is None or int(page.get("owner_id", 0)) != callback.from_user.id:
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    await state.set_state(RichEditorStates.renaming_page)
    await state.update_data(rename_page_id=page_id, pages_page_index=page_index)
    await core._send_add_prompt(
        callback.message,
        state,
        t("pages.rename_prompt", title=str(page.get("title") or page_id)),
    )
    await callback.answer()


@router.message(RichEditorStates.renaming_page)
async def receive_page_rename(message: Message, state: FSMContext, bot: Bot) -> None:
    title = (message.text or "").strip()
    if not title:
        await message.answer("اسم الصفحة يجب أن يكون نصًا.")
        return
    if len(title) > 64:
        await message.answer("اسم الصفحة طويل جدًا؛ الحد الأقصى 64 حرفًا.")
        return
    data = await state.get_data()
    page_id = str(data.get("rename_page_id") or "")
    if not await core.page_registry.rename(page_id, message.from_user.id, title):
        await state.set_state(RichEditorStates.managing)
        await message.answer("الصفحة محذوفة أو لا تخصك.")
        return
    await core._delete_add_step_messages(bot, message, data, state)
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    if before.current_page_id == page_id:
        after.current_page_title = title
    await save_changed_draft(state, before, after)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(rename_page_id=None)
    await render_pages_screen(
        message,
        state,
        message.from_user.id,
        int(data.get("pages_page_index", 0)),
        saved=True,
    )


@router.callback_query(F.data.startswith("r:pdelete:"))
async def confirm_page_delete(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    try:
        _, _, page_id, raw_index = callback.data.split(":", 3)
        page_index = max(0, int(raw_index))
    except (ValueError, TypeError):
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    page = await core.page_registry.get(page_id)
    if page is None or int(page.get("owner_id", 0)) != callback.from_user.id:
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    title = html.escape(str(page.get("title") or page_id))
    await core._edit_ui(
        callback.message,
        t("pages.delete_confirm", title=title),
        build_page_delete_confirmation_keyboard(page_id, page_index),
        parse_mode="HTML",
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:pdeleteok:"))
async def delete_saved_page(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    try:
        _, _, page_id, raw_index = callback.data.split(":", 3)
        requested_index = max(0, int(raw_index))
    except (ValueError, TypeError):
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    if not await core.page_registry.delete(page_id, callback.from_user.id):
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    data = await state.get_data()
    _, _, _, _, total_count = await pages_for_user(
        callback.from_user.id,
        requested_index,
        str(data.get("pages_search_query") or ""),
        str(data.get("pages_sort_mode") or "updated"),
    )
    if total_count == 0:
        draft = await draft_store.load(state)
        await core._edit_ui(
            callback.message,
            t("editor.empty_hint") if not draft.blocks else core.MAIN_TEXT,
            build_rich_editor_keyboard(draft.blocks),
        )
    else:
        await render_pages_screen(
            callback.message,
            state,
            callback.from_user.id,
            requested_index,
        )
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    if before.current_page_id == page_id:
        after.current_page_id = None
        after.current_page_title = None
    await save_changed_draft(state, before, after)
    await callback.answer(t("pages.deleted"))


@router.callback_query(F.data.startswith("r:pageopen:"))
async def open_saved_page(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    page_id = callback.data.rsplit(":", 1)[-1]
    page = await core.page_registry.get(page_id)
    if page is None or int(page.get("owner_id", 0)) != callback.from_user.id:
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    after.blocks = copy.deepcopy(page.get("blocks") or [])
    after.message_buttons = copy.deepcopy(page.get("buttons") or [])
    after.buttons_per_row = int(page.get("buttons_per_row", 1))
    after.buttons_align = str(page.get("buttons_align", "center"))
    after.current_page_id = page_id
    after.current_page_title = str(page.get("title") or page_id)
    await save_changed_draft(state, before, after)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(current_block_id=None, current_button_id=None)
    await core._edit_ui(
        callback.message,
        opened_page_text(),
        build_rich_editor_keyboard(after.blocks),
        parse_mode="HTML",
    )
    await callback.answer("تم فتح الصفحة")


__all__ = [
    "confirm_page_delete",
    "delete_saved_page",
    "open_saved_page",
    "receive_page_name",
    "receive_page_rename",
    "request_page_rename",
    "router",
    "save_page",
]
