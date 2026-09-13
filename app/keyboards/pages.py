from __future__ import annotations

from aiogram.enums import ButtonStyle
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup

from app.i18n import t


def build_pages_keyboard(
    *,
    show_controls: bool = False,
    show_pager: bool = False,
    page_index: int = 0,
    total_pages: int = 1,
    pagination_prefix: str = "r:pages",
) -> InlineKeyboardMarkup:
    rows: list[list[InlineKeyboardButton]] = []
    if show_pager:
        safe_total = max(total_pages, 1)
        safe_index = min(max(page_index, 0), safe_total - 1)
        previous_index = max(safe_index - 1, 0)
        next_index = min(safe_index + 1, safe_total - 1)
        rows.append([
            InlineKeyboardButton(
                text="⬅️",
                callback_data=f"{pagination_prefix}:{previous_index}",
            ),
            InlineKeyboardButton(
                text=f"{safe_index + 1}/{safe_total}",
                callback_data=f"{pagination_prefix}:{safe_index}",
            ),
            InlineKeyboardButton(
                text="➡️",
                callback_data=f"{pagination_prefix}:{next_index}",
            ),
        ])
    if show_controls:
        rows.append([
            InlineKeyboardButton(text=t("pages.search_button"), callback_data="r:psearch"),
            InlineKeyboardButton(text=t("pages.sort_button"), callback_data="r:psort"),
        ])
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:back")])
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
    rows.append([InlineKeyboardButton(text=t("ux.common.back"), callback_data="r:pages:0")])
    return InlineKeyboardMarkup(inline_keyboard=rows)


def build_page_delete_confirmation_keyboard(page_id: str, page_index: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[[
        InlineKeyboardButton(
            text=t("pages.delete_yes"), callback_data=f"r:pdeleteok:{page_id}:{page_index}",
            style=ButtonStyle.DANGER,
        ),
        InlineKeyboardButton(text=t("common.cancel"), callback_data=f"r:pages:{page_index}"),
    ]])


def build_page_restore_keyboard(page_index: int) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(
            text=t("ux.pages.restore"), callback_data="r:prestore",
            style=ButtonStyle.SUCCESS,
        )],
        [InlineKeyboardButton(
            text=t("ux.common.back"), callback_data=f"r:pages:{page_index}",
        )],
    ])


__all__ = [
    "build_page_delete_confirmation_keyboard",
    "build_page_sort_keyboard",
    "build_page_restore_keyboard",
    "build_pages_keyboard",
]
