from __future__ import annotations

from app.editor.adapters.base import InputKind
from app.editor.registry import block_registry

FINAL_RICH_BLOCK_TYPES = block_registry.supported_types()
MEDIA_CAPTION_TYPES = frozenset(
    block_type
    for block_type in FINAL_RICH_BLOCK_TYPES
    if (adapter := block_registry.get(block_type)) is not None and adapter.supports_caption
)
QUOTE_TYPES = frozenset({"blockquote", "pullquote"})


def compatible_child_block_types(container_type: str) -> tuple[str, ...]:
    return block_registry.compatible_children(container_type)


def input_kind_for(block_type: str) -> InputKind | None:
    adapter = block_registry.get(block_type)
    return adapter.input_kind if adapter else None


__all__ = [
    "FINAL_RICH_BLOCK_TYPES",
    "MEDIA_CAPTION_TYPES",
    "QUOTE_TYPES",
    "compatible_child_block_types",
    "input_kind_for",
]
