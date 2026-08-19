from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path


def _registry_path() -> Path:
    configured = os.getenv("BUTTON_POPUPS_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "button_popups.json"


class PopupRegistry:
    """Persist callback alert text so published Popup buttons survive restarts."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _registry_path()
        self._lock = asyncio.Lock()

    def _read(self) -> dict[str, str]:
        if not self.path.exists():
            return {}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        popups = value.get("popups", {}) if isinstance(value, dict) else {}
        return {
            str(key): str(text)
            for key, text in popups.items()
            if isinstance(key, str) and isinstance(text, str)
        } if isinstance(popups, dict) else {}

    def _write(self, popups: dict[str, str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(
            json.dumps({"popups": popups}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary.replace(self.path)

    async def remember(self, button_id: str, text: str) -> None:
        async with self._lock:
            popups = self._read()
            popups[button_id] = text
            self._write(popups)

    async def get(self, button_id: str) -> str | None:
        async with self._lock:
            return self._read().get(button_id)

    async def remove(self, button_id: str) -> None:
        async with self._lock:
            popups = self._read()
            if popups.pop(button_id, None) is not None:
                self._write(popups)


popup_registry = PopupRegistry()
