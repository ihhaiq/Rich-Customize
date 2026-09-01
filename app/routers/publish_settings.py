from __future__ import annotations

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.i18n import t
from app.keyboards import build_post_confirmation_keyboard, build_post_settings_keyboard
from app.services.chat_registry import managed_chat_registry

from app.editor.session import load_editor_session
from app.routers.editor_ui import edit_ui
from app.routers.publish_support import eligible_post_chats


router = Router(name="publish_settings")


def settings_text(selected_count: int) -> str:
    return (
        f"إعدادات المنشور\n\nالمحادثات المحددة: {selected_count}\n"
        "اختر الإعدادات ثم اضغط إرسال:"
    )


@router.callback_query(F.data == "r:postsettings")
async def open_post_settings(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    eligible = await eligible_post_chats(bot, callback.from_user.id)
    eligible_ids = {int(chat["chat_id"]) for chat in eligible}
    selected = [chat_id for chat_id in selected if chat_id in eligible_ids]
    if not selected:
        await state.update_data(post_selected_chat_ids=[])
        await callback.answer("حدد محادثة واحدة على الأقل.", show_alert=True)
        return
    await state.update_data(post_selected_chat_ids=selected)
    await managed_chat_registry.clear_panel(callback.from_user.id)
    await edit_ui(
        callback.message,
        settings_text(len(selected)),
        build_post_settings_keyboard(
            silent=bool(data.get("post_silent", False)),
            protected=bool(data.get("post_protected", False)),
            selected_count=len(selected),
        ),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:pt:"))
async def toggle_post_option(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    if not selected:
        await callback.answer("حدد محادثة واحدة على الأقل.", show_alert=True)
        return
    option = callback.data.rsplit(":", 1)[-1]
    silent = bool(data.get("post_silent", False))
    protected = bool(data.get("post_protected", False))
    if option == "silent":
        silent = not silent
    elif option == "protected":
        protected = not protected
    else:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    await state.update_data(post_silent=silent, post_protected=protected)
    await edit_ui(
        callback.message,
        settings_text(len(selected)),
        build_post_settings_keyboard(
            silent=silent,
            protected=protected,
            selected_count=len(selected),
        ),
    )
    await callback.answer()


@router.callback_query(F.data == "r:postconfirm")
async def confirm_post(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    if not selected:
        await callback.answer(t("select_chat"), show_alert=True)
        return
    await edit_ui(
        callback.message,
        t("ux.publish.confirm", count=len(selected)),
        build_post_confirmation_keyboard(len(selected)),
    )
    await callback.answer()


__all__ = ["confirm_post", "open_post_settings", "router", "settings_text", "toggle_post_option"]
