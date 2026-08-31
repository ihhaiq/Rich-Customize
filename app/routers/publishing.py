from __future__ import annotations

from typing import Any

from aiogram import Router

from app.routers.publish_actions import router as actions_router
from app.routers.publish_destinations import router as destinations_router
from app.routers.publish_settings import router as settings_router


router = Router(name="publishing")
router.include_router(destinations_router)
router.include_router(settings_router)
router.include_router(actions_router)


LEGACY_PUBLISH_CALLBACKS = frozenset({
    "open_post_chats",
    "return_to_post_chats",
    "select_post_chat",
    "open_post_settings",
    "toggle_post_option",
    "send_post",
})
LEGACY_PUBLISH_MEMBERS = frozenset({"remember_publish_chat"})


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


def detach_legacy_publish_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    return {
        "callback_query": _detach_named_handlers(
            legacy_module.router.callback_query,
            LEGACY_PUBLISH_CALLBACKS,
        ),
        "my_chat_member": _detach_named_handlers(
            legacy_module.router.my_chat_member,
            LEGACY_PUBLISH_MEMBERS,
        ),
    }


def legacy_publish_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    return {
        "callback_query": tuple(
            _handler_name(handler)
            for handler in legacy_module.router.callback_query.handlers
            if _handler_name(handler) in LEGACY_PUBLISH_CALLBACKS
        ),
        "my_chat_member": tuple(
            _handler_name(handler)
            for handler in legacy_module.router.my_chat_member.handlers
            if _handler_name(handler) in LEGACY_PUBLISH_MEMBERS
        ),
    }


__all__ = [
    "LEGACY_PUBLISH_CALLBACKS",
    "LEGACY_PUBLISH_MEMBERS",
    "detach_legacy_publish_handlers",
    "legacy_publish_handlers",
    "router",
]
