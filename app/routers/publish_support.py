from __future__ import annotations

import asyncio
import logging
from typing import Any

from aiogram import Bot
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.i18n import tr
from app.keyboards import build_post_back_keyboard
from app.services.chat_registry import managed_chat_registry
from app.services.publish_ui import build_post_picker_rich_message, edit_publish_ui


logger = logging.getLogger(__name__)
ADMIN_STATUSES = {"administrator", "creator"}
SUBSCRIBER_STATUSES = {"member", "administrator", "creator"}
CHANNEL_ADMIN_RIGHTS = (
    "post_messages+edit_messages+delete_messages+manage_chat+invite_users+restrict_members"
)
GROUP_ADMIN_RIGHTS = "delete_messages+manage_chat+invite_users+restrict_members"


def status_value(member) -> str:
    status = getattr(member, "status", "")
    return str(getattr(status, "value", status))


def is_administrator(member) -> bool:
    return status_value(member) in ADMIN_STATUSES


async def is_chat_subscriber(bot: Bot, chat_id: int, user_id: int) -> bool:
    try:
        member = await bot.get_chat_member(chat_id=chat_id, user_id=user_id)
    except (TelegramBadRequest, TelegramForbiddenError):
        return False
    return status_value(member) in SUBSCRIBER_STATUSES


def chat_type_value(chat) -> str:
    value = getattr(chat, "type", "")
    return str(getattr(value, "value", value))


async def can_publish_to_chat(bot: Bot, chat_id: int, user_id: int) -> bool:
    try:
        bot_member, user_member, chat = await asyncio.gather(
            bot.get_chat_member(chat_id=chat_id, user_id=bot.id),
            bot.get_chat_member(chat_id=chat_id, user_id=user_id),
            bot.get_chat(chat_id),
        )
    except (TelegramBadRequest, TelegramForbiddenError):
        return False
    if not is_administrator(bot_member) or not is_administrator(user_member):
        return False
    if chat_type_value(chat) == "channel" and not bool(
        getattr(bot_member, "can_post_messages", False)
    ):
        return False
    return True


async def eligible_post_chats(bot: Bot, user_id: int) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for chat in await managed_chat_registry.list_for_user(user_id):
        chat_id = int(chat.get("chat_id", 0))
        if chat_id and await can_publish_to_chat(bot, chat_id, user_id):
            result.append(chat)
        elif chat_id:
            await managed_chat_registry.remove(user_id, chat_id)
    return result


async def bot_add_links(bot: Bot) -> tuple[str, str]:
    me = await bot.get_me()
    username = me.username or "RichCustomizebot"
    base = f"https://t.me/{username}"
    return (
        f"{base}?startchannel&admin={CHANNEL_ADMIN_RIGHTS}",
        f"{base}?startgroup&admin={GROUP_ADMIN_RIGHTS}",
    )


def post_chats_text(chats: list[dict[str, Any]], selected_count: int) -> str:
    if not chats:
        return (
            f"{tr('إنشاء منشور')}\n\n"
            f"{tr('لا توجد قناة أو مجموعة مشتركة يكون فيها المستخدم والبوت مشرفين.')}\n"
            f"{tr('أضف البوت من أحد الزرين، وبعد نجاح الإضافة سيصلك إشعار هنا.')}"
        )
    return (
        f"{tr('إنشاء منشور')}\n\n"
        f"{tr('اضغط على كل قناة أو مجموعة لتحديدها للإرسال المتعدد.')}\n"
        f"{tr('المحدد حالياً: ')}{selected_count}"
    )


async def refresh_post_panel(bot: Bot, user_id: int) -> None:
    panel = await managed_chat_registry.panel_for_user(user_id)
    if panel is None:
        return
    chats = await managed_chat_registry.list_for_user(user_id)
    available_ids = {int(chat["chat_id"]) for chat in chats}
    selected = [
        int(chat_id) for chat_id in panel.get("selected_chat_ids", [])
        if int(chat_id) in available_ids
    ]
    channel_url, group_url = await bot_add_links(bot)
    try:
        await bot.edit_message_text(
            chat_id=panel["chat_id"],
            message_id=panel["message_id"],
            rich_message=build_post_picker_rich_message(
                post_chats_text(chats, len(selected)),
                chats,
                channel_url,
                group_url,
                selected,
            ),
            reply_markup=build_post_back_keyboard(),
        )
    except TelegramBadRequest as error:
        if "message is not modified" not in str(error).lower():
            logger.info("Could not refresh post panel for user_id=%s: %s", user_id, error)
    except TelegramForbiddenError:
        await managed_chat_registry.clear_panel(user_id)


async def render_post_chat_picker(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
    selected_chat_ids: list[int],
) -> list[dict[str, Any]]:
    chats = await eligible_post_chats(bot, callback.from_user.id)
    available_ids = {int(chat["chat_id"]) for chat in chats}
    selected = [chat_id for chat_id in selected_chat_ids if chat_id in available_ids]
    channel_url, group_url = await bot_add_links(bot)
    await state.update_data(post_selected_chat_ids=selected)
    await edit_publish_ui(
        callback.message,
        build_post_picker_rich_message(
            post_chats_text(chats, len(selected)),
            chats,
            channel_url,
            group_url,
            selected,
        ),
        build_post_back_keyboard(),
    )
    await managed_chat_registry.remember_panel(
        callback.from_user.id,
        callback.message.chat.id,
        callback.message.message_id,
        selected,
    )
    return chats


__all__ = [
    "bot_add_links",
    "can_publish_to_chat",
    "chat_type_value",
    "eligible_post_chats",
    "is_administrator",
    "is_chat_subscriber",
    "post_chats_text",
    "refresh_post_panel",
    "render_post_chat_picker",
    "status_value",
]
