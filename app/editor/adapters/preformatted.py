from __future__ import annotations

from app.editor.adapters.base import BlockAdapter, InputKind

ADAPTER = BlockAdapter(
    block_type="preformatted",
    input_kind=InputKind.TEXT,
    aliases=(),
    child_types=(),
    supports_caption=False,
)

__all__ = ["ADAPTER"]
