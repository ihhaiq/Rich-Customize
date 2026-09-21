from __future__ import annotations

import os
import time
from collections.abc import Mapping
from typing import Any

from aiogram.fsm.storage.base import DefaultKeyBuilder, StorageKey
from aiogram.fsm.storage.redis import RedisStorage

from app.editor.limits import EDITOR_SESSION_TTL_SECONDS


class EditorRedisStorage(RedisStorage):
    """Redis FSM that gives editor sessions a sliding two-hour TTL."""

    async def set_data(self, key: StorageKey, data: Mapping[str, Any]) -> None:
        payload = dict(data)
        if "editor_last_activity_at" not in payload:
            await super().set_data(key, payload)
            return

        payload["editor_last_activity_at"] = int(time.time())
        data_key = self.key_builder.build(key, "data")
        state_key = self.key_builder.build(key, "state")
        if not payload:
            await self.redis.delete(data_key)
            return
        async with self.redis.pipeline(transaction=True) as pipe:
            pipe.set(data_key, self.json_dumps(payload), ex=EDITOR_SESSION_TTL_SECONDS)
            pipe.expire(state_key, EDITOR_SESSION_TTL_SECONDS)
            await pipe.execute()


async def build_redis_fsm_storage() -> EditorRedisStorage | None:
    url = os.getenv("REDIS_URL", "").strip()
    if not url:
        return None
    storage = EditorRedisStorage.from_url(
        url,
        connection_kwargs={
            "socket_connect_timeout": float(os.getenv("REDIS_CONNECT_TIMEOUT", "2")),
            "socket_timeout": float(os.getenv("REDIS_COMMAND_TIMEOUT", "2")),
            "health_check_interval": 30,
            "max_connections": max(2, int(os.getenv("REDIS_MAX_CONNECTIONS", "20"))),
        },
        key_builder=DefaultKeyBuilder(
            prefix="rich:fsm",
            with_bot_id=True,
            with_business_connection_id=True,
            with_destiny=True,
        ),
    )
    try:
        await storage.redis.ping()
    except Exception:
        await storage.close()
        return None
    return storage


__all__ = ["EditorRedisStorage", "build_redis_fsm_storage"]
