from __future__ import annotations

import logging
import time
from collections.abc import Callable, Mapping
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.storage.hybrid import PostgresStateDatabase


class PagesBackup:
    """Page snapshot migration and backup operations."""

    def __init__(
        self,
        database: PostgresStateDatabase,
        *,
        encode_json: Callable[[Any], str],
        logger: logging.Logger,
    ) -> None:
        self.database = database
        self._encode_json = encode_json
        self._logger = logger

    async def migrate_legacy_pages(self, pages: Mapping[str, Any]) -> int:
        pool = self.database._pool
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
                            self._encode_json(raw.get("blocks") or []),
                            self._encode_json(raw.get("buttons") or []),
                            int(raw.get("buttons_per_row") or 1),
                            str(raw.get("buttons_align") or "center"),
                            created_at,
                            updated_at,
                        )
                        if result.endswith(" 1"):
                            migrated += 1
                    expected_ids = [
                        str(page_id)
                        for page_id, raw in pages.items()
                        if isinstance(raw, Mapping)
                        and str(raw.get("owner_id") or "").lstrip("-").isdigit()
                        and int(raw.get("owner_id") or 0) != 0
                    ]
                    if expected_ids:
                        migrated_count = int(
                            await connection.fetchval(
                                """
                                SELECT COUNT(*) FROM rich_pages
                                WHERE page_id = ANY($1::text[])
                                """,
                                expected_ids,
                            )
                            or 0
                        )
                        if migrated_count != len(set(expected_ids)):
                            raise RuntimeError(
                                "legacy page migration verification failed: "
                                f"expected={len(set(expected_ids))} actual={migrated_count}"
                            )
                    await connection.execute(
                        """
                        INSERT INTO rich_migrations (name, completed_at)
                        VALUES ($1, NOW())
                        ON CONFLICT (name) DO NOTHING
                        """,
                        migration_name,
                    )
            self._logger.info(
                "Legacy page migration verified: candidates=%s migrated_or_updated=%s",
                len(expected_ids) if "expected_ids" in locals() else 0,
                migrated,
            )
            return migrated
        except Exception as error:
            await self.database._disconnect(error)
            return 0


    async def replace_pages_snapshot(self, pages: Mapping[str, Any]) -> bool:
        pool = self.database._pool
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
                            self._encode_json(raw.get("blocks") or []),
                            self._encode_json(raw.get("buttons") or []),
                            int(raw.get("buttons_per_row") or 1),
                            str(raw.get("buttons_align") or "center"),
                            created_at,
                            updated_at,
                        )
            return True
        except Exception as error:
            await self.database._disconnect(error)
            return False


    async def all_pages_snapshot(self) -> tuple[bool, dict[str, dict[str, Any]]]:
        pool = self.database._pool
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
                str(row["page_id"]): self.database._page_record(row)
                for row in rows
            }
        except Exception as error:
            await self.database._disconnect(error)
            return False, {}


__all__ = ["PagesBackup"]
