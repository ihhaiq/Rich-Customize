from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram.fsm.storage.base import DefaultKeyBuilder, StorageKey
from fakeredis.aioredis import FakeRedis

from app.editor.limits import EDITOR_SESSION_TTL_SECONDS
from app.routers.developer import _cached_statistics_payload, _developer_panel_rich_message
from app.services.page_registry import PageRegistry
from app.services.runtime_redis import RedisStatus
from app.storage.redis_fsm import EditorRedisStorage
from app.webapp.server import health, metrics


class DeliveryAndRedisTests(unittest.IsolatedAsyncioTestCase):
    async def test_redis_fsm_survives_storage_instances_and_has_editor_ttl(self):
        redis = FakeRedis()
        builder = DefaultKeyBuilder(
            prefix="test:fsm",
            with_bot_id=True,
            with_business_connection_id=True,
            with_destiny=True,
        )
        first = EditorRedisStorage(redis=redis, key_builder=builder)
        key = StorageKey(bot_id=1, chat_id=2, user_id=3)

        await first.set_state(key, "RichEditorStates:managing")
        await first.set_data(key, {
            "blocks": [{"id": "x"}],
            "editor_last_activity_at": 1,
        })

        second = EditorRedisStorage(redis=redis, key_builder=builder)
        self.assertEqual(await second.get_state(key), "RichEditorStates:managing")
        restored = await second.get_data(key)
        self.assertEqual(restored["blocks"], [{"id": "x"}])
        self.assertGreater(restored["editor_last_activity_at"], 1)

        data_ttl = await redis.ttl(builder.build(key, "data"))
        state_ttl = await redis.ttl(builder.build(key, "state"))
        self.assertGreater(data_ttl, 0)
        self.assertLessEqual(data_ttl, EDITOR_SESSION_TTL_SECONDS)
        self.assertGreater(state_ttl, 0)
        self.assertLessEqual(state_ttl, EDITOR_SESSION_TTL_SECONDS)
        await redis.aclose()

    async def test_developer_statistics_uses_redis_cache(self):
        computed = {
            "snapshot": {"tracked_users": 4},
            "operational": {"total_updates": 9},
            "page_stats": {"pages": 3},
            "runtime": {"fsm_sessions": 2},
            "database": {"connected": True, "latency_ms": 4, "circuit_open": False},
            "redis": {"configured": True, "connected": True},
        }
        with patch(
            "app.routers.developer.runtime_redis.cache_get",
            AsyncMock(return_value=None),
        ), patch(
            "app.routers.developer.runtime_redis.cache_set",
            AsyncMock(),
        ) as cache_set, patch(
            "app.routers.developer.usage_stats.snapshot",
            AsyncMock(return_value=computed["snapshot"]),
        ), patch(
            "app.routers.developer.usage_stats.operational_snapshot",
            AsyncMock(return_value=computed["operational"]),
        ), patch(
            "app.routers.developer.page_registry.statistics",
            AsyncMock(return_value=computed["page_stats"]),
        ), patch(
            "app.routers.developer.state_database.runtime_statistics",
            AsyncMock(return_value=computed["runtime"]),
        ), patch(
            "app.routers.developer.state_database.status",
            return_value=SimpleNamespace(
                connected=True, latency_ms=4, circuit_open=False,
            ),
        ), patch(
            "app.routers.developer.runtime_redis.status",
            return_value=RedisStatus(True, True, None),
        ):
            value = await _cached_statistics_payload(1000)

        self.assertEqual(value["snapshot"]["tracked_users"], 4)
        cache_set.assert_awaited_once()
        self.assertEqual(cache_set.await_args.kwargs["ttl_seconds"], 15)

        encoded = json.dumps(value)
        with patch(
            "app.routers.developer.runtime_redis.cache_get",
            AsyncMock(return_value=encoded),
        ), patch(
            "app.routers.developer.usage_stats.snapshot",
            AsyncMock(),
        ) as snapshot:
            cached = await _cached_statistics_payload(1001)
        self.assertEqual(cached["page_stats"]["pages"], 3)
        snapshot.assert_not_awaited()

    async def test_restore_drill_validates_fallback_against_database_ids(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = PageRegistry(Path(directory) / "rich_pages.json")
            payload = {
                "stable-page": {
                    "owner_id": 7,
                    "title": "Stable",
                    "blocks": [{"id": "a", "type": "paragraph", "data": {"text": "x"}}],
                    "buttons": [],
                    "buttons_per_row": 1,
                    "buttons_align": "center",
                    "created_at": 1,
                    "updated_at": 2,
                }
            }
            await registry._repository.write_local(payload)
            with patch(
                "app.services.page_registry.state_database.all_pages_snapshot",
                AsyncMock(return_value=(True, payload)),
            ):
                result = await registry.restore_drill()

            self.assertTrue(result["ok"])
            self.assertEqual(result["pages"], 1)
            self.assertTrue(result["matches_database"])

    async def test_health_reports_database_redis_and_process_memory(self):
        with patch(
            "app.webapp.server.state_database.status",
            return_value=SimpleNamespace(
                configured=True,
                connected=True,
                mode="postgres",
                pending_sync=0,
                latency_ms=7,
                circuit_open=False,
            ),
        ), patch(
            "app.webapp.server.runtime_redis.status",
            return_value=RedisStatus(True, True, None),
        ), patch(
            "app.webapp.server.memory_rss_bytes",
            return_value=123456,
        ):
            response = await health(None)

        body = json.loads(response.body)
        self.assertTrue(body["ok"])
        self.assertFalse(body["degraded"])
        self.assertEqual(body["memory"]["rss_bytes"], 123456)
        self.assertEqual(body["database"]["latency_ms"], 7)
        self.assertTrue(body["redis"]["connected"])

    async def test_prometheus_endpoint_exports_required_metrics(self):
        response = await metrics(None)
        body = response.body.decode("utf-8")
        self.assertIn("rich_update_handler_seconds", body)
        self.assertIn("rich_handler_errors_total", body)
        self.assertIn("rich_publish_total", body)
        self.assertIn("rich_database_latency_ms", body)

    def test_developer_panel_exposes_manual_snapshot_control(self):
        payload = _developer_panel_rich_message("dev").model_dump(exclude_none=True)
        callbacks = {
            button["callback_data"]
            for block in payload["blocks"]
            for button in block.get("buttons", [])
            if button.get("callback_data")
        }
        self.assertIn("dev:snapshot", callbacks)

    def test_sentry_integration_is_optional_and_disables_default_pii(self):
        from app.services import observability

        source = Path(observability.__file__).read_text(encoding="utf-8")
        self.assertIn('os.getenv("SENTRY_DSN"', source)
        self.assertIn("sentry_sdk.init", source)
        self.assertIn("send_default_pii=False", source)


if __name__ == "__main__":
    unittest.main()
