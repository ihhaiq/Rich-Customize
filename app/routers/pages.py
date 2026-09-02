from __future__ import annotations

from aiogram import Router

from app.routers.page_actions import router as actions_router
from app.routers.page_delivery import router as delivery_router
from app.routers.page_navigation_router import (
    open_page_link,
    restore_original_message,
    router as navigation_router,
)
from app.routers.page_search import router as search_router


router = Router(name="pages")
router.include_router(actions_router)
router.include_router(search_router)
router.include_router(delivery_router)
router.include_router(navigation_router)

__all__ = [
    "open_page_link",
    "restore_original_message",
    "router",
]
