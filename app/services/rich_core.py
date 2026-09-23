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
_RAWTEXT_TAG_PREFIXES = ("<script", "</script", "<style", "</style")


def native_available() -> bool:
    """Return whether the Rust core is importable and enabled."""
    enabled = os.getenv("RICH_CORE_NATIVE", "1").strip().casefold() not in _DISABLED_VALUES
    return enabled and _native is not None


def native_max_nesting() -> int | None:
    """Expose the native safety cap for stress/regression tests."""
    if _native is None:
        return None
    value = getattr(_native, "MAX_HTML_NESTING", None)
    return int(value) if isinstance(value, int) else None


def _needs_python_entity_fallback(value: str) -> bool:
    """Keep Python HTML5 entity semantics for cases html-escape handles differently.

    The Rust html-escape crate intentionally decodes exact semicolon-terminated
    named/numeric references, while Python's HTMLParser also accepts legacy
    semicolonless references and applies HTML5 numeric replacement rules. For
    correctness, conservatively route those ambiguous inputs to the Python
    fallback rather than allowing native output to differ silently.
    """
    index = 0
    while True:
        amp = value.find("&", index)
        if amp < 0 or amp + 1 >= len(value):
            return False
        following = value[amp + 1:]

        # Numeric references have HTML5 edge cases (for example C1 control
        # replacements) which html-escape deliberately does not emulate.
        if following.startswith("#"):
            return True

        first = following[0]
        if first.isascii() and first.isalpha():
            end = 1
            while end < len(following):
                char = following[end]
                if not (char.isascii() and char.isalnum()):
                    break
                end += 1
            if end >= len(following) or following[end] != ";":
                return True

        index = amp + 1


def _needs_python_html_fallback(value: str) -> bool:
    """Return True for HTMLParser-specific syntax outside the native subset."""
    folded = value.casefold()
    if any(prefix in folded for prefix in _RAWTEXT_TAG_PREFIXES):
        return True
    return _needs_python_entity_fallback(value)


def _call_native(
    callable_name: str,
    legacy_json_name: str,
    value: str,
) -> Any | None:
    if not native_available():
        return None
    try:
        direct = getattr(_native, callable_name, None)
        if direct is not None:
            return direct(value)

        # Compatibility for an older locally-built POC extension. Production
        # builds expose the direct function and do not pay this JSON round-trip.
        raw = getattr(_native, legacy_json_name)(value)
        return json.loads(raw)
    except Exception:
        # Native acceleration must never take down the editor. Depth limits,
        # ABI/import issues, or parser errors deliberately fall back to Python.
        logger.debug(
            "Rust rich core call %s failed; using Python fallback",
            callable_name,
            exc_info=True,
        )
        return None


def parse_inline_markers(text: str) -> list[dict[str, Any]] | None:
    """Parse inline rich-button markers with the Rust core when available."""
    parsed = _call_native("parse_inline_markers", "parse_inline_markers_json", text)
    if parsed is None:
        return None
    if not isinstance(parsed, list) or not all(isinstance(item, dict) for item in parsed):
        return None
    return parsed


def html_to_rich(value: str) -> Any | None:
    """Convert Telegram inline HTML to RichText via Rust, otherwise return None."""
    if _needs_python_html_fallback(value):
        return None
    return _call_native("html_to_rich", "html_to_rich_json", value)


__all__ = [
    "html_to_rich",
    "native_available",
    "native_max_nesting",
    "parse_inline_markers",
]
