from __future__ import annotations

import asyncio
import copy
import os
import time
from collections import Counter
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
    """Persistent user analytics plus lightweight operational telemetry."""

    def __init__(self, path: Path | None = None) -> None:
        self._repository = HybridJSONRepository("usage_stats", path or _stats_path())
        self._lock = asyncio.Lock()
        self._started_at = int(time.time())
        self._runtime_started_at = int(time.time())
        self._users: dict[str, dict[str, Any]] = {}
        self._total_updates = 0
        self._failed_updates = 0
        self._handler_ms_total = 0.0
        self._handler_ms_max = 0.0
        self._minute_buckets: dict[str, dict[str, float | int]] = {}
        self._operations: dict[str, int] = {
            "preview_success": 0,
            "preview_failed": 0,
            "publish_success": 0,
            "publish_failed": 0,
            "rate_limited": 0,
        }
        self._dirty = False
        self._loaded = False

    @staticmethod
    def _clean_text(value: Any, limit: int = 128) -> str | None:
        if not isinstance(value, str):
            return None
        cleaned = value.strip()
        return cleaned[:limit] if cleaned else None

    @staticmethod
    def _minute_key(stamp: int) -> str:
        return str((stamp // 60) * 60)

    def _trim_buckets(self, now: int) -> None:
        cutoff = now - (24 * 60 * 60)
        for key in tuple(self._minute_buckets):
            try:
                bucket_stamp = int(key)
            except ValueError:
                self._minute_buckets.pop(key, None)
                continue
            if bucket_stamp < cutoff:
                self._minute_buckets.pop(key, None)

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
                    for user_id, raw in raw_users.items():
                        if not isinstance(raw, dict):
                            continue
                        try:
                            first_seen = int(raw.get("first_seen") or now)
                            last_seen = int(raw.get("last_seen") or first_seen)
                            events = max(0, int(raw.get("events") or 0))
                        except (TypeError, ValueError):
                            continue
                        self._users[str(user_id)] = {
                            "first_seen": first_seen,
                            "last_seen": last_seen,
                            "events": events,
                            "username": self._clean_text(raw.get("username"), 64),
                            "first_name": self._clean_text(raw.get("first_name"), 128),
                            "last_name": self._clean_text(raw.get("last_name"), 128),
                            "language_code": self._clean_text(raw.get("language_code"), 16),
                        }

                raw_operational = payload.get("operational")
                if isinstance(raw_operational, dict):
                    try:
                        self._total_updates = max(
                            0, int(raw_operational.get("total_updates") or 0)
                        )
                        self._failed_updates = max(
                            0, int(raw_operational.get("failed_updates") or 0)
                        )
                        self._handler_ms_total = max(
                            0.0, float(raw_operational.get("handler_ms_total") or 0.0)
                        )
                        self._handler_ms_max = max(
                            0.0, float(raw_operational.get("handler_ms_max") or 0.0)
                        )
                    except (TypeError, ValueError):
                        pass
                    raw_operations = raw_operational.get("operations")
                    if isinstance(raw_operations, dict):
                        for key in self._operations:
                            try:
                                self._operations[key] = max(
                                    0, int(raw_operations.get(key) or 0)
                                )
                            except (TypeError, ValueError):
                                pass
                    raw_buckets = raw_operational.get("minute_buckets")
                    if isinstance(raw_buckets, dict):
                        for key, raw_bucket in raw_buckets.items():
                            if not isinstance(raw_bucket, dict):
                                continue
                            try:
                                self._minute_buckets[str(int(key))] = {
                                    "updates": max(0, int(raw_bucket.get("updates") or 0)),
                                    "failures": max(0, int(raw_bucket.get("failures") or 0)),
                                    "duration_ms": max(
                                        0.0, float(raw_bucket.get("duration_ms") or 0.0)
                                    ),
                                }
                            except (TypeError, ValueError):
                                continue

            self._loaded = True
            self._trim_buckets(now)
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
                        "username": None,
                        "first_name": None,
                        "last_name": None,
                        "language_code": None,
                    }
                    changed = True
                    continue
                merged_first = min(int(current["first_seen"]), first_seen)
                merged_last = max(int(current["last_seen"]), last_seen)
                if (
                    merged_first != int(current["first_seen"])
                    or merged_last != int(current["last_seen"])
                ):
                    current["first_seen"] = merged_first
                    current["last_seen"] = merged_last
                    changed = True
            self._dirty = self._dirty or changed
        if changed:
            await self.flush()

    async def observe(
        self,
        user_id: int,
        *,
        now: int | None = None,
    ) -> None:
        """Backward-compatible ID-only observation used by tests/callers."""
        stamp = int(now or time.time())
        async with self._lock:
            if not self._loaded:
                return
            key = str(user_id)
            current = self._users.get(key)
            if current is None:
                current = {
                    "first_seen": stamp,
                    "last_seen": stamp,
                    "events": 0,
                    "username": None,
                    "first_name": None,
                    "last_name": None,
                    "language_code": None,
                }
                self._users[key] = current
            current["first_seen"] = min(int(current["first_seen"]), stamp)
            current["last_seen"] = max(int(current["last_seen"]), stamp)
            current["events"] = int(current["events"]) + 1
            self._dirty = True

    async def observe_user(self, user: Any, *, now: int | None = None) -> None:
        user_id = getattr(user, "id", None)
        if not isinstance(user_id, int):
            return
        stamp = int(now or time.time())
        async with self._lock:
            if not self._loaded:
                return
            key = str(user_id)
            current = self._users.get(key)
            if current is None:
                current = {
                    "first_seen": stamp,
                    "last_seen": stamp,
                    "events": 0,
                    "username": None,
                    "first_name": None,
                    "last_name": None,
                    "language_code": None,
                }
                self._users[key] = current
            current["first_seen"] = min(int(current["first_seen"]), stamp)
            current["last_seen"] = max(int(current["last_seen"]), stamp)
            current["events"] = int(current["events"]) + 1
            current["username"] = self._clean_text(getattr(user, "username", None), 64)
            current["first_name"] = self._clean_text(
                getattr(user, "first_name", None), 128
            )
            current["last_name"] = self._clean_text(
                getattr(user, "last_name", None), 128
            )
            current["language_code"] = self._clean_text(
                getattr(user, "language_code", None), 16
            )
            self._dirty = True

    async def record_request(
        self,
        duration_ms: float,
        *,
        failed: bool = False,
        now: int | None = None,
    ) -> None:
        stamp = int(now or time.time())
        duration = max(0.0, float(duration_ms))
        async with self._lock:
            if not self._loaded:
                return
            self._total_updates += 1
            self._handler_ms_total += duration
            self._handler_ms_max = max(self._handler_ms_max, duration)
            if failed:
                self._failed_updates += 1
            bucket = self._minute_buckets.setdefault(
                self._minute_key(stamp),
                {"updates": 0, "failures": 0, "duration_ms": 0.0},
            )
            bucket["updates"] = int(bucket["updates"]) + 1
            bucket["duration_ms"] = float(bucket["duration_ms"]) + duration
            if failed:
                bucket["failures"] = int(bucket["failures"]) + 1
            self._trim_buckets(stamp)
            self._dirty = True

    async def record_operation(
        self,
        name: str,
        *,
        success: bool = True,
        count: int = 1,
    ) -> None:
        key = f"{name}_{'success' if success else 'failed'}"
        amount = max(0, int(count))
        if not amount:
            return
        async with self._lock:
            if key not in self._operations:
                self._operations[key] = 0
            self._operations[key] += amount
            self._dirty = True

    async def record_rate_limit(self) -> None:
        async with self._lock:
            self._operations["rate_limited"] = self._operations.get("rate_limited", 0) + 1
            self._dirty = True

    async def flush(self) -> None:
        async with self._lock:
            if not self._loaded or not self._dirty:
                return
            payload = {
                "version": 2,
                "started_at": self._started_at,
                "users": copy.deepcopy(self._users),
                "operational": {
                    "total_updates": self._total_updates,
                    "failed_updates": self._failed_updates,
                    "handler_ms_total": self._handler_ms_total,
                    "handler_ms_max": self._handler_ms_max,
                    "minute_buckets": copy.deepcopy(self._minute_buckets),
                    "operations": copy.deepcopy(self._operations),
                },
            }
            self._dirty = False
        try:
            await self._repository.write(payload)
        except Exception:
            async with self._lock:
                self._dirty = True
            raise

    async def snapshot(self, *, now: int | None = None) -> dict[str, Any]:
        stamp = int(now or time.time())
        async with self._lock:
            users = copy.deepcopy(self._users)
            started_at = self._started_at

        first_values = [int(item["first_seen"]) for item in users.values()]
        last_values = [int(item["last_seen"]) for item in users.values()]

        def since(field: str, seconds: int) -> int:
            cutoff = stamp - seconds
            return sum(1 for item in users.values() if int(item[field]) >= cutoff)

        languages = Counter(
            str(item["language_code"]).lower()
            for item in users.values()
            if item.get("language_code")
        )
        return {
            "tracked_users": len(users),
            "profiled_users": sum(
                1 for item in users.values() if item.get("username") or item.get("first_name")
            ),
            "users_with_username": sum(
                1 for item in users.values() if item.get("username")
            ),
            "languages": languages,
            "events": sum(int(item["events"]) for item in users.values()),
            "started_at": started_at,
            "oldest_seen": min(first_values) if first_values else None,
            "latest_seen": max(last_values) if last_values else None,
            "active_1h": since("last_seen", 60 * 60),
            "active_24h": since("last_seen", 24 * 60 * 60),
            "active_7d": since("last_seen", 7 * 24 * 60 * 60),
            "active_30d": since("last_seen", 30 * 24 * 60 * 60),
            "new_24h": since("first_seen", 24 * 60 * 60),
            "new_7d": since("first_seen", 7 * 24 * 60 * 60),
            "new_30d": since("first_seen", 30 * 24 * 60 * 60),
        }

    async def operational_snapshot(self, *, now: int | None = None) -> dict[str, Any]:
        stamp = int(now or time.time())
        async with self._lock:
            buckets = copy.deepcopy(self._minute_buckets)
            total_updates = self._total_updates
            failed_updates = self._failed_updates
            total_ms = self._handler_ms_total
            max_ms = self._handler_ms_max
            operations = copy.deepcopy(self._operations)
            runtime_started_at = self._runtime_started_at

        current_minute = (stamp // 60) * 60

        def window(minutes: int) -> tuple[int, int, float]:
            cutoff = current_minute - ((minutes - 1) * 60)
            selected = [
                bucket
                for raw_key, bucket in buckets.items()
                if int(raw_key) >= cutoff
            ]
            return (
                sum(int(item.get("updates") or 0) for item in selected),
                sum(int(item.get("failures") or 0) for item in selected),
                sum(float(item.get("duration_ms") or 0.0) for item in selected),
            )

        one_updates, one_failures, one_ms = window(1)
        five_updates, five_failures, five_ms = window(5)
        sixty_updates, sixty_failures, _ = window(60)
        return {
            "runtime_started_at": runtime_started_at,
            "uptime_seconds": max(0, stamp - runtime_started_at),
            "requests_current_minute": one_updates,
            "requests_per_minute_5m": round(five_updates / 5, 2),
            "requests_last_hour": sixty_updates,
            "failures_current_minute": one_failures,
            "failures_last_5m": five_failures,
            "failures_last_hour": sixty_failures,
            "avg_response_ms_current_minute": round(one_ms / one_updates, 2)
            if one_updates
            else 0.0,
            "avg_response_ms_5m": round(five_ms / five_updates, 2)
            if five_updates
            else 0.0,
            "avg_response_ms_all": round(total_ms / total_updates, 2)
            if total_updates
            else 0.0,
            "max_response_ms": round(max_ms, 2),
            "total_updates": total_updates,
            "failed_updates": failed_updates,
            "operations": operations,
        }

    async def top_users(self, limit: int = 10) -> list[dict[str, Any]]:
        async with self._lock:
            users = [
                {"user_id": int(user_id), **copy.deepcopy(data)}
                for user_id, data in self._users.items()
                if user_id.lstrip("-").isdigit()
            ]
        users.sort(
            key=lambda item: (int(item.get("events") or 0), int(item.get("last_seen") or 0)),
            reverse=True,
        )
        return users[: max(1, limit)]


class UsageStatsMiddleware(BaseMiddleware):
    async def __call__(
        self,
        handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]],
        event: TelegramObject,
        data: dict[str, Any],
    ) -> Any:
        user = data.get("event_from_user") or getattr(event, "from_user", None)
        if user is not None:
            await usage_stats.observe_user(user)
        started = time.perf_counter()
        failed = False
        try:
            return await handler(event, data)
        except Exception:
            failed = True
            raise
        finally:
            await usage_stats.record_request(
                (time.perf_counter() - started) * 1000,
                failed=failed,
            )


usage_stats = UsageStats()


__all__ = ["UsageStats", "UsageStatsMiddleware", "usage_stats"]
