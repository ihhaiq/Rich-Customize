from __future__ import annotations

import logging

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.i18n import t
from app.services.showcase_channel import showcase_channel_store


router = Router(name="editor_showcase")
logger = logging.getLogger(__name__)


@router.message(Command("draft"))
@router.message(F.text.in_({"دريفت", "draft", "Draft", "DRAFT"}))
async def showcase_from_message(message: Message, bot: Bot) -> None:
    if not message.from_user:
        return
    await bot.send_chat_action(chat_id=message.chat.id, action="typing")
    try:
        await showcase_channel_store.send_preview(bot, message.chat.id)
    except Exception:
        logger.exception(
            "Failed to send cached showcase channel to user_id=%s",
            message.from_user.id,
        )
        await message.answer(t("preview_failed"))


@router.callback_query(F.data == "r:showcase")
async def showcase_from_button(callback: CallbackQuery, bot: Bot) -> None:
    await callback.answer(t("preview_generating"))
    try:
        await showcase_channel_store.send_preview(bot, callback.from_user.id)
    except Exception:
        logger.exception(
            "Failed to send cached showcase channel to user_id=%s",
            callback.from_user.id,
        )
        await bot.send_message(callback.from_user.id, t("preview_failed"))


__all__ = [
    "router",
    "showcase_from_button",
    "showcase_from_message",
]
