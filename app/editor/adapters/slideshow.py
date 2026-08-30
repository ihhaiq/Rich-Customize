from __future__ import annotations

from app.editor.adapters.base import BlockAdapter, InputKind

ADAPTER = BlockAdapter(
    block_type="slideshow",
    input_kind=InputKind.CONTAINER,
    aliases=(),
    child_types=('photo', 'video'),
    supports_caption=True,
)

__all__ = ["ADAPTER"]
