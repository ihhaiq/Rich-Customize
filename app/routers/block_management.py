from __future__ import annotations

from typing import Any

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

LEGACY_BLOCK_CALLBACKS = frozenset({
    "add_block_menu",
    "open_list_type_menu",
    "choose_list_type",
    "choose_add_block",
    "choose_heading_level",
    "open_block",
    "table_options",
    "choose_table_action",
    "apply_table_cell_action",
    "edit_block",
    "toggle_checklist_task",
    "edit_block_field",
    "ask_delete",
    "confirm_delete",
    "move_menu",
    "move_one_step",
    "move_to",
})
LEGACY_BLOCK_MESSAGES = frozenset({
    "receive_added_block",
    "receive_replacement",
})


def _handler_name(handler: Any) -> str:
    return str(getattr(getattr(handler, "callback", None), "__name__", ""))


def _detach_named_handlers(observer: Any, names: frozenset[str]) -> tuple[str, ...]:
    removed: list[str] = []
    kept = []
    for handler in observer.handlers:
        name = _handler_name(handler)
        if name in names:
            removed.append(name)
        else:
            kept.append(handler)
    observer.handlers[:] = kept
    return tuple(removed)


def detach_legacy_block_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    return {
        "callback_query": _detach_named_handlers(
            legacy_module.router.callback_query,
            LEGACY_BLOCK_CALLBACKS,
        ),
        "message": _detach_named_handlers(
            legacy_module.router.message,
            LEGACY_BLOCK_MESSAGES,
        ),
    }


def legacy_block_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    return {
        "callback_query": tuple(
            _handler_name(handler)
            for handler in legacy_module.router.callback_query.handlers
            if _handler_name(handler) in LEGACY_BLOCK_CALLBACKS
        ),
        "message": tuple(
            _handler_name(handler)
            for handler in legacy_module.router.message.handlers
            if _handler_name(handler) in LEGACY_BLOCK_MESSAGES
        ),
    }


__all__ = [
    "LEGACY_BLOCK_CALLBACKS",
    "LEGACY_BLOCK_MESSAGES",
    "detach_legacy_block_handlers",
    "legacy_block_handlers",
    "router",
]
