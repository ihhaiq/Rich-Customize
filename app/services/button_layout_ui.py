from __future__ import annotations

from typing import Any

from aiogram.types import (
    InlineKeyboardButton, InlineKeyboardMarkup, InputRichBlockParagraph,
    InputRichBlockTable, InputRichMessage, RichBlockTableCell,
    RichMessageButton, RichTextButton,
)

from app.i18n import t
from app.services.buttons import button_rows

ROWS_PER_PAGE = 8


def choice(label: str, callback: str, selected: bool = False) -> RichBlockTableCell:
    return RichBlockTableCell(align="center", valign="middle", text=RichTextButton(button=RichMessageButton(
        text=label, callback_data=callback, style="primary" if selected else None,
    )))


def build_button_layout_ui(
    buttons: list[dict[str, Any]], width: int, *, custom: bool = False, page: int = 0,
) -> tuple[InputRichMessage, InlineKeyboardMarkup]:
    blocks: list[Any] = [InputRichBlockParagraph(text=t(
        "ux.buttons.custom_hint" if custom else "ux.buttons.layout_hint",
    ))]
    navigation: list[list[InlineKeyboardButton]] = []
    if custom:
        rows = button_rows(buttons, width)
        last_page = max(0, (len(rows) - 1) // ROWS_PER_PAGE)
        page = max(0, min(page, last_page))
        cells = []
        for index in range(page * ROWS_PER_PAGE, min(len(rows), (page + 1) * ROWS_PER_PAGE)):
            remaining = sum(len(row) for row in rows[index:])
            cells.append([
                RichBlockTableCell(align="center", valign="middle", text=t("ux.buttons.row_number", number=index + 1)),
                *[choice(str(count), f"r:browcustom:{index}:{count}:{page}",
                         len(rows[index]) == count)
                  if count <= remaining else RichBlockTableCell(align="center", valign="middle", text="—")
                  for count in range(1, 9)],
            ])
        if cells:
            blocks.append(InputRichBlockTable(cells=cells, is_compact=True, is_bordered=True))
        else:
            blocks.append(InputRichBlockParagraph(text=t("ux.buttons.empty")))
        if last_page:
            nav = []
            if page:
                nav.append(InlineKeyboardButton(text="⬅️", callback_data=f"r:browcustompage:{page - 1}"))
            if page < last_page:
                nav.append(InlineKeyboardButton(text="➡️", callback_data=f"r:browcustompage:{page + 1}"))
            navigation.append(nav)
    else:
        custom_active = any("row_end" in button for button in buttons)
        blocks.append(InputRichBlockTable(cells=[[
            choice(str(count), f"r:browset:{count}", not custom_active and count == width)
            for count in range(start, start + 4)
        ] for start in (1, 5)], is_compact=True, is_bordered=True))
        blocks.append(InputRichBlockParagraph(text=RichTextButton(button=RichMessageButton(
            text=t("ux.buttons.custom"), callback_data="r:browcustompage:0", style="primary",
        ))))
    navigation.append([InlineKeyboardButton(
        text=t("ux.common.back"), callback_data="r:brow" if custom else "r:buttons",
    )])
    return InputRichMessage(blocks=blocks), InlineKeyboardMarkup(inline_keyboard=navigation)
