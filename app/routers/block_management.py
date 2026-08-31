from aiogram import Router

from app.routers.block_actions import router as actions_router
from app.routers.block_add import router as add_router
from app.routers.block_edit import router as edit_router
from app.routers.block_table import router as table_router

router = Router(name="block_management")
router.include_router(add_router)
router.include_router(actions_router)
router.include_router(table_router)
router.include_router(edit_router)

__all__ = ["router"]
