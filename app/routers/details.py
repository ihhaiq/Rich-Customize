from __future__ import annotations

from typing import Any

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


def install_into(legacy_module: Any) -> tuple[str, ...]:
    """Bridge generic legacy handlers to the extracted Details implementation."""
    legacy_module._details_children = details_children
    legacy_module._details_child = details_child
    legacy_module._details_builder_text = details_builder_text
    legacy_module._details_inner_list_text = details_inner_list_text
    legacy_module._details_inner_page = details_inner_page
    legacy_module._store_details_child = store_pending_details_child
    legacy_module._receive_nested_replacement = receive_nested_replacement
    return detach_legacy_details_handlers(legacy_module)


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
    "install_into",
    "legacy_details_handlers",
    "move_details_child",
    "receive_nested_replacement",
    "replace_details_child",
    "replace_details_children",
    "router",
    "store_pending_details_child",
]
