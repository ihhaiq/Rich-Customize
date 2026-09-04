from __future__ import annotations

import logging

from aiogram import Bot, F, Router
from aiogram.filters import Command
from aiogram.types import CallbackQuery, Message

from app.i18n import tr
from app.services.showcase import (
    MEDIA_LABELS,
    MissingShowcaseMedia,
    send_all_blocks_showcase,
)


router = Router(name="editor_showcase")
logger = logging.getLogger(__name__)


def missing_media_text(error: MissingShowcaseMedia) -> str:
    labels = ", ".join(tr(MEDIA_LABELS[kind]) for kind in error.missing)
    return f"{tr('مكتبة وسائط القالب ناقصة. أضف إلى قناة الوسائط: ')}{labels}"


@router.message(Command("draft"))
@router.message(F.text.in_({"دريفت", "draft", "Draft", "DRAFT"}))
async def showcase_from_message(message: Message, bot: Bot) -> None:
    if not message.from_user:
        return
    await bot.send_chat_action(chat_id=message.chat.id, action="typing")
    try:
        await send_all_blocks_showcase(bot, message.chat.id, message.from_user.id)
    except MissingShowcaseMedia as error:
        await message.answer(missing_media_text(error))
    except Exception:
        logger.exception(
            "Failed to send all-block showcase to user_id=%s", message.from_user.id,
        )
        await message.answer(tr("تعذر إرسال قالب كل البلوكات. راجع السجل لمعرفة الخطأ."))


@router.callback_query(F.data == "r:showcase")
async def showcase_from_button(callback: CallbackQuery, bot: Bot) -> None:
    await callback.answer(tr("جاري تجهيز قالب كل البلوكات…"))
    try:
        await send_all_blocks_showcase(
            bot, callback.from_user.id, callback.from_user.id,
        )
    except MissingShowcaseMedia as error:
        await bot.send_message(callback.from_user.id, missing_media_text(error))
    except Exception:
        logger.exception(
            "Failed to send all-block showcase to user_id=%s", callback.from_user.id,
        )
        await bot.send_message(
            callback.from_user.id,
            tr("تعذر إرسال قالب كل البلوكات. راجع السجل لمعرفة الخطأ."),
        )


__all__ = [
    "missing_media_text",
    "router",
    "showcase_from_button",
    "showcase_from_message",
]
