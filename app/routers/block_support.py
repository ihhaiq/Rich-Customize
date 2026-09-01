from __future__ import annotations

from typing import Any

from aiogram import Bot
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from app.editor.document import get_block_by_id
from app.editor.draft_store import draft_store
from app.editor.history import remember
from app.editor.models import make_block
from app.editor.workflow import editor_workflow
from app.keyboards import build_rich_editor_keyboard
from app.states import RichEditorStates

from app.routers.editor_ui import (
    delete_add_step_messages,
    editor_dashboard_text,
    repost_saved_ui,
)


async def save_blocks(state: FSMContext, blocks: list[dict[str, Any]]) -> None:
    draft = await draft_store.load(state)
    draft.blocks = blocks
    await draft_store.save(state, draft)


async def finish_add(
    message: Message,
    state: FSMContext,
    bot: Bot,
    block: dict[str, Any],
    *,
    index: int | None = None,
) -> dict[str, Any]:
    data = await state.get_data()
    draft = await draft_store.load(state)
    await remember(state)
    result = editor_workflow.add(draft.blocks, block, index=index)
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
    await delete_add_step_messages(bot, message, data, state)
    await repost_saved_ui(
        bot,
        state,
        editor_dashboard_text(draft, "✅ تمت إضافة البلوك بنجاح."),
        build_rich_editor_keyboard(result.blocks, draft.message_buttons),
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
    current = get_block_by_id(blocks, block_id)
    if current is None:
        return None
    candidate = make_block(
        str(current.get("type", "content")),
        payload,
        source=source,
        block_id=str(current.get("id")),
    )
    result = editor_workflow.replace(blocks, block_id, candidate)
    if not result.changed or result.block is None:
        return None
    await remember(state)
    blocks[:] = result.blocks
    await save_blocks(state, blocks)
    return get_block_by_id(blocks, block_id)


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
