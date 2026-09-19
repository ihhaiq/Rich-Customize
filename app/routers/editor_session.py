from __future__ import annotations

from aiogram import Router

from app.routers.editor_entry import router as entry_router
from app.routers.editor_navigation import router as navigation_router
from app.routers.editor_preview import router as preview_router
from app.routers.editor_showcase import router as showcase_router


router = Router(name="editor_session")
router.include_router(showcase_router)
router.include_router(preview_router)
router.include_router(navigation_router)
router.include_router(entry_router)

__all__ = ["router"]
