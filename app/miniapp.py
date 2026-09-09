"""Stable public facade for the Mini App backend.

Implementation lives in :mod:`app.webapp`; this module remains intentionally
small so existing imports such as ``from app.miniapp import mini_app_url`` keep
working while the HTTP backend stays feature-scoped.
"""

from __future__ import annotations

from aiohttp import web

from app.services.page_registry import page_registry
from app.webapp.auth import miniapp_user as _miniapp_user
from app.webapp.auth import verify_init_data as _verify_init_data
from app.webapp.constants import BETA_VERSION, MAX_PAGE_BLOCKS
from app.webapp.pages import (
    api_create_page,
    api_destinations,
    api_me,
    api_page,
    api_pages,
    api_save_page,
    api_send_page,
    page_content as _page_content,
)
from app.webapp.server import (
    STATIC_DIR,
    build_web_app,
    health,
    index,
    mini_app_url,
    start_mini_app_server,
)

__all__ = [
    "BETA_VERSION",
    "MAX_PAGE_BLOCKS",
    "STATIC_DIR",
    "api_create_page",
    "api_destinations",
    "api_me",
    "api_page",
    "api_pages",
    "api_save_page",
    "api_send_page",
    "build_web_app",
    "health",
    "index",
    "mini_app_url",
    "start_mini_app_server",
]
