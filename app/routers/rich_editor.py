from __future__ import annotations

from aiogram import Router

from app.routers.block_management import router as block_management_router
from app.routers.block_preview import router as block_preview_router
from app.routers.details import router as details_router
from app.routers.developer import router as developer_router
from app.routers.editor_session import router as editor_session_router
from app.routers.history import router as history_router
from app.routers.math_ready import router as math_ready_router
from app.routers.media_events import router as media_events_router
from app.routers.message_buttons import router as message_buttons_router
from app.routers.miniapp import router as miniapp_router
from app.routers.pages import router as pages_router
from app.routers.page_navigation_router import open_page_link, restore_original_message
from app.routers.publishing import router as publishing_router

router = Router(name="rich_editor")
router.include_router(developer_router)
router.include_router(miniapp_router)
router.include_router(block_preview_router)
router.include_router(media_events_router)
router.include_router(details_router)
router.include_router(history_router)
# Native Math gets first chance to consume ready Rich Messages.
router.include_router(math_ready_router)
router.include_router(block_management_router)
router.include_router(message_buttons_router)
router.include_router(pages_router)
router.include_router(publishing_router)
router.include_router(editor_session_router)

__all__ = ["open_page_link", "restore_original_message", "router"]
