from __future__ import annotations

from aiogram import Bot, F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.editor.document import get_block_by_id, replace_block
from app.editor.importer import first_block_of_type
from app.editor.registry import block_registry
from app.i18n import t
from app.keyboards import build_block_editor_keyboard
from app.states import RichEditorStates

from app.routers import editor_core
from app.routers.details import (
    receive_nested_replacement,
    store_pending_details_child,
)


router = Router(name="math_ready")
MATH_TYPE = "mathematical_expression"


def _math_block(message: Message) -> dict | None:
    if message.rich_message is None:
        return None
    adapter = block_registry.require(MATH_TYPE)
    if adapter.input_kind.value != "native":
        return None
    return first_block_of_type(message, MATH_TYPE)


async def _missing_math(message: Message) -> None:
    await message.answer(t("math.ready_missing"))


@router.message(RichEditorStates.adding_block, F.rich_message)
async def receive_ready_math_add(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    block_type = data.get("pending_add_type")
    step = data.get("add_step")

    if block_type == MATH_TYPE and step == "content":
        block = _math_block(message)
        if block is None:
            await _missing_math(message)
            return
        await editor_core._finish_add(message, state, bot, block)
        return

    # Details now owns its nested input flow. This remains as a compatibility
    # path if router ordering changes or the handler is called directly.
    if (
        block_type == "details"
        and step == "details_child_content"
        and data.get("pending_child_type") == MATH_TYPE
    ):
        block = _math_block(message)
        if block is None:
            await _missing_math(message)
            return
        await store_pending_details_child(message, state, bot, block)
        return

    raise SkipHandler


@router.message(RichEditorStates.editing_block, F.rich_message)
async def receive_ready_math_edit(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()

    if (
        data.get("nested_action") == "content"
        and data.get("expected_type") == MATH_TYPE
    ):
        if _math_block(message) is None:
            await _missing_math(message)
            return
        await receive_nested_replacement(message, state, bot, data)
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

    updated = replace_block(blocks, str(block_id), incoming)
    if updated is None:
        raise SkipHandler

    await editor_core._delete_add_step_messages(bot, message, data, state)
    await state.update_data(blocks=blocks)
    await state.set_state(RichEditorStates.managing)
    await editor_core._edit_saved_ui(
        bot,
        state,
        editor_core._block_page(updated, blocks),
        build_block_editor_keyboard(updated, blocks),
    )


__all__ = ["router"]
