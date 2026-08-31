from __future__ import annotations

from aiogram import Router

from app.routers.details_builder import (
    router as builder_router,
    store_pending_details_child,
)
from app.routers.details_edit import (
    receive_nested_replacement,
    router as edit_router,
)
from app.routers.details_manager import router as manager_router
from app.routers.details_support import (
    DETAILS_TYPE,
    LEGACY_DETAILS_CALLBACKS,
    add_details_child,
    delete_details_child,
    detach_legacy_details_handlers,
    detach_native_details,
    details_builder_text,
    details_child,
    details_children,
    details_inner_list_text,
    details_inner_page,
    legacy_details_handlers,
    move_details_child,
    replace_details_child,
    replace_details_children,
)


router = Router(name="details")
router.include_router(builder_router)
router.include_router(manager_router)
router.include_router(edit_router)


__all__ = [
    "DETAILS_TYPE",
    "LEGACY_DETAILS_CALLBACKS",
    "add_details_child",
    "delete_details_child",
    "detach_legacy_details_handlers",
    "detach_native_details",
    "details_builder_text",
    "details_child",
    "details_children",
    "details_inner_list_text",
    "details_inner_page",
    "legacy_details_handlers",
    "move_details_child",
    "receive_nested_replacement",
    "replace_details_child",
    "replace_details_children",
    "router",
    "store_pending_details_child",
]
