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
    """Persist saved pages in indexed PostgreSQL rows, with JSON fallback."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _registry_path()
        self._lock = asyncio.Lock()
        # Kept for offline operation, migration from the old JSONB snapshot,
        # developer backup/import, and installations without DATABASE_URL.
        self._repository = HybridJSONRepository("rich_pages", self.path)

    async def startup(self) -> int:
        """Migrate the previous rich_pages JSON/JSONB snapshot without changing codes."""
        if not state_database.connected:
            return 0
        legacy = await self._repository.read()
        if not isinstance(legacy, dict):
            return 0
        return await state_database.migrate_legacy_pages(legacy)

    async def _read_fallback(self) -> dict[str, dict[str, Any]]:
        value = await self._repository.read()
        return value if isinstance(value, dict) else {}

    async def _write_fallback(self, pages: dict[str, dict[str, Any]]) -> None:
        await self._repository.write(pages)

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
        async with self._lock:
            available, existing = await state_database.get_page(page_id or "")
            if available:
                reuse = (
                    bool(page_id)
                    and isinstance(existing, dict)
                    and int(existing.get("owner_id", 0)) == owner_id
                )
                if not reuse and owner_id not in developer_ids():
                    _, owned_count = await state_database.count_pages_for_user(owner_id)
                    if owned_count >= MAX_SAVED_PAGES:
                        raise PageLimitError()

                code = page_id if reuse and page_id is not None else secrets.token_hex(4)
                while not reuse:
                    check_available, collision = await state_database.get_page(code)
                    if not check_available or collision is None:
                        break
                    code = secrets.token_hex(4)

                now = int(time.time())
                created_at = (
                    int(existing.get("created_at", now))
                    if reuse and existing is not None
                    else now
                )
                saved = await state_database.save_page_row(
                    code,
                    owner_id,
                    title.strip()[:64] or "صفحة بلا اسم",
                    copy.deepcopy(blocks),
                    copy.deepcopy(buttons),
                    int(buttons_per_row),
                    str(buttons_align),
                    created_at,
                    now,
                )
                if saved:
                    media_store.remember_blocks(blocks)
                    media_store.pin_page(code, blocks)
                    return code

            pages = await self._read_fallback()
            existing = pages.get(page_id or "")
            reuse = (
                bool(page_id)
                and isinstance(existing, dict)
                and int(existing.get("owner_id", 0)) == owner_id
            )
            if not reuse and owner_id not in developer_ids():
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
            now = int(time.time())
            pages[code] = {
                "owner_id": owner_id,
                "title": title.strip()[:64] or "صفحة بلا اسم",
                "blocks": copy.deepcopy(blocks),
                "buttons": copy.deepcopy(buttons),
                "buttons_per_row": buttons_per_row,
                "buttons_align": buttons_align,
                "created_at": (
                    int(existing.get("created_at", now))
                    if reuse and existing is not None
                    else now
                ),
                "updated_at": now,
            }
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
        available, pages, _ = await state_database.query_pages_for_user(
            owner_id,
            sort_mode="title",
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
        available, pages, total_count = await state_database.query_pages_for_user(
            owner_id,
            query=query,
            sort_mode=sort_mode,
        )
        if available:
            return pages, total_count

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
            available, existing = await state_database.get_page(page_id)
            if available:
                if existing is not None:
                    return False
                if owner_id not in developer_ids():
                    _, owned_count = await state_database.count_pages_for_user(owner_id)
                    if owned_count >= MAX_SAVED_PAGES:
                        return False
                now = int(time.time())
                saved = await state_database.save_page_row(
                    page_id,
                    owner_id,
                    page["title"],
                    page["blocks"],
                    page["buttons"],
                    page["buttons_per_row"],
                    page["buttons_align"],
                    int(page.get("created_at") or now),
                    int(page.get("updated_at") or now),
                )
                if saved:
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
            history = {}
            now = int(time.time())
            for page in pages.values():
                if not isinstance(page, dict):
                    continue
                try:
                    owner_id = int(page.get("owner_id", 0))
                except (TypeError, ValueError):
                    continue
                if not owner_id:
                    continue
                created_at = int(page.get("created_at") or now)
                updated_at = int(page.get("updated_at") or created_at)
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
        """Refresh rich_pages.json from the indexed table before developer export."""
        available, pages = await state_database.all_pages_snapshot()
        if available:
            await self._repository.write_local(pages)

    async def replace_from_local_backup(self) -> bool:
        """Apply imported rich_pages.json to the indexed table as a true replacement."""
        pages = await self._repository.read_local()
        if not isinstance(pages, dict):
            return False
        if not state_database.connected:
            return True
        return await state_database.replace_pages_snapshot(pages)

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
