from __future__ import annotations

from aiogram import Bot, F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.keyboards import build_block_editor_keyboard
from app.locales.common import AR_PHRASES, KEY_TRANSLATIONS, PHRASES
from app.services.blocks import get_block_by_id
from app.services.parser import message_to_blocks, replacement_data
from app.states import RichEditorStates

from app.routers import editor_core


router = Router(name="math_ready")
MATH_TYPE = "mathematical_expression"


# Math is now primarily imported from an already-rendered Rich Message.
# Plain LaTeX still reaches editor_core as a backwards-compatible fallback.
PHRASES["math.add_prompt"] = (
    "Send or forward a ready Rich Message that contains a Math block."
)
PHRASES["math.edit_prompt"] = (
    "Send or forward the ready Rich Message that contains the new Math block."
)
PHRASES["math.ready_missing"] = (
    "This Rich Message does not contain a Math block. Send a message that already contains Math."
)
AR_PHRASES["math.add_prompt"] = (
    "أرسل أو حوّل رسالة غنية جاهزة تحتوي على بلوك Math."
)
AR_PHRASES["math.edit_prompt"] = (
    "أرسل أو حوّل الرسالة الغنية الجاهزة التي تحتوي على بلوك Math الجديد."
)
AR_PHRASES["math.ready_missing"] = (
    "هذه الرسالة الغنية لا تحتوي على بلوك Math. أرسل رسالة جاهزة تحتوي على المعادلة."
)

# Prevent older locale-specific strings from continuing to ask for LaTeX.
# Locales without a new dedicated translation cleanly fall back to the new
# English semantic string instead of showing stale instructions.
for keyed in KEY_TRANSLATIONS.values():
    keyed.pop("math.add_prompt", None)
    keyed.pop("math.edit_prompt", None)


def _math_block(message: Message) -> dict | None:
    """Return the first native Math block from a received Rich Message."""
    if message.rich_message is None:
        return None
    parsed = message_to_blocks(message)
    return next((block for block in parsed if block.get("type") == MATH_TYPE), None)


async def _missing_math(message: Message) -> None:
    from app.i18n import t

    await message.answer(t("math.ready_missing"))


@router.message(RichEditorStates.adding_block, F.rich_message)
async def receive_ready_math_add(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    block_type = data.get("pending_add_type")
    step = data.get("add_step")

    # Main Math block.
    if block_type == MATH_TYPE and step == "content":
        block = _math_block(message)
        if block is None:
            await _missing_math(message)
            return
        await editor_core._finish_add(message, state, bot, block)
        return

    # Math nested inside Details.
    if (
        block_type == "details"
        and step == "details_child_content"
        and data.get("pending_child_type") == MATH_TYPE
    ):
        block = _math_block(message)
        if block is None:
            await _missing_math(message)
            return
        await editor_core._store_details_child(message, state, bot, block)
        return

    # This feature router owns only Math Rich Messages. Let editor_core handle
    # every other Rich Message flow (details, media, quotes, etc.).
    raise SkipHandler


@router.message(RichEditorStates.editing_block, F.rich_message)
async def receive_ready_math_edit(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()

    # Nested Math editing is already generic in editor_core once a native Math
    # payload reaches it, so reuse that path instead of duplicating Details UI.
    if (
        data.get("nested_action") == "content"
        and data.get("expected_type") == MATH_TYPE
    ):
        block = _math_block(message)
        if block is None:
            await _missing_math(message)
            return
        await editor_core._receive_nested_replacement(message, state, bot, data)
        return

    if data.get("expected_type") != MATH_TYPE or data.get("edit_field"):
        raise SkipHandler

    blocks = data.get("blocks", [])
    block_id = data.get("current_block_id")
    current = get_block_by_id(blocks, block_id)
    if current is None or current.get("type") != MATH_TYPE:
        raise SkipHandler

    incoming = _math_block(message)
    if incoming is None:
        await _missing_math(message)
        return

    # Keep the received native Math payload intact. The renderer can then send
    # the exact expression Telegram parsed instead of rebuilding it from text.
    replacement = replacement_data(message, MATH_TYPE)
    if replacement is None:
        await _missing_math(message)
        return

    current["data"] = replacement
    await editor_core._delete_add_step_messages(bot, message, data, state)
    await state.update_data(blocks=blocks)
    await state.set_state(RichEditorStates.managing)
    await editor_core._edit_saved_ui(
        bot,
        state,
        editor_core._block_page(current, blocks),
        build_block_editor_keyboard(current, blocks),
    )


__all__ = ["router"]
