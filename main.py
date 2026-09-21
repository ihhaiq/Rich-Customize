from __future__ import annotations

import asyncio
import logging
import os
import time
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
from aiogram.fsm.storage.base import BaseStorage
from aiogram.utils.token import TokenValidationError

from app.config import Settings
from app.editor.limits import EDITOR_SESSION_TTL_SECONDS
from app.i18n import LocaleMiddleware, LocalizedBot, configure_bot_profile
from app.miniapp import BETA_VERSION, start_mini_app_server
from app.routers import router
from app.services.media import cleanup_interval_seconds, media_store
from app.services.media_library import showcase_media_library
from app.services.observability import configure_observability
from app.services.page_registry import page_registry
from app.services.request_guard import (
    DeveloperAccessMiddleware,
    IdempotencyMiddleware,
    SlidingWindowThrottleMiddleware,
)
from app.services.retry import retry_after_delay
from app.services.runtime_redis import runtime_redis
from app.services.usage_stats import UsageStatsMiddleware, usage_stats
from app.storage import HybridFSMStorage, state_database
from app.storage.redis_fsm import build_redis_fsm_storage


logger = logging.getLogger(__name__)
INITIAL_RETRY_DELAY = 5.0
MAX_RETRY_DELAY = 60.0
TELEGRAM_REQUEST_TIMEOUT = 30
BOT_API_RETRY_ATTEMPTS = 3

_VISIBLE_TEXT_KEYS = {
    "text",
    "summary",
    "caption",
    "credit",
    "expression",
    "alternative_text",
}


def _visible_rich_text(value: Any) -> list[str]:
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
    for text in _visible_rich_text(rich_message):
        for char in text:
            bidi = unicodedata.bidirectional(char)
            if bidi in {"R", "AL"}:
                return True
            if bidi == "L":
                return False
    return None


class DirectionAwareBot(LocalizedBot):
    """Direction-aware Bot API client with global 429 backoff + jitter."""

    async def __call__(self, method, request_timeout: int | None = None):
        rich_message = getattr(method, "rich_message", None)
        if rich_message is not None:
            is_rtl = _detect_rich_rtl(rich_message)
            if is_rtl is not None and hasattr(rich_message, "model_copy"):
                rich_message = rich_message.model_copy(update={"is_rtl": is_rtl})
                method = method.model_copy(update={"rich_message": rich_message})

        for attempt in range(BOT_API_RETRY_ATTEMPTS + 1):
            try:
                return await super().__call__(method, request_timeout=request_timeout)
            except TelegramRetryAfter as error:
                await usage_stats.record_rate_limit()
                if attempt >= BOT_API_RETRY_ATTEMPTS:
                    raise
                delay = retry_after_delay(float(error.retry_after), attempt)
                logger.warning(
                    "Telegram flood control; retrying API method in %.2fs",
                    delay,
                )
                await asyncio.sleep(delay)
        raise RuntimeError("unreachable Telegram retry loop")


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
                    drop_pending_updates=False,
                    request_timeout=TELEGRAM_REQUEST_TIMEOUT,
                )
                logger.info("Telegram webhook deleted; pending updates preserved")
            else:
                logger.info("No Telegram webhook is configured; polling can start")
            return True

        except TelegramUnauthorizedError:
            logger.critical(
                "Telegram rejected BOT_TOKEN during %s (401 Unauthorized). "
                "Replace BOT_TOKEN with a fresh token from BotFather.",
                stage,
            )
            return False
        except TelegramNotFound:
            logger.critical(
                "Telegram returned 404 during %s. BOT_TOKEN is malformed or invalid.",
                stage,
            )
            return False
        except TelegramRetryAfter as error:
            delay = retry_after_delay(float(error.retry_after), attempt)
            retry_delay = max(retry_delay, delay)
            logger.warning(
                "Telegram rate limit during %s; retrying in %.2fs",
                stage,
                retry_delay,
            )
        except (TelegramNetworkError, TelegramServerError) as error:
            logger.warning(
                "Temporary Telegram failure during %s (attempt=%s, error=%s); "
                "retrying in %.2fs",
                stage,
                attempt,
                error,
                retry_delay,
            )
        except TelegramAPIError as error:
            logger.critical(
                "Telegram rejected startup during %s with a non-retryable API error: %s",
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
            async with runtime_redis.distributed_lock(
                "maintenance:media-cleanup",
                timeout=max(60, interval - 5),
            ) as acquired:
                if acquired:
                    await asyncio.to_thread(media_store.cleanup)
        except Exception:
            logger.exception("Rich-media cleanup failed")
        await asyncio.sleep(interval)


async def _usage_stats_flush_loop() -> None:
    while True:
        await asyncio.sleep(60)
        try:
            await usage_stats.flush()
        except Exception:
            logger.exception("Usage statistics flush failed")


async def _page_fallback_snapshot_loop() -> None:
    interval = max(3600, int(os.getenv("PAGE_SNAPSHOT_INTERVAL", "21600")))
    while True:
        await asyncio.sleep(interval)
        try:
            async with runtime_redis.distributed_lock(
                "maintenance:page-snapshot",
                timeout=600,
            ) as acquired:
                if acquired:
                    await page_registry.export_snapshot()
        except Exception:
            logger.exception("Saved-page fallback snapshot failed")


async def _restore_drill_loop() -> None:
    interval = max(3600, int(os.getenv("RESTORE_DRILL_INTERVAL", "86400")))
    while True:
        await asyncio.sleep(interval)
        try:
            async with runtime_redis.distributed_lock(
                "maintenance:restore-drill",
                timeout=600,
            ) as acquired:
                if not acquired:
                    continue
                result = await page_registry.restore_drill()
                if not result["ok"]:
                    logger.error("JSON fallback restore drill failed: %s", result)
                else:
                    logger.info(
                        "JSON fallback restore drill passed: pages=%s",
                        result["pages"],
                    )
        except Exception:
            logger.exception("JSON fallback restore drill crashed")


async def _editor_session_cleanup_loop(storage: BaseStorage) -> None:
    while True:
        try:
            async with runtime_redis.distributed_lock(
                "maintenance:editor-cleanup",
                timeout=240,
            ) as acquired:
                if acquired:
                    cutoff = int(time.time()) - EDITOR_SESSION_TTL_SECONDS
                    removed_database = await state_database.cleanup_expired_editor_fsm(cutoff)
                    removed_memory = 0
                    cleanup = getattr(storage, "cleanup_expired_editor_sessions", None)
                    if callable(cleanup):
                        removed_memory = int(await cleanup())
                    if removed_database or removed_memory:
                        logger.info(
                            "Expired editor cleanup: postgres=%s fallback=%s",
                            removed_database,
                            removed_memory,
                        )
        except Exception:
            logger.exception("Editor session cleanup failed")
        await asyncio.sleep(300)


async def _build_fsm_storage() -> BaseStorage:
    redis_storage = await build_redis_fsm_storage()
    if redis_storage is not None:
        logger.info("FSM storage mode: Redis")
        return redis_storage
    if os.getenv("REDIS_URL", "").strip():
        logger.warning("Redis FSM unavailable; falling back to PostgreSQL-backed FSM")
    return HybridFSMStorage()


async def main() -> None:
    settings = Settings.from_env()
    configure_observability(settings.log_level)

    try:
        bot = DirectionAwareBot(settings.bot_token)
    except TokenValidationError:
        logger.critical(
            "BOT_TOKEN has an invalid format. Paste only the exact token from BotFather."
        )
        return

    redis_status = await runtime_redis.startup()
    if redis_status.configured and not redis_status.connected:
        logger.warning("Redis unavailable; local fallbacks are active: %s", redis_status.last_error)

    database_status = await state_database.startup()
    if database_status.connected:
        logger.info(
            "Persistent storage mode: PostgreSQL (%sms)",
            database_status.latency_ms,
        )
    else:
        logger.warning(
            "Persistent storage mode: JSON fallback (%s)",
            database_status.last_error or "DATABASE_URL is not configured",
        )

    migrated_pages = await page_registry.startup()
    if migrated_pages:
        logger.info("Migrated %s saved pages into indexed PostgreSQL rows", migrated_pages)
    await usage_stats.startup(await page_registry.usage_history())

    fsm_storage = await _build_fsm_storage()
    isolation_factory = getattr(fsm_storage, "create_isolation", None)
    events_isolation = isolation_factory() if callable(isolation_factory) else None
    dispatcher = Dispatcher(storage=fsm_storage, events_isolation=events_isolation)

    dispatcher.update.outer_middleware(IdempotencyMiddleware())
    for observer in (dispatcher.message, dispatcher.guest_message, dispatcher.callback_query):
        observer.outer_middleware(DeveloperAccessMiddleware())
        observer.outer_middleware(SlidingWindowThrottleMiddleware())
        observer.outer_middleware(LocaleMiddleware())
        observer.outer_middleware(UsageStatsMiddleware())
    dispatcher.my_chat_member.outer_middleware(LocaleMiddleware())
    dispatcher.my_chat_member.outer_middleware(UsageStatsMiddleware())
    dispatcher.include_router(router)

    tasks: list[asyncio.Task[None]] = []
    miniapp_runner = None
    try:
        await showcase_media_library.reload()
        if state_database.configured:
            tasks.append(asyncio.create_task(
                state_database.maintain_connection(),
                name="postgres-connection-monitor",
            ))
        try:
            miniapp_runner = await start_mini_app_server(bot, settings.bot_token)
            logger.info("Mini App Beta %s server started", BETA_VERSION)
        except Exception:
            logger.exception(
                "Mini App Beta %s failed to start; continuing with bot polling",
                BETA_VERSION,
            )
        if not await prepare_telegram(bot):
            return

        await page_registry.rebuild_media_pins()
        await asyncio.to_thread(media_store.cleanup)
        tasks.extend([
            asyncio.create_task(_media_cleanup_loop(), name="rich-media-cleanup"),
            asyncio.create_task(_usage_stats_flush_loop(), name="usage-stats-flush"),
            asyncio.create_task(_page_fallback_snapshot_loop(), name="page-fallback-snapshot"),
            asyncio.create_task(_restore_drill_loop(), name="restore-drill"),
            asyncio.create_task(
                _editor_session_cleanup_loop(fsm_storage),
                name="editor-session-cleanup",
            ),
        ])

        cutoff = int(time.time()) - EDITOR_SESSION_TTL_SECONDS
        await state_database.cleanup_expired_editor_fsm(cutoff)
        cleanup = getattr(fsm_storage, "cleanup_expired_editor_sessions", None)
        if callable(cleanup):
            await cleanup()

        await configure_bot_profile(bot)
        logger.info("Starting Telegram polling")
        await dispatcher.start_polling(
            bot,
            allowed_updates=dispatcher.resolve_used_update_types(),
        )
    finally:
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

        # Produce one recoverable copy after handlers have stopped mutating state.
        try:
            async with runtime_redis.distributed_lock(
                "maintenance:page-snapshot",
                timeout=600,
            ) as acquired:
                if acquired:
                    await page_registry.export_snapshot()
        except Exception:
            logger.exception("Final saved-page fallback snapshot failed")

        try:
            await usage_stats.flush()
        except Exception:
            logger.exception("Final usage statistics flush failed")

        if miniapp_runner is not None:
            await miniapp_runner.cleanup()
        await state_database.close()
        await runtime_redis.close()
        await bot.session.close()
        logger.info("Graceful shutdown complete")


if __name__ == "__main__":
    asyncio.run(main())
