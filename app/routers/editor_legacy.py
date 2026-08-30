"""Temporary compatibility namespace for the staged editor migration.

All feature handlers and their implementations now live in dedicated modules.
This module intentionally owns no handlers; ``rich_editor`` installs explicit
compatibility exports for modules that have not yet dropped ``editor_core``.
It remains as a narrow bridge until Stage 9 removes that alias.
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
