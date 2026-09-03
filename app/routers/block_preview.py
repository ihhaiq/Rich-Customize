from __future__ import annotations

import html
import logging
import re
from typing import Any

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.editor.models import make_block
from app.editor.session import load_editor_session, user_locks
from app.i18n import t
from app.services.anchors import anchor_display_name
from app.services.blocks import get_block_by_id, get_block_label, table_rows
from app.services.media import file_data, file_id, media_store
from app.services.renderer import RichMessageRenderError, send_rich_message_preview

router = Router(name="block_preview")
logger = logging.getLogger(__name__)

_VISUAL_PEEK_TYPES = {"photo", "video", "animation"}
_MEDIA_PEEK_TYPES = _VISUAL_PEEK_TYPES | {"audio", "voice", "document"}
_HTML_TAG_RE = re.compile(r"<[^>]+>")


def _is_empty_rich_message_error(error: BaseException) -> bool:
    message = str(error)
    return (
        "RICH_MESSAGE_EMPTY" in message.upper()
        or "rich message must be non-empty" in message.lower()
    )


def _rich_text_plain(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(_rich_text_plain(item) for item in value)
    if isinstance(value, dict):
        if "text" in value:
            return _rich_text_plain(value.get("text"))
        if "children" in value:
            return _rich_text_plain(value.get("children"))
        return ""
    return str(value)


def _compact_text(value: Any, limit: int = 180) -> str:
    plain = html.unescape(_rich_text_plain(value))
    plain = " ".join(plain.split()).strip()
    if len(plain) <= limit:
        return plain
    return f"{plain[: max(1, limit - 1)].rstrip()}…"


def _compact_html(value: Any, limit: int = 180) -> str:
    raw = _rich_text_plain(value)
    return _compact_text(_HTML_TAG_RE.sub(" ", raw), limit)


def _media_peek_title(block: dict[str, Any]) -> str:
    data = block.get("data") if isinstance(block.get("data"), dict) else {}
    metadata = file_data(block) or {}
    title = _compact_text(metadata.get("title"), 100)
    performer = _compact_text(metadata.get("performer"), 70)
    file_name = _compact_text(metadata.get("file_name"), 140)
    if title and performer:
        return _compact_text(f"{performer} — {title}")
    if title:
        return title
    if file_name:
        return file_name
    caption = (
        _compact_text(data.get("caption_text"))
        or _compact_html(data.get("caption_html"))
    )
    return caption or get_block_label(str(block.get("type", "")))


def _table_peek_text(block: dict[str, Any]) -> str:
    data = block.get("data") if isinstance(block.get("data"), dict) else {}
    caption = (
        _compact_text(data.get("caption_text"))
        or _compact_html(data.get("caption_html"))
        or _compact_text(data.get("caption_rich_text"))
    )
    if caption:
        return caption
    rows = table_rows(block)
    if not rows:
        return get_block_label("table")
    first_row = rows[0]
    cells: list[str] = []
    for raw in first_row[:4]:
        value = raw.get("text") if isinstance(raw, dict) else raw
        text = _compact_text(value, 40)
        if text:
            cells.append(text)
    return _compact_text(" | ".join(cells)) or get_block_label("table")


def _block_peek_text(block: dict[str, Any]) -> str:
    block_type = str(block.get("type", ""))
    data = block.get("data") if isinstance(block.get("data"), dict) else {}

    if block_type in _MEDIA_PEEK_TYPES:
        return _media_peek_title(block)
    if block_type == "anchor":
        return _compact_text(anchor_display_name(block)) or get_block_label(block_type)
    if block_type == "details":
        return (
            _compact_html(data.get("summary_html"))
            or _compact_text(data.get("summary"))
            or _compact_text(data.get("title"))
            or get_block_label(block_type)
        )
    if block_type == "list":
        items = data.get("items") if isinstance(data.get("items"), list) else []
        preview_items: list[str] = []
        for raw in items[:3]:
            value = raw.get("text") if isinstance(raw, dict) else raw
            text = _compact_text(value, 50)
            if text:
                preview_items.append(text)
        if preview_items:
            return _compact_text(" • ".join(preview_items))
    if block_type == "table":
        return _table_peek_text(block)
    if block_type in {"blockquote", "pullquote"}:
        quote = (
            _compact_text(data.get("quote_text"))
            or _compact_html(data.get("quote_html"))
            or _compact_text(data.get("text"))
        )
        if quote:
            return quote
    if block_type in {"collage", "slideshow"}:
        children = data.get("children") if isinstance(data.get("children"), list) else []
        if children:
            return f"{get_block_label(block_type)} · {len(children)}"
    if block_type == "map":
        latitude = data.get("latitude")
        longitude = data.get("longitude")
        if latitude is not None and longitude is not None:
            return _compact_text(f"{latitude}, {longitude}")

    for key in ("text", "title", "display_name", "caption_text"):
        value = _compact_text(data.get(key))
        if value:
            return value
    for key in ("caption_html", "html"):
        value = _compact_html(data.get(key))
        if value:
            return value
    return get_block_label(block_type)


async def _clear_previous_peek(
    bot: Bot,
    chat_id: int,
    state: FSMContext,
    state_data: dict[str, Any],
) -> None:
    message_id = state_data.get("block_peek_message_id")
    if message_id is None:
        return
    try:
        await bot.delete_message(chat_id=chat_id, message_id=int(message_id))
    except (TelegramBadRequest, TelegramForbiddenError, TypeError, ValueError):
        pass
    await state.update_data(block_peek_message_id=None)


async def _send_visual_peek(
    bot: Bot,
    chat_id: int,
    block: dict[str, Any],
) -> Message | None:
    media_id = file_id(block)
    if not media_id:
        return None
    block_type = str(block.get("type", ""))
    if block_type == "photo":
        return await bot.send_photo(chat_id=chat_id, photo=media_id)
    if block_type == "video":
        return await bot.send_video(chat_id=chat_id, video=media_id)
    if block_type == "animation":
        return await bot.send_animation(chat_id=chat_id, animation=media_id)
    return None


def _standalone_preview_blocks(block: dict[str, Any]) -> list[dict[str, Any]]:
    """Add preview-only context for blocks Telegram rejects when sent alone.

    Structural blocks such as a divider or anchor can be valid inside a rich
    message while Telegram still considers the same block an empty standalone
    message. The footer exists only in the transient preview payload; the stored
    editor block is never modified.
    """
    try:
        position = int(block.get("position", 0)) + 1
    except (TypeError, ValueError):
        position = 1
    context = make_block(
        "footer",
        {"text": t("ux.editor.preview"), "parse_inline_buttons": False},
        position=position,
    )
    return [block, context]


async def _send_single_block_preview(
    bot: Bot,
    chat_id: int,
    block: dict[str, Any],
    source_page_id: str | None,
) -> list:
    try:
        return await send_rich_message_preview(
            bot,
            chat_id,
            [block],
            buttons=None,
            buttons_per_row=1,
            buttons_align="center",
            source_page_id=source_page_id,
        ) or []
    except RichMessageRenderError as error:
        if not _is_empty_rich_message_error(error):
            raise
        logger.info(
            "Retrying standalone rich block preview with context block_id=%s type=%s",
            block.get("id"),
            block.get("type"),
        )
        return await send_rich_message_preview(
            bot,
            chat_id,
            _standalone_preview_blocks(block),
            buttons=None,
            buttons_per_row=1,
            buttons_align="center",
            source_page_id=source_page_id,
        ) or []


@router.callback_query(F.data.startswith("r:peek:"))
async def peek_block(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    async with user_locks[callback.from_user.id]:
        session = await load_editor_session(callback, state)
        if not session:
            return
        data, blocks = session
        block_id = callback.data.rsplit(":", 1)[-1]
        block = get_block_by_id(blocks, block_id)
        if block is None:
            await callback.answer(t("editor.block_missing"), show_alert=True)
            return

        chat_id = callback.from_user.id
        await _clear_previous_peek(bot, chat_id, state, data)

        if str(block.get("type", "")) in _VISUAL_PEEK_TYPES:
            try:
                sent = await _send_visual_peek(bot, chat_id, block)
            except (TelegramBadRequest, TelegramForbiddenError):
                logger.exception(
                    "Visual block peek failed block_id=%s user_id=%s",
                    block_id,
                    chat_id,
                )
                sent = None
            if sent is not None:
                await state.update_data(block_peek_message_id=sent.message_id)
                await callback.answer()
                return

        await callback.answer(_block_peek_text(block), show_alert=True)


@router.callback_query(F.data.startswith("r:pv:"))
async def preview_one_block(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    blocks = data.get("blocks") or []
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None:
        await callback.answer(t("editor.block_missing"), show_alert=True)
        return

    await callback.answer(t("editor.preview_generating"))
    media_store.remember_blocks([block])

    preview_ids = dict(data.get("block_preview_message_ids") or {})
    old_ids = preview_ids.get(block_id) or []
    if isinstance(old_ids, int):
        old_ids = [old_ids]
    for message_id in old_ids:
        try:
            await bot.delete_message(chat_id=callback.from_user.id, message_id=int(message_id))
        except (TelegramBadRequest, TypeError, ValueError):
            pass

    try:
        sent = await _send_single_block_preview(
            bot,
            callback.from_user.id,
            block,
            data.get("current_page_id"),
        )
    except RichMessageRenderError as error:
        logger.exception(
            "Single block preview failed block_id=%s user_id=%s",
            block_id,
            callback.from_user.id,
        )
        await bot.send_message(
            callback.from_user.id,
            f"{t('editor.preview_failed_single')}\n{t('common.reason', reason=error)}",
        )
        return
    except Exception:
        logger.exception(
            "Unexpected single block preview failure block_id=%s user_id=%s",
            block_id,
            callback.from_user.id,
        )
        await bot.send_message(callback.from_user.id, t("editor.preview_failed"))
        return

    label = get_block_label(str(block.get("type")))
    notice = await bot.send_message(
        callback.from_user.id,
        t("editor.preview_single_notice", label=label),
    )
    preview_ids[block_id] = [
        *[message.message_id for message in sent],
        notice.message_id,
    ]
    await state.update_data(block_preview_message_ids=preview_ids)
