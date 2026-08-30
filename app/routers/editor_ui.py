from __future__ import annotations

import logging
from typing import Any

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.editor.draft_store import EditorDraft, draft_store
from app.i18n import t
from app.keyboards import build_rich_editor_keyboard
from app.routers.button_guide import answer_with_button_guide, button_guide_blocks
from app.services.blocks import BLOCK_LABELS
from app.services.renderer import build_input_rich_message
from app.states import RichEditorStates


logger = logging.getLogger(__name__)
MAIN_TEXT = "تخصيص الرسالة\n\nاختر الجزء الذي تريد تعديله:"


def friendly_rich_error(error: Exception) -> str:
    reason = str(error)
    if "BOT_DOMAIN_INVALID" in reason:
        return (
            "BOT_DOMAIN_INVALID: دومين زر Login URL غير مربوط بهذا البوت أو لا يطابق "
            "الرابط. افتح @BotFather، اختر البوت، أرسل /setdomain وسجّل الدومين فقط "
            "مثل example.com، ثم استعمل رابط HTTPS من الدومين نفسه. إذا ما تحتاج "
            "تسجيل دخول، غيّر نوع الزر إلى URL عادي."
        )
    return reason


async def edit_ui(
    message: Message,
    text: str,
    reply_markup,
    parse_mode: str | None = None,
) -> None:
    try:
        await message.edit_text(text, reply_markup=reply_markup, parse_mode=parse_mode)
    except TelegramBadRequest as error:
        if "message is not modified" not in str(error).lower():
            raise


async def edit_button_ui(message: Message, text: str, reply_markup) -> None:
    try:
        await message.bot.edit_message_text(
            chat_id=message.chat.id,
            message_id=message.message_id,
            rich_message=build_input_rich_message(button_guide_blocks(text)),
            reply_markup=reply_markup,
        )
    except TelegramAPIError as error:
        if "message is not modified" in str(error).lower():
            return
        await edit_ui(message, text, reply_markup)


async def edit_saved_ui(
    bot: Bot,
    state: FSMContext,
    text: str,
    reply_markup,
    parse_mode: str | None = None,
) -> None:
    data = await state.get_data()
    try:
        await bot.edit_message_text(
            chat_id=data["management_chat_id"],
            message_id=data["management_message_id"],
            text=text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
        )
    except (KeyError, TelegramBadRequest):
        sent = await bot.send_message(
            data.get("management_chat_id"),
            text,
            reply_markup=reply_markup,
            parse_mode=parse_mode,
        )
        await state.update_data(
            management_chat_id=sent.chat.id,
            management_message_id=sent.message_id,
        )


async def edit_saved_button_ui(
    bot: Bot,
    state: FSMContext,
    text: str,
    reply_markup,
) -> None:
    data = await state.get_data()
    try:
        await bot.edit_message_text(
            chat_id=data["management_chat_id"],
            message_id=data["management_message_id"],
            rich_message=build_input_rich_message(button_guide_blocks(text)),
            reply_markup=reply_markup,
        )
    except (KeyError, TelegramAPIError) as error:
        if "message is not modified" in str(error).lower():
            return
        try:
            sent = await bot.send_rich_message(
                chat_id=data.get("management_chat_id"),
                rich_message=build_input_rich_message(button_guide_blocks(text)),
                reply_markup=reply_markup,
            )
        except TelegramAPIError:
            sent = await bot.send_message(
                data.get("management_chat_id"), text, reply_markup=reply_markup,
            )
        await state.update_data(
            management_chat_id=sent.chat.id,
            management_message_id=sent.message_id,
        )


async def repost_saved_ui(
    bot: Bot,
    state: FSMContext,
    text: str,
    reply_markup,
) -> Message:
    data = await state.get_data()
    chat_id = data.get("management_chat_id")
    message_id = data.get("management_message_id")
    if chat_id and message_id:
        try:
            await bot.delete_message(chat_id=chat_id, message_id=message_id)
        except TelegramBadRequest as error:
            logger.debug("Could not remove the old management panel: %s", error)
    sent = await bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)
    await state.update_data(
        management_chat_id=sent.chat.id,
        management_message_id=sent.message_id,
    )
    return sent


def editor_overview_text(blocks: list[dict[str, Any]]) -> str:
    lines = [
        t("editor.imported_title"),
        t("editor.block_count", count=len(blocks)),
        "",
        t("editor.imported_blocks_title"),
    ]
    for position, block in enumerate(
        sorted(blocks, key=lambda item: int(item.get("position", 0))),
        start=1,
    ):
        label = BLOCK_LABELS.get(str(block.get("type", "")), t("block.content"))
        lines.append(f"{position}. {label}")
    lines.extend(["", t("editor.imported_choose_block")])
    return "\n".join(lines)


async def open_editor(
    message: Message,
    state: FSMContext,
    blocks: list[dict[str, Any]],
) -> None:
    text = (
        f"{t('editor.empty_hint')}\n\n{t('editor.forward_hint')}"
        if not blocks
        else editor_overview_text(blocks)
    )
    if blocks:
        sent = await message.answer(text, reply_markup=build_rich_editor_keyboard(blocks))
    else:
        sent = await answer_with_button_guide(
            message, text, reply_markup=build_rich_editor_keyboard(blocks),
        )
    await state.set_state(RichEditorStates.managing)
    await draft_store.save(state, EditorDraft(blocks=blocks, message_buttons=[]))
    await state.update_data(
        current_block_id=None,
        pages_search_query="",
        pages_sort_mode="updated",
        management_chat_id=sent.chat.id,
        management_message_id=sent.message_id,
    )


async def send_add_prompt(
    message: Message,
    state: FSMContext,
    text: str,
    reply_markup=None,
) -> Message:
    sent = await message.answer(text, reply_markup=reply_markup)
    await state.update_data(
        add_prompt_chat_id=sent.chat.id,
        add_prompt_message_id=sent.message_id,
    )
    return sent


async def delete_stored_block_prompt(
    bot: Bot,
    state: FSMContext,
    data: dict[str, Any],
    protected_message: Message | None = None,
) -> None:
    prompt_id = data.get("add_prompt_message_id")
    prompt_chat_id = data.get("add_prompt_chat_id")
    is_management_message = bool(
        protected_message
        and prompt_id == protected_message.message_id
        and prompt_chat_id == protected_message.chat.id
    )
    if prompt_id and prompt_chat_id and not is_management_message:
        try:
            await bot.delete_message(chat_id=prompt_chat_id, message_id=prompt_id)
        except TelegramBadRequest as error:
            logger.debug("Could not delete block prompt %s: %s", prompt_id, error)
    await state.update_data(add_prompt_chat_id=None, add_prompt_message_id=None)


async def delete_input_message(message: Message) -> None:
    try:
        await message.delete()
    except TelegramBadRequest as error:
        logger.debug("Could not delete input message %s: %s", message.message_id, error)


async def delete_add_step_messages(
    bot: Bot,
    message: Message,
    data: dict[str, Any],
    state: FSMContext,
) -> None:
    targets = {(message.chat.id, message.message_id)}
    prompt_id = data.get("add_prompt_message_id")
    if prompt_id:
        targets.add((data.get("add_prompt_chat_id", message.chat.id), prompt_id))
    for chat_id, message_id in targets:
        try:
            await bot.delete_message(chat_id=chat_id, message_id=message_id)
        except TelegramBadRequest as error:
            logger.debug("Could not delete add-flow message %s: %s", message_id, error)
    await state.update_data(add_prompt_chat_id=None, add_prompt_message_id=None)


__all__ = [
    "MAIN_TEXT",
    "delete_add_step_messages",
    "delete_input_message",
    "delete_stored_block_prompt",
    "edit_button_ui",
    "edit_saved_button_ui",
    "edit_saved_ui",
    "edit_ui",
    "editor_overview_text",
    "friendly_rich_error",
    "open_editor",
    "repost_saved_ui",
    "send_add_prompt",
]
