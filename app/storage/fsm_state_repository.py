from __future__ import annotations

import asyncio
import copy
import logging
from collections.abc import Callable, Mapping
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.storage.hybrid import HybridJSONRepository, PostgresStateDatabase


class FSMStateRepository:
    """PostgreSQL FSM and generic HybridJSONRepository snapshot persistence."""

    def __init__(
        self,
        database: PostgresStateDatabase,
        *,
        encode_json: Callable[[Any], str],
        decode_json: Callable[[Any], Any],
        logger: logging.Logger,
    ) -> None:
        self.database = database
        self._encode_json = encode_json
        self._decode_json = decode_json
        self._logger = logger

    def register(self, repository: HybridJSONRepository) -> None:
        self.database._repositories[repository.namespace] = repository

    async def read_snapshot(self, repository: HybridJSONRepository) -> Any:
        pool = self.database._pool
        if pool is None:
            return await repository.read_local()
        try:
            stored = await pool.fetchval(
                "SELECT payload FROM rich_state WHERE namespace = $1",
                repository.namespace,
            )
            if stored is None:
                payload = await repository.read_local()
                await self.database._upsert_snapshot(repository.namespace, payload)
                return payload
            payload = self._decode_json(stored)
            await repository.refresh_local(payload)
            return payload
        except Exception as error:
            await self.database._disconnect(error)
            return await repository.read_local()

    async def write_snapshot(
        self,
        repository: HybridJSONRepository,
        payload: Any,
    ) -> None:
        database_saved = False
        if self.database._pool is not None:
            try:
                await self.database._upsert_snapshot(repository.namespace, payload)
                database_saved = True
                await self.database._set_dirty(repository.namespace, False)
            except Exception as error:
                await self.database._disconnect(error)

        try:
            await repository.write_local(payload)
        except OSError:
            if not database_saved:
                raise
            self._logger.exception(
                "PostgreSQL write succeeded but JSON mirror failed for %s",
                repository.namespace,
            )

        if self.database.configured and not database_saved:
            await self.database._set_dirty(repository.namespace, True)

    async def mirror_local_snapshot(
        self,
        repository: HybridJSONRepository,
        payload: Any,
    ) -> None:
        if self.database._pool is None:
            if self.database.configured:
                await self.database._set_dirty(repository.namespace, True)
            return
        try:
            await self.database._upsert_snapshot(repository.namespace, payload)
            await self.database._set_dirty(repository.namespace, False)
        except Exception as error:
            await self.database._disconnect(error)
            await self.database._set_dirty(repository.namespace, True)

    def schedule_local_snapshot(
        self,
        repository: HybridJSONRepository,
        payload: Any,
    ) -> None:
        if not self.database.configured:
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
        self.database._background_tasks.add(task)
        task.add_done_callback(self.database._background_tasks.discard)

    async def sync_local_paths(self, paths: list[str]) -> None:
        selected = {str(Path(path).resolve()) for path in paths}
        for repository in tuple(self.database._repositories.values()):
            if str(repository.path.resolve()) not in selected:
                continue
            payload = await repository.read_local()
            if self.database._pool is None:
                if self.database.configured:
                    await self.database._set_dirty(repository.namespace, True)
                continue
            try:
                await self.database._upsert_snapshot(repository.namespace, payload)
                await self.database._set_dirty(repository.namespace, False)
            except Exception as error:
                await self.database._disconnect(error)
                await self.database._set_dirty(repository.namespace, True)

    async def read_fsm(self, storage_key: str) -> tuple[bool, str | None, dict[str, Any]]:
        pool = self.database._pool
        if pool is None:
            return False, None, {}
        try:
            row = await pool.fetchrow(
                "SELECT state, data FROM rich_fsm WHERE storage_key = $1",
                storage_key,
            )
            if row is None:
                return True, None, {}
            data = self._decode_json(row["data"])
            return True, row["state"], data if isinstance(data, dict) else {}
        except Exception as error:
            await self.database._disconnect(error)
            return False, None, {}

    async def cleanup_expired_editor_fsm(self, cutoff_epoch: int) -> int:
        """Delete editor FSM rows whose inactivity TTL has elapsed."""
        pool = self.database._pool
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
            await self.database._disconnect(error)
            return 0

    async def write_fsm(
        self,
        storage_key: str,
        state: str | None,
        data: Mapping[str, Any],
    ) -> bool:
        pool = self.database._pool
        if pool is None:
            return False
        try:
            encoded_data = self._encode_json(dict(data))
        except TypeError:
            self._logger.exception(
                "FSM data is not JSON-compatible; keeping this session in memory only"
            )
            try:
                await pool.execute(
                    "DELETE FROM rich_fsm WHERE storage_key = $1", storage_key
                )
                return True
            except Exception as error:
                await self.database._disconnect(error)
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
            await self.database._disconnect(error)
            return False


__all__ = ["FSMStateRepository"]
