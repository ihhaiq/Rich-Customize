from __future__ import annotations

from app.editor.adapters.base import BlockAdapter, InputKind

ADAPTER = BlockAdapter(
    block_type="paragraph",
    input_kind=InputKind.TEXT,
    aliases=('text',),
    child_types=(),
    supports_caption=False,
)

__all__ = ["ADAPTER"]
