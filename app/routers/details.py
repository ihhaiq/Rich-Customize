from aiogram import Router

from app.routers.details_builder import router as builder_router
from app.routers.details_edit import router as edit_router
from app.routers.details_manager import router as manager_router

router = Router(name="details")
router.include_router(builder_router)
router.include_router(manager_router)
router.include_router(edit_router)

__all__ = ["router"]
