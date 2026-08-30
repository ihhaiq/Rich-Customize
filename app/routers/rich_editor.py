from __future__ import annotations

from aiogram import Router

from app.routers import editor_core
from app.routers.block_management import (
    install_into as install_block_management,
    router as block_management_router,
)
from app.routers.block_preview import router as block_preview_router
from app.routers.button_guide import install_into as install_button_guide
from app.routers.details import (
    install_into as install_details,
    router as details_router,
)
from app.routers.developer import router as developer_router
from app.routers.history import (
    install_into as install_history,
    router as history_router,
)
from app.routers.math_ready import router as math_ready_router
from app.routers.media_events import router as media_events_router
from app.routers.miniapp import router as miniapp_router


install_button_guide(editor_core.compat_module)
install_details(editor_core.compat_module)
install_history(editor_core.compat_module)
install_block_management(editor_core.compat_module)
editor_core_router = editor_core.router

open_page_link = editor_core.open_page_link
restore_original_message = editor_core.restore_original_message

router = Router(name="rich_editor")
router.include_router(developer_router)
router.include_router(miniapp_router)
router.include_router(block_preview_router)
router.include_router(media_events_router)
# Feature routers own their updates before the remaining compatibility core.
router.include_router(details_router)
router.include_router(history_router)
# Native Math gets first chance to consume ready Rich Messages.
router.include_router(math_ready_router)
router.include_router(block_management_router)
router.include_router(editor_core_router)

__all__ = ["router"]
