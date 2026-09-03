from __future__ import annotations

import copy
import html

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.session import load_editor_session
from app.i18n import t
from app.keyboards import (
    build_page_delete_confirmation_keyboard,
    build_page_restore_keyboard,
    build_rich_editor_keyboard,
)
from app.routers.editor_ui import (
    delete_add_step_messages,
    edit_saved_ui,
    edit_ui,
    editor_dashboard_text,
    send_add_prompt,
)
from app.routers.page_support import render_pages_screen
from app.services.page_editor import persist_page_draft_change
from app.services.page_registry import page_registry
from app.states import RichEditorStates


router = Router(name="page_actions")


@router.callback_query(F.data == "r:savepage")
async def save_page(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    if not blocks:
        await callback.answer("لا توجد أجزاء لحفظها.", show_alert=True)
        return
    draft = await draft_store.load(state)
    existing_id = draft.current_page_id
    if not existing_id:
        await state.set_state(RichEditorStates.saving_page_name)
        await send_add_prompt(
            callback.message,
            state,
            "أرسل اسم الصفحة لحفظها؛ الحد الأقصى 64 حرفًا.",
        )
        await callback.answer()
        return

    existing = await page_registry.get(existing_id)
    if existing is None or int(existing.get("owner_id", 0)) != callback.from_user.id:
        draft.current_page_id = None
        draft.current_page_title = None
        await draft_store.save(state, draft)
        await state.set_state(RichEditorStates.saving_page_name)
        await send_add_prompt(
            callback.message,
            state,
            "الصفحة الأصلية لم تعد موجودة. أرسل اسمًا لحفظها كصفحة جديدة.",
        )
        await callback.answer("الصفحة الأصلية لم تعد موجودة.", show_alert=True)
        return

    title = str(draft.current_page_title or existing.get("title") or existing_id)[:64]
    code = await page_registry.save(
        callback.from_user.id,
        title,
        draft.blocks,
        draft.message_buttons,
        draft.buttons_per_row,
        draft.buttons_align,
        page_id=existing_id,
    )
    draft.current_page_id = code
    draft.current_page_title = title
    await draft_store.save(state, draft)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(block_scroll_enabled=True)
    await edit_ui(
        callback.message,
        editor_dashboard_text(draft, f"✅ تم تحديث الصفحة المحفوظة «{title}»."),
        build_rich_editor_keyboard(draft.blocks, draft.message_buttons),
    )
    await callback.answer("✅ تم حفظ التعديلات بنفس الكود")


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
    code = await page_registry.save(
        message.from_user.id,
        title,
        before.blocks,
        before.message_buttons,
        before.buttons_per_row,
        before.buttons_align,
        page_id=existing_id,
    )
    await delete_add_step_messages(bot, message, data, state)
    after = copy.deepcopy(before)
    after.current_page_id = code
    after.current_page_title = title
    await persist_page_draft_change(state, before, after)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(block_scroll_enabled=True)
    prefix = (
        "✅ تم تحديث الصفحة المحفوظة.\n\nالكود: "
        if existing_id == code
        else "✅ تم حفظ الصفحة.\n\nالكود: "
    )
    await message.answer(
        f"{prefix}{code}\n\nتقدر تستعمله داخل النص هكذا:\n"
        f"{{التالي:cbd {code}#b}}\n\nأو اختَر «CBD — فتح صفحة» من قائمة الأزرار."
    )
    await edit_saved_ui(
        bot,
        state,
        editor_dashboard_text(after, f"✅ تم حفظ الصفحة «{title}»."),
        build_rich_editor_keyboard(after.blocks, after.message_buttons),
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
    page = await page_registry.get(page_id)
    if page is None or int(page.get("owner_id", 0)) != callback.from_user.id:
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    await state.set_state(RichEditorStates.renaming_page)
    await state.update_data(rename_page_id=page_id, pages_page_index=page_index)
    await send_add_prompt(
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
    if not await page_registry.rename(page_id, message.from_user.id, title):
        await state.set_state(RichEditorStates.managing)
        await message.answer("الصفحة محذوفة أو لا تخصك.")
        return
    await delete_add_step_messages(bot, message, data, state)
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    if before.current_page_id == page_id:
        after.current_page_title = title
    await persist_page_draft_change(state, before, after)
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
    page = await page_registry.get(page_id)
    if page is None or int(page.get("owner_id", 0)) != callback.from_user.id:
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    title = html.escape(str(page.get("title") or page_id))
    await edit_ui(
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
    page = await page_registry.get(page_id)
    if page is None or int(page.get("owner_id", 0)) != callback.from_user.id:
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    before = await draft_store.load(state)
    was_current = before.current_page_id == page_id
    if not await page_registry.delete(page_id, callback.from_user.id):
        await callback.answer("الصفحة محذوفة أو لا تخصك.", show_alert=True)
        return
    await state.update_data(
        deleted_page_id=page_id,
        deleted_page_snapshot=page,
        deleted_page_index=requested_index,
        deleted_page_was_current=was_current,
    )
    after = copy.deepcopy(before)
    if was_current:
        after.current_page_id = None
        after.current_page_title = None
    await persist_page_draft_change(state, before, after)
    await edit_ui(
        callback.message,
        t("ux.pages.deleted_recoverable"),
        build_page_restore_keyboard(requested_index),
    )
    await callback.answer(t("pages.deleted"))


@router.callback_query(F.data == "r:prestore")
async def restore_deleted_page(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    data = await state.get_data()
    page_id = str(data.get("deleted_page_id") or "")
    snapshot = data.get("deleted_page_snapshot")
    if not page_id or not isinstance(snapshot, dict):
        await callback.answer(t("ux.pages.restore_unavailable"), show_alert=True)
        return
    restored = await page_registry.restore(
        page_id,
        callback.from_user.id,
        snapshot,
    )
    if not restored:
        await callback.answer(t("ux.pages.restore_unavailable"), show_alert=True)
        return
    before = await draft_store.load(state)
    after = copy.deepcopy(before)
    if bool(data.get("deleted_page_was_current")):
        after.current_page_id = page_id
        after.current_page_title = str(snapshot.get("title") or page_id)
    await persist_page_draft_change(state, before, after)
    page_index = max(0, int(data.get("deleted_page_index", 0)))
    await state.update_data(
        deleted_page_id=None,
        deleted_page_snapshot=None,
        deleted_page_index=None,
        deleted_page_was_current=None,
    )
    await render_pages_screen(
        callback.message,
        state,
        callback.from_user.id,
        page_index,
        saved=True,
    )
    await callback.answer(t("ux.pages.restored"))


@router.callback_query(F.data.startswith("r:pageopen:"))
async def open_saved_page(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    page_id = callback.data.rsplit(":", 1)[-1]
    page = await page_registry.get(page_id)
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
    await persist_page_draft_change(
        state,
        before,
        after,
        reset_scroll=before.current_page_id != page_id,
    )
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        current_block_id=None,
        current_button_id=None,
        management_chat_id=callback.message.chat.id,
        management_message_id=callback.message.message_id,
        block_scroll_enabled=True,
    )
    await edit_ui(
        callback.message,
        editor_dashboard_text(after),
        build_rich_editor_keyboard(after.blocks, after.message_buttons),
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
    "restore_deleted_page",
    "router",
    "save_page",
]
