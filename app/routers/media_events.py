from __future__ import annotations

import logging

from aiogram import Router
from aiogram.types import Message

from app.services.media_library import SHOWCASE_MEDIA_CHANNEL_ID, showcase_media_library
from app.services.showcase_channel import showcase_channel_store

router = Router(name="media_events")
logger = logging.getLogger(__name__)


@router.channel_post()
@router.edited_channel_post()
async def remember_showcase_media(message: Message) -> None:
    if message.chat.id != SHOWCASE_MEDIA_CHANNEL_ID:
        return

    remembered = await showcase_channel_store.remember(message)
    kind = await showcase_media_library.remember(message)
    if remembered:
        logger.info(
            "Saved showcase channel message_id=%s content_type=%s",
            message.message_id,
            message.content_type,
        )
    if kind:
        logger.info(
            "Saved %s file_id from showcase media channel message_id=%s",
            kind,
            message.message_id,
        )
