from __future__ import annotations

from typing import Any

from aiogram import Router

from app.routers.editor_entry import router as entry_router
from app.routers.editor_navigation import router as navigation_router
from app.routers.editor_preview import router as preview_router
from app.routers.editor_showcase import router as showcase_router


router = Router(name="editor_session")
router.include_router(showcase_router)
router.include_router(preview_router)
router.include_router(navigation_router)
router.include_router(entry_router)


LEGACY_SESSION_CALLBACKS = frozenset({
    "start_editor_from_button",
    "showcase_from_button",
    "no_op",
    "back_to_main",
    "open_editor_tools",
    "preview",
})
LEGACY_SESSION_MESSAGES = frozenset({
    "start",
    "new_editor",
    "showcase_from_message",
    "receive_source",
    "import_rich_message_into_editor",
    "managing_extra_message",
})
LEGACY_SESSION_CHANNEL_POSTS = frozenset({"remember_showcase_media"})


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


def detach_legacy_session_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    return {
        "callback_query": _detach_named_handlers(
            legacy_module.router.callback_query, LEGACY_SESSION_CALLBACKS,
        ),
        "message": _detach_named_handlers(
            legacy_module.router.message, LEGACY_SESSION_MESSAGES,
        ),
        "channel_post": _detach_named_handlers(
            legacy_module.router.channel_post, LEGACY_SESSION_CHANNEL_POSTS,
        ),
    }


def legacy_session_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    observers = {
        "callback_query": (
            legacy_module.router.callback_query, LEGACY_SESSION_CALLBACKS,
        ),
        "message": (legacy_module.router.message, LEGACY_SESSION_MESSAGES),
        "channel_post": (
            legacy_module.router.channel_post, LEGACY_SESSION_CHANNEL_POSTS,
        ),
    }
    return {
        name: tuple(
            _handler_name(handler)
            for handler in observer.handlers
            if _handler_name(handler) in names
        )
        for name, (observer, names) in observers.items()
    }


__all__ = [
    "LEGACY_SESSION_CALLBACKS",
    "LEGACY_SESSION_CHANNEL_POSTS",
    "LEGACY_SESSION_MESSAGES",
    "detach_legacy_session_handlers",
    "legacy_session_handlers",
    "router",
]
