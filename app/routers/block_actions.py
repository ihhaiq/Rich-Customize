from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.history import remember
from app.editor.draft_store import draft_store
from app.editor.workflow import editor_workflow
from app.i18n import t, tr
from app.keyboards import (
    build_anchor_target_keyboard,
    build_block_position_keyboard,
    build_delete_confirmation_keyboard,
    build_linked_anchor_delete_keyboard,
    build_rich_editor_keyboard,
)
from app.states import RichEditorStates

from app.editor.session import load_editor_session, user_locks
from app.routers.block_view import block_page
from app.routers.editor_ui import MAIN_TEXT, edit_ui, editor_dashboard_text
from app.routers.block_keyboard import build_managed_block_keyboard
from app.routers.block_support import block_by_id, save_blocks
from app.services.anchors import (
    anchor_display_name,
    anchor_targets,
    linked_anchors,
    retarget_linked_anchors,
    set_anchor_target,
)


router = Router(name="block_actions")


@router.callback_query(F.data.startswith("r:b:"))
async def open_block(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = block_by_id(blocks, block_id)
    if block is None:
        await callback.answer(t("missing_block"), show_alert=True)
        await edit_ui(
            callback.message,
            tr(MAIN_TEXT),
            build_rich_editor_keyboard(blocks),
        )
        return
    await state.update_data(current_block_id=block_id)
    await edit_ui(
        callback.message,
        block_page(block, blocks),
        build_managed_block_keyboard(block, blocks),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:dup:"))
async def duplicate_block_action(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    if block_by_id(blocks, block_id) is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    result = editor_workflow.duplicate(blocks, block_id, after=True)
    if not result.changed or result.block is None:
        await callback.answer(tr("تعذر نسخ هذا الجزء."), show_alert=True)
        return
    await remember(state)
    await save_blocks(state, result.blocks)
    await state.update_data(current_block_id=result.block["id"])
    await edit_ui(
        callback.message,
        block_page(result.block, result.blocks),
        build_managed_block_keyboard(result.block, result.blocks),
    )
    await callback.answer(t("block.duplicated"))


@router.callback_query(F.data.startswith("r:d:"))
async def ask_delete(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    if block_by_id(blocks, block_id) is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    anchors = linked_anchors(blocks, block_id)
    if anchors:
        await edit_ui(
            callback.message,
            t("anchor.target_delete_warning", count=len(anchors)),
            build_linked_anchor_delete_keyboard(block_id, blocks),
        )
        await callback.answer()
        return
    await edit_ui(
        callback.message,
        tr("هل تريد حذف هذا الجزء؟"),
        build_delete_confirmation_keyboard(block_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:dc:"))
async def confirm_delete(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session:
            return
        _, blocks = session
        block_id = callback.data.rsplit(":", 1)[-1]
        anchors = linked_anchors(blocks, block_id)
        if anchors:
            await edit_ui(
                callback.message,
                t("anchor.target_delete_warning", count=len(anchors)),
                build_linked_anchor_delete_keyboard(block_id, blocks),
            )
            await callback.answer(
                t("anchor.target_delete_warning", count=len(anchors)),
                show_alert=True,
            )
            return
        result = editor_workflow.delete(blocks, block_id)
        if not result.changed:
            await callback.answer(t("missing_block"), show_alert=True)
            return
        await remember(state)
        await save_blocks(state, result.blocks)
        await state.set_state(RichEditorStates.managing)
        await state.update_data(current_block_id=None)
        await edit_ui(
            callback.message,
            (
                editor_dashboard_text(await draft_store.load(state), t("delete"))
                if result.blocks else t("editor.empty_hint")
            ),
            build_rich_editor_keyboard(
                result.blocks, (await draft_store.load(state)).message_buttons,
            ),
        )
        await callback.answer(tr("تم الحذف"))


@router.callback_query(F.data.startswith("r:adc:"))
async def delete_target_with_anchors(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session:
            return
        _, blocks = session
        block_id = callback.data.rsplit(":", 1)[-1]
        result = editor_workflow.delete(blocks, block_id)
        if not result.changed:
            await callback.answer(t("editor.block_missing"), show_alert=True)
            return
        await remember(state)
        await save_blocks(state, result.blocks)
        await state.set_state(RichEditorStates.managing)
        await state.update_data(current_block_id=None)
        draft = await draft_store.load(state)
        await edit_ui(
            callback.message,
            editor_dashboard_text(draft, t("anchor.deleted")),
            build_rich_editor_keyboard(result.blocks, draft.message_buttons),
        )
        await callback.answer(t("anchor.deleted"))


@router.callback_query(F.data.startswith("r:adr:"))
async def retarget_anchors_before_delete(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session:
            return
        _, blocks = session
        try:
            _, _, block_id, target_id = callback.data.split(":", 3)
        except ValueError:
            await callback.answer(t("editor.block_missing"), show_alert=True)
            return
        if not retarget_linked_anchors(blocks, block_id, target_id):
            await callback.answer(t("editor.block_missing"), show_alert=True)
            return
        result = editor_workflow.delete(blocks, block_id)
        if not result.changed:
            await callback.answer(t("editor.block_missing"), show_alert=True)
            return
        await remember(state)
        await save_blocks(state, result.blocks)
        await state.set_state(RichEditorStates.managing)
        await state.update_data(current_block_id=None)
        draft = await draft_store.load(state)
        await edit_ui(
            callback.message,
            editor_dashboard_text(draft, t("anchor.deleted")),
            build_rich_editor_keyboard(result.blocks, draft.message_buttons),
        )
        await callback.answer(t("anchor.deleted"))


@router.callback_query(F.data.startswith("r:am:"))
async def change_anchor_target_menu(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    anchor_id = callback.data.rsplit(":", 1)[-1]
    anchor = block_by_id(blocks, anchor_id)
    if anchor is None or anchor.get("type") != "anchor":
        await callback.answer(t("editor.block_missing"), show_alert=True)
        return
    if not anchor_targets(blocks):
        await callback.answer(t("anchor.no_targets"), show_alert=True)
        return
    await edit_ui(
        callback.message,
        t("anchor.choose_target", name=anchor_display_name(anchor)),
        build_anchor_target_keyboard(
            blocks,
            callback_prefix=f"r:art:{anchor_id}",
            back_data=f"r:b:{anchor_id}",
        ),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:art:"))
async def change_anchor_target(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session:
            return
        _, blocks = session
        try:
            _, _, anchor_id, target_id = callback.data.split(":", 3)
        except ValueError:
            await callback.answer(t("editor.block_missing"), show_alert=True)
            return
        if not set_anchor_target(blocks, anchor_id, target_id):
            await callback.answer(t("editor.block_missing"), show_alert=True)
            return
        await remember(state)
        await save_blocks(state, blocks)
        anchor = block_by_id(blocks, anchor_id)
        assert anchor is not None
        await edit_ui(
            callback.message,
            block_page(anchor, blocks),
            build_managed_block_keyboard(anchor, blocks),
        )
        await callback.answer(t("anchor.target_changed"))


@router.callback_query(F.data.startswith("r:m:"))
async def move_menu(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    if block_by_id(blocks, block_id) is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await edit_ui(
        callback.message,
        tr("اختر الموقع الجديد:"),
        build_block_position_keyboard(blocks, block_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:mu:"))
@router.callback_query(F.data.startswith("r:md:"))
async def move_one_step(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session:
            return
        _, blocks = session
        block_id = callback.data.rsplit(":", 1)[-1]
        ordered = sorted(blocks, key=lambda item: int(item.get("position", 0)))
        block = block_by_id(ordered, block_id)
        if block is None:
            await callback.answer(t("missing_block"), show_alert=True)
            return
        current_index = ordered.index(block)
        target_index = (
            current_index - 1
            if callback.data.startswith("r:mu:")
            else current_index + 1
        )
        if not 0 <= target_index < len(ordered):
            await callback.answer(tr("هذا الجزء وصل إلى نهاية الترتيب."))
            return
        result = editor_workflow.move(blocks, block_id, target_index)
        if not result.changed or result.block is None:
            await callback.answer(tr("تعذر نقل الجزء."), show_alert=True)
            return
        await remember(state)
        await save_blocks(state, result.blocks)
        await edit_ui(
            callback.message,
            block_page(result.block, result.blocks),
            build_managed_block_keyboard(result.block, result.blocks),
        )
        await callback.answer(tr("تم تغيير الموقع"))


@router.callback_query(F.data.startswith("r:mt:"))
async def move_to(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user or not isinstance(callback.message, Message):
        return
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session:
            return
        _, blocks = session
        try:
            _, _, block_id, raw_index = callback.data.split(":", 3)
            target_index = int(raw_index)
        except (TypeError, ValueError):
            await callback.answer(tr("الموقع الجديد غير صالح."), show_alert=True)
            return
        result = editor_workflow.move(blocks, block_id, target_index)
        if not result.changed:
            await callback.answer(tr("تعذر نقل الجزء؛ ربما تغيرت الجلسة."), show_alert=True)
            return
        await remember(state)
        await save_blocks(state, result.blocks)
        await state.update_data(current_block_id=None)
        await edit_ui(
            callback.message,
            editor_dashboard_text(await draft_store.load(state)),
            build_rich_editor_keyboard(
                result.blocks, (await draft_store.load(state)).message_buttons,
            ),
        )
        await callback.answer(tr("تم تغيير الموقع"))


__all__ = [
    "ask_delete",
    "change_anchor_target",
    "change_anchor_target_menu",
    "confirm_delete",
    "delete_target_with_anchors",
    "duplicate_block_action",
    "move_menu",
    "move_one_step",
    "move_to",
    "open_block",
    "retarget_anchors_before_delete",
    "router",
]
