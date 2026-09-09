from __future__ import annotations

import asyncio
import os
from pathlib import Path

from app.storage import HybridJSONRepository


def _registry_path() -> Path:
    configured = os.getenv("BUTTON_POPUPS_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "button_popups.json"


class PopupRegistry:
    """Persist callback alert text so published Popup buttons survive restarts."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _registry_path()
        self._lock = asyncio.Lock()
        self._repository = HybridJSONRepository("button_popups", self.path)

    async def _read(self) -> dict[str, str]:
        value = await self._repository.read()
        popups = value.get("popups", {}) if isinstance(value, dict) else {}
        return {
            str(key): str(text)
            for key, text in popups.items()
            if isinstance(key, str) and isinstance(text, str)
        } if isinstance(popups, dict) else {}

    async def _write(self, popups: dict[str, str]) -> None:
        await self._repository.write({"popups": popups})

    async def remember(self, button_id: str, text: str) -> None:
        async with self._lock:
            popups = await self._read()
            popups[button_id] = text
            await self._write(popups)

    async def get(self, button_id: str) -> str | None:
        async with self._lock:
            return (await self._read()).get(button_id)

    async def remove(self, button_id: str) -> None:
        async with self._lock:
            popups = await self._read()
            if popups.pop(button_id, None) is not None:
                await self._write(popups)


popup_registry = PopupRegistry()
