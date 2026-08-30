from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.history import remember
from app.editor.workflow import editor_workflow
from app.keyboards import (
    build_block_editor_keyboard,
    build_block_position_keyboard,
    build_delete_confirmation_keyboard,
    build_rich_editor_keyboard,
)
from app.states import RichEditorStates

from app.routers import editor_core as core
from app.routers.block_support import block_by_id, save_blocks


router = Router(name="block_actions")


@router.callback_query(F.data.startswith("r:b:"))
async def open_block(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = block_by_id(blocks, block_id)
    if block is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        await core._edit_ui(
            callback.message,
            core.MAIN_TEXT,
            build_rich_editor_keyboard(blocks),
        )
        return
    await state.update_data(current_block_id=block_id)
    await core._edit_ui(
        callback.message,
        core._block_page(block, blocks),
        build_block_editor_keyboard(block, blocks),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:dup:"))
async def duplicate_block_action(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    if block_by_id(blocks, block_id) is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        return
    await remember(state)
    result = editor_workflow.duplicate(blocks, block_id, after=True)
    if not result.changed or result.block is None:
        await callback.answer("تعذر نسخ هذا الجزء.", show_alert=True)
        return
    await save_blocks(state, result.blocks)
    await state.update_data(current_block_id=result.block["id"])
    await core._edit_ui(
        callback.message,
        core._block_page(result.block, result.blocks),
        build_block_editor_keyboard(result.block, result.blocks),
    )
    await callback.answer("تم نسخ الـBlock")


@router.callback_query(F.data.startswith("r:d:"))
async def ask_delete(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    if block_by_id(blocks, block_id) is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        return
    await core._edit_ui(
        callback.message,
        "هل تريد حذف هذا الجزء؟",
        build_delete_confirmation_keyboard(block_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:dc:"))
async def confirm_delete(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with core.user_locks[callback.from_user.id]:
        session = await core._session(callback, state)
        if not session:
            return
        _, blocks = session
        block_id = callback.data.rsplit(":", 1)[-1]
        await remember(state)
        result = editor_workflow.delete(blocks, block_id)
        if not result.changed:
            await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
            return
        await save_blocks(state, result.blocks)
        await state.set_state(RichEditorStates.managing)
        await state.update_data(current_block_id=None)
        await core._edit_ui(
            callback.message,
            core.MAIN_TEXT if result.blocks else core.t("editor.empty_hint"),
            build_rich_editor_keyboard(result.blocks),
        )
        await callback.answer("تم الحذف")


@router.callback_query(F.data.startswith("r:m:"))
async def move_menu(callback: CallbackQuery, state: FSMContext) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    if block_by_id(blocks, block_id) is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        return
    await core._edit_ui(
        callback.message,
        "اختر الموقع الجديد:",
        build_block_position_keyboard(blocks, block_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:mu:"))
@router.callback_query(F.data.startswith("r:md:"))
async def move_one_step(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with core.user_locks[callback.from_user.id]:
        session = await core._session(callback, state)
        if not session:
            return
        _, blocks = session
        block_id = callback.data.rsplit(":", 1)[-1]
        ordered = sorted(blocks, key=lambda item: int(item.get("position", 0)))
        block = block_by_id(ordered, block_id)
        if block is None:
            await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
            return
        current_index = ordered.index(block)
        target_index = (
            current_index - 1
            if callback.data.startswith("r:mu:")
            else current_index + 1
        )
        if not 0 <= target_index < len(ordered):
            await callback.answer("هذا الجزء وصل إلى نهاية الترتيب.")
            return
        await remember(state)
        result = editor_workflow.move(blocks, block_id, target_index)
        if not result.changed or result.block is None:
            await callback.answer("تعذر نقل الجزء.", show_alert=True)
            return
        await save_blocks(state, result.blocks)
        await core._edit_ui(
            callback.message,
            core._block_page(result.block, result.blocks),
            build_block_editor_keyboard(result.block, result.blocks),
        )
        await callback.answer("تم تغيير الموقع")


@router.callback_query(F.data.startswith("r:mt:"))
async def move_to(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with core.user_locks[callback.from_user.id]:
        session = await core._session(callback, state)
        if not session:
            return
        _, blocks = session
        try:
            _, _, block_id, raw_index = callback.data.split(":", 3)
            target_index = int(raw_index)
        except (TypeError, ValueError):
            await callback.answer("الموقع الجديد غير صالح.", show_alert=True)
            return
        await remember(state)
        result = editor_workflow.move(blocks, block_id, target_index)
        if not result.changed:
            await callback.answer("تعذر نقل الجزء؛ ربما تغيرت الجلسة.", show_alert=True)
            return
        await save_blocks(state, result.blocks)
        await state.update_data(current_block_id=None)
        await core._edit_ui(
            callback.message,
            core.MAIN_TEXT,
            build_rich_editor_keyboard(result.blocks),
        )
        await callback.answer("تم تغيير الموقع")


__all__ = [
    "ask_delete",
    "confirm_delete",
    "duplicate_block_action",
    "move_menu",
    "move_one_step",
    "move_to",
    "open_block",
    "router",
]
