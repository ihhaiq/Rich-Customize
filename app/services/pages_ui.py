from __future__ import annotations

from typing import Any

from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    CopyTextButton,
    DisabledButton,
    InlineKeyboardMarkup,
    InputRichBlockDivider,
    InputRichBlockParagraph,
    InputRichBlockTable,
    InputRichMessage,
    Message,
    RichBlockTableCell,
    RichMessageButton,
    RichTextButton,
)

from app.i18n import t


def _button_cell(
    button: RichMessageButton,
    *,
    align: str = "center",
) -> RichBlockTableCell:
    return RichBlockTableCell(
        text=RichTextButton(button=button),
        align=align,
        valign="middle",
    )


def _text_cell(
    text: str,
    *,
    is_header: bool = False,
    align: str = "center",
) -> RichBlockTableCell:
    return RichBlockTableCell(
        text=text,
        align=align,
        valign="middle",
        is_header=is_header or None,
    )


def build_pages_rich_message(
    text: str,
    pages: list[dict[str, Any]],
    page_index: int = 0,
    total_pages: int = 1,
    *,
    pagination_prefix: str = "r:pages",
) -> InputRichMessage:
    """Render saved pages as one compact management row per page."""
    heading = InputRichBlockParagraph(text=text)
    if not pages:
        return InputRichMessage(blocks=[heading])

    rows: list[list[RichBlockTableCell]] = [[
        _text_cell("🗑️", is_header=True),
        _text_cell("✏️", is_header=True),
        _text_cell(t("pages.copy_code"), is_header=True),
        _text_cell(t("pages.sort_title"), is_header=True, align="right"),
    ]]

    for page in pages:
        page_id = str(page["page_id"])
        rows.append([
            _button_cell(RichMessageButton(
                text="🗑️",
                callback_data=f"r:pdelete:{page_id}:{page_index}",
                style="danger",
            )),
            _button_cell(RichMessageButton(
                text="✏️",
                callback_data=f"r:prename:{page_id}:{page_index}",
            )),
            _button_cell(RichMessageButton(
                text=t("pages.copy_code"),
                copy_text=CopyTextButton(text=page_id),
            )),
            _button_cell(
                RichMessageButton(
                    text=str(page.get("title") or page_id),
                    callback_data=f"r:pageopen:{page_id}",
                    style="primary",
                ),
                align="right",
            ),
        ])

    safe_total = max(total_pages, 1)
    safe_index = min(max(page_index, 0), safe_total - 1)
    rows.append([
        _button_cell(RichMessageButton(
            text="⬅️",
            callback_data=(
                f"{pagination_prefix}:{safe_index - 1}"
                if safe_index > 0
                else None
            ),
            disabled=DisabledButton() if safe_index <= 0 else None,
        )),
        RichBlockTableCell(
            align="center",
            valign="middle",
        ),
        _text_cell(f"{safe_index + 1}/{safe_total}", align="left"),
        _button_cell(RichMessageButton(
            text="➡️",
            callback_data=(
                f"{pagination_prefix}:{safe_index + 1}"
                if safe_index < safe_total - 1
                else None
            ),
            disabled=DisabledButton() if safe_index >= safe_total - 1 else None,
        )),
    ])

    return InputRichMessage(blocks=[
        heading,
        InputRichBlockDivider(),
        InputRichBlockTable(cells=rows, is_bordered=True, is_compact=True),
        InputRichBlockDivider(),
    ])


async def edit_pages_ui(
    message: Message,
    state: FSMContext,
    rich_message: InputRichMessage,
    reply_markup: InlineKeyboardMarkup,
    *,
    saved: bool = False,
) -> None:
    """Refresh the management message, including after a search or rename input."""
    data = await state.get_data() if saved else {}
    chat_id = data.get("management_chat_id") or message.chat.id
    message_id = data.get("management_message_id") if saved else message.message_id
    if message_id is not None:
        try:
            await message.bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                rich_message=rich_message,
                reply_markup=reply_markup,
            )
            return
        except TelegramBadRequest as error:
            reason = str(error).lower()
            if "message is not modified" in reason:
                return
            if not saved or not any(fragment in reason for fragment in (
                "message to edit not found", "message can't be edited", "message_id_invalid",
            )):
                raise

    sent = await message.bot.send_rich_message(
        chat_id=chat_id,
        rich_message=rich_message,
        reply_markup=reply_markup,
    )
    await state.update_data(
        management_chat_id=sent.chat.id,
        management_message_id=sent.message_id,
    )


__all__ = ["build_pages_rich_message", "edit_pages_ui"]
