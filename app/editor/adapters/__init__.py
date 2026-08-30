from __future__ import annotations

from app.editor.adapters.paragraph import ADAPTER as PARAGRAPH_ADAPTER
from app.editor.adapters.heading import ADAPTER as HEADING_ADAPTER
from app.editor.adapters.preformatted import ADAPTER as PREFORMATTED_ADAPTER
from app.editor.adapters.footer import ADAPTER as FOOTER_ADAPTER
from app.editor.adapters.divider import ADAPTER as DIVIDER_ADAPTER
from app.editor.adapters.mathematical_expression import ADAPTER as MATH_ADAPTER
from app.editor.adapters.anchor import ADAPTER as ANCHOR_ADAPTER
from app.editor.adapters.list import ADAPTER as LIST_ADAPTER
from app.editor.adapters.blockquote import ADAPTER as BLOCKQUOTE_ADAPTER
from app.editor.adapters.pullquote import ADAPTER as PULLQUOTE_ADAPTER
from app.editor.adapters.collage import ADAPTER as COLLAGE_ADAPTER
from app.editor.adapters.slideshow import ADAPTER as SLIDESHOW_ADAPTER
from app.editor.adapters.table import ADAPTER as TABLE_ADAPTER
from app.editor.adapters.details import ADAPTER as DETAILS_ADAPTER
from app.editor.adapters.map import ADAPTER as MAP_ADAPTER
from app.editor.adapters.animation import ADAPTER as ANIMATION_ADAPTER
from app.editor.adapters.audio import ADAPTER as AUDIO_ADAPTER
from app.editor.adapters.document import ADAPTER as DOCUMENT_ADAPTER
from app.editor.adapters.photo import ADAPTER as PHOTO_ADAPTER
from app.editor.adapters.video import ADAPTER as VIDEO_ADAPTER
from app.editor.adapters.voice import ADAPTER as VOICE_ADAPTER

DEFAULT_ADAPTERS = (
    PARAGRAPH_ADAPTER,
    HEADING_ADAPTER,
    PREFORMATTED_ADAPTER,
    FOOTER_ADAPTER,
    DIVIDER_ADAPTER,
    MATH_ADAPTER,
    ANCHOR_ADAPTER,
    LIST_ADAPTER,
    BLOCKQUOTE_ADAPTER,
    PULLQUOTE_ADAPTER,
    COLLAGE_ADAPTER,
    SLIDESHOW_ADAPTER,
    TABLE_ADAPTER,
    DETAILS_ADAPTER,
    MAP_ADAPTER,
    ANIMATION_ADAPTER,
    AUDIO_ADAPTER,
    DOCUMENT_ADAPTER,
    PHOTO_ADAPTER,
    VIDEO_ADAPTER,
    VOICE_ADAPTER,
)

__all__ = ["DEFAULT_ADAPTERS"]
