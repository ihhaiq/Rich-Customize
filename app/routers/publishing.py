from __future__ import annotations

from aiogram import Router

from app.routers.publish_actions import router as actions_router
from app.routers.publish_destinations import router as destinations_router
from app.routers.publish_settings import router as settings_router


router = Router(name="publishing")
router.include_router(destinations_router)
router.include_router(settings_router)
router.include_router(actions_router)

__all__ = ["router"]
