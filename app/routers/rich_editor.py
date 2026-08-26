from __future__ import annotations

from aiogram import Router

from app.routers.block_preview import router as block_preview_router
from app.routers.media_events import router as media_events_router
from app.routers.editor_core import router as editor_core_router


router = Router(name="rich_editor")

# Feature routers are registered before the compatibility core so newly split
# handlers own their update types/callbacks without changing existing behavior.
router.include_router(block_preview_router)
router.include_router(media_events_router)
router.include_router(editor_core_router)

__all__ = ["router"]
