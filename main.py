from __future__ import annotations

import asyncio
import logging
import unicodedata
from typing import Any

from aiogram import Dispatcher
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramNetworkError,
    TelegramNotFound,
    TelegramRetryAfter,
    TelegramServerError,
    TelegramUnauthorizedError,
)
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.utils.token import TokenValidationError

from app.config import Settings
from app.i18n import LocaleMiddleware, LocalizedBot, configure_bot_profile
from app.routers import router
from app.services.media import cleanup_interval_seconds, media_store
from app.services.page_registry import page_registry


logger = logging.getLogger(__name__)
INITIAL_RETRY_DELAY = 5
MAX_RETRY_DELAY = 60
TELEGRAM_REQUEST_TIMEOUT = 30

_VISIBLE_TEXT_KEYS = {
    "text",
    "summary",
    "caption",
    "credit",
    "expression",
    "alternative_text",
}


def _visible_rich_text(value: Any) -> list[str]:
    """Collect user-visible text without structural fields such as block types or URLs."""
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        result: list[str] = []
        for item in value:
            result.extend(_visible_rich_text(item))
        return result
    if hasattr(value, "model_dump"):
        value = value.model_dump(exclude_none=True)
    if not isinstance(value, dict):
        return []

    result: list[str] = []
    for key, item in value.items():
        if key in _VISIBLE_TEXT_KEYS:
            result.extend(_visible_rich_text(item))
        elif key in {"blocks", "items", "buttons", "cells"}:
            result.extend(_visible_rich_text(item))
    return result


def _detect_rich_rtl(rich_message: Any) -> bool | None:
    """Detect paragraph direction from the first strong directional character."""
    for text in _visible_rich_text(rich_message):
        for char in text:
            bidi = unicodedata.bidirectional(char)
            if bidi in {"R", "AL"}:
                return True
            if bidi == "L":
                return False
    return None


class DirectionAwareBot(LocalizedBot):
    """Set Rich Message direction from its own text, independent of UI locale."""

    async def __call__(self, method, request_timeout: int | None = None):
        rich_message = getattr(method, "rich_message", None)
        if rich_message is not None:
            is_rtl = _detect_rich_rtl(rich_message)
            if is_rtl is not None and hasattr(rich_message, "model_copy"):
                rich_message = rich_message.model_copy(update={"is_rtl": is_rtl})
                method = method.model_copy(update={"rich_message": rich_message})
        return await super().__call__(method, request_timeout=request_timeout)


async def prepare_telegram(bot: LocalizedBot) -> bool:
    """Validate Telegram access and prepare polling without crashing on outages."""
    attempt = 0
    retry_delay = INITIAL_RETRY_DELAY

    while True:
        attempt += 1
        stage = "getMe"
        try:
            me = await bot.get_me(request_timeout=TELEGRAM_REQUEST_TIMEOUT)
            logger.info(
                "Telegram authentication succeeded: bot_id=%s username=@%s",
                me.id,
                me.username or "unknown",
            )

            stage = "getWebhookInfo"
            webhook = await bot.get_webhook_info(
                request_timeout=TELEGRAM_REQUEST_TIMEOUT,
            )
            logger.info(
                "Telegram webhook status: configured=%s pending_updates=%s",
                bool(webhook.url),
                webhook.pending_update_count,
            )

            if webhook.url:
                stage = "deleteWebhook"
                await bot.delete_webhook(
                    drop_pending_updates=True,
                    request_timeout=TELEGRAM_REQUEST_TIMEOUT,
                )
                logger.info("Telegram webhook deleted; pending updates dropped")
            else:
                logger.info("No Telegram webhook is configured; polling can start")

            return True

        except TelegramUnauthorizedError:
            logger.critical(
                "Telegram rejected BOT_TOKEN during %s (401 Unauthorized). "
                "The token is invalid, revoked, or belongs to a deleted bot. "
                "Generate a fresh token in @BotFather and replace BOT_TOKEN.",
                stage,
            )
            return False
        except TelegramNotFound:
            logger.critical(
                "Telegram returned 404 Not Found during %s. BOT_TOKEN is empty, "
                "malformed, incomplete, or no longer valid. Replace BOT_TOKEN "
                "with the exact token from @BotFather.",
                stage,
            )
            return False
        except TelegramRetryAfter as error:
            retry_delay = min(
                max(int(error.retry_after) + 1, retry_delay),
                MAX_RETRY_DELAY,
            )
            logger.warning(
                "Telegram rate limit during %s (attempt=%s); retrying in %ss",
                stage,
                attempt,
                retry_delay,
            )
        except (TelegramNetworkError, TelegramServerError) as error:
            logger.warning(
                "Temporary Telegram failure during %s (attempt=%s, error=%s); "
                "retrying in %ss",
                stage,
                attempt,
                error,
                retry_delay,
            )
        except TelegramAPIError as error:
            logger.critical(
                "Telegram rejected startup during %s with a non-retryable API "
                "error: %s",
                stage,
                error,
            )
            return False

        await asyncio.sleep(retry_delay)
        retry_delay = min(retry_delay * 2, MAX_RETRY_DELAY)


async def _media_cleanup_loop() -> None:
    interval = cleanup_interval_seconds()
    while True:
        try:
            media_store.cleanup()
        except Exception:
            logger.exception("Rich-media cleanup failed")
        await asyncio.sleep(interval)


async def main() -> None:
    settings = Settings.from_env()
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    )
    try:
        bot = DirectionAwareBot(settings.bot_token)
    except TokenValidationError:
        logger.critical(
            "BOT_TOKEN has an invalid format. Paste only the exact token from "
            "@BotFather without BOT_TOKEN=, quotes, spaces, or a URL."
        )
        return

    dispatcher = Dispatcher(storage=MemoryStorage())
    dispatcher.message.outer_middleware(LocaleMiddleware())
    dispatcher.guest_message.outer_middleware(LocaleMiddleware())
    dispatcher.callback_query.outer_middleware(LocaleMiddleware())
    dispatcher.my_chat_member.outer_middleware(LocaleMiddleware())
    dispatcher.include_router(router)

    cleanup_task: asyncio.Task[None] | None = None
    try:
        if not await prepare_telegram(bot):
            return
        await page_registry.rebuild_media_pins()
        media_store.cleanup()
        cleanup_task = asyncio.create_task(_media_cleanup_loop(), name="rich-media-cleanup")
        await configure_bot_profile(bot)
        logger.info("Starting Telegram polling")
        await dispatcher.start_polling(
            bot,
            allowed_updates=dispatcher.resolve_used_update_types(),
        )
    finally:
        if cleanup_task is not None:
            cleanup_task.cancel()
            try:
                await cleanup_task
            except asyncio.CancelledError:
                pass
        await bot.session.close()
        logger.info("Telegram HTTP session closed")


if __name__ == "__main__":
    asyncio.run(main())
