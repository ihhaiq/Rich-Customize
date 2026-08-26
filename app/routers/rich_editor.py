from __future__ import annotations

from aiogram import Router

from app.routers import editor_core
from app.routers.block_preview import router as block_preview_router
from app.routers.button_guide import install_into as install_button_guide
from app.routers.media_events import router as media_events_router


# The compatibility core still owns the existing handlers. Feature modules can
# replace focused helpers/handlers while the remaining core is split gradually.
install_button_guide(editor_core)
editor_core_router = editor_core.router

router = Router(name="rich_editor")

# Feature routers are registered before the compatibility core so newly split
# handlers own their update types/callbacks without changing existing behavior.
router.include_router(block_preview_router)
router.include_router(media_events_router)
router.include_router(editor_core_router)

__all__ = ["router"]
