from __future__ import annotations

import json
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

try:
    import rich_core_native as _native
except (ImportError, OSError):  # Native extension is optional outside Docker/CI.
    _native = None

_DISABLED_VALUES = {"0", "false", "no", "off"}


def native_available() -> bool:
    """Return whether the Rust core is importable and enabled."""
    enabled = os.getenv("RICH_CORE_NATIVE", "1").strip().casefold() not in _DISABLED_VALUES
    return enabled and _native is not None


def _decode_json(callable_name: str, value: str) -> Any | None:
    if not native_available():
        return None
    try:
        raw = getattr(_native, callable_name)(value)
        return json.loads(raw)
    except Exception:
        # The native path is an optimization. Any extension/runtime issue must
        # preserve the Python implementation instead of breaking the editor.
        logger.debug("Rust rich core call %s failed; using Python fallback", callable_name, exc_info=True)
        return None


def parse_inline_markers(text: str) -> list[dict[str, Any]] | None:
    """Parse inline rich-button markers with the Rust core when available."""
    parsed = _decode_json("parse_inline_markers_json", text)
    if parsed is None:
        return None
    if not isinstance(parsed, list) or not all(isinstance(item, dict) for item in parsed):
        return None
    return parsed


def html_to_rich(value: str) -> Any | None:
    """Convert Telegram inline HTML to the RichText JSON shape via Rust."""
    return _decode_json("html_to_rich_json", value)


__all__ = ["html_to_rich", "native_available", "parse_inline_markers"]
