from __future__ import annotations

import html

from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.i18n import t
from app.keyboards import build_pages_keyboard
from app.routers.editor_ui import MAIN_TEXT, edit_saved_ui, edit_ui
from app.services.page_editor import (
    PAGES_PER_SCREEN,
    paginate_pages,
    persist_page_draft_change,
    query_user_pages,
)

# Temporary public aliases used by existing routers/tests. New code should use
# the semantic service names from app.services.page_editor directly.
page_screen = paginate_pages
pages_for_user = query_user_pages
save_changed_draft = persist_page_draft_change


def saved_pages_text(page_index: int = 0, total_pages: int = 1) -> str:
    return "\n".join([
        "📚 صفحاتك المحفوظة",
        f"{page_index + 1}/{total_pages}",
        "",
        "اختر صفحة لفتحها وتعديلها:",
    ])


def opened_page_text() -> str:
    return MAIN_TEXT


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
    pages, visible, page_index, total_pages, total_count = await query_user_pages(
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
        await edit_saved_ui(
            bot=message.bot,
            state=state,
            text=text,
            reply_markup=keyboard,
            parse_mode="HTML",
        )
    else:
        await edit_ui(message, text, keyboard, parse_mode="HTML")
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
