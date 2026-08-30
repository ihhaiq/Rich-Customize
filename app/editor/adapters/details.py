from __future__ import annotations

from app.editor.adapters.base import BlockAdapter, InputKind

ADAPTER = BlockAdapter(
    block_type="details",
    input_kind=InputKind.CONTAINER,
    aliases=(),
    child_types=('paragraph', 'heading', 'preformatted', 'footer', 'divider', 'mathematical_expression', 'anchor', 'list', 'blockquote', 'pullquote', 'table', 'collage', 'slideshow', 'map', 'animation', 'audio', 'document', 'photo', 'video', 'voice'),
    supports_caption=False,
)

__all__ = ["ADAPTER"]
