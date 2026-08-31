from __future__ import annotations

from typing import Any

from aiogram.fsm.context import FSMContext

from app.editor.draft_store import EditorDraft, draft_store
from app.editor.history import remember
from app.services.page_registry import page_registry

PAGES_PER_SCREEN = 4


def paginate_pages(
    pages: list[dict[str, Any]],
    requested_index: int,
) -> tuple[list[dict[str, Any]], int, int]:
    """Return the visible page slice and a clamped screen index."""
    total_pages = max(1, (len(pages) + PAGES_PER_SCREEN - 1) // PAGES_PER_SCREEN)
    page_index = max(0, min(requested_index, total_pages - 1))
    start = page_index * PAGES_PER_SCREEN
    return pages[start:start + PAGES_PER_SCREEN], page_index, total_pages


async def query_user_pages(
    user_id: int,
    requested_index: int,
    query: str = "",
    sort_mode: str = "updated",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int, int, int]:
    pages, total_count = await page_registry.query_for_user(
        user_id,
        query=query,
        sort_mode=sort_mode,
    )
    visible, page_index, total_pages = paginate_pages(pages, requested_index)
    return pages, visible, page_index, total_pages, total_count


async def persist_page_draft_change(
    state: FSMContext,
    before: EditorDraft,
    after: EditorDraft,
) -> bool:
    """Persist a page-related draft mutation and remember one undo snapshot."""
    if before.as_state() == after.as_state():
        return False
    await remember(state)
    await draft_store.save(state, after)
    return True


__all__ = [
    "PAGES_PER_SCREEN",
    "paginate_pages",
    "persist_page_draft_change",
    "query_user_pages",
]
