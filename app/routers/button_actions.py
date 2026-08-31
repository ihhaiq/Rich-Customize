"""Button callback composition root.

The previous monolithic router mixed manager UI, creation, mutations, previews,
and public popup callbacks. Keep this module as a stable import surface while
feature routers own those responsibilities separately.
"""
from aiogram import Router

from app.routers.button_create import (
    choose_new_button_type,
    router as create_router,
    select_button_page,
    start_add_button,
)
from app.routers.button_manager import (
    change_buttons_per_row,
    choose_button_action,
    open_buttons_manager,
    router as manager_router,
    select_message_button,
)
from app.routers.button_modify import (
    change_button_position,
    change_button_style,
    change_button_type,
    router as modify_router,
)
from app.routers.button_preview_actions import (
    close_buttons_preview,
    preview_message_buttons,
    router as preview_router,
    show_inline_popup_button,
    show_popup_button,
)

router = Router(name="button_actions")
router.include_router(manager_router)
router.include_router(create_router)
router.include_router(modify_router)
router.include_router(preview_router)

__all__ = [
    "change_button_position",
    "change_button_style",
    "change_button_type",
    "change_buttons_per_row",
    "choose_button_action",
    "choose_new_button_type",
    "close_buttons_preview",
    "open_buttons_manager",
    "preview_message_buttons",
    "router",
    "select_button_page",
    "select_message_button",
    "show_inline_popup_button",
    "show_popup_button",
    "start_add_button",
]
