from __future__ import annotations

import asyncio
import json
import os
import secrets
from pathlib import Path
from typing import Any


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
            pages[code] = {
                "owner_id": owner_id,
                "blocks": blocks,
                "buttons": buttons,
                "buttons_per_row": buttons_per_row,
                "buttons_align": buttons_align,
            }
            self._write(pages)
            return code

    async def get(self, page_id: str) -> dict[str, Any] | None:
        async with self._lock:
            page = self._read().get(page_id)
            return page if isinstance(page, dict) else None

    async def delete(self, page_id: str, owner_id: int) -> bool:
        async with self._lock:
            pages = self._read()
            page = pages.get(page_id)
            if not isinstance(page, dict) or int(page.get("owner_id", 0)) != owner_id:
                return False
            pages.pop(page_id, None)
            self._write(pages)
            return True


page_registry = PageRegistry()
