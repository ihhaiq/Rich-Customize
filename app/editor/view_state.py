from __future__ import annotations

from contextvars import ContextVar
from typing import Any


BLOCK_SCROLL_SIZE = 8
_block_scroll_offset: ContextVar[int] = ContextVar("block_scroll_offset", default=0)


def normalize_block_scroll_offset(block_count: int, value: Any) -> int:
    if block_count <= 0:
        return 0
    try:
        raw_offset = max(0, int(value or 0))
    except (TypeError, ValueError):
        raw_offset = 0
    last_offset = ((block_count - 1) // BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE
    clamped = min(raw_offset, last_offset)
    return (clamped // BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE


def current_block_scroll_offset() -> int:
    return _block_scroll_offset.get()


def set_block_scroll_offset(value: Any) -> int:
    try:
        normalized = max(0, int(value or 0))
    except (TypeError, ValueError):
        normalized = 0
    _block_scroll_offset.set(normalized)
    return normalized


__all__ = [
    "BLOCK_SCROLL_SIZE",
    "current_block_scroll_offset",
    "normalize_block_scroll_offset",
    "set_block_scroll_offset",
]
