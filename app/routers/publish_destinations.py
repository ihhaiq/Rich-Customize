from __future__ import annotations

import logging

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, ChatMemberUpdated, Message

from app.keyboards import build_chat_reached_keyboard
from app.services.chat_registry import managed_chat_registry

from app.editor.session import load_editor_session
from app.routers.publish_support import (
    can_publish_to_chat,
    chat_type_value,
    is_administrator,
    refresh_post_panel,
    render_post_chat_picker,
)


router = Router(name="publish_destinations")
logger = logging.getLogger(__name__)


@router.my_chat_member()
async def remember_publish_chat(update: ChatMemberUpdated, bot: Bot) -> None:
    chat_id = update.chat.id
    if not is_administrator(update.new_chat_member):
        await managed_chat_registry.remove_chat(chat_id)
        return
    chat_type = chat_type_value(update.chat)
    if chat_type == "channel" and not bool(
        getattr(update.new_chat_member, "can_post_messages", False)
    ):
        try:
            await bot.send_message(
                update.from_user.id,
                "تمت إضافة البوت، لكن بدون صلاحية نشر الرسائل في القناة.",
            )
        except (TelegramBadRequest, TelegramForbiddenError):
            pass
        return
    actor = update.from_user
    if actor.is_bot:
        return
    title = update.chat.title or str(chat_id)
    await managed_chat_registry.remember(actor.id, chat_id, title, chat_type)
    await refresh_post_panel(bot, actor.id)
    try:
        await bot.send_message(
            actor.id,
            f"✅ تم الوصول إلى «{title}».",
            reply_markup=build_chat_reached_keyboard(chat_id),
        )
    except (TelegramBadRequest, TelegramForbiddenError):
        logger.info(
            "Could not notify user_id=%s after reaching chat_id=%s",
            actor.id,
            chat_id,
        )


@router.callback_query(F.data == "r:post")
async def open_post_chats(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    await state.update_data(
        post_selected_chat_ids=[],
        post_silent=False,
        post_protected=False,
    )
    await render_post_chat_picker(callback, state, bot, [])
    await callback.answer()


@router.callback_query(F.data == "r:postlist")
async def return_to_post_chats(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    await render_post_chat_picker(callback, state, bot, selected)
    await callback.answer()


@router.callback_query(F.data.startswith("r:postchat:"))
async def select_post_chat(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    try:
        chat_id = int(callback.data.rsplit(":", 1)[-1])
    except (TypeError, ValueError):
        await callback.answer("اختيار محادثة غير صالح.", show_alert=True)
        return
    registered = next(
        (
            chat for chat in await managed_chat_registry.list_for_user(callback.from_user.id)
            if int(chat.get("chat_id", 0)) == chat_id
        ),
        None,
    )
    if registered is None or not await can_publish_to_chat(
        bot, chat_id, callback.from_user.id,
    ):
        await managed_chat_registry.remove(callback.from_user.id, chat_id)
        await callback.answer(
            "المحادثة لم تعد متاحة، أو أن صلاحيات أحد المشرفين تغيرت.",
            show_alert=True,
        )
        return
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    if chat_id in selected:
        selected.remove(chat_id)
        notice = "تم إلغاء تحديد المحادثة"
    else:
        selected.append(chat_id)
        notice = "تم تحديد المحادثة للإرسال"
    await render_post_chat_picker(callback, state, bot, selected)
    await callback.answer(notice)


__all__ = [
    "open_post_chats",
    "remember_publish_chat",
    "return_to_post_chats",
    "router",
    "select_post_chat",
]
