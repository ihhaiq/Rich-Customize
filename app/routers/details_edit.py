from __future__ import annotations

from typing import Any

from aiogram import Bot, F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.document import get_block_by_id
from app.editor.history import remember
from app.i18n import t
from app.keyboards import build_details_inner_block_keyboard
from app.routers import editor_core as core
from app.routers.block_keyboard import build_managed_block_keyboard
from app.routers.details_support import (
    DETAILS_TYPE,
    add_details_child,
    detach_native_details,
    details_child,
    details_children,
    details_inner_page,
    replace_details_child,
    replace_details_children,
    save_document,
)
from app.services.factory import (
    MEDIA_CAPTION_TYPES,
    new_block,
    text_data,
)
from app.services.parser import (
    message_to_blocks,
    messages_to_blocks,
    replacement_data,
)
from app.states import RichEditorStates


router = Router(name="details_edit")


async def receive_nested_replacement(
    message: Message,
    state: FSMContext,
    bot: Bot,
    data: dict[str, Any] | None = None,
) -> bool:
    current_data = data or await state.get_data()
    details_id = current_data.get("nested_details_id")
    child_id = current_data.get("nested_child_id")
    action = current_data.get("nested_action")
    if not details_id or not child_id or not action:
        return False

    blocks = current_data.get("blocks") or []
    details = get_block_by_id(blocks, str(details_id))
    child = details_child(details, str(child_id)) if details else None
    if details is None or child is None:
        await message.answer(t("missing_block"))
        await state.set_state(RichEditorStates.managing)
        return True

    if action in {"caption", "credit", "add_footer"} and not message.text:
        await message.answer(t("details.inner_text_required"))
        return True

    await remember(state)
    selected = child

    if action == "add_footer":
        footer = new_block("footer", text_data(message, "footer"))
        position = details_children(details).index(child) + 1
        add_details_child(details, footer, index=position)
        selected = footer
    elif action == "caption":
        detach_native_details(details)
        child["source"] = "generated"
        child["data"].pop("native", None)
        child["data"].pop("native_data", None)
        child["data"]["caption_html"] = (
            None
            if message.text.strip().lower() == "/remove"
            else message.html_text
        )
    elif action == "credit":
        detach_native_details(details)
        child["source"] = "generated"
        child["data"].pop("native", None)
        child["data"].pop("native_data", None)
        child["data"]["credit_html"] = (
            None
            if message.text.strip().lower() in {"/remove", "/skip"}
            else message.html_text
        )
    else:
        expected = str(
            current_data.get("expected_type")
            or child.get("type")
            or ""
        )

        if expected in {"collage", "slideshow"}:
            if message.media_group_id:
                collected = await core.albums.collect(message)
                if collected is None:
                    return True
                parsed = messages_to_blocks(collected)
            else:
                parsed = message_to_blocks(message)
            media_children = [
                item
                for item in parsed
                if item.get("type") in {"photo", "video"}
            ]
            if not media_children:
                await message.answer(t("details.inner_wrong_content"))
                return True
            candidate = new_block(
                expected,
                {
                    **child.get("data", {}),
                    "children": media_children,
                },
            )
        else:
            replacement = replacement_data(message, expected)
            if replacement is None:
                await message.answer(t("details.inner_wrong_content"))
                return True
            if expected in MEDIA_CAPTION_TYPES:
                replacement["caption_html"] = (
                    child.get("data", {}).get("caption_html")
                )
                replacement["credit_html"] = (
                    child.get("data", {}).get("credit_html")
                )
            candidate = new_block(expected, replacement)

        selected = (
            replace_details_child(
                details,
                str(child_id),
                candidate,
            )
            or child
        )

    await save_document(state, blocks)
    await core._delete_add_step_messages(
        bot,
        message,
        current_data,
        state,
    )
    await state.update_data(
        nested_details_id=None,
        nested_child_id=None,
        nested_action=None,
        expected_type=None,
    )
    await state.set_state(RichEditorStates.managing)
    await core._edit_saved_ui(
        bot,
        state,
        details_inner_page(details, selected),
        build_details_inner_block_keyboard(details, selected),
    )
    return True


@router.message(RichEditorStates.editing_block)
async def receive_details_edit(
    message: Message,
    state: FSMContext,
    bot: Bot,
) -> None:
    data = await state.get_data()
    owns_details_edit = bool(
        data.get("nested_details_id")
        or data.get("expected_type") == DETAILS_TYPE
    )
    if (
        owns_details_edit
        and await core._defer_text_for_user_buttons(
            message,
            state,
            "editing_block",
        )
    ):
        return

    if data.get("nested_details_id"):
        if await receive_nested_replacement(
            message,
            state,
            bot,
            data,
        ):
            return

    if data.get("expected_type") != DETAILS_TYPE:
        raise SkipHandler

    blocks = data.get("blocks") or []
    block_id = data.get("current_block_id")
    details = (
        get_block_by_id(blocks, str(block_id))
        if block_id
        else None
    )
    if details is None or details.get("type") != DETAILS_TYPE:
        raise SkipHandler

    if data.get("edit_field") == "summary":
        if not message.text:
            await message.answer(t("details.summary_text_required"))
            return
        await remember(state)
        detach_native_details(details)
        details.setdefault("data", {})["summary_html"] = message.html_text
    else:
        if message.media_group_id:
            collected = await core.albums.collect(message)
            if collected is None:
                return
            incoming = messages_to_blocks(collected)
        else:
            incoming = message_to_blocks(message)

        if not incoming:
            await message.answer(t("details.unsupported_content"))
            return
        if (
            len(incoming) == 1
            and incoming[0].get("type") == DETAILS_TYPE
        ):
            incoming = list(
                incoming[0]
                .get("data", {})
                .get("children")
                or []
            )
        if not incoming:
            await message.answer(t("details.unsupported_content"))
            return

        await remember(state)
        replace_details_children(details, incoming)

    await save_document(state, blocks)
    await core._delete_add_step_messages(bot, message, data, state)
    await state.update_data(
        current_block_id=None,
        expected_type=None,
        edit_field=None,
    )
    await state.set_state(RichEditorStates.managing)
    await core._edit_saved_ui(
        bot,
        state,
        core._block_page(details, blocks),
        build_managed_block_keyboard(details, blocks),
    )


@router.callback_query(F.data.startswith("r:e:"))
async def edit_details_content(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None or block.get("type") != DETAILS_TYPE:
        raise SkipHandler
    await state.set_state(RichEditorStates.editing_block)
    await state.update_data(
        current_block_id=block_id,
        expected_type=DETAILS_TYPE,
        edit_field=None,
    )
    await core._send_add_prompt(
        callback.message,
        state,
        t("details.replace_content_prompt"),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:f:"))
async def edit_details_summary(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    try:
        _, _, block_id, field = callback.data.split(":", 3)
    except ValueError:
        raise SkipHandler
    block = get_block_by_id(blocks, block_id)
    if (
        field != "summary"
        or block is None
        or block.get("type") != DETAILS_TYPE
    ):
        raise SkipHandler
    await state.set_state(RichEditorStates.editing_block)
    await state.update_data(
        current_block_id=block_id,
        expected_type=DETAILS_TYPE,
        edit_field="summary",
    )
    await core._send_add_prompt(
        callback.message,
        state,
        t("details.summary_edit_prompt"),
    )
    await callback.answer()


__all__ = [
    "receive_nested_replacement",
    "router",
]
