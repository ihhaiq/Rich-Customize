from __future__ import annotations

import asyncio
import base64
import copy
import hashlib
import json
import logging

import orjson
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

from app.editor.limits import EDITOR_SESSION_TTL_SECONDS
from app.storage.migrations import run_database_migrations

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


def _restore_json(value: Any) -> Any:
    if isinstance(value, list):
        return [_restore_json(item) for item in value]
    if isinstance(value, dict):
        restored = {str(key): _restore_json(item) for key, item in value.items()}
        return _json_object_hook(restored)
    return value


def _encode_json(value: Any) -> str:
    return orjson.dumps(value, default=_json_default).decode("utf-8")


def _decode_json(value: Any) -> Any:
    if isinstance(value, (str, bytes, bytearray)):
        return _restore_json(orjson.loads(value))
    return _restore_json(copy.deepcopy(value))


@dataclass(frozen=True, slots=True)
class DatabaseStatus:
    configured: bool
    connected: bool
    mode: str
    latency_ms: int | None
    pending_sync: int
    synced_namespaces: int
    last_error: str | None
    circuit_open: bool


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
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0
        self._migrations_ready = False

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

    @property
    def circuit_failure_threshold(self) -> int:
        return _bounded_env_int("DATABASE_CIRCUIT_FAILURES", 3, 1, 20)

    @property
    def circuit_cooldown(self) -> int:
        return _bounded_env_int("DATABASE_CIRCUIT_COOLDOWN", 30, 5, 600)

    def _pool_sizes(self) -> tuple[int, int]:
        workers = _bounded_env_int(
            "WEB_CONCURRENCY",
            _bounded_env_int("WORKERS", 1, 1, 64),
            1,
            64,
        )
        total_budget = _bounded_env_int("DATABASE_POOL_TOTAL_BUDGET", 20, 2, 200)
        configured_max = os.getenv("DATABASE_POOL_MAX_SIZE", "").strip()
        max_size = (
            _bounded_env_int("DATABASE_POOL_MAX_SIZE", 5, 1, 50)
            if configured_max
            else max(1, min(20, total_budget // workers))
        )
        min_size = min(
            max_size,
            _bounded_env_int("DATABASE_POOL_MIN_SIZE", 1, 0, 20),
        )
        return min_size, max_size

    def _circuit_is_open(self) -> bool:
        return time.monotonic() < self._circuit_open_until

    def _record_failure(self, error: Exception) -> None:
        self._consecutive_failures += 1
        self._last_error = self._safe_error(error)
        if self._consecutive_failures >= self.circuit_failure_threshold:
            self._circuit_open_until = time.monotonic() + self.circuit_cooldown

    def _record_success(self) -> None:
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0
        self._last_error = None

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
            circuit_open=self._circuit_is_open(),
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
        self._record_failure(error)
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

    async def _verify_schema(self, pool: Any) -> None:
        required = ("rich_state", "rich_fsm", "rich_migrations", "rich_pages")
        for table in required:
            present = await pool.fetchval("SELECT to_regclass($1)", f"public.{table}")
            if present is None:
                raise RuntimeError(f"database migration missing table: {table}")

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
            if not force and self._circuit_is_open():
                return self.status()
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
                    self._record_success()
                    await self._flush_dirty_repositories()
                    await self._run_reconnect_hooks()
                    return self.status()
                except Exception as error:
                    await self._disconnect(error)

            if not self._migrations_ready:
                try:
                    async with asyncio.timeout(
                        _bounded_env_int("DATABASE_MIGRATION_TIMEOUT", 20, 5, 120)
                    ):
                        await asyncio.to_thread(run_database_migrations, self._url())
                    self._migrations_ready = True
                except Exception as error:
                    self._record_failure(error)
                    logger.warning(
                        "Database migration failed; continuing with JSON fallback (%s)",
                        self._last_error,
                    )
                    return self.status()

            factory = self._pool_factory
            if factory is None:
                if asyncpg is None:
                    self._last_error = "مكتبة asyncpg غير مثبتة"
                    return self.status()
                factory = asyncpg.create_pool

            min_size, max_size = self._pool_sizes()
            pool = None
            try:
                pool = await factory(
                    dsn=self._url(),
                    min_size=min_size,
                    max_size=max_size,
                    timeout=_bounded_env_int("DATABASE_CONNECT_TIMEOUT", 5, 1, 30),
                    command_timeout=_bounded_env_int("DATABASE_COMMAND_TIMEOUT", 5, 2, 60),
                )
                await self._verify_schema(pool)
                await pool.fetchval("SELECT 1")
                self._pool = pool
                self._record_success()
                self._last_latency_ms = max(
                    1, round((time.perf_counter() - started) * 1000)
                )
                self._synced_namespaces = 0
                for repository in tuple(self._repositories.values()):
                    await self._sync_repository(repository)
                    self._synced_namespaces += 1
                await self._run_reconnect_hooks()
                logger.info(
                    "PostgreSQL connected; pool=%s..%s synchronized=%s",
                    min_size,
                    max_size,
                    self._synced_namespaces,
                )
            except Exception as error:
                if pool is self._pool:
                    self._pool = None
                if pool is not None:
                    await self._close_pool(pool)
                self._pool = None
                self._last_latency_ms = None
                self._record_failure(error)
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
            await self.check_and_reconnect(force=False)

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

    @staticmethod
    def _page_record(row: Any) -> dict[str, Any]:
        return {
            "owner_id": int(row["owner_id"]),
            "title": str(row["title"]),
            "blocks": _decode_json(row["blocks"]),
            "buttons": _decode_json(row["buttons"]),
            "buttons_per_row": int(row["buttons_per_row"]),
            "buttons_align": str(row["buttons_align"]),
            "created_at": int(row["created_at"]),
            "updated_at": int(row["updated_at"]),
        }

    async def migrate_legacy_pages(self, pages: Mapping[str, Any]) -> int:
        pool = self._pool
        if pool is None:
            return 0
        migration_name = "saved_pages_jsonb_to_rows_v1"
        try:
            already_done = await pool.fetchval(
                "SELECT 1 FROM rich_migrations WHERE name = $1",
                migration_name,
            )
            if already_done:
                return 0

            migrated = 0
            async with pool.acquire() as connection:
                async with connection.transaction():
                    for page_id, raw in pages.items():
                        if not isinstance(raw, Mapping):
                            continue
                        try:
                            owner_id = int(raw.get("owner_id", 0))
                        except (TypeError, ValueError):
                            continue
                        if not owner_id:
                            continue
                        now = int(time.time())
                        try:
                            created_at = int(raw.get("created_at") or now)
                        except (TypeError, ValueError):
                            created_at = now
                        try:
                            updated_at = int(raw.get("updated_at") or created_at)
                        except (TypeError, ValueError):
                            updated_at = created_at
                        result = await connection.execute(
                            """
                            INSERT INTO rich_pages (
                                page_id, owner_id, title, blocks, buttons,
                                buttons_per_row, buttons_align, created_at, updated_at
                            )
                            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
                            ON CONFLICT (page_id) DO UPDATE
                            SET owner_id = EXCLUDED.owner_id,
                                title = EXCLUDED.title,
                                blocks = EXCLUDED.blocks,
                                buttons = EXCLUDED.buttons,
                                buttons_per_row = EXCLUDED.buttons_per_row,
                                buttons_align = EXCLUDED.buttons_align,
                                created_at = LEAST(rich_pages.created_at, EXCLUDED.created_at),
                                updated_at = EXCLUDED.updated_at
                            WHERE EXCLUDED.updated_at > rich_pages.updated_at
                            """,
                            str(page_id),
                            owner_id,
                            str(raw.get("title") or "صفحة بلا اسم")[:64],
                            _encode_json(raw.get("blocks") or []),
                            _encode_json(raw.get("buttons") or []),
                            int(raw.get("buttons_per_row") or 1),
                            str(raw.get("buttons_align") or "center"),
                            created_at,
                            updated_at,
                        )
                        if result.endswith(" 1"):
                            migrated += 1
                    await connection.execute(
                        """
                        INSERT INTO rich_migrations (name, completed_at)
                        VALUES ($1, NOW())
                        ON CONFLICT (name) DO NOTHING
                        """,
                        migration_name,
                    )
            return migrated
        except Exception as error:
            await self._disconnect(error)
            return 0

    async def replace_pages_snapshot(self, pages: Mapping[str, Any]) -> bool:
        pool = self._pool
        if pool is None:
            return False
        try:
            async with pool.acquire() as connection:
                async with connection.transaction():
                    await connection.execute("DELETE FROM rich_pages")
                    for page_id, raw in pages.items():
                        if not isinstance(raw, Mapping):
                            continue
                        try:
                            owner_id = int(raw.get("owner_id", 0))
                        except (TypeError, ValueError):
                            continue
                        if not owner_id:
                            continue
                        now = int(time.time())
                        created_at = int(raw.get("created_at") or now)
                        updated_at = int(raw.get("updated_at") or created_at)
                        await connection.execute(
                            """
                            INSERT INTO rich_pages (
                                page_id, owner_id, title, blocks, buttons,
                                buttons_per_row, buttons_align, created_at, updated_at
                            )
                            VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
                            """,
                            str(page_id),
                            owner_id,
                            str(raw.get("title") or "صفحة بلا اسم")[:64],
                            _encode_json(raw.get("blocks") or []),
                            _encode_json(raw.get("buttons") or []),
                            int(raw.get("buttons_per_row") or 1),
                            str(raw.get("buttons_align") or "center"),
                            created_at,
                            updated_at,
                        )
            return True
        except Exception as error:
            await self._disconnect(error)
            return False

    async def get_page(self, page_id: str) -> tuple[bool, dict[str, Any] | None]:
        pool = self._pool
        if pool is None:
            return False, None
        try:
            row = await pool.fetchrow(
                """
                SELECT owner_id, title, blocks, buttons, buttons_per_row,
                       buttons_align, created_at, updated_at
                FROM rich_pages WHERE page_id = $1
                """,
                page_id,
            )
            return True, self._page_record(row) if row is not None else None
        except Exception as error:
            await self._disconnect(error)
            return False, None

    async def count_pages_for_user(self, owner_id: int) -> tuple[bool, int]:
        pool = self._pool
        if pool is None:
            return False, 0
        try:
            value = await pool.fetchval(
                "SELECT COUNT(*) FROM rich_pages WHERE owner_id = $1",
                owner_id,
            )
            return True, int(value or 0)
        except Exception as error:
            await self._disconnect(error)
            return False, 0

    async def save_page_row_limited(
        self,
        page_id: str,
        owner_id: int,
        title: str,
        blocks: list[dict[str, Any]],
        buttons: list[dict[str, Any]],
        buttons_per_row: int,
        buttons_align: str,
        created_at: int,
        updated_at: int,
        *,
        max_pages: int | None,
    ) -> tuple[bool, str]:
        """Atomically enforce per-owner limits and save one page.

        Returns (database_available, status), where status is one of
        saved / limit / conflict / unavailable.
        """
        pool = self._pool
        if pool is None:
            return False, "unavailable"
        try:
            async with pool.acquire() as connection:
                async with connection.transaction():
                    # Serialize create/delete/restore decisions for one owner across
                    # processes so two concurrent creates cannot both pass the limit.
                    await connection.execute(
                        "SELECT pg_advisory_xact_lock($1)",
                        owner_id,
                    )
                    existing = await connection.fetchrow(
                        """
                        SELECT owner_id, created_at
                        FROM rich_pages
                        WHERE page_id = $1
                        FOR UPDATE
                        """,
                        page_id,
                    )
                    if existing is not None and int(existing["owner_id"]) != owner_id:
                        return True, "conflict"
                    if existing is None and max_pages is not None:
                        owned_count = int(
                            await connection.fetchval(
                                "SELECT COUNT(*) FROM rich_pages WHERE owner_id = $1",
                                owner_id,
                            )
                            or 0
                        )
                        if owned_count >= max_pages:
                            return True, "limit"

                    effective_created_at = (
                        int(existing["created_at"]) if existing is not None else created_at
                    )
                    result = await connection.execute(
                        """
                        INSERT INTO rich_pages (
                            page_id, owner_id, title, blocks, buttons,
                            buttons_per_row, buttons_align, created_at, updated_at
                        )
                        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9)
                        ON CONFLICT (page_id) DO UPDATE
                        SET title = EXCLUDED.title,
                            blocks = EXCLUDED.blocks,
                            buttons = EXCLUDED.buttons,
                            buttons_per_row = EXCLUDED.buttons_per_row,
                            buttons_align = EXCLUDED.buttons_align,
                            updated_at = EXCLUDED.updated_at
                        WHERE rich_pages.owner_id = EXCLUDED.owner_id
                        """,
                        page_id,
                        owner_id,
                        title,
                        _encode_json(blocks),
                        _encode_json(buttons),
                        buttons_per_row,
                        buttons_align,
                        effective_created_at,
                        updated_at,
                    )
                    if not result.endswith(" 1"):
                        return True, "conflict"
            return True, "saved"
        except Exception as error:
            await self._disconnect(error)
            return False, "unavailable"

    async def save_page_row(
        self,
        page_id: str,
        owner_id: int,
        title: str,
        blocks: list[dict[str, Any]],
        buttons: list[dict[str, Any]],
        buttons_per_row: int,
        buttons_align: str,
        created_at: int,
        updated_at: int,
    ) -> bool:
        available, status = await self.save_page_row_limited(
            page_id,
            owner_id,
            title,
            blocks,
            buttons,
            buttons_per_row,
            buttons_align,
            created_at,
            updated_at,
            max_pages=None,
        )
        return available and status == "saved"

    @staticmethod
    def _page_query_sql(query: bool, sort_mode: str, paged: bool) -> str:
        mode = sort_mode if sort_mode in {"title", "oldest", "newest", "updated"} else "updated"
        statements = {
            (False, "title", False): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages WHERE owner_id = $1
                ORDER BY lower(title) ASC, page_id ASC
            """,
            (False, "oldest", False): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages WHERE owner_id = $1
                ORDER BY created_at ASC, page_id ASC
            """,
            (False, "newest", False): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages WHERE owner_id = $1
                ORDER BY created_at DESC, page_id ASC
            """,
            (False, "updated", False): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages WHERE owner_id = $1
                ORDER BY updated_at DESC, page_id ASC
            """,
            (True, "title", False): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                ORDER BY lower(title) ASC, page_id ASC
            """,
            (True, "oldest", False): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                ORDER BY created_at ASC, page_id ASC
            """,
            (True, "newest", False): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                ORDER BY created_at DESC, page_id ASC
            """,
            (True, "updated", False): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                ORDER BY updated_at DESC, page_id ASC
            """,
            (False, "title", True): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages WHERE owner_id = $1
                ORDER BY lower(title) ASC, page_id ASC LIMIT $2 OFFSET $3
            """,
            (False, "oldest", True): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages WHERE owner_id = $1
                ORDER BY created_at ASC, page_id ASC LIMIT $2 OFFSET $3
            """,
            (False, "newest", True): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages WHERE owner_id = $1
                ORDER BY created_at DESC, page_id ASC LIMIT $2 OFFSET $3
            """,
            (False, "updated", True): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages WHERE owner_id = $1
                ORDER BY updated_at DESC, page_id ASC LIMIT $2 OFFSET $3
            """,
            (True, "title", True): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                ORDER BY lower(title) ASC, page_id ASC LIMIT $3 OFFSET $4
            """,
            (True, "oldest", True): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                ORDER BY created_at ASC, page_id ASC LIMIT $3 OFFSET $4
            """,
            (True, "newest", True): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                ORDER BY created_at DESC, page_id ASC LIMIT $3 OFFSET $4
            """,
            (True, "updated", True): """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                ORDER BY updated_at DESC, page_id ASC LIMIT $3 OFFSET $4
            """,
        }
        return statements[(query, mode, paged)]

    async def query_pages_for_user(
        self,
        owner_id: int,
        *,
        query: str = "",
        sort_mode: str = "updated",
        limit: int | None = None,
        offset: int = 0,
    ) -> tuple[bool, list[dict[str, Any]], int, int]:
        pool = self._pool
        if pool is None:
            return False, [], 0, 0
        try:
            normalized = query.strip()
            if normalized:
                pattern = f"%{normalized}%"
                total = int(
                    await pool.fetchval(
                        """
                        SELECT COUNT(*) FROM rich_pages
                        WHERE owner_id = $1 AND (title ILIKE $2 OR page_id ILIKE $2)
                        """,
                        owner_id,
                        pattern,
                    )
                    or 0
                )
            else:
                total = int(
                    await pool.fetchval(
                        "SELECT COUNT(*) FROM rich_pages WHERE owner_id = $1",
                        owner_id,
                    )
                    or 0
                )
            owned_total = int(
                await pool.fetchval(
                    "SELECT COUNT(*) FROM rich_pages WHERE owner_id = $1",
                    owner_id,
                )
                or 0
            )
            paged = limit is not None
            sql = self._page_query_sql(bool(normalized), sort_mode, paged)
            if normalized and paged:
                rows = await pool.fetch(
                    sql,
                    owner_id,
                    pattern,
                    max(1, int(limit or 1)),
                    max(0, int(offset)),
                )
            elif normalized:
                rows = await pool.fetch(sql, owner_id, pattern)
            elif paged:
                rows = await pool.fetch(
                    sql,
                    owner_id,
                    max(1, int(limit or 1)),
                    max(0, int(offset)),
                )
            else:
                rows = await pool.fetch(sql, owner_id)
            pages = [
                {"page_id": str(row["page_id"]), **self._page_record(row)}
                for row in rows
            ]
            return True, pages, total, owned_total
        except Exception as error:
            await self._disconnect(error)
            return False, [], 0, 0

    async def count_pages_for_users(
        self,
        owner_ids: list[int],
    ) -> tuple[bool, dict[int, int]]:
        pool = self._pool
        if pool is None:
            return False, {}
        unique = sorted(set(int(owner_id) for owner_id in owner_ids))
        if not unique:
            return True, {}
        try:
            rows = await pool.fetch(
                """
                SELECT owner_id, COUNT(*) AS page_count
                FROM rich_pages
                WHERE owner_id = ANY($1::bigint[])
                GROUP BY owner_id
                """,
                unique,
            )
            return True, {
                int(row["owner_id"]): int(row["page_count"] or 0)
                for row in rows
            }
        except Exception as error:
            await self._disconnect(error)
            return False, {}

    async def delete_page_row(self, page_id: str, owner_id: int) -> tuple[bool, bool]:
        pool = self._pool
        if pool is None:
            return False, False
        try:
            result = await pool.execute(
                "DELETE FROM rich_pages WHERE page_id = $1 AND owner_id = $2",
                page_id,
                owner_id,
            )
            return True, result.endswith(" 1")
        except Exception as error:
            await self._disconnect(error)
            return False, False

    async def rename_page_row(
        self,
        page_id: str,
        owner_id: int,
        title: str,
        updated_at: int,
    ) -> tuple[bool, bool]:
        pool = self._pool
        if pool is None:
            return False, False
        try:
            result = await pool.execute(
                """
                UPDATE rich_pages
                SET title = $3, updated_at = $4
                WHERE page_id = $1 AND owner_id = $2
                """,
                page_id,
                owner_id,
                title,
                updated_at,
            )
            return True, result.endswith(" 1")
        except Exception as error:
            await self._disconnect(error)
            return False, False

    async def all_pages_snapshot(self) -> tuple[bool, dict[str, dict[str, Any]]]:
        pool = self._pool
        if pool is None:
            return False, {}
        try:
            rows = await pool.fetch(
                """
                SELECT page_id, owner_id, title, blocks, buttons,
                       buttons_per_row, buttons_align, created_at, updated_at
                FROM rich_pages
                """
            )
            return True, {
                str(row["page_id"]): self._page_record(row)
                for row in rows
            }
        except Exception as error:
            await self._disconnect(error)
            return False, {}

    async def page_statistics(self) -> tuple[bool, dict[str, int | None]]:
        pool = self._pool
        if pool is None:
            return False, {}
        try:
            row = await pool.fetchrow(
                """
                SELECT COUNT(*) AS pages,
                       COUNT(DISTINCT owner_id) AS owners,
                       MIN(created_at) AS oldest_page,
                       MAX(updated_at) AS latest_page_update
                FROM rich_pages
                """
            )
            return True, {
                "pages": int(row["pages"] or 0),
                "page_owners": int(row["owners"] or 0),
                "oldest_page": (
                    int(row["oldest_page"]) if row["oldest_page"] is not None else None
                ),
                "latest_page_update": (
                    int(row["latest_page_update"])
                    if row["latest_page_update"] is not None
                    else None
                ),
            }
        except Exception as error:
            await self._disconnect(error)
            return False, {}

    async def page_usage_history(self) -> tuple[bool, dict[int, dict[str, int]]]:
        pool = self._pool
        if pool is None:
            return False, {}
        try:
            rows = await pool.fetch(
                """
                SELECT owner_id, MIN(created_at) AS first_seen, MAX(updated_at) AS last_seen
                FROM rich_pages
                GROUP BY owner_id
                """
            )
            return True, {
                int(row["owner_id"]): {
                    "first_seen": int(row["first_seen"]),
                    "last_seen": int(row["last_seen"]),
                }
                for row in rows
            }
        except Exception as error:
            await self._disconnect(error)
            return False, {}

    async def runtime_statistics(self, active_after: int) -> dict[str, int | None]:
        pool = self._pool
        if pool is None:
            return {
                "fsm_sessions": 0,
                "active_editors": 0,
                "database_bytes": None,
                "pages_table_bytes": None,
                "fsm_table_bytes": None,
            }
        try:
            row = await pool.fetchrow(
                """
                SELECT
                    (SELECT COUNT(*) FROM rich_fsm) AS fsm_sessions,
                    (
                        SELECT COUNT(*) FROM rich_fsm
                        WHERE jsonb_typeof(data -> 'editor_last_activity_at') = 'number'
                          AND (data ->> 'editor_last_activity_at')::double precision >= $1
                    ) AS active_editors,
                    pg_database_size(current_database()) AS database_bytes,
                    pg_total_relation_size('rich_pages') AS pages_table_bytes,
                    pg_total_relation_size('rich_fsm') AS fsm_table_bytes
                """,
                float(active_after),
            )
            return {
                "fsm_sessions": int(row["fsm_sessions"] or 0),
                "active_editors": int(row["active_editors"] or 0),
                "database_bytes": int(row["database_bytes"] or 0),
                "pages_table_bytes": int(row["pages_table_bytes"] or 0),
                "fsm_table_bytes": int(row["fsm_table_bytes"] or 0),
            }
        except Exception as error:
            await self._disconnect(error)
            return {
                "fsm_sessions": 0,
                "active_editors": 0,
                "database_bytes": None,
                "pages_table_bytes": None,
                "fsm_table_bytes": None,
            }

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

    async def cleanup_expired_editor_fsm(self, cutoff_epoch: int) -> int:
        """Delete editor FSM rows whose inactivity TTL has elapsed."""
        pool = self._pool
        if pool is None:
            return 0
        try:
            result = await pool.execute(
                """
                DELETE FROM rich_fsm
                WHERE jsonb_typeof(data -> 'editor_last_activity_at') = 'number'
                  AND (data ->> 'editor_last_activity_at')::double precision < $1
                """,
                float(cutoff_epoch),
            )
            try:
                return int(str(result).rsplit(" ", 1)[-1])
            except (TypeError, ValueError):
                return 0
        except Exception as error:
            await self._disconnect(error)
            return 0

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
        register: bool = True,
    ) -> None:
        self.namespace = namespace
        self.path = path
        self.default_factory = default_factory
        self.database = database or state_database
        self._local_fingerprint: str | None = None
        if register:
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
            if await self._expire_editor_if_stale(key, encoded):
                return None
            return await self.fallback.get_state(key)

    async def _expire_editor_if_stale(self, key: StorageKey, encoded: str) -> bool:
        data = await self.fallback.get_data(key)
        raw_activity = data.get("editor_last_activity_at")
        if raw_activity is None:
            return False
        try:
            last_activity = int(raw_activity)
        except (TypeError, ValueError):
            last_activity = 0
        if (
            last_activity > 0
            and int(time.time()) - last_activity < EDITOR_SESSION_TTL_SECONDS
        ):
            return False
        await self.fallback.set_state(key, None)
        await self.fallback.set_data(key, {})
        await self._persist(key, encoded)
        return True

    async def set_data(self, key: StorageKey, data: Mapping[str, Any]) -> None:
        encoded = self._key(key)
        async with self._locks.setdefault(encoded, asyncio.Lock()):
            await self._ensure_loaded(key, encoded)
            payload = dict(data)
            if "editor_last_activity_at" in payload:
                payload["editor_last_activity_at"] = int(time.time())
            await self.fallback.set_data(key, payload)
            await self._persist(key, encoded)

    async def get_data(self, key: StorageKey) -> dict[str, Any]:
        encoded = self._key(key)
        async with self._locks.setdefault(encoded, asyncio.Lock()):
            await self._ensure_loaded(key, encoded)
            if await self._expire_editor_if_stale(key, encoded):
                return {}
            return await self.fallback.get_data(key)

    async def cleanup_expired_editor_sessions(self) -> int:
        """Drop stale editor sessions from the in-process MemoryStorage fallback."""
        storage = getattr(self.fallback, "storage", None)
        if not isinstance(storage, dict):
            return 0
        cutoff = int(time.time()) - EDITOR_SESSION_TTL_SECONDS
        expired: list[StorageKey] = []
        for key, record in tuple(storage.items()):
            data = getattr(record, "data", None)
            if not isinstance(data, dict):
                continue
            raw_activity = data.get("editor_last_activity_at")
            try:
                last_activity = int(raw_activity)
            except (TypeError, ValueError):
                continue
            if last_activity < cutoff:
                expired.append(key)

        for key in expired:
            storage.pop(key, None)
            encoded = self._key(key)
            self._loaded.discard(encoded)
            self._dirty.pop(encoded, None)
            self._locks.pop(encoded, None)
        return len(expired)

    async def close(self) -> None:
        try:
            await self._flush_dirty()
        finally:
            await self.fallback.close()


state_database = PostgresStateDatabase()
