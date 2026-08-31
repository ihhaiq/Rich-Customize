from __future__ import annotations

from typing import Any

from aiogram.enums import ButtonStyle
from aiogram.types import CopyTextButton, InlineKeyboardButton, InlineKeyboardMarkup

from app.i18n import t


def build_pages_keyboard(
    pages: list[dict[str, Any]],
    page_index: int = 0,
    total_pages: int = 1,
    *,
    show_controls: bool = False,
    pagination_prefix: str = "r:pages",
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    for page in pages:
        page_id = str(page["page_id"])
        title = str(page.get("title") or page_id)[:24]
        rows.append([InlineKeyboardButton(
            text=f"📄 {title}",
            callback_data=f"r:pageopen:{page_id}",
            style=ButtonStyle.PRIMARY,
        )])
        rows.append([
            InlineKeyboardButton(text=f"📋 {page_id}", copy_text=CopyTextButton(text=page_id)),
            InlineKeyboardButton(text="✏️", callback_data=f"r:prename:{page_id}:{page_index}"),
            InlineKeyboardButton(
                text="🗑", callback_data=f"r:pdelete:{page_id}:{page_index}",
                style=ButtonStyle.DANGER,
            ),
        ])
    if total_pages > 1:
        rows.append([
            InlineKeyboardButton(
                text="◀️",
                callback_data="r:no" if page_index <= 0 else f"{pagination_prefix}:{page_index - 1}",
            ),
            InlineKeyboardButton(text=f"{page_index + 1}/{total_pages}", callback_data="r:no"),
            InlineKeyboardButton(
                text="▶️",
                callback_data="r:no" if page_index >= total_pages - 1 else f"{pagination_prefix}:{page_index + 1}",
            ),
        ])
    if show_controls:
        rows.append([
            InlineKeyboardButton(text=t("pages.search_button"), callback_data="r:psearch"),
            InlineKeyboardButton(text=t("pages.sort_button"), callback_data="r:psort"),
        ])
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:back")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_page_sort_keyboard(current_sort: str) -> InlineKeyboardMarkup:
    choices = [
        (t("pages.sort_updated"), "updated"),
        (t("pages.sort_newest"), "newest"),
        (t("pages.sort_oldest"), "oldest"),
        (t("pages.sort_title"), "title"),
    ]
    rows = [[InlineKeyboardButton(
        text=f"{'✅ ' if current_sort == value else ''}{label}",
        callback_data=f"r:psortset:{value}",
        style=ButtonStyle.PRIMARY if current_sort == value else None,
    )] for label, value in choices]
    rows.append([InlineKeyboardButton(text="🔙 رجوع", callback_data="r:pages:0")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_page_delete_confirmation_keyboard(page_id: str, page_index: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("pages.delete_yes"), callback_data=f"r:pdeleteok:{page_id}:{page_index}",
            style=ButtonStyle.DANGER,
        ),
        InlineKeyboardButton(text=t("common.cancel"), callback_data=f"r:pages:{page_index}"),
    ]])


__all__ = [
    "build_page_delete_confirmation_keyboard",
    "build_page_sort_keyboard",
    "build_pages_keyboard",
]
