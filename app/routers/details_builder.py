from __future__ import annotations

from typing import Any

from aiogram import Bot, F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.draft_store import draft_store
from app.editor.history import remember
from app.editor.workflow import editor_workflow
from app.i18n import t
from app.keyboards import (
    build_details_content_keyboard,
    build_heading_level_keyboard,
    build_inner_block_input_keyboard,
    build_inner_block_keyboard,
    build_list_type_keyboard,
    build_rich_editor_keyboard,
)
from app.routers import editor_core as core
from app.routers.details_support import (
    DETAILS_TYPE,
    details_builder_text,
)
from app.services.factory import (
    MEDIA_CAPTION_TYPES,
    QUOTE_TYPES,
    compatible_child_block_types,
    container_data,
    details_data,
    map_data,
    new_block,
    text_data,
)
from app.services.parser import message_to_blocks, messages_to_blocks
from app.states import RichEditorStates


router = Router(name="details_builder")


async def _finish_details_add(
    message: Message,
    state: FSMContext,
    bot: Bot,
    block: dict[str, Any],
) -> None:
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
    )
    await core._delete_add_step_messages(bot, message, data, state)
    await core._repost_saved_ui(
        bot,
        state,
        f"{t('details.added')}\n\n{core.MAIN_TEXT}",
        build_rich_editor_keyboard(result.blocks),
    )


async def store_pending_details_child(
    message: Message,
    state: FSMContext,
    bot: Bot,
    child: dict[str, Any],
) -> None:
    data = await state.get_data()
    payload = dict(data.get("add_payload") or {})
    children = list(payload.get("children") or [])
    payload["children"] = editor_workflow.add(children, child).blocks
    for key in (
        "child_quote_text",
        "child_quote_html",
        "child_media_children",
        "child_heading_size",
        "child_list_kind",
    ):
        payload.pop(key, None)
    await core._delete_add_step_messages(bot, message, data, state)
    await state.update_data(
        pending_add_type=DETAILS_TYPE,
        pending_child_type=None,
        add_step="details_content",
        add_payload=payload,
    )
    await core._send_add_prompt(
        message,
        state,
        details_builder_text(payload),
        build_details_content_keyboard(len(payload["children"])),
    )


@router.callback_query(F.data == "r:add:details")
async def start_add_details(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await core._session(callback, state)
    if not session:
        return
    await state.set_state(RichEditorStates.adding_block)
    await state.update_data(
        pending_add_type=DETAILS_TYPE,
        pending_child_type=None,
        add_step="details_summary",
        add_payload={},
    )
    if isinstance(callback.message, Message):
        await core._send_add_prompt(
            callback.message,
            state,
            t("details.summary_prompt"),
        )
    await callback.answer()


@router.callback_query(F.data == "r:details:add")
async def open_details_inner_blocks(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    if (
        data.get("pending_add_type") != DETAILS_TYPE
        or not isinstance(callback.message, Message)
    ):
        await callback.answer(t("details.expired"), show_alert=True)
        return
    await state.update_data(
        add_step="details_child_select",
        pending_child_type=None,
    )
    await core._edit_ui(
        callback.message,
        t("details.choose_child"),
        build_inner_block_keyboard(DETAILS_TYPE),
    )
    await callback.answer()


@router.callback_query(F.data == "r:details:content")
async def return_to_details_content(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    if (
        data.get("pending_add_type") != DETAILS_TYPE
        or not isinstance(callback.message, Message)
    ):
        await callback.answer(t("details.expired"), show_alert=True)
        return
    payload = dict(data.get("add_payload") or {})
    children = list(payload.get("children") or [])
    await state.update_data(
        add_step="details_content",
        pending_child_type=None,
        add_payload=payload,
    )
    await core._edit_ui(
        callback.message,
        details_builder_text(payload),
        build_details_content_keyboard(len(children)),
    )
    await callback.answer()


@router.callback_query(F.data == "r:details:cancel")
async def cancel_details_builder(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
) -> None:
    data = await state.get_data()
    if not isinstance(callback.message, Message):
        return
    draft = await draft_store.load(state)
    await core._delete_add_step_messages(
        bot,
        callback.message,
        data,
        state,
    )
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        pending_add_type=None,
        pending_child_type=None,
        add_step=None,
        add_payload=None,
    )
    await core._edit_saved_ui(
        bot,
        state,
        core.MAIN_TEXT,
        build_rich_editor_keyboard(draft.blocks),
    )
    await callback.answer(t("details.cancelled"))


@router.callback_query(F.data == "r:details:finish")
async def finish_details_builder(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
) -> None:
    data = await state.get_data()
    payload = dict(data.get("add_payload") or {})
    children = list(payload.get("children") or [])
    summary_html = payload.get("summary_html")
    if (
        data.get("pending_add_type") != DETAILS_TYPE
        or not isinstance(callback.message, Message)
        or not summary_html
    ):
        await callback.answer(t("details.expired"), show_alert=True)
        return
    if not children:
        await callback.answer(
            t("details.child_required"),
            show_alert=True,
        )
        return
    await _finish_details_add(
        callback.message,
        state,
        bot,
        new_block(
            DETAILS_TYPE,
            details_data(str(summary_html), children),
        ),
    )
    await callback.answer(t("details.added"))


@router.callback_query(F.data.startswith("r:details:type:"))
async def choose_details_child_type(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
) -> None:
    data = await state.get_data()
    child_type = callback.data.rsplit(":", 1)[-1]
    if (
        data.get("pending_add_type") != DETAILS_TYPE
        or child_type not in compatible_child_block_types(DETAILS_TYPE)
        or not isinstance(callback.message, Message)
    ):
        await callback.answer(
            t("details.invalid_child"),
            show_alert=True,
        )
        return
    if child_type == "divider":
        await store_pending_details_child(
            callback.message,
            state,
            bot,
            new_block("divider", {"html": "<hr/>"}),
        )
        await callback.answer(t("details.child_added"))
        return
    if child_type == "heading":
        await state.update_data(
            add_step="details_child_heading",
            pending_child_type="heading",
        )
        await core._edit_ui(
            callback.message,
            t("details.choose_heading"),
            build_heading_level_keyboard("details"),
        )
        await callback.answer()
        return
    if child_type == "list":
        await core._edit_ui(
            callback.message,
            t("list.menu_title"),
            build_list_type_keyboard(
                callback_prefix="r:details:list",
                back_data="r:details:add",
            ),
        )
        await callback.answer()
        return

    prompts = {
        "paragraph": t("details.send_paragraph"),
        "preformatted": core._code_input_prompt(),
        "footer": t("details.send_footer"),
        "mathematical_expression": t("math.add_prompt"),
        "anchor": t("details.send_anchor"),
        "table": t("details.send_table"),
        "blockquote": t("details.send_quote"),
        "pullquote": t("details.send_pullquote"),
        "collage": t("details.send_collage"),
        "slideshow": t("details.send_slideshow"),
        "map": t("details.send_map"),
        "animation": t("details.send_animation"),
        "audio": t("details.send_audio"),
        "document": t("details.send_document"),
        "photo": t("details.send_photo"),
        "video": t("details.send_video"),
        "voice": t("details.send_voice"),
    }
    await state.update_data(
        add_step=(
            "details_child_quote_text"
            if child_type in QUOTE_TYPES
            else "details_child_content"
        ),
        pending_child_type=child_type,
    )
    await core._edit_ui(
        callback.message,
        prompts[child_type],
        build_inner_block_input_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:details:list:"))
async def choose_details_list_type(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    list_kind = callback.data.rsplit(":", 1)[-1]
    if (
        data.get("pending_add_type") != DETAILS_TYPE
        or list_kind not in {"bullet", "numbered", "checklist"}
        or not isinstance(callback.message, Message)
    ):
        await callback.answer(t("list.invalid"), show_alert=True)
        return
    payload = dict(data.get("add_payload") or {})
    payload["child_list_kind"] = list_kind
    await state.update_data(
        add_step="details_child_content",
        pending_child_type="list",
        add_payload=payload,
    )
    await core._edit_ui(
        callback.message,
        t(f"list.{list_kind}_prompt"),
        build_inner_block_input_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:hs:details:"))
async def choose_details_heading_level(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    data = await state.get_data()
    if (
        data.get("pending_add_type") != DETAILS_TYPE
        or not isinstance(callback.message, Message)
    ):
        await callback.answer(t("details.expired"), show_alert=True)
        return
    try:
        heading_size = int(callback.data.rsplit(":", 1)[-1])
    except (TypeError, ValueError):
        heading_size = 0
    if heading_size not in range(1, 7):
        await callback.answer(
            t("details.invalid_heading"),
            show_alert=True,
        )
        return
    payload = dict(data.get("add_payload") or {})
    payload["child_heading_size"] = heading_size
    await state.update_data(
        add_step="details_child_content",
        pending_child_type="heading",
        add_payload=payload,
    )
    await core._edit_ui(
        callback.message,
        t("details.heading_selected", level=heading_size),
        build_inner_block_input_keyboard(),
    )
    await callback.answer()


@router.message(RichEditorStates.adding_block)
async def receive_details_add(
    message: Message,
    state: FSMContext,
    bot: Bot,
) -> None:
    data = await state.get_data()
    if data.get("pending_add_type") != DETAILS_TYPE:
        raise SkipHandler
    if await core._defer_text_for_user_buttons(
        message,
        state,
        "adding_block",
    ):
        return

    step = data.get("add_step")
    payload = dict(data.get("add_payload") or {})

    if step == "details_summary":
        if not message.text:
            await message.answer(t("details.summary_text_required"))
            return
        await core._delete_add_step_messages(bot, message, data, state)
        payload = {
            "summary_html": message.html_text,
            "children": [],
        }
        await state.update_data(
            add_step="details_content",
            add_payload=payload,
        )
        await core._send_add_prompt(
            message,
            state,
            details_builder_text(payload),
            build_details_content_keyboard(),
        )
        return

    if step == "details_child_quote_text":
        child_type = data.get("pending_child_type")
        if child_type not in QUOTE_TYPES:
            await message.answer(t("details.invalid_child"))
            return
        if not message.text:
            if message.media_group_id:
                collected = await core.albums.collect(message)
                if collected is None:
                    return
                parsed = messages_to_blocks(collected)
            else:
                parsed = message_to_blocks(message)
            media_children, caption = core._quote_media_payload(parsed)
            if not media_children:
                await message.answer(
                    t("details.quote_content_required"),
                )
                return
            await core._delete_add_step_messages(
                bot,
                message,
                data,
                state,
            )
            payload["child_media_children"] = media_children
            if caption:
                payload["child_quote_text"] = (
                    caption["data"].get("text", "")
                )
                payload["child_quote_html"] = (
                    caption["data"].get("html", "")
                )
                next_step = "details_child_quote_credit"
                prompt = t("details.quote_credit_prompt")
            else:
                next_step = "details_child_pullquote_text"
                prompt = t("details.quote_text_after_media")
            await state.update_data(
                add_step=next_step,
                add_payload=payload,
            )
            await core._send_add_prompt(
                message,
                state,
                prompt,
                build_inner_block_input_keyboard(),
            )
            return

        await core._delete_add_step_messages(
            bot,
            message,
            data,
            state,
        )
        payload["child_quote_text"] = message.text
        payload["child_quote_html"] = message.html_text
        await state.update_data(
            add_step="details_child_quote_credit",
            add_payload=payload,
        )
        await core._send_add_prompt(
            message,
            state,
            t("details.quote_credit_prompt"),
            build_inner_block_input_keyboard(),
        )
        return

    if step == "details_child_pullquote_text":
        if not message.text:
            await message.answer(t("details.quote_text_required"))
            return
        payload["child_quote_text"] = message.text
        payload["child_quote_html"] = message.html_text
        await state.update_data(
            add_step="details_child_quote_credit",
            add_payload=payload,
        )
        await core._send_add_prompt(
            message,
            state,
            t("details.quote_credit_prompt"),
            build_inner_block_input_keyboard(),
        )
        return

    if step == "details_child_quote_credit":
        if not message.text:
            await message.answer(t("details.quote_credit_required"))
            return
        child_type = data.get("pending_child_type")
        if child_type not in QUOTE_TYPES:
            await message.answer(t("details.invalid_child"))
            return
        credit = (
            None
            if message.text.strip().lower() == "/skip"
            else message.html_text
        )
        await store_pending_details_child(
            message,
            state,
            bot,
            new_block(child_type, {
                "quote_text": payload.get("child_quote_text", ""),
                "quote_html": payload.get("child_quote_html", ""),
                "credit_html": credit,
                "media_children": payload.get(
                    "child_media_children",
                    [],
                ),
            }),
        )
        return

    if step == "details_child_content":
        child_type = data.get("pending_child_type")
        if child_type not in compatible_child_block_types(DETAILS_TYPE):
            await message.answer(t("details.invalid_child"))
            return
        child: dict[str, Any] | None = None

        if child_type in {"collage", "slideshow"}:
            if message.media_group_id:
                collected = await core.albums.collect(message)
                if collected is None:
                    return
                children = messages_to_blocks(collected)
            else:
                children = message_to_blocks(message)
            children = [
                item
                for item in children
                if item.get("type") in {"photo", "video"}
            ]
            if children:
                child = new_block(
                    child_type,
                    container_data(children),
                )
        elif child_type == "map":
            if message.location:
                child = new_block(
                    "map",
                    map_data(
                        message.location.latitude,
                        message.location.longitude,
                    ),
                )
        elif child_type in {
            "photo",
            "video",
            "animation",
            "audio",
            "voice",
            "document",
            "mathematical_expression",
        }:
            parsed = message_to_blocks(message)
            child = next(
                (
                    item
                    for item in parsed
                    if item.get("type") == child_type
                ),
                None,
            )
            if child is not None and child_type in MEDIA_CAPTION_TYPES:
                caption = next(
                    (
                        item
                        for item in parsed
                        if item.get("type") == "caption"
                    ),
                    None,
                )
                if caption:
                    child["data"]["caption_html"] = (
                        caption["data"].get("html")
                    )
                child["data"].setdefault("credit_html", None)
        elif (
            child_type
            in {
                "paragraph",
                "heading",
                "preformatted",
                "footer",
                "anchor",
                "list",
                "table",
            }
            and message.text
        ):
            child_data = text_data(
                message,
                child_type,
                int(payload.get("child_heading_size", 2)),
                str(payload.get("child_list_kind", "bullet")),
            )
            if child_type == "list" and not child_data.get("items"):
                await message.answer(t("list.empty"))
                return
            child = new_block(child_type, child_data)

        if child is None:
            await message.answer(t("details.wrong_child_content"))
            return
        await store_pending_details_child(
            message,
            state,
            bot,
            child,
        )
        return

    if step == "details_content":
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
        children = list(payload.get("children") or [])
        for child in incoming:
            children = editor_workflow.add(children, child).blocks
        await _finish_details_add(
            message,
            state,
            bot,
            new_block(
                DETAILS_TYPE,
                details_data(
                    str(payload.get("summary_html") or ""),
                    children,
                ),
            ),
        )
        return

    raise SkipHandler


__all__ = [
    "router",
    "store_pending_details_child",
]
