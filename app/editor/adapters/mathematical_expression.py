from __future__ import annotations

from app.editor.adapters.base import BlockAdapter, InputKind

ADAPTER = BlockAdapter(
    block_type="mathematical_expression",
    input_kind=InputKind.NATIVE,
    aliases=(),
    child_types=(),
    supports_caption=False,
)

__all__ = ["ADAPTER"]
