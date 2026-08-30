from __future__ import annotations

import asyncio
import copy
import json
import os
import secrets
import time
from pathlib import Path
from typing import Any

from app.services.media import media_store


def _registry_path() -> Path:
    configured = os.getenv("RICH_PAGES_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "rich_pages.json"


class PageRegistry:
    """Persist saved rich-message pages so «page» buttons can navigate between them."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _registry_path()
        self._lock = asyncio.Lock()

    def _read(self) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return value if isinstance(value, dict) else {}

    def _write(self, pages: dict[str, dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(
            json.dumps(pages, ensure_ascii=False, indent=2), encoding="utf-8",
        )
        temporary.replace(self.path)

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
        """Create a new page or overwrite an existing one owned by the same user."""
        async with self._lock:
            pages = self._read()
            existing = pages.get(page_id or "")
            reuse = (
                bool(page_id)
                and isinstance(existing, dict)
                and int(existing.get("owner_id", 0)) == owner_id
            )
            code = page_id if reuse else secrets.token_hex(4)
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
                "created_at": int(existing.get("created_at", now)) if reuse else now,
                "updated_at": now,
            }
            self._write(pages)
            media_store.remember_blocks(blocks)
            media_store.pin_page(code, blocks)
            return code

    async def get(self, page_id: str) -> dict[str, Any] | None:
        async with self._lock:
            page = self._read().get(page_id)
            return copy.deepcopy(page) if isinstance(page, dict) else None

    async def list_for_user(self, owner_id: int) -> list[dict[str, Any]]:
        async with self._lock:
            pages = self._read()
            result = [
                {"page_id": code, **copy.deepcopy(page)}
                for code, page in pages.items()
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
        """Return filtered/sorted owned pages and the unfiltered total count."""
        pages = await self.list_for_user(owner_id)
        total_count = len(pages)
        normalized_query = query.strip().casefold()
        if normalized_query:
            pages = [
                page for page in pages
                if normalized_query in str(page.get("title") or "").casefold()
                or normalized_query in str(page.get("page_id") or "").casefold()
            ]
        title_key = lambda page: str(
            page.get("title") or page["page_id"]
        ).casefold()
        pages.sort(key=title_key)
        if sort_mode == "oldest":
            pages.sort(key=lambda page: int(page.get("created_at", 0)))
        elif sort_mode == "newest":
            pages.sort(key=lambda page: int(page.get("created_at", 0)), reverse=True)
        elif sort_mode != "title":
            pages.sort(key=lambda page: int(page.get("updated_at", 0)), reverse=True)
        return pages, total_count

    async def delete(self, page_id: str, owner_id: int) -> bool:
        async with self._lock:
            pages = self._read()
            page = pages.get(page_id)
            if not isinstance(page, dict) or int(page.get("owner_id", 0)) != owner_id:
                return False
            pages.pop(page_id, None)
            self._write(pages)
            media_store.unpin_page(page_id)
            return True

    async def rename(self, page_id: str, owner_id: int, title: str) -> bool:
        async with self._lock:
            pages = self._read()
            page = pages.get(page_id)
            if not isinstance(page, dict) or int(page.get("owner_id", 0)) != owner_id:
                return False
            page["title"] = title.strip()[:64] or "صفحة بلا اسم"
            page["updated_at"] = int(time.time())
            self._write(pages)
            return True

    async def rebuild_media_pins(self) -> None:
        """Rebuild pins at startup so existing page codes survive cache cleanup."""
        async with self._lock:
            pages = self._read()
            for page_id, page in pages.items():
                if isinstance(page, dict):
                    media_store.remember_blocks(page.get("blocks") or [])
                    media_store.pin_page(page_id, page.get("blocks") or [])


page_registry = PageRegistry()
