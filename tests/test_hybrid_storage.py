import json
import tempfile
import unittest
from pathlib import Path
from typing import Any

from aiogram.fsm.storage.base import StorageKey

from app.storage.hybrid import (
    HybridFSMStorage,
    HybridJSONRepository,
    PostgresStateDatabase,
)


class FakePool:
    def __init__(self) -> None:
        self.states: dict[str, Any] = {}
        self.fsm: dict[str, dict[str, Any]] = {}
        self.closed = False

    async def execute(self, query: str, *args: Any) -> str:
        normalized = " ".join(query.split())
        if normalized.startswith("CREATE TABLE"):
            return "CREATE TABLE"
        if "INSERT INTO rich_state" in normalized:
            self.states[str(args[0])] = json.loads(str(args[1]))
            return "INSERT 0 1"
        if "DELETE FROM rich_fsm" in normalized:
            self.fsm.pop(str(args[0]), None)
            return "DELETE 1"
        if "INSERT INTO rich_fsm" in normalized:
            self.fsm[str(args[0])] = {
                "state": args[1],
                "data": json.loads(str(args[2])),
            }
            return "INSERT 0 1"
        raise AssertionError(normalized)

    async def fetchval(self, query: str, *args: Any) -> Any:
        normalized = " ".join(query.split())
        if normalized == "SELECT 1":
            return 1
        if "SELECT payload FROM rich_state" in normalized:
            value = self.states.get(str(args[0]))
            return json.dumps(value, ensure_ascii=False) if value is not None else None
        raise AssertionError(normalized)

    async def fetchrow(self, query: str, *args: Any) -> dict[str, Any] | None:
        normalized = " ".join(query.split())
        if "SELECT state, data FROM rich_fsm" not in normalized:
            raise AssertionError(normalized)
        value = self.fsm.get(str(args[0]))
        if value is None:
            return None
        return {
            "state": value["state"],
            "data": json.dumps(value["data"], ensure_ascii=False),
        }

    async def close(self) -> None:
        self.closed = True


class SequencedPoolFactory:
    def __init__(self, pool: FakePool, failures: int = 0) -> None:
        self.pool = pool
        self.failures = failures

    async def __call__(self, **_: Any) -> FakePool:
        if self.failures:
            self.failures -= 1
            raise OSError("database offline")
        return self.pool


class HybridStorageTests(unittest.IsolatedAsyncioTestCase):
    async def test_json_fallback_is_flushed_before_postgres_becomes_primary(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pool = FakePool()
            database = PostgresStateDatabase(
                "postgresql://example/test",
                pool_factory=SequencedPoolFactory(pool, failures=1),
                dirty_path=root / "dirty.json",
            )
            repository = HybridJSONRepository(
                "pages", root / "pages.json", database=database,
            )

            self.assertFalse((await database.startup()).connected)
            await repository.write({"page": {"title": "محلي"}})
            self.assertEqual(database.status().pending_sync, 1)

            status = await database.check_and_reconnect()

            self.assertTrue(status.connected)
            self.assertEqual(status.pending_sync, 0)
            self.assertEqual(pool.states["pages"]["page"]["title"], "محلي")
            pool.states["pages"] = {"page": {"title": "من PostgreSQL"}}
            self.assertEqual(
                (await repository.read())["page"]["title"],
                "من PostgreSQL",
            )
            await database.close()

    async def test_existing_json_is_imported_only_when_database_is_empty(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pool = FakePool()
            database = PostgresStateDatabase(
                "postgresql://example/test",
                pool_factory=SequencedPoolFactory(pool),
                dirty_path=root / "dirty.json",
            )
            repository = HybridJSONRepository(
                "managed_chats", root / "chats.json", database=database,
            )
            repository.write_local_sync({"users": {"7": {}}})

            status = await database.startup()

            self.assertTrue(status.connected)
            self.assertEqual(pool.states["managed_chats"], {"users": {"7": {}}})
            await database.close()

    async def test_postgres_snapshot_hydrates_the_local_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pool = FakePool()
            pool.states["popups"] = {"popups": {"id": "remote"}}
            database = PostgresStateDatabase(
                "postgresql://example/test",
                pool_factory=SequencedPoolFactory(pool),
                dirty_path=root / "dirty.json",
            )
            repository = HybridJSONRepository(
                "popups", root / "popups.json", database=database,
            )
            repository.write_local_sync({"popups": {"id": "old"}})

            await database.startup()

            self.assertEqual(repository.read_local_sync()["popups"]["id"], "remote")
            await database.close()

    async def test_fsm_uses_memory_offline_and_flushes_after_reconnect(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pool = FakePool()
            database = PostgresStateDatabase(
                "postgresql://example/test",
                pool_factory=SequencedPoolFactory(pool, failures=1),
                dirty_path=root / "dirty.json",
            )
            storage = HybridFSMStorage(database)
            key = StorageKey(bot_id=1, chat_id=2, user_id=3)

            await database.startup()
            await storage.set_state(key, "Editor:waiting")
            await storage.set_data(key, {"payload": b"backup"})
            self.assertEqual(await storage.get_state(key), "Editor:waiting")

            self.assertTrue((await database.check_and_reconnect()).connected)
            restored = HybridFSMStorage(database)

            self.assertEqual(await restored.get_state(key), "Editor:waiting")
            self.assertEqual((await restored.get_data(key))["payload"], b"backup")
            await storage.close()
            await restored.close()
            await database.close()


if __name__ == "__main__":
    unittest.main()
