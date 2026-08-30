from __future__ import annotations

from typing import Any

from aiogram import Bot, F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.exceptions import TelegramAPIError
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.document import get_block_by_id
from app.editor.draft_store import draft_store
from app.editor.history import remember
from app.editor.preview import send_preview
from app.editor.workflow import editor_workflow
from app.i18n import t
from app.keyboards import (
    build_block_editor_keyboard,
    build_details_content_keyboard,
    build_details_inner_block_keyboard,
    build_details_inner_blocks_keyboard,
    build_details_inner_delete_keyboard,
    build_heading_level_keyboard,
    build_inner_block_input_keyboard,
    build_inner_block_keyboard,
    build_list_type_keyboard,
    build_rich_editor_keyboard,
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
from app.services.parser import message_to_blocks, messages_to_blocks, replacement_data
from app.states import RichEditorStates

from app.routers import editor_core as core


router = Router(name="details")
DETAILS_TYPE = "details"

# The exact legacy callback functions are detached once this router is installed.
# Generic legacy message handlers remain registered for other block types, but
# this router is included first and owns every active Details flow.
LEGACY_DETAILS_CALLBACKS = frozenset({
    "open_details_inner_blocks",
    "return_to_details_content",
    "cancel_details_builder",
    "finish_details_builder",
    "choose_details_child_type",
    "choose_details_list_type",
    "open_details_inner_manager",
    "open_details_inner_block",
    "preview_details_inner_block",
    "edit_details_inner_block",
    "edit_details_inner_field",
    "ask_delete_details_inner",
    "confirm_delete_details_inner",
    "move_details_inner",
})


def details_children(details: dict[str, Any]) -> list[dict[str, Any]]:
    data = details.setdefault("data", {})
    children = data.get("children")
    if not isinstance(children, list):
        children = []
        data["children"] = children
    return children


def details_child(details: dict[str, Any], child_id: str) -> dict[str, Any] | None:
    return get_block_by_id(details_children(details), child_id)


def detach_native_details(details: dict[str, Any]) -> None:
    data = details.setdefault("data", {})
    details["source"] = "generated"
    for key in ("native", "native_data", "native_type", "html"):
        data.pop(key, None)


def _apply_children(details: dict[str, Any], children: list[dict[str, Any]]) -> None:
    detach_native_details(details)
    details.setdefault("data", {})["children"] = children


def add_details_child(
    details: dict[str, Any],
    child: dict[str, Any],
    *,
    index: int | None = None,
) -> dict[str, Any]:
    result = editor_workflow.add(details_children(details), child, index=index)
    _apply_children(details, result.blocks)
    assert result.block is not None
    return result.block


def delete_details_child(details: dict[str, Any], child_id: str) -> bool:
    result = editor_workflow.delete(details_children(details), child_id)
    if result.changed:
        _apply_children(details, result.blocks)
    return result.changed


def move_details_child(details: dict[str, Any], child_id: str, new_index: int) -> bool:
    result = editor_workflow.move(details_children(details), child_id, new_index)
    if result.changed:
        _apply_children(details, result.blocks)
    return result.changed


def replace_details_child(
    details: dict[str, Any],
    child_id: str,
    replacement: dict[str, Any],
) -> dict[str, Any] | None:
    result = editor_workflow.replace(details_children(details), child_id, replacement)
    if not result.changed:
        return None
    _apply_children(details, result.blocks)
    return result.block


def details_builder_text(payload: dict[str, Any]) -> str:
    count = len(payload.get("children") or [])
    return t("details.builder_text", count=count)


def details_inner_list_text(details: dict[str, Any]) -> str:
    children = details_children(details)
    lines = [
        t("details.inner_list_title"),
        t("details.inner_count", count=len(children)),
        "",
    ]
    for position, child in enumerate(children, start=1):
        label = core.BLOCK_LABELS.get(
            str(child.get("type", "")),
            t("block.content"),
        )
        lines.append(f"{position}. {label}")
    lines.extend(["", t("common.choose_action")])
    return "\n".join(lines)


def details_inner_page(
    details: dict[str, Any],
    child: dict[str, Any],
) -> str:
    children = details_children(details)
    position = children.index(child) + 1
    label = core.BLOCK_LABELS.get(
        str(child.get("type", "")),
        t("block.content"),
    )
    return "\n".join([
        t("details.inner_settings_title"),
        t("details.inner_type", name=label),
        t("details.inner_position", current=position, total=len(children)),
        "",
        t("common.choose_action"),
    ])


async def _save_document(state: FSMContext, blocks: list[dict[str, Any]]) -> None:
    draft = await draft_store.load(state)
    draft.blocks = blocks
    await draft_store.save(state, draft)


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
    result = editor_workflow.add(children, child)
    payload["children"] = result.blocks
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
        build_details_content_keyboard(len(result.blocks)),
    )


def _callback_function_name(handler: Any) -> str:
    callback = getattr(handler, "callback", None)
    return str(getattr(callback, "__name__", ""))


def detach_legacy_details_handlers(legacy_module: Any) -> tuple[str, ...]:
    """Remove legacy Details callback registrations after the new router is ready."""
    observer = legacy_module.router.callback_query
    removed: list[str] = []
    kept = []
    for handler in observer.handlers:
        name = _callback_function_name(handler)
        if name in LEGACY_DETAILS_CALLBACKS:
            removed.append(name)
        else:
            kept.append(handler)
    observer.handlers[:] = kept
    return tuple(removed)


def legacy_details_handlers(legacy_module: Any) -> tuple[str, ...]:
    return tuple(
        _callback_function_name(handler)
        for handler in legacy_module.router.callback_query.handlers
        if _callback_function_name(handler) in LEGACY_DETAILS_CALLBACKS
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
    await state.update_data(add_step="details_child_select", pending_child_type=None)
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
    await core._delete_add_step_messages(bot, callback.message, data, state)
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
        await callback.answer(t("details.child_required"), show_alert=True)
        return
    block = new_block(
        DETAILS_TYPE,
        details_data(str(summary_html), children),
    )
    await _finish_details_add(callback.message, state, bot, block)
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
        await callback.answer(t("details.invalid_child"), show_alert=True)
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
    step = (
        "details_child_quote_text"
        if child_type in QUOTE_TYPES
        else "details_child_content"
    )
    await state.update_data(add_step=step, pending_child_type=child_type)
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
        await callback.answer(t("details.invalid_heading"), show_alert=True)
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
    if await core._defer_text_for_user_buttons(message, state, "adding_block"):
        return

    step = data.get("add_step")
    payload = dict(data.get("add_payload") or {})

    if step == "details_summary":
        if not message.text:
            await message.answer(t("details.summary_text_required"))
            return
        await core._delete_add_step_messages(bot, message, data, state)
        payload = {"summary_html": message.html_text, "children": []}
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
                await message.answer(t("details.quote_content_required"))
                return
            await core._delete_add_step_messages(bot, message, data, state)
            payload["child_media_children"] = media_children
            if caption:
                payload["child_quote_text"] = caption["data"].get("text", "")
                payload["child_quote_html"] = caption["data"].get("html", "")
                next_step = "details_child_quote_credit"
                prompt = t("details.quote_credit_prompt")
            else:
                next_step = "details_child_pullquote_text"
                prompt = t("details.quote_text_after_media")
            await state.update_data(add_step=next_step, add_payload=payload)
            await core._send_add_prompt(
                message,
                state,
                prompt,
                build_inner_block_input_keyboard(),
            )
            return
        await core._delete_add_step_messages(bot, message, data, state)
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
        child = new_block(child_type, {
            "quote_text": payload.get("child_quote_text", ""),
            "quote_html": payload.get("child_quote_html", ""),
            "credit_html": credit,
            "media_children": payload.get("child_media_children", []),
        })
        await store_pending_details_child(message, state, bot, child)
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
                item for item in children
                if item.get("type") in {"photo", "video"}
            ]
            if children:
                child = new_block(child_type, container_data(children))
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
            "photo", "video", "animation",
            "audio", "voice", "document",
            "mathematical_expression",
        }:
            parsed = message_to_blocks(message)
            child = next(
                (item for item in parsed if item.get("type") == child_type),
                None,
            )
            if child is not None and child_type in MEDIA_CAPTION_TYPES:
                caption = next(
                    (item for item in parsed if item.get("type") == "caption"),
                    None,
                )
                if caption:
                    child["data"]["caption_html"] = caption["data"].get("html")
                child["data"].setdefault("credit_html", None)
        elif child_type in {
            "paragraph", "heading", "preformatted",
            "footer", "anchor", "list", "table",
        } and message.text:
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
        await store_pending_details_child(message, state, bot, child)
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
        result = children
        for child in incoming:
            result = editor_workflow.add(result, child).blocks
        block = new_block(
            DETAILS_TYPE,
            details_data(str(payload.get("summary_html") or ""), result),
        )
        await _finish_details_add(message, state, bot, block)
        return

    raise SkipHandler


def _parse_details_child_callback(data: str, prefix: str) -> tuple[str, str] | None:
    raw = data.removeprefix(prefix)
    parts = raw.split(":")
    if len(parts) != 2 or not all(parts):
        return None
    return parts[0], parts[1]


@router.callback_query(F.data.startswith("r:dim:"))
async def open_details_inner_manager(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    details_id = callback.data.rsplit(":", 1)[-1]
    details = get_block_by_id(blocks, details_id)
    if details is None or details.get("type") != DETAILS_TYPE:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await core._edit_ui(
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
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parsed = _parse_details_child_callback(callback.data, "r:di:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = details_child(details, child_id) if details else None
    if details is None or details.get("type") != DETAILS_TYPE or child is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await core._edit_ui(
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
    session = await core._session(callback, state)
    if not session:
        return
    _, blocks = session
    parsed = _parse_details_child_callback(callback.data, "r:dip:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = details_child(details, child_id) if details else None
    if child is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await callback.answer(t("preview_generating"))
    try:
        await send_preview(bot, callback.from_user.id, [child])
    except (ValueError, TelegramAPIError):
        core.logger.exception(
            "Failed to preview nested Details block %s",
            child_id,
        )
        await bot.send_message(callback.from_user.id, t("preview_failed"))


@router.callback_query(F.data.startswith("r:die:"))
async def edit_details_inner_block(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parsed = _parse_details_child_callback(callback.data, "r:die:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = details_child(details, child_id) if details else None
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
    await core._send_add_prompt(
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
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    raw = callback.data.removeprefix("r:dif:")
    parts = raw.split(":")
    if len(parts) != 3:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id, action = parts
    details = get_block_by_id(blocks, details_id)
    child = details_child(details, child_id) if details else None
    allowed = bool(
        child
        and (
            action == "add_footer"
            and child.get("type") not in {"footer", "divider", "anchor"}
            or action == "caption"
            and child.get("type") in MEDIA_CAPTION_TYPES
            or action == "credit"
            and child.get("type") in MEDIA_CAPTION_TYPES | QUOTE_TYPES
        )
    )
    if not allowed:
        await callback.answer(t("missing_block"), show_alert=True)
        return
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
    await core._send_add_prompt(callback.message, state, t(prompt_key))
    await callback.answer()


@router.callback_query(F.data.startswith("r:did:"))
async def ask_delete_details_inner(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parsed = _parse_details_child_callback(callback.data, "r:did:")
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = details_child(details, child_id) if details else None
    if child is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    await core._edit_ui(
        callback.message,
        t("details.inner_delete_question"),
        build_details_inner_delete_keyboard(details_id, child_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:didok:"))
async def confirm_delete_details_inner(
    callback: CallbackQuery,
    state: FSMContext,
) -> None:
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    parsed = _parse_details_child_callback(callback.data, "r:didok:")
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
    await _save_document(state, blocks)
    await core._edit_ui(
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
    session = await core._session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    prefix = "r:dimu:" if callback.data.startswith("r:dimu:") else "r:dimd:"
    parsed = _parse_details_child_callback(callback.data, prefix)
    if parsed is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    details_id, child_id = parsed
    details = get_block_by_id(blocks, details_id)
    child = details_child(details, child_id) if details else None
    if details is None or child is None:
        await callback.answer(t("missing_block"), show_alert=True)
        return
    children = details_children(details)
    current = children.index(child)
    target = current - 1 if prefix == "r:dimu:" else current + 1
    if not 0 <= target < len(children):
        await callback.answer(t("details.inner_current_position"))
        return
    await remember(state)
    if not move_details_child(details, child_id, target):
        await callback.answer(t("details.inner_current_position"))
        return
    await _save_document(state, blocks)
    moved = details_child(details, child_id)
    assert moved is not None
    await core._edit_ui(
        callback.message,
        details_inner_page(details, moved),
        build_details_inner_block_keyboard(details, moved),
    )
    await callback.answer(t("details.inner_moved"))


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
        expected = str(current_data.get("expected_type") or child.get("type") or "")
        replacement: dict[str, Any] | None = None

        if expected in {"collage", "slideshow"}:
            if message.media_group_id:
                collected = await core.albums.collect(message)
                if collected is None:
                    return True
                parsed = messages_to_blocks(collected)
            else:
                parsed = message_to_blocks(message)
            media_children = [
                item for item in parsed
                if item.get("type") in {"photo", "video"}
            ]
            if media_children:
                replacement = {
                    **child.get("data", {}),
                    "children": media_children,
                }
                candidate = new_block(expected, replacement)
                selected = replace_details_child(
                    details,
                    str(child_id),
                    candidate,
                ) or child
            else:
                await message.answer(t("details.inner_wrong_content"))
                return True
        else:
            replacement = replacement_data(message, expected)
            if replacement is None:
                await message.answer(t("details.inner_wrong_content"))
                return True
            if expected in MEDIA_CAPTION_TYPES:
                replacement["caption_html"] = child.get("data", {}).get("caption_html")
                replacement["credit_html"] = child.get("data", {}).get("credit_html")
            candidate = new_block(expected, replacement)
            selected = replace_details_child(
                details,
                str(child_id),
                candidate,
            ) or child

    await _save_document(state, blocks)
    await core._delete_add_step_messages(bot, message, current_data, state)
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
    if owns_details_edit and await core._defer_text_for_user_buttons(
        message, state, "editing_block",
    ):
        return
    if data.get("nested_details_id"):
        handled = await receive_nested_replacement(message, state, bot, data)
        if handled:
            return
    if data.get("expected_type") != DETAILS_TYPE:
        raise SkipHandler

    blocks = data.get("blocks") or []
    block_id = data.get("current_block_id")
    details = get_block_by_id(blocks, str(block_id)) if block_id else None
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
        if len(incoming) == 1 and incoming[0].get("type") == DETAILS_TYPE:
            incoming = list(incoming[0].get("data", {}).get("children") or [])
        if not incoming:
            await message.answer(t("details.unsupported_content"))
            return
        await remember(state)
        result: list[dict[str, Any]] = []
        for child in incoming:
            result = editor_workflow.add(result, child).blocks
        _apply_children(details, result)

    await _save_document(state, blocks)
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
        build_block_editor_keyboard(details, blocks),
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


def install_into(legacy_module: Any) -> tuple[str, ...]:
    """Compatibility bridge while generic editor helpers still live in legacy."""
    legacy_module._details_children = details_children
    legacy_module._details_child = details_child
    legacy_module._details_builder_text = details_builder_text
    legacy_module._details_inner_list_text = details_inner_list_text
    legacy_module._details_inner_page = details_inner_page
    legacy_module._store_details_child = store_pending_details_child
    legacy_module._receive_nested_replacement = receive_nested_replacement
    return detach_legacy_details_handlers(legacy_module)


__all__ = [
    "DETAILS_TYPE",
    "LEGACY_DETAILS_CALLBACKS",
    "add_details_child",
    "delete_details_child",
    "detach_legacy_details_handlers",
    "details_builder_text",
    "details_child",
    "details_children",
    "details_inner_list_text",
    "details_inner_page",
    "install_into",
    "legacy_details_handlers",
    "move_details_child",
    "receive_nested_replacement",
    "replace_details_child",
    "router",
    "store_pending_details_child",
]
