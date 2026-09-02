from __future__ import annotations

import logging

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramAPIError
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.document import get_block_by_id
from app.editor.history import remember
from app.editor.preview import send_preview
from app.i18n import t
from app.keyboards import (
    build_details_inner_block_keyboard,
    build_details_inner_blocks_keyboard,
    build_details_inner_delete_keyboard,
)
from app.editor.session import load_editor_session
from app.routers.editor_ui import edit_ui, send_add_prompt
from app.routers.details_support import (
    details_inner_list_text,
    details_inner_page,
    save_document,
)
from app.services.details_editor import (
    DETAILS_TYPE,
    delete_details_child,
    details_children,
    find_details_child,
    move_details_child,
)
from app.editor.specs import MEDIA_CAPTION_TYPES, QUOTE_TYPES
from app.states import RichEditorStates


router = Router(name="details_manager")
logger = logging.getLogger(__name__)


def _parse_child_callback(
    data: str,
    prefix: str,
) -> tuple[str, str] | None:
    parts = data.removeprefix(prefix).split(":")
    if len(parts) != 2 or not all(parts):
        return None
    return parts[0], parts[1]


@router.callback_query(F.data.startswith("r:dim:"))
async def open_details_inner_manager(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    details_id = callback.data.rsplit(":", 1)[-1]
    details = get_block_by_id(blocks, details_id)
    if details is None or details.get("type") != DETAILS_TYPE:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await edit_ui(
        callback.message,
        details_inner_list_text(details),
        build_details_inner_blocks_keyboard(details),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:di:"))
async def open_details_inner_block(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parsed = _parse_child_callback(callback.data, "r:di:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = find_details_child(details, child_id) if details else None
    if (
        details is None
        or details.get("type") != DETAILS_TYPE
        or child is None
    ):
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await edit_ui(
        callback.message,
        details_inner_page(details, child),
        build_details_inner_block_keyboard(details, child),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:dip:"))
async def preview_details_inner_block(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
) -> None:
    session = await load_editor_session(callback, state)
    if not session:
        return
    _, blocks = session
    parsed = _parse_child_callback(callback.data, "r:dip:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = find_details_child(details, child_id) if details else None
    if child is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await callback.answer(t("preview_generating"))
    try:
        await send_preview(bot, callback.from_user.id, [child])
    except (ValueError, TelegramAPIError):
        logger.exception(
            "Failed to preview nested Details block %s",
            child_id,
        )
        await bot.send_message(
            callback.from_user.id,
            t("preview_failed"),
        )


@router.callback_query(F.data.startswith("r:die:"))
async def edit_details_inner_block(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parsed = _parse_child_callback(callback.data, "r:die:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = find_details_child(details, child_id) if details else None
    if child is None or child.get("type") == "divider":
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await state.update_data(
        nested_details_id=details_id,
        nested_child_id=child_id,
        nested_action="content",
        expected_type=child.get("type"),
        edit_field=None,
    )
    await state.set_state(RichEditorStates.editing_block)
    await send_add_prompt(
        callback.message,
        state,
        t("details.inner_send_content"),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:dif:"))
async def edit_details_inner_field(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parts = callback.data.removeprefix("r:dif:").split(":")
    if len(parts) != 3:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id, action = parts
    details = get_block_by_id(blocks, details_id)
    child = find_details_child(details, child_id) if details else None
    allowed = bool(
        child
        and (
            (
                action == "add_footer"
                and child.get("type")
                not in {"footer", "divider", "anchor"}
            )
            or (
                action == "caption"
                and child.get("type") in MEDIA_CAPTION_TYPES
            )
            or (
                action == "credit"
                and child.get("type")
                in MEDIA_CAPTION_TYPES | QUOTE_TYPES
            )
        )
    )
    if not allowed:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    assert child is not None
    await state.update_data(
        nested_details_id=details_id,
        nested_child_id=child_id,
        nested_action=action,
        expected_type=child.get("type"),
        edit_field=None,
    )
    await state.set_state(RichEditorStates.editing_block)
    prompt_key = {
        "caption": "details.inner_send_caption",
        "credit": "details.inner_send_credit",
        "add_footer": "details.inner_send_footer",
    }[action]
    await send_add_prompt(
        callback.message,
        state,
        t(prompt_key),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:did:"))
async def ask_delete_details_inner(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parsed = _parse_child_callback(callback.data, "r:did:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = find_details_child(details, child_id) if details else None
    if child is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await edit_ui(
        callback.message,
        t("details.inner_delete_question"),
        build_details_inner_delete_keyboard(
            details_id,
            child_id,
        ),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:didok:"))
async def confirm_delete_details_inner(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parsed = _parse_child_callback(callback.data, "r:didok:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    if details is None or details.get("type") != DETAILS_TYPE:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await remember(state)
    if not delete_details_child(details, child_id):
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await save_document(state, blocks)
    await edit_ui(
        callback.message,
        details_inner_list_text(details),
        build_details_inner_blocks_keyboard(details),
    )
    await callback.answer(t("details.inner_deleted"))


@router.callback_query(F.data.startswith("r:dimu:"))
@router.callback_query(F.data.startswith("r:dimd:"))
async def move_details_inner(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    prefix = (
        "r:dimu:"
        if callback.data.startswith("r:dimu:")
        else "r:dimd:"
    )
    parsed = _parse_child_callback(callback.data, prefix)
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = find_details_child(details, child_id) if details else None
    if details is None or child is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    children = details_children(details)
    current = children.index(child)
    target = current - 1 if prefix == "r:dimu:" else current + 1
    if not 0 <= target < len(children):
        await callback.answer(
            t("details.inner_current_position"),
        )
        return
    await remember(state)
    if not move_details_child(details, child_id, target):
        await callback.answer(
            t("details.inner_current_position"),
        )
        return
    await save_document(state, blocks)
    moved = find_details_child(details, child_id)
    assert moved is not None
    await edit_ui(
        callback.message,
        details_inner_page(details, moved),
        build_details_inner_block_keyboard(details, moved),
    )
    await callback.answer(t("details.inner_moved"))


__all__ = ["router"]
