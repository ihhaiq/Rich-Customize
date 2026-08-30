from __future__ import annotations

from typing import Any

from aiogram import Bot
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.editor.document import get_block_by_id, replace_block_data
from app.editor.draft_store import draft_store
from app.editor.history import remember
from app.editor.workflow import editor_workflow
from app.keyboards import build_rich_editor_keyboard
from app.states import RichEditorStates

from app.routers import editor_core as core


async def save_blocks(state: FSMContext, blocks: list[dict[str, Any]]) -> None:
    draft = await draft_store.load(state)
    draft.blocks = blocks
    await draft_store.save(state, draft)


async def finish_add(
    message: Message,
    state: FSMContext,
    bot: Bot,
    block: dict[str, Any],
) -> dict[str, Any]:
    data = await state.get_data()
    draft = await draft_store.load(state)
    await remember(state)
    result = editor_workflow.add(draft.blocks, block)
    draft.blocks = result.blocks
    await draft_store.save(state, draft)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        current_block_id=None,
        pending_add_type=None,
        pending_child_type=None,
        add_step=None,
        add_payload=None,
        add_prompt_chat_id=None,
        add_prompt_message_id=None,
        heading_size=None,
    )
    await core._delete_add_step_messages(bot, message, data, state)
    await core._repost_saved_ui(
        bot,
        state,
        f"✅ تمت إضافة الـBlock بنجاح.\n\n{core.MAIN_TEXT}",
        build_rich_editor_keyboard(result.blocks),
    )
    assert result.block is not None
    return result.block


async def replace_payload(
    state: FSMContext,
    blocks: list[dict[str, Any]],
    block_id: str,
    payload: dict[str, Any],
    *,
    source: str = "generated",
) -> dict[str, Any] | None:
    await remember(state)
    updated = replace_block_data(
        blocks,
        block_id,
        payload,
        source=source,
    )
    if updated is not None:
        await save_blocks(state, blocks)
    return updated


def block_by_id(
    blocks: list[dict[str, Any]],
    block_id: str | None,
) -> dict[str, Any] | None:
    return get_block_by_id(blocks, block_id)


__all__ = [
    "block_by_id",
    "finish_add",
    "replace_payload",
    "save_blocks",
]
