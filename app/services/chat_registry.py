from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Any

from app.storage import HybridJSONRepository


def _registry_path() -> Path:
    configured = os.getenv("MANAGED_CHATS_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "managed_chats.json"


class ManagedChatRegistry:
    """Persist chats associated with the administrator who added the bot."""

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _registry_path()
        self._lock = asyncio.Lock()
        self._repository = HybridJSONRepository("managed_chats", self.path)

    async def _read_document(self) -> dict[str, Any]:
        value = await self._repository.read()
        if not isinstance(value, dict):
            return {"users": {}, "panels": {}}
        users = value.get("users", {})
        panels = value.get("panels", {})
        return {
            "users": users if isinstance(users, dict) else {},
            "panels": panels if isinstance(panels, dict) else {},
        }

    async def _write_document(self, document: dict[str, Any]) -> None:
        await self._repository.write(document)

    async def remember(
        self,
        user_id: int,
        chat_id: int,
        title: str,
        chat_type: str,
    ) -> None:
        async with self._lock:
            document = await self._read_document()
            users = document["users"]
            chats = users.setdefault(str(user_id), {})
            chats[str(chat_id)] = {
                "chat_id": chat_id,
                "title": title,
                "type": chat_type,
            }
            await self._write_document(document)

    async def list_for_user(self, user_id: int) -> list[dict[str, Any]]:
        async with self._lock:
            chats = (await self._read_document())["users"].get(str(user_id), {})
            if not isinstance(chats, dict):
                return []
            result = [item for item in chats.values() if isinstance(item, dict)]
            return sorted(result, key=lambda item: str(item.get("title", "")).casefold())

    async def remember_panel(
        self,
        user_id: int,
        chat_id: int,
        message_id: int,
        selected_chat_ids: list[int] | None = None,
    ) -> None:
        async with self._lock:
            document = await self._read_document()
            document["panels"][str(user_id)] = {
                "chat_id": chat_id,
                "message_id": message_id,
                "selected_chat_ids": selected_chat_ids or [],
            }
            await self._write_document(document)

    async def panel_for_user(self, user_id: int) -> dict[str, Any] | None:
        async with self._lock:
            panel = (await self._read_document())["panels"].get(str(user_id))
            if not isinstance(panel, dict):
                return None
            try:
                return {
                    "chat_id": int(panel["chat_id"]),
                    "message_id": int(panel["message_id"]),
                    "selected_chat_ids": [
                        int(item) for item in panel.get("selected_chat_ids", [])
                    ],
                }
            except (KeyError, TypeError, ValueError):
                return None

    async def clear_panel(self, user_id: int) -> None:
        async with self._lock:
            document = await self._read_document()
            if document["panels"].pop(str(user_id), None) is not None:
                await self._write_document(document)

    async def remove(self, user_id: int, chat_id: int) -> None:
        async with self._lock:
            document = await self._read_document()
            users = document["users"]
            chats = users.get(str(user_id), {})
            if not isinstance(chats, dict) or chats.pop(str(chat_id), None) is None:
                return
            if not chats:
                users.pop(str(user_id), None)
            await self._write_document(document)

    async def remove_chat(self, chat_id: int) -> None:
        async with self._lock:
            document = await self._read_document()
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
                await self._write_document(document)


managed_chat_registry = ManagedChatRegistry()
