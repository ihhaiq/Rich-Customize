from __future__ import annotations

import asyncio
import copy
import os
import time
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any

from aiogram import BaseMiddleware
from aiogram.types import TelegramObject

from app.storage import HybridJSONRepository


def _stats_path() -> Path:
    configured = os.getenv("USAGE_STATS_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "usage_stats.json"


class UsageStats:
    def __init__(self, path: Path | None = None) -> None:
        self._repository = HybridJSONRepository("usage_stats", path or _stats_path())
        self._lock = asyncio.Lock()
        self._started_at = int(time.time())
        self._users: dict[str, dict[str, int]] = {}
        self._dirty = False
        self._loaded = False

    async def startup(self, history: dict[int, dict[str, int]] | None = None) -> None:
        payload = await self._repository.read()
        now = int(time.time())
        changed = False
        async with self._lock:
            if isinstance(payload, dict):
                try:
                    self._started_at = int(payload.get("started_at") or now)
                except (TypeError, ValueError):
                    self._started_at = now
                raw_users = payload.get("users")
                if isinstance(raw_users, dict):
                    self._users = {
                        str(user_id): {
                            "first_seen": int(data.get("first_seen") or now),
                            "last_seen": int(data.get("last_seen") or now),
                            "events": max(0, int(data.get("events") or 0)),
                        }
                        for user_id, data in raw_users.items()
                        if isinstance(data, dict)
                    }
            self._loaded = True
            for user_id, data in (history or {}).items():
                key = str(user_id)
                try:
                    first_seen = int(data.get("first_seen") or now)
                    last_seen = int(data.get("last_seen") or first_seen)
                except (TypeError, ValueError):
                    continue
                current = self._users.get(key)
                if current is None:
                    self._users[key] = {
                        "first_seen": first_seen,
                        "last_seen": last_seen,
                        "events": 0,
                    }
                    changed = True
                    continue
                merged_first = min(current["first_seen"], first_seen)
                merged_last = max(current["last_seen"], last_seen)
                if merged_first != current["first_seen"] or merged_last != current["last_seen"]:
                    current["first_seen"] = merged_first
                    current["last_seen"] = merged_last
                    changed = True
            self._dirty = self._dirty or changed
        if changed:
            await self.flush()

    async def observe(self, user_id: int, *, now: int | None = None) -> None:
        stamp = int(now or time.time())
        async with self._lock:
            if not self._loaded:
                return
            key = str(user_id)
            current = self._users.get(key)
            if current is None:
                current = {"first_seen": stamp, "last_seen": stamp, "events": 0}
                self._users[key] = current
            else:
                current["first_seen"] = min(current["first_seen"], stamp)
                current["last_seen"] = max(current["last_seen"], stamp)
            current["events"] += 1
            self._dirty = True

    async def flush(self) -> None:
        async with self._lock:
            if not self._loaded or not self._dirty:
                return
            payload = {
                "version": 1,
                "started_at": self._started_at,
                "users": copy.deepcopy(self._users),
            }
            self._dirty = False
        try:
            await self._repository.write(payload)
        except Exception:
            async with self._lock:
                self._dirty = True
            raise

    async def snapshot(self, *, now: int | None = None) -> dict[str, int | None]:
        stamp = int(now or time.time())
        async with self._lock:
            users = copy.deepcopy(self._users)
            started_at = self._started_at

        first_values = [item["first_seen"] for item in users.values()]
        last_values = [item["last_seen"] for item in users.values()]

        def since(field: str, seconds: int) -> int:
            cutoff = stamp - seconds
            return sum(1 for item in users.values() if item[field] >= cutoff)

        return {
            "tracked_users": len(users),
            "events": sum(item["events"] for item in users.values()),
            "started_at": started_at,
            "oldest_seen": min(first_values) if first_values else None,
            "latest_seen": max(last_values) if last_values else None,
            "active_24h": since("last_seen", 24 * 60 * 60),
            "active_7d": since("last_seen", 7 * 24 * 60 * 60),
            "active_30d": since("last_seen", 30 * 24 * 60 * 60),
            "new_24h": since("first_seen", 24 * 60 * 60),
            "new_7d": since("first_seen", 7 * 24 * 60 * 60),
            "new_30d": since("first_seen", 30 * 24 * 60 * 60),
        }


class UsageStatsMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = getattr(event, "from_user", None)
        user_id = getattr(user, "id", None)
        if isinstance(user_id, int):
            await usage_stats.observe(user_id)
        return await handler(event, data)


usage_stats = UsageStats()


__all__ = ["UsageStats", "UsageStatsMiddleware", "usage_stats"]
