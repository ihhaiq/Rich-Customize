from __future__ import annotations

import asyncio
import copy
import os
import secrets
import time
from pathlib import Path
from typing import Any

from app.config import developer_ids
from app.editor.limits import EditorLimitError, MAX_SAVED_PAGES, validate_editor_limits
from app.services.media import media_store
from app.storage import HybridJSONRepository, state_database


def _registry_path() -> Path:
    configured = os.getenv("RICH_PAGES_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "rich_pages.json"


class PageLimitError(ValueError):
    def __init__(self, limit: int = MAX_SAVED_PAGES) -> None:
        self.limit = limit
        super().__init__(f"saved page limit reached: {limit}")


class PageRegistry:
    """Persist saved pages in PostgreSQL rows, with a local JSON recovery copy."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _registry_path()
        self._lock = asyncio.Lock()
        # This file is backup/import/export only. It must not be mirrored back into
        # rich_state as one giant JSONB document after the row-table migration.
        self._repository = HybridJSONRepository(
            "rich_pages",
            self.path,
            register=False,
        )

    async def startup(self) -> int:
        """One-time migration from the pre-table JSON/JSONB page snapshot."""
        if not state_database.connected:
            return 0
        legacy = await self._repository.read_local()
        if not isinstance(legacy, dict):
            return 0
        return await state_database.migrate_legacy_pages(legacy)

    async def _read_fallback(self) -> dict[str, dict[str, Any]]:
        value = await self._repository.read_local()
        return value if isinstance(value, dict) else {}

    async def _write_fallback(self, pages: dict[str, dict[str, Any]]) -> None:
        await self._repository.write_local(pages)

    @staticmethod
    def _page_payload(
        owner_id: int,
        title: str,
        blocks: list[dict[str, Any]],
        buttons: list[dict[str, Any]],
        buttons_per_row: int,
        buttons_align: str,
        *,
        created_at: int,
        updated_at: int,
    ) -> dict[str, Any]:
        return {
            "owner_id": owner_id,
            "title": title.strip()[:64] or "صفحة بلا اسم",
            "blocks": copy.deepcopy(blocks),
            "buttons": copy.deepcopy(buttons),
            "buttons_per_row": int(buttons_per_row),
            "buttons_align": str(buttons_align),
            "created_at": int(created_at),
            "updated_at": int(updated_at),
        }

    async def save(
        self,
        owner_id: int,
        title: str,
        blocks: list[dict[str, Any]],
        buttons: list[dict[str, Any]],
        buttons_per_row: int,
        buttons_align: str,
        page_id: str | None = None,
    ) -> str:
        validate_editor_limits(blocks)
        cleaned_title = title.strip()[:64] or "صفحة بلا اسم"
        now = int(time.time())
        developer = owner_id in developer_ids()

        async with self._lock:
            if state_database.connected:
                reuse = False
                existing: dict[str, Any] | None = None
                if page_id:
                    available, existing = await state_database.get_page(page_id)
                    if available and existing is not None:
                        if int(existing.get("owner_id", 0)) != owner_id:
                            raise ValueError("page id belongs to another user")
                        reuse = True

                attempts = 1 if reuse else 8
                for _ in range(attempts):
                    code = page_id if reuse and page_id is not None else secrets.token_hex(4)
                    created_at = (
                        int(existing.get("created_at") or now)
                        if existing is not None
                        else now
                    )
                    available, status = await state_database.save_page_row_limited(
                        code,
                        owner_id,
                        cleaned_title,
                        copy.deepcopy(blocks),
                        copy.deepcopy(buttons),
                        int(buttons_per_row),
                        str(buttons_align),
                        created_at,
                        now,
                        max_pages=None if developer else MAX_SAVED_PAGES,
                    )
                    if not available:
                        break
                    if status == "limit":
                        raise PageLimitError()
                    if status == "saved":
                        media_store.remember_blocks(blocks)
                        media_store.pin_page(code, blocks)
                        return code
                    if reuse:
                        raise ValueError("saved page could not be updated")
                if state_database.connected:
                    raise RuntimeError("could not allocate a unique page id")

            pages = await self._read_fallback()
            existing = pages.get(page_id or "")
            reuse = (
                bool(page_id)
                and isinstance(existing, dict)
                and int(existing.get("owner_id", 0)) == owner_id
            )
            if page_id and isinstance(existing, dict) and not reuse:
                raise ValueError("page id belongs to another user")
            if not reuse and not developer:
                owned_count = sum(
                    1
                    for page in pages.values()
                    if isinstance(page, dict)
                    and int(page.get("owner_id", 0)) == owner_id
                )
                if owned_count >= MAX_SAVED_PAGES:
                    raise PageLimitError()

            code = page_id if reuse and page_id is not None else secrets.token_hex(4)
            while not reuse and code in pages:
                code = secrets.token_hex(4)
            pages[code] = self._page_payload(
                owner_id,
                cleaned_title,
                blocks,
                buttons,
                buttons_per_row,
                buttons_align,
                created_at=(
                    int(existing.get("created_at") or now)
                    if isinstance(existing, dict)
                    else now
                ),
                updated_at=now,
            )
            await self._write_fallback(pages)
            media_store.remember_blocks(blocks)
            media_store.pin_page(code, blocks)
            return code

    async def get(self, page_id: str) -> dict[str, Any] | None:
        available, page = await state_database.get_page(page_id)
        if available:
            return copy.deepcopy(page) if page is not None else None
        async with self._lock:
            page = (await self._read_fallback()).get(page_id)
            return copy.deepcopy(page) if isinstance(page, dict) else None

    async def list_for_user(self, owner_id: int) -> list[dict[str, Any]]:
        available, pages, _filtered_total, _owned_total = (
            await state_database.query_pages_for_user(owner_id, sort_mode="title")
        )
        if available:
            return pages
        async with self._lock:
            fallback = await self._read_fallback()
            result = [
                {"page_id": code, **copy.deepcopy(page)}
                for code, page in fallback.items()
                if isinstance(page, dict) and int(page.get("owner_id", 0)) == owner_id
            ]
            return sorted(
                result,
                key=lambda page: str(page.get("title") or page["page_id"]).casefold(),
            )

    async def query_for_user(
        self,
        owner_id: int,
        *,
        query: str = "",
        sort_mode: str = "updated",
    ) -> tuple[list[dict[str, Any]], int]:
        available, pages, _filtered_total, owned_total = (
            await state_database.query_pages_for_user(
                owner_id,
                query=query,
                sort_mode=sort_mode,
            )
        )
        if available:
            return pages, owned_total

        pages = await self.list_for_user(owner_id)
        total_count = len(pages)
        normalized_query = query.strip().casefold()
        if normalized_query:
            pages = [
                page
                for page in pages
                if normalized_query in str(page.get("title") or "").casefold()
                or normalized_query in str(page.get("page_id") or "").casefold()
            ]

        def title_key(page: dict[str, Any]) -> str:
            return str(page.get("title") or page["page_id"]).casefold()

        pages.sort(key=title_key)
        if sort_mode == "oldest":
            pages.sort(key=lambda page: int(page.get("created_at", 0)))
        elif sort_mode == "newest":
            pages.sort(key=lambda page: int(page.get("created_at", 0)), reverse=True)
        elif sort_mode != "title":
            pages.sort(key=lambda page: int(page.get("updated_at", 0)), reverse=True)
        return pages, total_count

    async def query_page_for_user(
        self,
        owner_id: int,
        page_index: int,
        page_size: int,
        *,
        query: str = "",
        sort_mode: str = "updated",
    ) -> tuple[list[dict[str, Any]], int, int]:
        """Return one SQL-paginated screen, filtered count, and unfiltered count."""
        size = max(1, int(page_size))
        index = max(0, int(page_index))
        available, pages, filtered_total, owned_total = (
            await state_database.query_pages_for_user(
                owner_id,
                query=query,
                sort_mode=sort_mode,
                limit=size,
                offset=index * size,
            )
        )
        if available:
            return pages, filtered_total, owned_total

        all_pages, owned_total = await self.query_for_user(
            owner_id,
            query=query,
            sort_mode=sort_mode,
        )
        return all_pages[index * size : (index + 1) * size], len(all_pages), owned_total

    async def delete(self, page_id: str, owner_id: int) -> bool:
        available, deleted = await state_database.delete_page_row(page_id, owner_id)
        if available:
            if deleted:
                media_store.unpin_page(page_id)
            return deleted
        async with self._lock:
            pages = await self._read_fallback()
            page = pages.get(page_id)
            if not isinstance(page, dict) or int(page.get("owner_id", 0)) != owner_id:
                return False
            pages.pop(page_id, None)
            await self._write_fallback(pages)
            media_store.unpin_page(page_id)
            return True

    async def restore(
        self,
        page_id: str,
        owner_id: int,
        snapshot: dict[str, Any],
    ) -> bool:
        if int(snapshot.get("owner_id", 0)) != owner_id:
            return False
        page = copy.deepcopy(snapshot)
        page["owner_id"] = owner_id
        page["title"] = str(page.get("title") or "صفحة بلا اسم").strip()[:64]
        page["blocks"] = copy.deepcopy(page.get("blocks") or [])
        try:
            validate_editor_limits(page["blocks"])
        except EditorLimitError:
            return False
        page["buttons"] = copy.deepcopy(page.get("buttons") or [])
        page["buttons_per_row"] = int(page.get("buttons_per_row", 1))
        page["buttons_align"] = str(page.get("buttons_align", "center"))

        async with self._lock:
            if state_database.connected:
                now = int(time.time())
                available, status = await state_database.save_page_row_limited(
                    page_id,
                    owner_id,
                    page["title"],
                    page["blocks"],
                    page["buttons"],
                    page["buttons_per_row"],
                    page["buttons_align"],
                    int(page.get("created_at") or now),
                    int(page.get("updated_at") or now),
                    max_pages=None if owner_id in developer_ids() else MAX_SAVED_PAGES,
                )
                if available:
                    if status != "saved":
                        return False
                    media_store.remember_blocks(page["blocks"])
                    media_store.pin_page(page_id, page["blocks"])
                    return True

            pages = await self._read_fallback()
            if page_id in pages:
                return False
            if owner_id not in developer_ids():
                owned_count = sum(
                    1
                    for candidate in pages.values()
                    if isinstance(candidate, dict)
                    and int(candidate.get("owner_id", 0)) == owner_id
                )
                if owned_count >= MAX_SAVED_PAGES:
                    return False
            pages[page_id] = page
            await self._write_fallback(pages)
            media_store.remember_blocks(page["blocks"])
            media_store.pin_page(page_id, page["blocks"])
            return True

    async def rename(self, page_id: str, owner_id: int, title: str) -> bool:
        cleaned = title.strip()[:64] or "صفحة بلا اسم"
        now = int(time.time())
        available, renamed = await state_database.rename_page_row(
            page_id,
            owner_id,
            cleaned,
            now,
        )
        if available:
            return renamed
        async with self._lock:
            pages = await self._read_fallback()
            page = pages.get(page_id)
            if not isinstance(page, dict) or int(page.get("owner_id", 0)) != owner_id:
                return False
            page["title"] = cleaned
            page["updated_at"] = now
            await self._write_fallback(pages)
            return True

    async def usage_history(self) -> dict[int, dict[str, int]]:
        available, history = await state_database.page_usage_history()
        if available:
            return history
        async with self._lock:
            pages = await self._read_fallback()
            history: dict[int, dict[str, int]] = {}
            now = int(time.time())
            for page in pages.values():
                if not isinstance(page, dict):
                    continue
                try:
                    owner_id = int(page.get("owner_id", 0))
                    created_at = int(page.get("created_at") or now)
                    updated_at = int(page.get("updated_at") or created_at)
                except (TypeError, ValueError):
                    continue
                if not owner_id:
                    continue
                current = history.get(owner_id)
                if current is None:
                    history[owner_id] = {
                        "first_seen": created_at,
                        "last_seen": updated_at,
                    }
                else:
                    current["first_seen"] = min(current["first_seen"], created_at)
                    current["last_seen"] = max(current["last_seen"], updated_at)
            return history

    async def count_for_user(self, owner_id: int) -> int:
        available, count = await state_database.count_pages_for_user(owner_id)
        if available:
            return count
        pages = await self.list_for_user(owner_id)
        return len(pages)

    async def counts_for_users(self, owner_ids: list[int]) -> dict[int, int]:
        available, counts = await state_database.count_pages_for_users(owner_ids)
        if available:
            return {owner_id: counts.get(owner_id, 0) for owner_id in owner_ids}
        pages = await self._read_fallback()
        result = {owner_id: 0 for owner_id in owner_ids}
        for page in pages.values():
            if not isinstance(page, dict):
                continue
            try:
                owner_id = int(page.get("owner_id", 0))
            except (TypeError, ValueError):
                continue
            if owner_id in result:
                result[owner_id] += 1
        return result

    async def statistics(self) -> dict[str, int | None]:
        available, stats = await state_database.page_statistics()
        if available:
            return stats
        async with self._lock:
            pages = await self._read_fallback()
            valid_pages = [page for page in pages.values() if isinstance(page, dict)]
            owners: set[int] = set()
            created: list[int] = []
            updated: list[int] = []
            for page in valid_pages:
                try:
                    owner_id = int(page.get("owner_id", 0))
                except (TypeError, ValueError):
                    owner_id = 0
                if owner_id:
                    owners.add(owner_id)
                try:
                    created.append(int(page.get("created_at") or 0))
                    updated.append(int(page.get("updated_at") or 0))
                except (TypeError, ValueError):
                    pass
            created = [value for value in created if value > 0]
            updated = [value for value in updated if value > 0]
            return {
                "pages": len(valid_pages),
                "page_owners": len(owners),
                "oldest_page": min(created) if created else None,
                "latest_page_update": max(updated) if updated else None,
            }

    async def export_snapshot(self) -> None:
        """Refresh rich_pages.json from the indexed table for backup/export."""
        available, pages = await state_database.all_pages_snapshot()
        if available:
            await self._repository.write_local(pages)

    async def replace_from_local_backup(self) -> bool:
        pages = await self._repository.read_local()
        if not isinstance(pages, dict):
            return False
        if not state_database.connected:
            return True
        return await state_database.replace_pages_snapshot(pages)

    async def restore_drill(self) -> dict[str, int | bool]:
        """Parse and validate the fallback without mutating production data."""
        pages = await self._repository.read_local()
        if not isinstance(pages, dict):
            return {"ok": False, "pages": 0, "invalid": 1, "matches_database": False}
        invalid = 0
        valid_ids: set[str] = set()
        for page_id, page in pages.items():
            if not isinstance(page_id, str) or not isinstance(page, dict):
                invalid += 1
                continue
            try:
                owner_id = int(page.get("owner_id", 0))
                blocks = page.get("blocks") or []
                if not owner_id or not isinstance(blocks, list):
                    raise ValueError
                validate_editor_limits(blocks)
            except (TypeError, ValueError, EditorLimitError):
                invalid += 1
                continue
            valid_ids.add(page_id)

        matches_database = True
        available, database_pages = await state_database.all_pages_snapshot()
        if available:
            matches_database = valid_ids == set(database_pages)
        return {
            "ok": invalid == 0 and matches_database,
            "pages": len(valid_ids),
            "invalid": invalid,
            "matches_database": matches_database,
        }

    async def rebuild_media_pins(self) -> None:
        available, pages = await state_database.all_pages_snapshot()
        if not available:
            pages = await self._read_fallback()
        for page_id, page in pages.items():
            if isinstance(page, dict):
                media_store.remember_blocks(page.get("blocks") or [])
                media_store.pin_page(page_id, page.get("blocks") or [])


page_registry = PageRegistry()


__all__ = ["PageLimitError", "PageRegistry", "page_registry"]
