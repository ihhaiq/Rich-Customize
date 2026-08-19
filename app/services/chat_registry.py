from __future__ import annotations

import asyncio
import json
import os
from pathlib import Path
from typing import Any


def _registry_path() -> Path:
    configured = os.getenv("MANAGED_CHATS_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "managed_chats.json"


class ManagedChatRegistry:
    """Persist chats associated with the administrator who added the bot."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _registry_path()
        self._lock = asyncio.Lock()

    def _read_document(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"users": {}, "panels": {}}
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {"users": {}, "panels": {}}
        if not isinstance(value, dict):
            return {"users": {}, "panels": {}}
        users = value.get("users", {})
        panels = value.get("panels", {})
        return {
            "users": users if isinstance(users, dict) else {},
            "panels": panels if isinstance(panels, dict) else {},
        }

    def _write_document(self, document: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(f"{self.path.suffix}.tmp")
        temporary.write_text(
            json.dumps(document, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        temporary.replace(self.path)

    async def remember(
        self,
        user_id: int,
        chat_id: int,
        title: str,
        chat_type: str,
    ) -> None:
        async with self._lock:
            document = self._read_document()
            users = document["users"]
            chats = users.setdefault(str(user_id), {})
            chats[str(chat_id)] = {
                "chat_id": chat_id,
                "title": title,
                "type": chat_type,
            }
            self._write_document(document)

    async def list_for_user(self, user_id: int) -> list[dict[str, Any]]:
        async with self._lock:
            chats = self._read_document()["users"].get(str(user_id), {})
            if not isinstance(chats, dict):
                return []
            result = [item for item in chats.values() if isinstance(item, dict)]
            return sorted(result, key=lambda item: str(item.get("title", "")).casefold())

    async def remember_panel(self, user_id: int, chat_id: int, message_id: int) -> None:
        async with self._lock:
            document = self._read_document()
            document["panels"][str(user_id)] = {
                "chat_id": chat_id,
                "message_id": message_id,
            }
            self._write_document(document)

    async def panel_for_user(self, user_id: int) -> dict[str, int] | None:
        async with self._lock:
            panel = self._read_document()["panels"].get(str(user_id))
            if not isinstance(panel, dict):
                return None
            try:
                return {
                    "chat_id": int(panel["chat_id"]),
                    "message_id": int(panel["message_id"]),
                }
            except (KeyError, TypeError, ValueError):
                return None

    async def clear_panel(self, user_id: int) -> None:
        async with self._lock:
            document = self._read_document()
            if document["panels"].pop(str(user_id), None) is not None:
                self._write_document(document)

    async def remove(self, user_id: int, chat_id: int) -> None:
        async with self._lock:
            document = self._read_document()
            users = document["users"]
            chats = users.get(str(user_id), {})
            if not isinstance(chats, dict) or chats.pop(str(chat_id), None) is None:
                return
            if not chats:
                users.pop(str(user_id), None)
            self._write_document(document)

    async def remove_chat(self, chat_id: int) -> None:
        async with self._lock:
            document = self._read_document()
            users = document["users"]
            changed = False
            empty_users: list[str] = []
            for user_id, chats in users.items():
                if isinstance(chats, dict) and chats.pop(str(chat_id), None) is not None:
                    changed = True
                if not chats:
                    empty_users.append(user_id)
            for user_id in empty_users:
                users.pop(user_id, None)
            if changed:
                self._write_document(document)


managed_chat_registry = ManagedChatRegistry()