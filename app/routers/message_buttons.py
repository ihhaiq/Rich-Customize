from aiogram import Router

from app.routers.button_actions import router as actions_router
from app.routers.button_input import router as input_router
from app.routers.button_target_picker import router as target_picker_router

router = Router(name="message_buttons")
router.include_router(target_picker_router)
router.include_router(actions_router)
router.include_router(input_router)

__all__ = ["router"]
