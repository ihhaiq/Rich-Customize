from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import Message

from app.services.media_library import SHOWCASE_MEDIA_CHANNEL_ID
from app.storage import HybridJSONRepository, state_database


logger = logging.getLogger(__name__)
SHOWCASE_CHANNEL_STATE = Path(
    os.getenv("SHOWCASE_CHANNEL_STATE", "data/showcase_channel.json")
)
_COPY_BATCH_SIZE = 100
_STALE_MESSAGE_MARKERS = (
    "MESSAGE_ID_INVALID",
    "MESSAGE_NOT_FOUND",
    "MESSAGE TO COPY NOT FOUND",
    "MESSAGE_TO_COPY_NOT_FOUND",
)


@dataclass(frozen=True, slots=True)
class ShowcaseRefreshResult:
    total: int
    retained: int
    removed: int
    failed_checks: int


class ShowcaseChannelStore:
    """Persist source-channel snapshots used by the showcase content library.

    The store keeps ordered source message IDs plus compact text/rich-message
    snapshots for PostgreSQL-backed persistence, JSON fallback, diagnostics and
    backups. Message IDs are retained only so the developer refresh action can
    validate known channel posts and prune entries that were deleted later.
    """

    def __init__(
        self,
        path: Path = SHOWCASE_CHANNEL_STATE,
        *,
        channel_id: int = SHOWCASE_MEDIA_CHANNEL_ID,
    ) -> None:
        self.path = path
        self.channel_id = channel_id
        self._lock = asyncio.Lock()
        self._repository = HybridJSONRepository("showcase_channel", self.path)
        self._items = self._load(self._repository.read_local_sync())
        state_database.register_reconnect_hook(self.reload)

    @staticmethod
    def _load(raw: Any) -> dict[int, dict[str, Any]]:
        items: dict[int, dict[str, Any]] = {}
        if not isinstance(raw, dict):
            return items
        messages = raw.get("messages", [])
        if not isinstance(messages, list):
            return items
        for item in messages:
            if not isinstance(item, dict):
                continue
            message_id = item.get("message_id")
            if isinstance(message_id, int) and message_id > 0:
                items[message_id] = dict(item)
        return items

    @staticmethod
    def _content_type(message: Message) -> str:
        value = message.content_type
        return value.value if hasattr(value, "value") else str(value)

    @classmethod
    def _snapshot(cls, message: Message) -> dict[str, Any]:
        rich_message = None
        if message.rich_message is not None:
            rich_message = message.rich_message.model_dump(mode="json", exclude_none=True)
        return {
            "message_id": message.message_id,
            "date": int(message.date.timestamp()),
            "media_group_id": message.media_group_id,
            "content_type": cls._content_type(message),
            "text": message.text,
            "caption": message.caption,
            "rich_message": rich_message,
        }

    def _payload(self) -> dict[str, Any]:
        return {
            "channel_id": self.channel_id,
            "updated_at": int(time.time()),
            "messages": [self._items[key] for key in sorted(self._items)],
        }

    @property
    def message_ids(self) -> list[int]:
        return sorted(self._items)

    @property
    def count(self) -> int:
        return len(self._items)

    async def remember(self, message: Message) -> bool:
        if message.chat.id != self.channel_id:
            return False
        snapshot = self._snapshot(message)
        async with self._lock:
            self._items[message.message_id] = snapshot
            await self._repository.write(self._payload())
        return True

    async def reload(self) -> None:
        async with self._lock:
            self._items = self._load(await self._repository.read())

    async def _remove(self, message_ids: set[int]) -> None:
        if not message_ids:
            return
        async with self._lock:
            changed = False
            for message_id in message_ids:
                changed = self._items.pop(message_id, None) is not None or changed
            if changed:
                await self._repository.write(self._payload())

    @staticmethod
    def _is_stale_message(error: TelegramBadRequest) -> bool:
        text = str(error).upper()
        return any(marker in text for marker in _STALE_MESSAGE_MARKERS)

    async def refresh(self, bot: Bot, validation_chat_id: int) -> ShowcaseRefreshResult:
        """Reload persisted state and prune known source messages that no longer exist."""
        await self.reload()
        source_ids = self.message_ids
        stale: set[int] = set()
        temporary_ids: list[int] = []
        failed_checks = 0

        for source_id in source_ids:
            try:
                copied = await bot.copy_message(
                    chat_id=validation_chat_id,
                    from_chat_id=self.channel_id,
                    message_id=source_id,
                    disable_notification=True,
                )
            except TelegramBadRequest as error:
                if self._is_stale_message(error):
                    stale.add(source_id)
                else:
                    failed_checks += 1
                    logger.warning(
                        "Could not validate showcase message_id=%s: %s",
                        source_id,
                        error,
                    )
            except TelegramAPIError as error:
                failed_checks += 1
                logger.warning(
                    "Telegram error while validating showcase message_id=%s: %s",
                    source_id,
                    error,
                )
            else:
                temporary_ids.append(copied.message_id)

        for offset in range(0, len(temporary_ids), _COPY_BATCH_SIZE):
            batch = temporary_ids[offset:offset + _COPY_BATCH_SIZE]
            try:
                await bot.delete_messages(validation_chat_id, batch)
            except TelegramAPIError:
                logger.exception("Could not delete temporary showcase validation copies")

        await self._remove(stale)
        return ShowcaseRefreshResult(
            total=len(source_ids),
            retained=len(source_ids) - len(stale),
            removed=len(stale),
            failed_checks=failed_checks,
        )


showcase_channel_store = ShowcaseChannelStore()


__all__ = [
    "SHOWCASE_CHANNEL_STATE",
    "ShowcaseChannelStore",
    "ShowcaseRefreshResult",
    "showcase_channel_store",
]
