from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import CallbackQuery, Message, TelegramObject, Update

from app.config import developer_ids
from app.services.context import correlation_id
from app.services.runtime_redis import runtime_redis
from app.services.usage_stats import usage_stats


def _scope(
    event: TelegramObject,
    data: dict[str, Any] | None = None,
) -> tuple[str, int, float] | None:
    if isinstance(event, CallbackQuery):
        data = event.data or ""
        if data.startswith("dev:"):
            return "developer", 5, 10.0
        if data == "r:postsend":
            return "publish", 2, 10.0
        if data == "r:savepage" or data.startswith(("r:pdelete", "r:prestore")):
            return "save", 4, 10.0
        if data.startswith("r:"):
            return "editor", 30, 10.0
    if isinstance(event, Message):
        text = (event.text or "").strip().casefold()
        raw_state = str((data or {}).get("raw_state") or "")
        if text.startswith("/dev") or raw_state.startswith("DeveloperStates:"):
            return "developer", 3, 10.0
        if raw_state.endswith(":saving_page_name") or raw_state.endswith(":renaming_page"):
            return "save", 4, 10.0
        if text.startswith("/editor"):
            return "editor", 8, 10.0
        if raw_state.startswith("RichEditorStates:"):
            return "editor", 30, 10.0
    return None


class SlidingWindowThrottleMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user") or getattr(event, "from_user", None)
        user_id = getattr(user, "id", None)
        rule = _scope(event, data)
        if not isinstance(user_id, int) or rule is None:
            return await handler(event, data)

        scope, limit, window = rule
        member = str(
            getattr(event, "id", None)
            or getattr(event, "message_id", None)
            or time.time_ns()
        )
        allowed = await runtime_redis.sliding_window_allow(
            f"{scope}:{user_id}",
            limit=limit,
            window_seconds=window,
            member=member,
        )
        if allowed:
            return await handler(event, data)

        await usage_stats.record_rate_limit()
        if isinstance(event, CallbackQuery):
            await event.answer("طلبات كثيرة بسرعة، حاول بعد لحظات.", show_alert=False)
        elif isinstance(event, Message):
            await event.answer("طلبات كثيرة بسرعة، حاول بعد لحظات.")
        return None


class DeveloperAccessMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        is_dev_event = (
            isinstance(event, CallbackQuery) and (event.data or "").startswith("dev:")
        ) or (
            isinstance(event, Message)
            and (event.text or "").strip().casefold().startswith("/dev")
        )
        if not is_dev_event:
            return await handler(event, data)
        user = data.get("event_from_user") or getattr(event, "from_user", None)
        user_id = getattr(user, "id", None)
        if isinstance(user_id, int) and user_id in developer_ids():
            return await handler(event, data)
        if isinstance(event, CallbackQuery):
            await event.answer("غير مسموح.", show_alert=True)
        return None


class IdempotencyMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[Update, dict[str, Any]], Awaitable[Any]],
        event: Update,
        data: dict[str, Any],
    ) -> Any:
        token = correlation_id.set(f"u{event.update_id}")
        try:
            if not await runtime_redis.claim_once(
                f"telegram-update:{event.update_id}",
                ttl_seconds=900,
            ):
                return None
            return await handler(event, data)
        finally:
            correlation_id.reset(token)


__all__ = [
    "DeveloperAccessMiddleware",
    "IdempotencyMiddleware",
    "SlidingWindowThrottleMiddleware",
    "correlation_id",
]
