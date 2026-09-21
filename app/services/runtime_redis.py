from __future__ import annotations

import asyncio
import os
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import AsyncIterator

try:
    from redis.asyncio import Redis
except ImportError:  # pragma: no cover - dependency is installed in production.
    Redis = None  # type: ignore[assignment]


_SLIDING_WINDOW_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local cutoff = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local ttl = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', key, 0, cutoff)
local count = redis.call('ZCARD', key)
if count >= limit then
    redis.call('PEXPIRE', key, ttl)
    return 0
end
redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, ttl)
return 1
"""


@dataclass(frozen=True, slots=True)
class RedisStatus:
    configured: bool
    connected: bool
    last_error: str | None


class RuntimeRedis:
    """Shared Redis primitives for throttling, idempotency, cache and locks."""

    def __init__(self) -> None:
        self.client: Redis | None = None
        self._connect_lock = asyncio.Lock()
        self._last_error: str | None = None
        self._memory_windows: dict[str, deque[float]] = defaultdict(deque)
        self._memory_seen: dict[str, float] = {}
        self._memory_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    @property
    def url(self) -> str:
        return os.getenv("REDIS_URL", "").strip()

    @property
    def configured(self) -> bool:
        return bool(self.url)

    @property
    def connected(self) -> bool:
        return self.client is not None

    def status(self) -> RedisStatus:
        return RedisStatus(self.configured, self.connected, self._last_error)

    async def startup(self) -> RedisStatus:
        if not self.configured or Redis is None:
            if self.configured and Redis is None:
                self._last_error = "redis package is not installed"
            return self.status()
        async with self._connect_lock:
            if self.client is not None:
                return self.status()
            try:
                candidate = Redis.from_url(
                    self.url,
                    decode_responses=True,
                    socket_connect_timeout=float(os.getenv("REDIS_CONNECT_TIMEOUT", "2")),
                    socket_timeout=float(os.getenv("REDIS_COMMAND_TIMEOUT", "2")),
                    health_check_interval=30,
                    max_connections=max(2, int(os.getenv("REDIS_MAX_CONNECTIONS", "20"))),
                )
                async with asyncio.timeout(float(os.getenv("REDIS_CONNECT_TIMEOUT", "2")) + 1):
                    await candidate.ping()
                self.client = candidate
                self._last_error = None
            except Exception as error:
                self._last_error = f"{type(error).__name__}: {str(error)[:180]}"
                try:
                    await candidate.aclose(close_connection_pool=True)  # type: ignore[possibly-undefined]
                except Exception:
                    pass
                self.client = None
            return self.status()

    async def close(self) -> None:
        client, self.client = self.client, None
        if client is not None:
            await client.aclose(close_connection_pool=True)

    async def sliding_window_allow(
        self,
        key: str,
        *,
        limit: int,
        window_seconds: float,
        member: str,
    ) -> bool:
        now_ms = int(time.time() * 1000)
        window_ms = max(1, int(window_seconds * 1000))
        client = self.client
        if client is not None:
            try:
                result = await client.eval(
                    _SLIDING_WINDOW_SCRIPT,
                    1,
                    f"rich:window:{key}",
                    now_ms,
                    now_ms - window_ms,
                    max(1, limit),
                    member,
                    window_ms,
                )
                return bool(result)
            except Exception:
                self.client = None

        now = time.monotonic()
        bucket = self._memory_windows[key]
        cutoff = now - window_seconds
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            return False
        bucket.append(now)
        return True

    async def claim_once(self, key: str, *, ttl_seconds: int) -> bool:
        client = self.client
        if client is not None:
            try:
                return bool(
                    await client.set(
                        f"rich:once:{key}",
                        "1",
                        ex=max(1, ttl_seconds),
                        nx=True,
                    )
                )
            except Exception:
                self.client = None

        now = time.monotonic()
        expires = self._memory_seen.get(key, 0.0)
        if expires > now:
            return False
        self._memory_seen[key] = now + max(1, ttl_seconds)
        if len(self._memory_seen) > 10_000:
            self._memory_seen = {
                item: expiry
                for item, expiry in self._memory_seen.items()
                if expiry > now
            }
        return True

    async def cache_get(self, key: str) -> str | None:
        client = self.client
        if client is None:
            return None
        try:
            value = await client.get(f"rich:cache:{key}")
            return str(value) if value is not None else None
        except Exception:
            self.client = None
            return None

    async def cache_set(self, key: str, value: str, *, ttl_seconds: int) -> None:
        client = self.client
        if client is None:
            return
        try:
            await client.set(f"rich:cache:{key}", value, ex=max(1, ttl_seconds))
        except Exception:
            self.client = None

    @asynccontextmanager
    async def distributed_lock(
        self,
        name: str,
        *,
        timeout: int = 240,
    ) -> AsyncIterator[bool]:
        client = self.client
        if client is not None:
            lock = client.lock(
                f"rich:lock:{name}",
                timeout=max(5, timeout),
                blocking=False,
            )
            acquired = False
            try:
                acquired = bool(await lock.acquire())
                yield acquired
            finally:
                if acquired:
                    try:
                        await lock.release()
                    except Exception:
                        pass
            return

        lock = self._memory_locks[name]
        if lock.locked():
            yield False
            return
        await lock.acquire()
        try:
            yield True
        finally:
            lock.release()


runtime_redis = RuntimeRedis()


__all__ = ["RedisStatus", "RuntimeRedis", "runtime_redis"]
