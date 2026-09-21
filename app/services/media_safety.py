from __future__ import annotations

import asyncio
from io import BytesIO

from aiogram import Bot
from aiogram.types import Message


MAX_SLIDESHOW_IMAGE_BYTES = 20 * 1024 * 1024
MAX_SLIDESHOW_VIDEO_BYTES = 50 * 1024 * 1024
MAX_MEDIA_DIMENSION = 10_000
MAX_IMAGE_PIXELS = 40_000_000
TELEGRAM_DOWNLOAD_TIMEOUT = 15.0


class UnsafeMediaError(ValueError):
    pass


def _validate_dimensions(width: int | None, height: int | None) -> None:
    if not width or not height:
        return
    if width > MAX_MEDIA_DIMENSION or height > MAX_MEDIA_DIMENSION:
        raise UnsafeMediaError("media dimensions exceed the allowed limit")
    if width * height > MAX_IMAGE_PIXELS:
        raise UnsafeMediaError("media pixel count exceeds the allowed limit")


def validate_slideshow_message(message: Message) -> None:
    if message.photo:
        media = message.photo[-1]
        if media.file_size and media.file_size > MAX_SLIDESHOW_IMAGE_BYTES:
            raise UnsafeMediaError("photo is too large")
        _validate_dimensions(media.width, media.height)
        return
    if message.video:
        media = message.video
        if media.file_size and media.file_size > MAX_SLIDESHOW_VIDEO_BYTES:
            raise UnsafeMediaError("video is too large")
        _validate_dimensions(media.width, media.height)


async def safe_telegram_download(
    bot: Bot,
    file_id: str,
    *,
    max_bytes: int = MAX_SLIDESHOW_IMAGE_BYTES,
    timeout: float = TELEGRAM_DOWNLOAD_TIMEOUT,
) -> bytes:
    """Bound any Telegram file download by both time and bytes."""
    target = BytesIO()
    async with asyncio.timeout(timeout):
        await bot.download(file_id, destination=target)
    payload = target.getvalue()
    if len(payload) > max_bytes:
        raise UnsafeMediaError("downloaded Telegram file is too large")
    return payload


__all__ = [
    "MAX_IMAGE_PIXELS",
    "MAX_MEDIA_DIMENSION",
    "MAX_SLIDESHOW_IMAGE_BYTES",
    "MAX_SLIDESHOW_VIDEO_BYTES",
    "TELEGRAM_DOWNLOAD_TIMEOUT",
    "UnsafeMediaError",
    "safe_telegram_download",
    "validate_slideshow_message",
]
