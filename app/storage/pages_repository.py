from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from app.storage.hybrid import PostgresStateDatabase


def _encode_json(value: Any) -> str:
    from app.storage.hybrid import _encode_json as encode_json

    return encode_json(value)


def _decode_json(value: Any) -> Any:
    from app.storage.hybrid import _decode_json as decode_json

    return decode_json(value)


class PagesRepository:
    """PostgreSQL CRUD and statistics for saved pages."""

    def __init__(self, database: PostgresStateDatabase) -> None:
        self.database = database

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


    async def get_page(self, page_id: str) -> tuple[bool, dict[str, Any] | None]:
        pool = self.database._pool
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
            await self.database._disconnect(error)
            return False, None


    async def count_pages_for_user(self, owner_id: int) -> tuple[bool, int]:
        pool = self.database._pool
        if pool is None:
            return False, 0
        try:
            value = await pool.fetchval(
                "SELECT COUNT(*) FROM rich_pages WHERE owner_id = $1",
                owner_id,
            )
            return True, int(value or 0)
        except Exception as error:
            await self.database._disconnect(error)
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
        pool = self.database._pool
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
            await self.database._disconnect(error)
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
        pool = self.database._pool
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
            await self.database._disconnect(error)
            return False, [], 0, 0


    async def count_pages_for_users(
        self,
        owner_ids: list[int],
    ) -> tuple[bool, dict[int, int]]:
        pool = self.database._pool
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
            await self.database._disconnect(error)
            return False, {}


    async def delete_page_row(self, page_id: str, owner_id: int) -> tuple[bool, bool]:
        pool = self.database._pool
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
            await self.database._disconnect(error)
            return False, False


    async def rename_page_row(
        self,
        page_id: str,
        owner_id: int,
        title: str,
        updated_at: int,
    ) -> tuple[bool, bool]:
        pool = self.database._pool
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
            await self.database._disconnect(error)
            return False, False


    async def page_statistics(self) -> tuple[bool, dict[str, int | None]]:
        pool = self.database._pool
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
            await self.database._disconnect(error)
            return False, {}


    async def page_usage_history(self) -> tuple[bool, dict[int, dict[str, int]]]:
        pool = self.database._pool
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
            await self.database._disconnect(error)
            return False, {}


__all__ = ["PagesRepository"]
