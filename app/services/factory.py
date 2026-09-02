"""Compatibility facade for block construction.

New code should import from :mod:`app.editor.builders`,
:mod:`app.editor.models`, or :mod:`app.editor.registry` directly. Keeping this
module thin preserves the stable import surface while block-specific logic
lives outside the router layer.
"""
from __future__ import annotations

from app.editor.builders import (
    container_data,
    details_data,
    list_data,
    map_data,
    new_block,
    preformatted_data,
    quote_data,
    table_data,
    text_data,
)
from app.editor.specs import (
    FINAL_RICH_BLOCK_TYPES,
    MEDIA_CAPTION_TYPES,
    QUOTE_TYPES,
    compatible_child_block_types,
)

__all__ = [
    "FINAL_RICH_BLOCK_TYPES",
    "MEDIA_CAPTION_TYPES",
    "QUOTE_TYPES",
    "compatible_child_block_types",
    "container_data",
    "details_data",
    "list_data",
    "map_data",
    "new_block",
    "preformatted_data",
    "quote_data",
    "table_data",
    "text_data",
]
