from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
import re
import tempfile
import unittest
from collections import defaultdict
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiohttp import web

from app.editor.limits import MAX_SAVED_PAGES
from app.routers import developer
from app.services.media_safety import (
    MAX_IMAGE_PIXELS,
    MAX_SLIDESHOW_IMAGE_BYTES,
    UnsafeMediaError,
    safe_telegram_download,
    validate_slideshow_message,
)
from app.services.observability import JsonFormatter
from app.services.request_guard import (
    IdempotencyMiddleware,
    _scope,
    correlation_id,
)
from app.services.retry import retry_after_delay
from app.services.runtime_redis import RedisStatus, RuntimeRedis
from app.storage.hybrid import (
    PostgresStateDatabase,
    _decode_json,
    _encode_json,
)


class _AtomicTransaction:
    def __init__(self, connection):
        self.connection = connection

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        lock = self.connection.owner_lock
        if lock is not None and lock.locked():
            lock.release()
        self.connection.owner_lock = None


class _AtomicConnection:
    def __init__(self, pool):
        self.pool = pool
        self.owner_lock = None

    def transaction(self):
        return _AtomicTransaction(self)

    async def execute(self, query, *args):
        normalized = " ".join(query.split())
        if "pg_advisory_xact_lock" in normalized:
            owner_id = int(args[0])
            lock = self.pool.owner_locks[owner_id]
            await lock.acquire()
            self.owner_lock = lock
            return "SELECT 1"
        if "INSERT INTO rich_pages" in normalized:
            page_id = str(args[0])
            owner_id = int(args[1])
            existing = self.pool.pages.get(page_id)
            if existing is not None and int(existing["owner_id"]) != owner_id:
                return "INSERT 0 0"
            self.pool.pages[page_id] = {
                "owner_id": owner_id,
                "created_at": int(args[7]),
            }
            return "INSERT 0 1"
        raise AssertionError(normalized)

    async def fetchrow(self, query, *args):
        normalized = " ".join(query.split())
        if "FROM rich_pages" in normalized and "WHERE page_id = $1" in normalized:
            value = self.pool.pages.get(str(args[0]))
            return dict(value) if value is not None else None
        raise AssertionError(normalized)

    async def fetchval(self, query, *args):
        normalized = " ".join(query.split())
        if "COUNT(*) FROM rich_pages WHERE owner_id = $1" in normalized:
            owner_id = int(args[0])
            return sum(
                1 for page in self.pool.pages.values()
                if int(page["owner_id"]) == owner_id
            )
        raise AssertionError(normalized)


class _Acquire:
    def __init__(self, pool):
        self.pool = pool
        self.connection = _AtomicConnection(pool)

    async def __aenter__(self):
        self.pool.acquired += 1
        return self.connection

    async def __aexit__(self, exc_type, exc, tb):
        self.pool.released += 1


class _AtomicPool:
    def __init__(self):
        self.pages = {}
        self.owner_locks = defaultdict(asyncio.Lock)
        self.acquired = 0
        self.released = 0

    def acquire(self):
        return _Acquire(self)


class ProductionHardeningTests(unittest.IsolatedAsyncioTestCase):
    async def test_atomic_page_limit_allows_only_one_concurrent_twelfth_page(self):
        database = PostgresStateDatabase("postgresql://unused")
        pool = _AtomicPool()
        owner_id = 777
        for index in range(MAX_SAVED_PAGES - 1):
            pool.pages[f"existing-{index}"] = {
                "owner_id": owner_id,
                "created_at": 1,
            }
        database._pool = pool

        async def create(page_id: str):
            return await database.save_page_row_limited(
                page_id,
                owner_id,
                page_id,
                [],
                [],
                1,
                "center",
                1,
                2,
                max_pages=MAX_SAVED_PAGES,
            )

        first, second = await asyncio.gather(create("new-a"), create("new-b"))
        statuses = sorted([first[1], second[1]])

        self.assertEqual(statuses, ["limit", "saved"])
        self.assertEqual(
            sum(1 for page in pool.pages.values() if page["owner_id"] == owner_id),
            MAX_SAVED_PAGES,
        )
        self.assertEqual(pool.acquired, pool.released)

    async def test_sliding_window_is_real_pre_handler_throttling(self):
        redis = RuntimeRedis()
        self.assertTrue(await redis.sliding_window_allow(
            "editor:7", limit=2, window_seconds=10, member="1",
        ))
        self.assertTrue(await redis.sliding_window_allow(
            "editor:7", limit=2, window_seconds=10, member="2",
        ))
        self.assertFalse(await redis.sliding_window_allow(
            "editor:7", limit=2, window_seconds=10, member="3",
        ))

        callback = SimpleNamespace(data="dev:stats")
        with patch("app.services.request_guard.CallbackQuery", type(callback)):
            dev_scope = _scope(callback)
        self.assertEqual(dev_scope, ("developer", 5, 10.0))

        editor_callback = SimpleNamespace(data="r:addmenu")
        with patch("app.services.request_guard.CallbackQuery", type(editor_callback)):
            editor_scope = _scope(editor_callback)
        self.assertEqual(editor_scope, ("editor", 30, 10.0))
        self.assertLess(dev_scope[1], editor_scope[1])

        save_message = SimpleNamespace(text="صفحتي")
        with patch("app.services.request_guard.Message", type(save_message)):
            save_scope = _scope(
                save_message,
                {"raw_state": "RichEditorStates:saving_page_name"},
            )
        self.assertEqual(save_scope, ("save", 4, 10.0))

    async def test_duplicate_telegram_update_is_claimed_only_once(self):
        middleware = IdempotencyMiddleware()
        handler = AsyncMock(return_value="handled")
        event = SimpleNamespace(update_id=991)
        with patch("app.services.request_guard.Update", type(event)), patch(
            "app.services.request_guard.runtime_redis.claim_once",
            AsyncMock(side_effect=[True, False]),
        ):
            self.assertEqual(await middleware(handler, event, {}), "handled")
            self.assertIsNone(await middleware(handler, event, {}))
        handler.assert_awaited_once()

    def test_slideshow_rejects_oversized_or_extreme_images(self):
        too_large = SimpleNamespace(
            photo=[SimpleNamespace(
                file_size=MAX_SLIDESHOW_IMAGE_BYTES + 1,
                width=100,
                height=100,
            )],
            video=None,
        )
        with self.assertRaises(UnsafeMediaError):
            validate_slideshow_message(too_large)

        width = int(MAX_IMAGE_PIXELS ** 0.5) + 1
        too_many_pixels = SimpleNamespace(
            photo=[SimpleNamespace(file_size=1, width=width, height=width)],
            video=None,
        )
        with self.assertRaises(UnsafeMediaError):
            validate_slideshow_message(too_many_pixels)

    async def test_telegram_download_has_explicit_timeout_and_size_bound(self):
        class SlowBot:
            async def download(self, file_id, destination):
                await asyncio.sleep(0.05)

        with self.assertRaises(TimeoutError):
            await safe_telegram_download(SlowBot(), "file", timeout=0.001)

        class LargeBot:
            async def download(self, file_id, destination):
                destination.write(b"x" * 11)

        with self.assertRaises(UnsafeMediaError):
            await safe_telegram_download(LargeBot(), "file", max_bytes=10, timeout=1)

    async def test_runtime_distributed_lock_prevents_parallel_maintenance(self):
        redis = RuntimeRedis()
        entered = asyncio.Event()
        release = asyncio.Event()
        results = []

        async def first():
            async with redis.distributed_lock("cleanup") as acquired:
                results.append(acquired)
                entered.set()
                await release.wait()

        task = asyncio.create_task(first())
        await entered.wait()
        async with redis.distributed_lock("cleanup") as acquired:
            results.append(acquired)
        release.set()
        await task

        self.assertEqual(results, [True, False])

    async def test_circuit_breaker_stops_repeated_database_connect_waits(self):
        calls = 0

        async def failing_factory(**kwargs):
            nonlocal calls
            calls += 1
            raise OSError("offline")

        database = PostgresStateDatabase(
            "postgresql://unused",
            pool_factory=failing_factory,
        )
        database._migrations_ready = True
        with patch.dict(
            os.environ,
            {
                "DATABASE_CIRCUIT_FAILURES": "2",
                "DATABASE_CIRCUIT_COOLDOWN": "60",
            },
            clear=False,
        ):
            await database.check_and_reconnect(force=True)
            await database.check_and_reconnect(force=True)
            status = await database.check_and_reconnect(force=False)

        self.assertEqual(calls, 2)
        self.assertTrue(status.circuit_open)
        self.assertFalse(status.connected)

    def test_pool_budget_scales_with_worker_count(self):
        database = PostgresStateDatabase("postgresql://unused")
        with patch.dict(
            os.environ,
            {
                "WEB_CONCURRENCY": "4",
                "DATABASE_POOL_TOTAL_BUDGET": "20",
                "DATABASE_POOL_MAX_SIZE": "",
                "DATABASE_POOL_MIN_SIZE": "1",
            },
            clear=False,
        ):
            self.assertEqual(database._pool_sizes(), (1, 5))

    def test_orjson_round_trip_preserves_bytes_marker(self):
        payload = {"arabic": "مرحبا", "blob": b"abc", "items": [{"raw": b"xyz"}]}
        restored = _decode_json(_encode_json(payload))
        self.assertEqual(restored, payload)

    def test_retry_after_is_respected_with_exponential_backoff_and_jitter(self):
        with patch("app.services.retry.random.uniform", return_value=0.25):
            self.assertGreaterEqual(retry_after_delay(7, 0), 7)
            self.assertGreater(retry_after_delay(0, 4, base=1), 16)

    def test_page_sql_templates_are_static_and_parameterized(self):
        for search in (False, True):
            for paged in (False, True):
                for mode in ("title", "oldest", "newest", "updated", "invalid"):
                    sql = PostgresStateDatabase._page_query_sql(search, mode, paged)
                    self.assertNotIn("{", sql)
                    self.assertNotIn("}", sql)
                    self.assertIn("$1", sql)
                    if search:
                        self.assertIn("ILIKE $2", sql)

    def test_json_logs_redact_tokens_and_full_identifiers(self):
        token = correlation_id.set("u123")
        try:
            formatter = JsonFormatter()
            record = logging.LogRecord(
                "test",
                logging.INFO,
                __file__,
                1,
                "user_id=123456 chat_id=-100987654 token=123456789:abcdefghijklmnopqrstuvwxyzABCDE",
                (),
                None,
            )
            value = json.loads(formatter.format(record))
        finally:
            correlation_id.reset(token)

        self.assertEqual(value["correlation_id"], "u123")
        self.assertNotIn("123456", value["message"])
        self.assertNotIn("987654", value["message"])
        self.assertNotIn("abcdefghijklmnopqrstuvwxyzABCDE", value["message"])

    def test_every_developer_handler_has_explicit_authorization_check(self):
        source = inspect.getsource(developer)
        starts = [match.start() for match in re.finditer(r"@router\.(?:message|callback_query)", source)]
        self.assertTrue(starts)
        for index, start in enumerate(starts):
            end = starts[index + 1] if index + 1 < len(starts) else len(source)
            handler = source[start:end]
            match = re.search(r"async def\s+([a-zA-Z0-9_]+)", handler)
            if not match:
                continue
            name = match.group(1)
            with self.subTest(handler=name):
                self.assertIn("_is_developer(", handler)

    def test_secrets_and_connections_are_environment_driven(self):
        from app.config import Settings
        from app.services.runtime_redis import RuntimeRedis

        with patch.dict(
            os.environ,
            {
                "BOT_TOKEN": "123456789:test_token_value_abcdefghijklmnopqrstuvwxyz",
                "DATABASE_URL": "postgresql://env-only",
                "REDIS_URL": "redis://env-only",
            },
            clear=False,
        ):
            self.assertEqual(Settings.from_env().bot_token, os.environ["BOT_TOKEN"])
            self.assertEqual(
                PostgresStateDatabase()._url(),
                "postgresql://env-only",
            )
            self.assertEqual(RuntimeRedis().url, "redis://env-only")

    def test_alembic_bootstrap_migration_exists_and_keeps_downgrade_non_destructive(self):
        root = Path(__file__).resolve().parents[1]
        migration = root / "alembic" / "versions" / "20260921_0001_core_storage.py"
        text = migration.read_text(encoding="utf-8")
        self.assertIn('revision = "20260921_0001"', text)
        self.assertIn("CREATE TABLE IF NOT EXISTS rich_pages", text)
        downgrade = text.split("def downgrade()", 1)[1]
        self.assertNotIn("DROP TABLE", downgrade.upper())

    def test_snapshot_delivery_is_six_hour_default_and_shutdown_keeps_final_snapshot(self):
        import main

        source = inspect.getsource(main)
        self.assertIn('PAGE_SNAPSHOT_INTERVAL", "21600"', source)
        self.assertIn("Final saved-page fallback snapshot failed", source)
        self.assertIn("await state_database.close()", source)
        self.assertIn("Graceful shutdown complete", source)


if __name__ == "__main__":
    unittest.main()
