from __future__ import annotations

from app.editor.adapters.base import BlockAdapter, InputKind

ADAPTER = BlockAdapter(
    block_type="audio",
    input_kind=InputKind.TELEGRAM,
    aliases=(),
    child_types=(),
    supports_caption=True,
)

__all__ = ["ADAPTER"]
