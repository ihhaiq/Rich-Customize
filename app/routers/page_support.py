from __future__ import annotations

import html
from typing import Any

from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.editor.draft_store import EditorDraft, draft_store
from app.editor.history import remember
from app.i18n import t
from app.keyboards import build_pages_keyboard

from app.routers import editor_core as core


PAGES_PER_SCREEN = 4


def saved_pages_text(page_index: int = 0, total_pages: int = 1) -> str:
    return "\n".join([
        "📚 صفحاتك المحفوظة",
        f"{page_index + 1}/{total_pages}",
        "",
        "اختر صفحة لفتحها وتعديلها:",
    ])


def opened_page_text() -> str:
    return core.MAIN_TEXT


def page_screen(
    pages: list[dict[str, Any]],
    requested_index: int,
) -> tuple[list[dict[str, Any]], int, int]:
    total_pages = max(1, (len(pages) + PAGES_PER_SCREEN - 1) // PAGES_PER_SCREEN)
    page_index = max(0, min(requested_index, total_pages - 1))
    start = page_index * PAGES_PER_SCREEN
    return pages[start:start + PAGES_PER_SCREEN], page_index, total_pages


async def save_changed_draft(
    state: FSMContext,
    before: EditorDraft,
    after: EditorDraft,
) -> bool:
    if before.as_state() == after.as_state():
        return False
    await remember(state)
    await draft_store.save(state, after)
    return True


async def pages_for_user(
    user_id: int,
    requested_index: int,
    query: str = "",
    sort_mode: str = "updated",
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int, int, int]:
    pages, total_count = await core.page_registry.query_for_user(
        user_id,
        query=query,
        sort_mode=sort_mode,
    )
    visible, page_index, total_pages = page_screen(pages, requested_index)
    return pages, visible, page_index, total_pages, total_count


async def render_pages_screen(
    message: Message,
    state: FSMContext,
    user_id: int,
    requested_index: int = 0,
    *,
    saved: bool = False,
) -> bool:
    data = await state.get_data()
    query = str(data.get("pages_search_query") or "")
    sort_mode = str(data.get("pages_sort_mode") or "updated")
    pages, visible, page_index, total_pages, total_count = await pages_for_user(
        user_id, requested_index, query, sort_mode,
    )
    if not pages and not query:
        return False
    if pages:
        text = saved_pages_text(page_index, total_pages)
        if query:
            text += "\n\n" + t("pages.search_results", query=html.escape(query))
    else:
        text = t("pages.search_none", query=html.escape(query))
    keyboard = build_pages_keyboard(
        visible,
        page_index,
        total_pages,
        show_controls=total_count > 1,
        pagination_prefix="r:presults" if query else "r:pages",
    )
    if saved:
        await core._edit_saved_ui(
            bot=message.bot,
            state=state,
            text=text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    else:
        await core._edit_ui(message, text, keyboard, parse_mode="HTML")
    return True


__all__ = [
    "PAGES_PER_SCREEN",
    "opened_page_text",
    "page_screen",
    "pages_for_user",
    "render_pages_screen",
    "save_changed_draft",
    "saved_pages_text",
]
