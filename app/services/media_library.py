from __future__ import annotations

import asyncio
import json
import logging
import os
import random
from pathlib import Path

from aiogram.types import Message

logger = logging.getLogger(__name__)

SHOWCASE_MEDIA_CHANNEL_ID = int(os.getenv("SHOWCASE_MEDIA_CHANNEL_ID", "-1004433851299"))
MEDIA_LIBRARY_PATH = Path(os.getenv("SHOWCASE_MEDIA_LIBRARY", "data/showcase_media.json"))
SUPPORTED_MEDIA = ("photo", "video", "animation", "audio", "voice")


class ShowcaseMediaLibrary:
    def __init__(self, path: Path = MEDIA_LIBRARY_PATH) -> None:
        self.path = path
        self._lock = asyncio.Lock()
        self._items = self._load()

    def _load(self) -> dict[str, list[str]]:
        empty = {kind: [] for kind in SUPPORTED_MEDIA}
        if not self.path.exists():
            return empty
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            logger.warning("Could not load showcase media library: %s", error)
            return empty
        for kind in SUPPORTED_MEDIA:
            values = raw.get(kind, [])
            if isinstance(values, list):
                empty[kind] = [value for value in values if isinstance(value, str)]
        return empty

    def _extract(self, message: Message) -> tuple[str, str] | None:
        if message.photo:
            return "photo", message.photo[-1].file_id
        for kind in ("video", "animation", "audio", "voice"):
            media = getattr(message, kind, None)
            if media is not None:
                return kind, media.file_id
        return None

    async def remember(self, message: Message) -> str | None:
        extracted = self._extract(message)
        if extracted is None:
            return None
        kind, file_id = extracted
        async with self._lock:
            values = self._items[kind]
            if file_id not in values:
                values.append(file_id)
                # Keep the cache bounded while retaining plenty of random choices.
                self._items[kind] = values[-200:]
                self.path.parent.mkdir(parents=True, exist_ok=True)
                temporary = self.path.with_suffix(self.path.suffix + ".tmp")
                temporary.write_text(
                    json.dumps(self._items, ensure_ascii=False, indent=2),
                    encoding="utf-8",
                )
                temporary.replace(self.path)
        return kind

    def random_id(self, kind: str) -> str | None:
        values = self._items.get(kind, [])
        return random.choice(values) if values else None

    def missing_types(self) -> list[str]:
        return [kind for kind in SUPPORTED_MEDIA if not self._items[kind]]


showcase_media_library = ShowcaseMediaLibrary()
