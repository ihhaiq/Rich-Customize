from __future__ import annotations

import unittest
from unittest.mock import patch

from aiogram.fsm.storage.base import StorageKey

from app.editor.limits import EDITOR_SESSION_TTL_SECONDS
from app.storage.hybrid import HybridFSMStorage
from app.storage.redis_fsm import EditorRedisStorage


class _FakeDatabase:
    configured = False

    def register_reconnect_hook(self, _hook) -> None:
        return None

    async def write_fsm(self, _encoded, _state, _data) -> bool:
        return False


class _FakePipeline:
    def __init__(self) -> None:
        self.commands: list[tuple[object, ...]] = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False

    def set(self, key, value, *, ex=None):
        self.commands.append(("set", key, value, ex))
        return self

    def expire(self, key, ttl):
        self.commands.append(("expire", key, ttl))
        return self

    async def execute(self):
        return []


class _FakeRedis:
    def __init__(self) -> None:
        self.last_pipeline: _FakePipeline | None = None

    def pipeline(self, *, transaction=True):
        self.last_pipeline = _FakePipeline()
        return self.last_pipeline

    async def delete(self, _key):
        return 1


class EditorSessionTTLTests(unittest.IsolatedAsyncioTestCase):
    async def test_redis_and_hybrid_use_the_exact_same_ttl_boundary(self):
        key = StorageKey(bot_id=1, chat_id=2, user_id=3)

        redis = _FakeRedis()
        redis_storage = EditorRedisStorage(redis)
        with patch("app.storage.redis_fsm.time.time", return_value=1_000):
            await redis_storage.set_data(
                key,
                {"editor_last_activity_at": 1_000},
            )

        self.assertIsNotNone(redis.last_pipeline)
        commands = redis.last_pipeline.commands
        data_ttl = next(command[3] for command in commands if command[0] == "set")
        state_ttl = next(command[2] for command in commands if command[0] == "expire")
        self.assertEqual(data_ttl, EDITOR_SESSION_TTL_SECONDS)
        self.assertEqual(state_ttl, EDITOR_SESSION_TTL_SECONDS)

        hybrid = HybridFSMStorage(_FakeDatabase())
        encoded = hybrid._key(key)
        await hybrid.fallback.set_state(key, "Editor:waiting")
        await hybrid.fallback.set_data(
            key,
            {"editor_last_activity_at": 1_000},
        )

        with patch(
            "app.storage.hybrid.time.time",
            return_value=1_000 + EDITOR_SESSION_TTL_SECONDS - 1,
        ):
            self.assertFalse(await hybrid._expire_editor_if_stale(key, encoded))

        with patch(
            "app.storage.hybrid.time.time",
            return_value=1_000 + EDITOR_SESSION_TTL_SECONDS,
        ):
            self.assertTrue(await hybrid._expire_editor_if_stale(key, encoded))

        self.assertIsNone(await hybrid.fallback.get_state(key))
        self.assertEqual(await hybrid.fallback.get_data(key), {})


if __name__ == "__main__":
    unittest.main()
