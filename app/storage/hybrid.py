from __future__ import annotations

import asyncio
import base64
import copy
import hashlib
import json
import logging
import os
import secrets
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from aiogram.fsm.state import State
from aiogram.fsm.storage.base import BaseStorage, StateType, StorageKey
from aiogram.fsm.storage.memory import MemoryStorage

try:
    import asyncpg
except ImportError:  # pragma: no cover - requirements install it in production.
    asyncpg = None


logger = logging.getLogger(__name__)
_BYTES_MARKER = "__rich_customize_bytes__"


def _bounded_env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        return min(maximum, max(minimum, int(os.getenv(name, str(default)))))
    except ValueError:
        return default


def _json_default(value: Any) -> Any:
    if isinstance(value, bytes):
        return {_BYTES_MARKER: base64.b64encode(value).decode("ascii")}
    if isinstance(value, (set, frozenset, tuple)):
        return list(value)
    if hasattr(value, "model_dump"):
        return value.model_dump(exclude_none=True)
    raise TypeError(f"Unsupported JSON value: {type(value).__name__}")


def _json_object_hook(value: dict[str, Any]) -> Any:
    encoded = value.get(_BYTES_MARKER)
    if len(value) == 1 and isinstance(encoded, str):
        try:
            return base64.b64decode(encoded.encode("ascii"), validate=True)
        except ValueError:
            return value
    return value


def _encode_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=_json_default)


def _decode_json(value: Any) -> Any:
    if isinstance(value, str):
        return json.loads(value, object_hook=_json_object_hook)
    return copy.deepcopy(value)


@dataclass(frozen=True, slots=True)
class DatabaseStatus:
    configured: bool
    connected: bool
    mode: str
    latency_ms: int | None
    pending_sync: int
    synced_namespaces: int
    last_error: str | None


class PostgresStateDatabase:
    """PostgreSQL state snapshots with an always-current local JSON fallback."""

    def __init__(
        self,
        database_url: str | None = None,
        *,
        pool_factory: Callable[..., Awaitable[Any]] | None = None,
        dirty_path: Path | None = None,
    ) -> None:
        self._database_url = database_url
        self._pool_factory = pool_factory
        self._pool: Any | None = None
        self._connect_lock = asyncio.Lock()
        self._dirty_lock = asyncio.Lock()
        self._repositories: dict[str, HybridJSONRepository] = {}
        self._reconnect_hooks: list[Callable[[], Awaitable[None]]] = []
        self._background_tasks: set[asyncio.Task[Any]] = set()
        self._dirty_path = dirty_path or Path(
            os.getenv("DATABASE_FALLBACK_STATE", "data/database_fallback.json")
        )
        self._dirty_namespaces = self._load_dirty_namespaces()
        self._last_error: str | None = None
        self._last_connect_attempt = 0.0
        self._last_latency_ms: int | None = None
        self._synced_namespaces = 0

    def _url(self) -> str:
        if self._database_url is not None:
            return self._database_url.strip()
        return os.getenv("DATABASE_URL", "").strip()

    @property
    def configured(self) -> bool:
        return bool(self._url())

    @property
    def connected(self) -> bool:
        return self._pool is not None

    @property
    def reconnect_interval(self) -> int:
        return _bounded_env_int("DATABASE_RECONNECT_INTERVAL", 30, 10, 3600)

    def status(self) -> DatabaseStatus:
        configured = self.configured
        connected = self.connected
        return DatabaseStatus(
            configured=configured,
            connected=connected,
            mode="postgres" if connected else "json",
            latency_ms=self._last_latency_ms if connected else None,
            pending_sync=len(self._dirty_namespaces),
            synced_namespaces=self._synced_namespaces,
            last_error=self._last_error,
        )

    def register(self, repository: HybridJSONRepository) -> None:
        self._repositories[repository.namespace] = repository

    def register_reconnect_hook(self, hook: Callable[[], Awaitable[None]]) -> None:
        self._reconnect_hooks.append(hook)

    def _load_dirty_namespaces(self) -> set[str]:
        try:
            raw = json.loads(self._dirty_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return set()
        values = raw.get("namespaces", []) if isinstance(raw, dict) else []
        return {str(value) for value in values if isinstance(value, str)}

    def _write_dirty_namespaces(self) -> None:
        if not self._dirty_namespaces:
            self._dirty_path.unlink(missing_ok=True)
            return
        self._dirty_path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self._dirty_path.with_name(
            f".{self._dirty_path.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp"
        )
        try:
            temporary.write_text(
                json.dumps(
                    {"namespaces": sorted(self._dirty_namespaces)},
                    ensure_ascii=False,
                    indent=2,
                ),
                encoding="utf-8",
            )
            temporary.replace(self._dirty_path)
        finally:
            temporary.unlink(missing_ok=True)

    async def _set_dirty(self, namespace: str, dirty: bool) -> None:
        async with self._dirty_lock:
            if dirty:
                self._dirty_namespaces.add(namespace)
            else:
                self._dirty_namespaces.discard(namespace)
            try:
                await asyncio.to_thread(self._write_dirty_namespaces)
            except OSError:
                logger.exception("Could not persist PostgreSQL fallback sync marker")

    def _safe_error(self, error: Exception) -> str:
        message = str(error).strip() or type(error).__name__
        database_url = self._url()
        if database_url:
            message = message.replace(database_url, "<DATABASE_URL>")
        return f"{type(error).__name__}: {message}"[:300]

    async def _close_pool(self, pool: Any | None) -> None:
        if pool is None:
            return
        try:
            async with asyncio.timeout(3):
                await pool.close()
        except (Exception, asyncio.TimeoutError):
            terminate = getattr(pool, "terminate", None)
            if callable(terminate):
                terminate()

    async def _disconnect(self, error: Exception) -> None:
        self._last_error = self._safe_error(error)
        self._last_latency_ms = None
        pool, self._pool = self._pool, None
        terminate = getattr(pool, "terminate", None)
        if callable(terminate):
            terminate()
        else:
            await self._close_pool(pool)
        logger.warning(
            "PostgreSQL became unavailable; continuing with JSON fallback (%s)",
            self._last_error,
        )

    async def _initialize_schema(self, pool: Any) -> None:
        await pool.execute(
            """
            CREATE TABLE IF NOT EXISTS rich_state (
                namespace TEXT PRIMARY KEY,
                payload JSONB NOT NULL,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )
        await pool.execute(
            """
            CREATE TABLE IF NOT EXISTS rich_fsm (
                storage_key TEXT PRIMARY KEY,
                state TEXT,
                data JSONB NOT NULL DEFAULT '{}'::jsonb,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """
        )

    async def _upsert_snapshot(self, namespace: str, payload: Any) -> None:
        assert self._pool is not None
        await self._pool.execute(
            """
            INSERT INTO rich_state (namespace, payload, updated_at)
            VALUES ($1, $2::jsonb, NOW())
            ON CONFLICT (namespace) DO UPDATE
            SET payload = EXCLUDED.payload, updated_at = NOW()
            """,
            namespace,
            _encode_json(payload),
        )

    async def _sync_repository(self, repository: HybridJSONRepository) -> None:
        assert self._pool is not None
        if repository.namespace in self._dirty_namespaces:
            payload = await repository.read_local()
            await self._upsert_snapshot(repository.namespace, payload)
            await self._set_dirty(repository.namespace, False)
            return

        stored = await self._pool.fetchval(
            "SELECT payload FROM rich_state WHERE namespace = $1",
            repository.namespace,
        )
        if stored is None:
            payload = await repository.read_local()
            await self._upsert_snapshot(repository.namespace, payload)
        else:
            try:
                await repository.write_local(_decode_json(stored))
            except OSError:
                logger.exception(
                    "Could not refresh JSON fallback for %s", repository.namespace
                )

    async def check_and_reconnect(self, *, force: bool = True) -> DatabaseStatus:
        """Ping PostgreSQL or recreate its pool and synchronize fallback changes."""
        if not self.configured:
            self._last_error = "DATABASE_URL غير مضاف"
            return self.status()

        async with self._connect_lock:
            now = time.monotonic()
            if (
                self._pool is None
                and not force
                and now - self._last_connect_attempt < self.reconnect_interval
            ):
                return self.status()
            self._last_connect_attempt = now
            started = time.perf_counter()
            if self._pool is not None:
                try:
                    await self._pool.fetchval("SELECT 1")
                    self._last_latency_ms = max(
                        1, round((time.perf_counter() - started) * 1000)
                    )
                    self._last_error = None
                    await self._flush_dirty_repositories()
                    await self._run_reconnect_hooks()
                    return self.status()
                except Exception as error:
                    await self._disconnect(error)

            factory = self._pool_factory
            if factory is None:
                if asyncpg is None:
                    self._last_error = "مكتبة asyncpg غير مثبتة"
                    return self.status()
                factory = asyncpg.create_pool

            try:
                pool = await factory(
                    dsn=self._url(),
                    min_size=1,
                    max_size=_bounded_env_int("DATABASE_POOL_MAX_SIZE", 5, 1, 20),
                    timeout=_bounded_env_int("DATABASE_CONNECT_TIMEOUT", 5, 1, 30),
                    command_timeout=_bounded_env_int("DATABASE_COMMAND_TIMEOUT", 5, 2, 60),
                )
                await self._initialize_schema(pool)
                await pool.fetchval("SELECT 1")
                self._pool = pool
                self._last_error = None
                self._last_latency_ms = max(
                    1, round((time.perf_counter() - started) * 1000)
                )
                self._synced_namespaces = 0
                for repository in tuple(self._repositories.values()):
                    await self._sync_repository(repository)
                    self._synced_namespaces += 1
                await self._run_reconnect_hooks()
                logger.info(
                    "PostgreSQL connected; synchronized %s state namespaces",
                    self._synced_namespaces,
                )
            except Exception as error:
                candidate = locals().get("pool")
                if candidate is self._pool:
                    self._pool = None
                if candidate is not None:
                    await self._close_pool(candidate)
                self._pool = None
                self._last_error = self._safe_error(error)
                self._last_latency_ms = None
                logger.warning(
                    "PostgreSQL connection failed; using JSON fallback (%s)",
                    self._last_error,
                )
            return self.status()

    async def _flush_dirty_repositories(self) -> None:
        for namespace in tuple(self._dirty_namespaces):
            repository = self._repositories.get(namespace)
            if repository is None:
                continue
            await self._sync_repository(repository)

    async def _run_reconnect_hooks(self) -> None:
        for hook in tuple(self._reconnect_hooks):
            try:
                await hook()
            except Exception:
                logger.exception("A PostgreSQL reconnect hook failed")

    async def startup(self) -> DatabaseStatus:
        return await self.check_and_reconnect(force=True)

    async def maintain_connection(self) -> None:
        while True:
            await asyncio.sleep(self.reconnect_interval)
            await self.check_and_reconnect(force=True)

    async def read_snapshot(self, repository: HybridJSONRepository) -> Any:
        pool = self._pool
        if pool is None:
            return await repository.read_local()
        try:
            stored = await pool.fetchval(
                "SELECT payload FROM rich_state WHERE namespace = $1",
                repository.namespace,
            )
            if stored is None:
                payload = await repository.read_local()
                await self._upsert_snapshot(repository.namespace, payload)
                return payload
            payload = _decode_json(stored)
            await repository.refresh_local(payload)
            return payload
        except Exception as error:
            await self._disconnect(error)
            return await repository.read_local()

    async def write_snapshot(
        self,
        repository: HybridJSONRepository,
        payload: Any,
    ) -> None:
        database_saved = False
        if self._pool is not None:
            try:
                await self._upsert_snapshot(repository.namespace, payload)
                database_saved = True
                await self._set_dirty(repository.namespace, False)
            except Exception as error:
                await self._disconnect(error)

        try:
            await repository.write_local(payload)
        except OSError:
            if not database_saved:
                raise
            logger.exception(
                "PostgreSQL write succeeded but JSON mirror failed for %s",
                repository.namespace,
            )

        if self.configured and not database_saved:
            await self._set_dirty(repository.namespace, True)

    async def mirror_local_snapshot(
        self,
        repository: HybridJSONRepository,
        payload: Any,
    ) -> None:
        if self._pool is None:
            if self.configured:
                await self._set_dirty(repository.namespace, True)
            return
        try:
            await self._upsert_snapshot(repository.namespace, payload)
            await self._set_dirty(repository.namespace, False)
        except Exception as error:
            await self._disconnect(error)
            await self._set_dirty(repository.namespace, True)

    def schedule_local_snapshot(
        self,
        repository: HybridJSONRepository,
        payload: Any,
    ) -> None:
        if not self.configured:
            return
        # Mark it before scheduling so a simultaneous manual reconnect cannot
        # hydrate this file from an older database snapshot.
        self._dirty_namespaces.add(repository.namespace)
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return
        task = loop.create_task(
            self.mirror_local_snapshot(repository, copy.deepcopy(payload)),
            name=f"postgres-mirror-{repository.namespace}",
        )
        self._background_tasks.add(task)
        task.add_done_callback(self._background_tasks.discard)

    async def sync_local_paths(self, paths: list[str]) -> None:
        selected = {str(Path(path).resolve()) for path in paths}
        for repository in tuple(self._repositories.values()):
            if str(repository.path.resolve()) not in selected:
                continue
            payload = await repository.read_local()
            if self._pool is None:
                if self.configured:
                    await self._set_dirty(repository.namespace, True)
                continue
            try:
                await self._upsert_snapshot(repository.namespace, payload)
                await self._set_dirty(repository.namespace, False)
            except Exception as error:
                await self._disconnect(error)
                await self._set_dirty(repository.namespace, True)

    async def read_fsm(self, storage_key: str) -> tuple[bool, str | None, dict[str, Any]]:
        pool = self._pool
        if pool is None:
            return False, None, {}
        try:
            row = await pool.fetchrow(
                "SELECT state, data FROM rich_fsm WHERE storage_key = $1",
                storage_key,
            )
            if row is None:
                return True, None, {}
            data = _decode_json(row["data"])
            return True, row["state"], data if isinstance(data, dict) else {}
        except Exception as error:
            await self._disconnect(error)
            return False, None, {}

    async def write_fsm(
        self,
        storage_key: str,
        state: str | None,
        data: Mapping[str, Any],
    ) -> bool:
        pool = self._pool
        if pool is None:
            return False
        try:
            encoded_data = _encode_json(dict(data))
        except TypeError:
            logger.exception(
                "FSM data is not JSON-compatible; keeping this session in memory only"
            )
            try:
                await pool.execute(
                    "DELETE FROM rich_fsm WHERE storage_key = $1", storage_key
                )
                return True
            except Exception as error:
                await self._disconnect(error)
                return False
        try:
            if state is None and not data:
                await pool.execute(
                    "DELETE FROM rich_fsm WHERE storage_key = $1", storage_key
                )
            else:
                await pool.execute(
                    """
                    INSERT INTO rich_fsm (storage_key, state, data, updated_at)
                    VALUES ($1, $2, $3::jsonb, NOW())
                    ON CONFLICT (storage_key) DO UPDATE
                    SET state = EXCLUDED.state,
                        data = EXCLUDED.data,
                        updated_at = NOW()
                    """,
                    storage_key,
                    state,
                    encoded_data,
                )
            return True
        except Exception as error:
            await self._disconnect(error)
            return False

    async def close(self) -> None:
        tasks = tuple(self._background_tasks)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        pool, self._pool = self._pool, None
        await self._close_pool(pool)


class HybridJSONRepository:
    def __init__(
        self,
        namespace: str,
        path: Path,
        default_factory: Callable[[], Any] = dict,
        *,
        database: PostgresStateDatabase | None = None,
    ) -> None:
        self.namespace = namespace
        self.path = path
        self.default_factory = default_factory
        self.database = database or state_database
        self._local_fingerprint: str | None = None
        self.database.register(self)

    @staticmethod
    def _fingerprint(payload: Any) -> str:
        return hashlib.sha256(_encode_json(payload).encode("utf-8")).hexdigest()

    def read_local_sync(self) -> Any:
        if not self.path.exists():
            return self.default_factory()
        try:
            payload = json.loads(
                self.path.read_text(encoding="utf-8"),
                object_hook=_json_object_hook,
            )
            self._local_fingerprint = self._fingerprint(payload)
            return payload
        except (OSError, json.JSONDecodeError):
            return self.default_factory()

    def write_local_sync(self, payload: Any) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_name(
            f".{self.path.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp"
        )
        try:
            temporary.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2, default=_json_default),
                encoding="utf-8",
            )
            temporary.replace(self.path)
            self._local_fingerprint = self._fingerprint(payload)
        finally:
            temporary.unlink(missing_ok=True)

    async def read_local(self) -> Any:
        return await asyncio.to_thread(self.read_local_sync)

    async def write_local(self, payload: Any) -> None:
        await asyncio.to_thread(self.write_local_sync, payload)

    async def refresh_local(self, payload: Any) -> None:
        fingerprint = self._fingerprint(payload)
        if fingerprint != self._local_fingerprint:
            await self.write_local(payload)

    async def read(self) -> Any:
        return await self.database.read_snapshot(self)

    async def write(self, payload: Any) -> None:
        await self.database.write_snapshot(self, payload)

    def write_local_and_mirror(self, payload: Any) -> None:
        self.write_local_sync(payload)
        self.database.schedule_local_snapshot(self, payload)


class HybridFSMStorage(BaseStorage):
    """Persist FSM in PostgreSQL and use aiogram MemoryStorage while it is offline."""

    def __init__(self, database: PostgresStateDatabase | None = None) -> None:
        self.database = database or state_database
        self.fallback = MemoryStorage()
        self._locks: dict[str, asyncio.Lock] = {}
        self._loaded: set[str] = set()
        self._dirty: dict[str, StorageKey] = {}
        self.database.register_reconnect_hook(self._flush_dirty)

    @staticmethod
    def _key(key: StorageKey) -> str:
        return json.dumps(
            [
                key.bot_id,
                key.chat_id,
                key.user_id,
                key.thread_id,
                key.business_connection_id,
                key.destiny,
            ],
            ensure_ascii=True,
            separators=(",", ":"),
        )

    async def _ensure_loaded(self, key: StorageKey, encoded: str) -> None:
        if encoded in self._loaded or encoded in self._dirty:
            return
        available, state, data = await self.database.read_fsm(encoded)
        if available:
            await self.fallback.set_state(key, state)
            await self.fallback.set_data(key, data)
            self._loaded.add(encoded)

    async def _persist(self, key: StorageKey, encoded: str) -> None:
        state = await self.fallback.get_state(key)
        data = await self.fallback.get_data(key)
        if await self.database.write_fsm(encoded, state, data):
            self._dirty.pop(encoded, None)
            self._loaded.add(encoded)
        elif self.database.configured:
            self._dirty[encoded] = key

    async def _flush_dirty(self) -> None:
        for encoded, key in tuple(self._dirty.items()):
            async with self._locks.setdefault(encoded, asyncio.Lock()):
                await self._persist(key, encoded)

    async def set_state(self, key: StorageKey, state: StateType = None) -> None:
        encoded = self._key(key)
        async with self._locks.setdefault(encoded, asyncio.Lock()):
            await self._ensure_loaded(key, encoded)
            value = state.state if isinstance(state, State) else state
            await self.fallback.set_state(key, value)
            await self._persist(key, encoded)

    async def get_state(self, key: StorageKey) -> str | None:
        encoded = self._key(key)
        async with self._locks.setdefault(encoded, asyncio.Lock()):
            await self._ensure_loaded(key, encoded)
            return await self.fallback.get_state(key)

    async def set_data(self, key: StorageKey, data: Mapping[str, Any]) -> None:
        encoded = self._key(key)
        async with self._locks.setdefault(encoded, asyncio.Lock()):
            await self._ensure_loaded(key, encoded)
            await self.fallback.set_data(key, data)
            await self._persist(key, encoded)

    async def get_data(self, key: StorageKey) -> dict[str, Any]:
        encoded = self._key(key)
        async with self._locks.setdefault(encoded, asyncio.Lock()):
            await self._ensure_loaded(key, encoded)
            return await self.fallback.get_data(key)

    async def close(self) -> None:
        await self.fallback.close()


state_database = PostgresStateDatabase()
