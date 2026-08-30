"""Compatibility facade for the remaining legacy editor handlers.

No new editor logic belongs in this module.  New block/data logic lives under
``app.editor`` and focused feature routers are registered before the legacy
router.  ``editor_legacy`` can be removed once its remaining handlers are split.
"""
from __future__ import annotations

from app.routers import editor_legacy as _legacy

router = _legacy.router
compat_module = _legacy
open_page_link = _legacy.open_page_link
restore_original_message = _legacy.restore_original_message

_finish_add = _legacy._finish_add
_store_details_child = _legacy._store_details_child
_receive_nested_replacement = _legacy._receive_nested_replacement
_delete_add_step_messages = _legacy._delete_add_step_messages
_edit_saved_ui = _legacy._edit_saved_ui
_block_page = _legacy._block_page


def __getattr__(name: str):
    return getattr(_legacy, name)


__all__ = [
    "compat_module",
    "open_page_link",
    "restore_original_message",
    "router",
]
