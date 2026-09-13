from __future__ import annotations

from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.i18n import t
from app.keyboards import build_pages_keyboard
from app.routers.editor_ui import MAIN_TEXT
from app.routers.button_support import save_changed_draft
from app.services.page_editor import query_user_pages
from app.services.pages_ui import build_pages_rich_message, edit_pages_ui


def saved_pages_text() -> str:
    return "\n".join([
        t("pages.saved_title"),
        "",
        t("pages.open_prompt"),
    ])


def opened_page_text() -> str:
    return str(MAIN_TEXT)


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
        user_id,
        requested_index,
        query,
        sort_mode,
    )
    if not pages and not query:
        return False
    if pages:
        text = saved_pages_text()
        if query:
            text += "\n\n" + t("pages.search_results", query=query)
    else:
        text = t("pages.search_none", query=query)
    pagination_prefix = "r:presults" if query else "r:pages"
    rich_message = build_pages_rich_message(text, visible, page_index)
    await edit_pages_ui(
        message,
        state,
        rich_message,
        build_pages_keyboard(
            show_controls=total_count > 1,
            show_pager=bool(pages),
            page_index=page_index,
            total_pages=total_pages,
            pagination_prefix=pagination_prefix,
        ),
        saved=saved,
    )
    return True


__all__ = [
    "opened_page_text",
    "render_pages_screen",
    "save_changed_draft",
    "saved_pages_text",
]
