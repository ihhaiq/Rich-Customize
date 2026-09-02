from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path
from typing import Any, Iterable

logger = logging.getLogger(__name__)

MEDIA_TYPES = {"photo", "video", "animation", "audio", "voice", "document"}
MEDIA_NATIVE_FIELDS = {
    "photo": "photo",
    "video": "video",
    "animation": "animation",
    "audio": "audio",
    "document": "document",
    "voice": "voice_note",
}


def _state_path() -> Path:
    configured = os.getenv("RICH_MEDIA_STATE", "").strip()
    return Path(configured) if configured else Path("data") / "rich_media.json"


def _ttl_seconds() -> int:
    try:
        return max(3600, int(os.getenv("RICH_MEDIA_TTL_SECONDS", "604800")))
    except ValueError:
        return 604800


def cleanup_interval_seconds() -> int:
    try:
        return max(3600, int(os.getenv("RICH_MEDIA_CLEANUP_INTERVAL", "21600")))
    except ValueError:
        return 21600


def _as_file_dict(value: Any) -> dict[str, Any] | None:
    if isinstance(value, list):
        candidates = [item for item in value if isinstance(item, dict)]
        value = candidates[-1] if candidates else None
    if not isinstance(value, dict) or not value.get("file_id"):
        return None
    result = dict(value)
    result["file_id"] = str(result["file_id"])
    return result


def native_file_data(raw: dict[str, Any], block_type: str) -> dict[str, Any] | None:
    field = MEDIA_NATIVE_FIELDS.get(block_type)
    return _as_file_dict(raw.get(field)) if field else None


def file_data(block: dict[str, Any]) -> dict[str, Any] | None:
    data = block.get("data") or {}
    direct = _as_file_dict(data.get("file"))
    if direct:
        return direct
    native = data.get("native_data")
    if isinstance(native, dict):
        return native_file_data(native, str(block.get("type", "")))
    return None


def file_id(block: dict[str, Any]) -> str | None:
    value = file_data(block)
    return str(value["file_id"]) if value else None


def iter_media_blocks(blocks: Iterable[dict[str, Any]]) -> Iterable[dict[str, Any]]:
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if block.get("type") in MEDIA_TYPES:
            yield block
        data = block.get("data") or {}
        for key in ("children", "media_children"):
            children = data.get(key)
            if isinstance(children, list):
                yield from iter_media_blocks(children)


class MediaStore:
    """Persistent metadata cache for Telegram reusable media ids.

    Telegram owns the actual file. Cleanup only removes our local metadata entry;
    it never deletes a Telegram file. Saved pages pin referenced ids so cleanup
    cannot evict their metadata while a page code still uses them.
    """

    def __init__(self, path: Path | None = None, ttl: int | None = None) -> None:
        self.path = path or _state_path()
        self.ttl = ttl or _ttl_seconds()

    def _read(self) -> dict[str, dict[str, Any]]:
        if not self.path.exists():
            return {}
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return {}
        return raw if isinstance(raw, dict) else {}

    def _write(self, items: dict[str, dict[str, Any]]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(self.path.suffix + ".tmp")
        temporary.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(self.path)

    def remember_blocks(self, blocks: Iterable[dict[str, Any]]) -> None:
        now = int(time.time())
        items = self._read()
        changed = False
        for block in iter_media_blocks(blocks):
            metadata = file_data(block)
            if not metadata:
                continue
            fid = str(metadata["file_id"])
            current = items.get(fid, {})
            raw_refs = current.get("page_refs")
            refs: list[Any] = raw_refs if isinstance(raw_refs, list) else []
            items[fid] = {
                "kind": str(block.get("type", "media")),
                "file_unique_id": metadata.get("file_unique_id"),
                "last_seen": now,
                "expires_at": None if refs else now + self.ttl,
                "page_refs": sorted({str(item) for item in refs}),
            }
            changed = True
        if changed:
            self._write(items)

    def pin_page(self, page_id: str, blocks: Iterable[dict[str, Any]]) -> None:
        page_id = str(page_id)
        now = int(time.time())
        items = self._read()
        wanted: dict[str, tuple[str, dict[str, Any]]] = {}
        for block in iter_media_blocks(blocks):
            metadata = file_data(block)
            if metadata:
                wanted[str(metadata["file_id"])] = (str(block.get("type", "media")), metadata)

        changed = False
        for fid, current in list(items.items()):
            refs = {str(item) for item in current.get("page_refs", []) if item}
            if page_id in refs and fid not in wanted:
                refs.discard(page_id)
                current["page_refs"] = sorted(refs)
                current["expires_at"] = None if refs else now + self.ttl
                changed = True

        for fid, (kind, metadata) in wanted.items():
            current = items.get(fid, {})
            refs = {str(item) for item in current.get("page_refs", []) if item}
            refs.add(page_id)
            items[fid] = {
                "kind": kind,
                "file_unique_id": metadata.get("file_unique_id") or current.get("file_unique_id"),
                "last_seen": now,
                "expires_at": None,
                "page_refs": sorted(refs),
            }
            changed = True
        if changed:
            self._write(items)

    def unpin_page(self, page_id: str) -> None:
        page_id = str(page_id)
        now = int(time.time())
        items = self._read()
        changed = False
        for current in items.values():
            refs = {str(item) for item in current.get("page_refs", []) if item}
            if page_id not in refs:
                continue
            refs.discard(page_id)
            current["page_refs"] = sorted(refs)
            current["expires_at"] = None if refs else now + self.ttl
            changed = True
        if changed:
            self._write(items)

    def cleanup(self) -> int:
        now = int(time.time())
        items = self._read()
        before = len(items)
        kept = {
            fid: item
            for fid, item in items.items()
            if item.get("page_refs")
            or item.get("expires_at") is None
            or int(item.get("expires_at") or 0) > now
        }
        removed = before - len(kept)
        if removed:
            self._write(kept)
            logger.info("Cleaned %s expired rich-media cache entries", removed)
        return removed


media_store = MediaStore()
