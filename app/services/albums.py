from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import TypeAlias

from aiogram.types import Message


AlbumKey: TypeAlias = tuple[int, int, str]


class AlbumCollector:
    def __init__(self, quiet_seconds: float = 0.8) -> None:
        self.quiet_seconds = quiet_seconds
        self._items: dict[AlbumKey, list[Message]] = defaultdict(list)
        self._versions: dict[AlbumKey, int] = defaultdict(int)
        self._lock = asyncio.Lock()

    async def collect(self, message: Message) -> list[Message] | None:
        assert message.media_group_id and message.from_user
        key = (message.chat.id, message.from_user.id, message.media_group_id)
        async with self._lock:
            self._items[key].append(message)
            self._versions[key] += 1
            version = self._versions[key]
        await asyncio.sleep(self.quiet_seconds)
        async with self._lock:
            if self._versions.get(key) != version:
                return None
            items = self._items.pop(key, [])
            self._versions.pop(key, None)
            return items

