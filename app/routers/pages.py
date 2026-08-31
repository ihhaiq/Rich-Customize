from __future__ import annotations

from typing import Any

from aiogram import Router

from app.routers.page_actions import router as actions_router
from app.routers.page_delivery import router as delivery_router
from app.routers.page_navigation_router import (
    open_page_link,
    restore_original_message,
    router as navigation_router,
)
from app.routers.page_search import router as search_router


router = Router(name="pages")
router.include_router(actions_router)
router.include_router(search_router)
router.include_router(delivery_router)
router.include_router(navigation_router)


LEGACY_PAGE_CALLBACKS = frozenset({
    "save_page",
    "list_pages",
    "request_page_search",
    "open_page_sort",
    "set_page_sort",
    "request_page_rename",
    "confirm_page_delete",
    "delete_saved_page",
    "open_saved_page",
    "open_page_link",
    "open_gated_page_link",
    "navigate_page_back",
    "navigate_page_home",
    "restore_original_message",
})
LEGACY_PAGE_MESSAGES = frozenset({
    "receive_page_name",
    "receive_page_search",
    "receive_page_rename",
})
LEGACY_PAGE_INLINE_QUERIES = frozenset({"find_saved_page_inline"})
LEGACY_PAGE_GUEST_MESSAGES = frozenset({"summon_saved_rich_page"})


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


def detach_legacy_page_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    return {
        "callback_query": _detach_named_handlers(
            legacy_module.router.callback_query,
            LEGACY_PAGE_CALLBACKS,
        ),
        "message": _detach_named_handlers(
            legacy_module.router.message,
            LEGACY_PAGE_MESSAGES,
        ),
        "inline_query": _detach_named_handlers(
            legacy_module.router.inline_query,
            LEGACY_PAGE_INLINE_QUERIES,
        ),
        "guest_message": _detach_named_handlers(
            legacy_module.router.guest_message,
            LEGACY_PAGE_GUEST_MESSAGES,
        ),
    }


def legacy_page_handlers(legacy_module: Any) -> dict[str, tuple[str, ...]]:
    observers = {
        "callback_query": (legacy_module.router.callback_query, LEGACY_PAGE_CALLBACKS),
        "message": (legacy_module.router.message, LEGACY_PAGE_MESSAGES),
        "inline_query": (legacy_module.router.inline_query, LEGACY_PAGE_INLINE_QUERIES),
        "guest_message": (legacy_module.router.guest_message, LEGACY_PAGE_GUEST_MESSAGES),
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
    "LEGACY_PAGE_CALLBACKS",
    "LEGACY_PAGE_GUEST_MESSAGES",
    "LEGACY_PAGE_INLINE_QUERIES",
    "LEGACY_PAGE_MESSAGES",
    "detach_legacy_page_handlers",
    "legacy_page_handlers",
    "open_page_link",
    "restore_original_message",
    "router",
]
