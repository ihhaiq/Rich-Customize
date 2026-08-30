from __future__ import annotations

from typing import Any

from aiogram import Router

from app.routers.button_actions import router as actions_router
from app.routers.button_input import receive_button_value, router as input_router
from app.routers.button_support import (
    buttons_per_row,
    normalize_button_value,
    prepare_message_buttons,
)
from app.routers.button_target_picker import (
    ask_for_button_user,
    complete_button_target,
    defer_text_for_user_buttons,
    router as target_picker_router,
)


router = Router(name="message_buttons")
router.include_router(target_picker_router)
router.include_router(actions_router)
router.include_router(input_router)


LEGACY_BUTTON_CALLBACKS = frozenset({
    "open_buttons_manager",
    "change_buttons_per_row",
    "start_add_button",
    "choose_new_button_type",
    "choose_button_action",
    "select_message_button",
    "change_button_type",
    "select_button_page",
    "change_button_style",
    "change_button_position",
    "preview_message_buttons",
    "close_buttons_preview",
    "show_popup_button",
    "show_inline_popup_button",
})
LEGACY_BUTTON_MESSAGES = frozenset({
    "receive_button_user",
    "receive_button_channel",
    "wait_for_button_user",
    "receive_button_value",
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


def detach_legacy_button_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    return {
        "callback_query": _detach_named_handlers(
            legacy_module.router.callback_query,
            LEGACY_BUTTON_CALLBACKS,
        ),
        "message": _detach_named_handlers(
            legacy_module.router.message,
            LEGACY_BUTTON_MESSAGES,
        ),
    }


def legacy_button_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    return {
        "callback_query": tuple(
            _handler_name(handler)
            for handler in legacy_module.router.callback_query.handlers
            if _handler_name(handler) in LEGACY_BUTTON_CALLBACKS
        ),
        "message": tuple(
            _handler_name(handler)
            for handler in legacy_module.router.message.handlers
            if _handler_name(handler) in LEGACY_BUTTON_MESSAGES
        ),
    }


def install_into(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    """Install the extracted button feature as the compatibility authority."""
    legacy_module._buttons_per_row = buttons_per_row
    legacy_module._prepare_message_buttons = prepare_message_buttons
    legacy_module._normalize_button_value = normalize_button_value
    legacy_module._ask_for_button_user = ask_for_button_user
    legacy_module._defer_text_for_user_buttons = defer_text_for_user_buttons
    legacy_module._complete_button_target = complete_button_target
    legacy_module.receive_button_value = receive_button_value
    return detach_legacy_button_handlers(legacy_module)


__all__ = [
    "LEGACY_BUTTON_CALLBACKS",
    "LEGACY_BUTTON_MESSAGES",
    "detach_legacy_button_handlers",
    "install_into",
    "legacy_button_handlers",
    "router",
]
