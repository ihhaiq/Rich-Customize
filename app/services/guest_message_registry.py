from __future__ import annotations

import asyncio
import json
import os
import time
from pathlib import Path
from typing import Any


def _registry_path() -> Path:
    configured = os.getenv("GUEST_MESSAGES_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "guest_messages.json"


class GuestMessageRegistry:
    """Map guest inline message IDs back to the chat that summoned the bot."""

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

    def _write(self, messages: dict[str, dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(
            json.dumps(messages, ensure_ascii=False, indent=2), encoding="utf-8",
        )
        temporary.replace(self.path)

    async def remember(
        self, inline_message_id: str, chat_id: int, chat_type: str,
    ) -> None:
        if not inline_message_id:
            return
        async with self._lock:
            messages = self._read()
            messages[inline_message_id] = {
                "chat_id": int(chat_id),
                "chat_type": str(chat_type),
                "created_at": int(time.time()),
            }
            self._write(messages)

    async def get(self, inline_message_id: str) -> dict[str, Any] | None:
        if not inline_message_id:
            return None
        async with self._lock:
            value = self._read().get(inline_message_id)
            if not isinstance(value, dict):
                return None
            try:
                chat_id = int(value["chat_id"])
            except (KeyError, TypeError, ValueError):
                return None
            return {
                **value,
                "chat_id": chat_id,
                "chat_type": str(value.get("chat_type", "")),
            }


guest_message_registry = GuestMessageRegistry()
