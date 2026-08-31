"""Empty migration placeholder pending the approved final deletion.

All editor features are owned and registered by dedicated modules. Nothing in
the application imports or includes this router anymore.
"""

from __future__ import annotations

import logging

from aiogram import Router

from app.keyboards import (
    build_rich_editor_keyboard,
    build_table_options_keyboard,
)
from app.services.blocks import get_block_by_id
from app.services.guest_message_registry import guest_message_registry
from app.services.page_navigation import page_navigation_registry
from app.services.page_registry import page_registry
from app.services.renderer import build_input_rich_message


router = Router(name="rich_editor")
logger = logging.getLogger(__name__)


__all__ = [
    "build_input_rich_message",
    "build_rich_editor_keyboard",
    "build_table_options_keyboard",
    "get_block_by_id",
    "guest_message_registry",
    "logger",
    "page_navigation_registry",
    "page_registry",
    "router",
]
