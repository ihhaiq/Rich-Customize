from __future__ import annotations

import asyncio
import logging
import secrets
from collections import defaultdict
from typing import Any

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest, TelegramForbiddenError
from aiogram.filters import Command, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, ChatMemberUpdated, Message

from app.keyboards import (
    build_add_block_keyboard, build_block_editor_keyboard, build_block_position_keyboard,
    build_button_picker_keyboard, build_button_position_keyboard,
    build_button_style_keyboard, build_button_type_keyboard,
    build_buttons_manager_keyboard, build_chat_reached_keyboard,
    build_delete_confirmation_keyboard, build_heading_level_keyboard,
    build_details_content_keyboard, build_inner_block_input_keyboard,
    build_inner_block_keyboard,
    build_message_buttons_keyboard, build_post_chats_keyboard,
    build_post_settings_keyboard, build_rich_editor_keyboard,
    build_table_cell_keyboard, build_table_options_keyboard, build_welcome_keyboard,
)
from app.i18n import preserve_user_content, tr
from app.services.albums import AlbumCollector
from app.services.blocks import (
    BLOCK_LABELS, delete_block, get_block_by_id, move_block, normalize_block_positions,
    set_all_table_cells_style, set_table_cell_style, table_rows,
)
from app.services.buttons import (
    BUTTON_STYLES, BUTTON_TYPES, MAX_BUTTONS, add_message_button,
    delete_message_button, get_button_type, get_button_value,
    get_message_button, move_message_button, normalize_button_url,
    normalize_https_url,
)
from app.services.chat_registry import managed_chat_registry
from app.services.factory import (
    FINAL_RICH_BLOCK_TYPES, MEDIA_CAPTION_TYPES, QUOTE_TYPES, container_data,
    compatible_child_block_types, details_data, map_data, new_block, quote_data,
    text_data,
)
from app.services.parser import message_to_blocks, messages_to_blocks, replacement_data
from app.services.popup_registry import popup_registry
from app.services.renderer import (
    RichMessageRenderError, send_rich_message_post, send_rich_message_preview,
)
from app.services.media_library import SHOWCASE_MEDIA_CHANNEL_ID, showcase_media_library
from app.services.showcase import MEDIA_LABELS, MissingShowcaseMedia, send_all_blocks_showcase
from app.states import RichEditorStates

router = Router(name="rich_editor")
logger = logging.getLogger(__name__)
albums = AlbumCollector()
user_locks: defaultdict[int, asyncio.Lock] = defaultdict(asyncio.Lock)

MAIN_TEXT = "تخصيص الرسالة\n\nاختر الجزء الذي تريد تعديله:"
ADMIN_STATUSES = {"administrator", "creator"}
CHANNEL_ADMIN_RIGHTS = (
    "post_messages+edit_messages+delete_messages+manage_chat+invite_users+restrict_members"
)
GROUP_ADMIN_RIGHTS = "delete_messages+manage_chat+invite_users+restrict_members"
PULLQUOTE_MEDIA_TYPES = {"photo", "video", "animation", "audio", "voice", "document"}


def _status_value(member) -> str:
    status = getattr(member, "status", "")
    return str(getattr(status, "value", status))


def _is_administrator(member) -> bool:
    return _status_value(member) in ADMIN_STATUSES


def _chat_type_value(chat) -> str:
    value = getattr(chat, "type", "")
    return str(getattr(value, "value", value))


async def _can_publish_to_chat(bot: Bot, chat_id: int, user_id: int) -> bool:
    try:
        bot_member, user_member, chat = await asyncio.gather(
            bot.get_chat_member(chat_id=chat_id, user_id=bot.id),
            bot.get_chat_member(chat_id=chat_id, user_id=user_id),
            bot.get_chat(chat_id),
        )
    except (TelegramBadRequest, TelegramForbiddenError):
        return False
    if not _is_administrator(bot_member) or not _is_administrator(user_member):
        return False
    if _chat_type_value(chat) == "channel" and not bool(
        getattr(bot_member, "can_post_messages", False)
    ):
        return False
    return True


async def _eligible_post_chats(bot: Bot, user_id: int) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    for chat in await managed_chat_registry.list_for_user(user_id):
        chat_id = int(chat.get("chat_id", 0))
        if chat_id and await _can_publish_to_chat(bot, chat_id, user_id):
            result.append(chat)
        elif chat_id:
            await managed_chat_registry.remove(user_id, chat_id)
    return result


async def _bot_add_links(bot: Bot) -> tuple[str, str]:
    me = await bot.get_me()
    username = me.username or "RichCustomizebot"
    base = f"https://t.me/{username}"
    return (
        f"{base}?startchannel&admin={CHANNEL_ADMIN_RIGHTS}",
        f"{base}?startgroup&admin={GROUP_ADMIN_RIGHTS}",
    )


def _buttons_per_row(data: dict[str, Any]) -> int:
    try:
        return max(1, min(8, int(data.get("buttons_per_row", 1))))
    except (TypeError, ValueError):
        return 1


async def _prepare_message_buttons(
    buttons: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    prepared = [dict(button) for button in buttons]
    for button in prepared:
        if get_button_type(button) == "popup":
            token = secrets.token_hex(10)
            button["popup_token"] = token
            await popup_registry.remember(token, get_button_value(button))
    return prepared


def _pullquote_media_payload(parsed: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    media = [item for item in parsed if item.get("type") in PULLQUOTE_MEDIA_TYPES]
    normalize_block_positions(media)
    caption = next((item for item in parsed if item.get("type") == "caption"), None)
    return media, caption


def _normalize_button_value(button_type: str, value: str) -> tuple[str | None, str | None]:
    if button_type == "url":
        normalized = normalize_button_url(value)
        if normalized is None or len(normalized) > 256:
            return None, "الرابط غير صالح. أرسل @username أو رابطًا يبدأ بـ http:// أو https:// أو tg://"
        return normalized, None
    if button_type in {"web_app", "login_url"}:
        normalized = normalize_https_url(value)
        if normalized is None or len(normalized) > 256:
            return None, "هذا النوع يحتاج إلى رابط HTTPS صالح."
        return normalized, None
    if button_type == "copy" and len(value) > 256:
        return None, "نص النسخ طويل جدًا؛ الحد الأقصى 256 حرفًا."
    if button_type == "popup" and len(value) > 200:
        return None, "نص التنبيه طويل جدًا؛ الحد الأقصى 200 حرف."
    if button_type in {"switch_inline", "switch_inline_current"}:
        normalized = "" if value.strip().lower() == "/empty" else value
        if len(normalized) > 256:
            return None, "استعلام Inline طويل جدًا؛ الحد الأقصى 256 حرفًا."
        return normalized, None
    if button_type not in BUTTON_TYPES or button_type == "disabled":
        return None, "نوع الزر غير صالح لهذه العملية."
    return value, None


def _post_chats_text(chats: list[dict[str, Any]], selected_count: int) -> str:
    if not chats:
        return (
            "إنشاء منشور\n\n"
            "لا توجد قناة أو مجموعة مشتركة يكون فيها المستخدم والبوت مشرفين.\n"
            "أضف البوت من أحد الزرين، وبعد نجاح الإضافة سيصلك إشعار هنا."
        )
    return (
        "إنشاء منشور\n\n"
        "اضغط على كل قناة أو مجموعة لتحديدها للإرسال المتعدد.\n"
        f"المحدد حالياً: {selected_count}"
    )


async def _refresh_post_panel(bot: Bot, user_id: int) -> None:
    panel = await managed_chat_registry.panel_for_user(user_id)
    if panel is None:
        return
    chats = await managed_chat_registry.list_for_user(user_id)
    available_ids = {int(chat["chat_id"]) for chat in chats}
    selected = [
        int(chat_id) for chat_id in panel.get("selected_chat_ids", [])
        if int(chat_id) in available_ids
    ]
    channel_url, group_url = await _bot_add_links(bot)
    try:
        await bot.edit_message_text(
            chat_id=panel["chat_id"],
            message_id=panel["message_id"],
            text=_post_chats_text(chats, len(selected)),
            reply_markup=build_post_chats_keyboard(
                chats, channel_url, group_url, selected,
            ),
        )
    except TelegramBadRequest as error:
        if "message is not modified" not in str(error).lower():
            logger.info("Could not refresh post panel for user_id=%s: %s", user_id, error)
    except TelegramForbiddenError:
        await managed_chat_registry.clear_panel(user_id)


def _missing_media_text(error: MissingShowcaseMedia) -> str:
    labels = "، ".join(MEDIA_LABELS[kind] for kind in error.missing)
    return f"مكتبة وسائط القالب ناقصة. أضف إلى قناة الوسائط: {labels}"


def _block_page(block: dict[str, Any], blocks: list[dict[str, Any]]) -> str:
    index = sorted(blocks, key=lambda item: item["position"]).index(block) + 1
    name = BLOCK_LABELS.get(block["type"], "📦 محتوى")
    return f"إدارة {name} #{index}\nالنوع: {name.split(' ', 1)[-1]}\n\nاختر العملية:"


async def _edit_ui(message: Message, text: str, reply_markup) -> None:
    try:
        await message.edit_text(text, reply_markup=reply_markup)
    except TelegramBadRequest as error:
        if "message is not modified" not in str(error).lower():
            raise


async def _edit_saved_ui(bot: Bot, state: FSMContext, text: str, reply_markup) -> None:
    data = await state.get_data()
    try:
        await bot.edit_message_text(
            chat_id=data["management_chat_id"], message_id=data["management_message_id"],
            text=text, reply_markup=reply_markup,
        )
    except (KeyError, TelegramBadRequest):
        sent = await bot.send_message(data.get("management_chat_id"), text, reply_markup=reply_markup)
        await state.update_data(management_chat_id=sent.chat.id, management_message_id=sent.message_id)


async def _repost_saved_ui(bot: Bot, state: FSMContext, text: str, reply_markup) -> Message:
    data = await state.get_data()
    chat_id = data.get("management_chat_id")
    message_id = data.get("management_message_id")
    if chat_id and message_id:
        try:
            await bot.delete_message(chat_id=chat_id, message_id=message_id)
        except TelegramBadRequest as error:
            logger.debug("Could not remove the old management panel: %s", error)
    sent = await bot.send_message(chat_id=chat_id, text=text, reply_markup=reply_markup)
    await state.update_data(management_chat_id=sent.chat.id, management_message_id=sent.message_id)
    return sent


async def _open_editor(message: Message, state: FSMContext, blocks: list[dict[str, Any]]) -> None:
    sent = await message.answer(MAIN_TEXT, reply_markup=build_rich_editor_keyboard(blocks))
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        blocks=blocks, message_buttons=[], buttons_per_row=1, buttons_align="center",
        current_block_id=None,
        management_chat_id=sent.chat.id, management_message_id=sent.message_id,
    )


async def _send_add_prompt(message: Message, state: FSMContext, text: str, reply_markup=None) -> Message:
    sent = await message.answer(text, reply_markup=reply_markup)
    await state.update_data(
        add_prompt_chat_id=sent.chat.id,
        add_prompt_message_id=sent.message_id,
    )
    return sent


def _details_builder_text(payload: dict[str, Any]) -> str:
    count = len(payload.get("children") or [])
    return (
        "ابنِ محتوى «تفاصيل».\n\n"
        f"عدد البلوكات الداخلية: {count}\n"
        "أرسل نصًا أو وسائط مباشرة للإنهاء، أو أضف بلوكات داخلية."
    )


async def _store_details_child(
    message: Message,
    state: FSMContext,
    bot: Bot,
    child: dict[str, Any],
) -> None:
    data = await state.get_data()
    payload = dict(data.get("add_payload") or {})
    children = list(payload.get("children") or [])
    child["position"] = len(children)
    children.append(child)
    normalize_block_positions(children)
    payload["children"] = children
    payload.pop("child_quote_text", None)
    payload.pop("child_quote_html", None)
    await _delete_add_step_messages(bot, message, data, state)
    await state.update_data(
        pending_add_type="details",
        pending_child_type=None,
        add_step="details_content",
        add_payload=payload,
    )
    await _send_add_prompt(
        message,
        state,
        _details_builder_text(payload),
        build_details_content_keyboard(len(children)),
    )


async def _delete_add_step_messages(
    bot: Bot,
    message: Message,
    data: dict[str, Any],
    state: FSMContext,
) -> None:
    targets = {
        (message.chat.id, message.message_id),
    }
    prompt_id = data.get("add_prompt_message_id")
    if prompt_id:
        targets.add((data.get("add_prompt_chat_id", message.chat.id), prompt_id))
    for chat_id, message_id in targets:
        try:
            await bot.delete_message(chat_id=chat_id, message_id=message_id)
        except TelegramBadRequest as error:
            logger.debug("Could not delete add-flow message %s: %s", message_id, error)
    await state.update_data(add_prompt_chat_id=None, add_prompt_message_id=None)


async def _finish_add(message: Message, state: FSMContext, bot: Bot, block: dict[str, Any]) -> None:
    data = await state.get_data()
    blocks = data.get("blocks", [])
    block["position"] = len(blocks)
    blocks.append(block)
    normalize_block_positions(blocks)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        blocks=blocks, current_block_id=None, pending_add_type=None,
        add_step=None, add_payload=None, add_prompt_chat_id=None, add_prompt_message_id=None,
    )
    await _delete_add_step_messages(bot, message, data, state)
    await _repost_saved_ui(
        bot,
        state,
        f"✅ تمت إضافة الـBlock بنجاح.\n\n{MAIN_TEXT}",
        build_rich_editor_keyboard(blocks),
    )


@router.message(CommandStart())
async def start(message: Message) -> None:
    await message.answer(
        "أهلًا بك في محرّر الرسائل الغنية.\nأرسل /editor لبدء رسالة جديدة.",
        reply_markup=build_welcome_keyboard(),
    )


@router.message(Command("editor"))
async def new_editor(message: Message, state: FSMContext) -> None:
    await state.clear()
    await state.set_state(RichEditorStates.waiting_input)
    await message.answer("أرسل الرسالة التي تريد تخصيصها")


@router.message(Command("draft"))
@router.message(F.text.in_({"دريفت", "draft", "Draft", "DRAFT"}))
async def showcase_from_message(message: Message, bot: Bot) -> None:
    if not message.from_user:
        return
    await bot.send_chat_action(chat_id=message.chat.id, action="typing")
    try:
        await send_all_blocks_showcase(bot, message.chat.id, message.from_user.id)
    except MissingShowcaseMedia as error:
        await message.answer(_missing_media_text(error))
    except Exception:
        logger.exception("Failed to send all-block showcase to user_id=%s", message.from_user.id)
        await message.answer("تعذر إرسال قالب كل البلوكات. راجع السجل لمعرفة الخطأ.")


@router.callback_query(F.data == "r:showcase")
async def showcase_from_button(callback: CallbackQuery, bot: Bot) -> None:
    await callback.answer("جاري تجهيز قالب كل البلوكات…")
    try:
        await send_all_blocks_showcase(bot, callback.from_user.id, callback.from_user.id)
    except MissingShowcaseMedia as error:
        await bot.send_message(callback.from_user.id, _missing_media_text(error))
    except Exception:
        logger.exception("Failed to send all-block showcase to user_id=%s", callback.from_user.id)
        await bot.send_message(callback.from_user.id, "تعذر إرسال قالب كل البلوكات. راجع السجل لمعرفة الخطأ.")


@router.channel_post()
async def remember_showcase_media(message: Message) -> None:
    if message.chat.id != SHOWCASE_MEDIA_CHANNEL_ID:
        return
    kind = await showcase_media_library.remember(message)
    if kind:
        logger.info(
            "Saved %s file_id from showcase media channel message_id=%s",
            kind,
            message.message_id,
        )


@router.my_chat_member()
async def remember_publish_chat(update: ChatMemberUpdated, bot: Bot) -> None:
    chat_id = update.chat.id
    if not _is_administrator(update.new_chat_member):
        await managed_chat_registry.remove_chat(chat_id)
        return
    chat_type = _chat_type_value(update.chat)
    if chat_type == "channel" and not bool(
        getattr(update.new_chat_member, "can_post_messages", False)
    ):
        try:
            await bot.send_message(
                update.from_user.id,
                "تمت إضافة البوت، لكن بدون صلاحية نشر الرسائل في القناة.",
            )
        except (TelegramBadRequest, TelegramForbiddenError):
            pass
        return
    actor = update.from_user
    if actor.is_bot:
        return
    title = update.chat.title or str(chat_id)
    await managed_chat_registry.remember(
        actor.id, chat_id, title, chat_type,
    )
    await _refresh_post_panel(bot, actor.id)
    try:
        await bot.send_message(
            actor.id,
            f"✅ تم الوصول إلى «{title}».",
            reply_markup=build_chat_reached_keyboard(chat_id),
        )
    except (TelegramBadRequest, TelegramForbiddenError):
        logger.info(
            "Could not notify user_id=%s after reaching chat_id=%s",
            actor.id,
            chat_id,
        )


@router.message(RichEditorStates.waiting_input)
async def receive_source(message: Message, state: FSMContext) -> None:
    if message.media_group_id:
        collected = await albums.collect(message)
        if collected is None:
            return
        blocks = messages_to_blocks(collected)
    else:
        blocks = message_to_blocks(message)
    if not blocks:
        await message.answer("هذا النوع غير مدعوم حاليًا. أرسل نصًا أو وسائط أو Rich Message.")
        return
    await _open_editor(message, state, blocks)


async def _session(callback: CallbackQuery, state: FSMContext) -> tuple[dict[str, Any], list[dict[str, Any]]] | None:
    data = await state.get_data()
    blocks = data.get("blocks")
    if not blocks:
        await callback.answer("انتهت الجلسة. أرسل /editor للبدء من جديد.", show_alert=True)
        return None
    return data, blocks


@router.callback_query(F.data == "r:no")
async def no_op(callback: CallbackQuery) -> None:
    await callback.answer("هذا هو الموقع الحالي")


@router.callback_query(F.data == "r:addmenu")
async def add_block_menu(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    await _edit_ui(callback.message, "اختر نوع الـBlock الجديد:", build_add_block_keyboard())
    await callback.answer()


@router.callback_query(F.data.startswith("r:add:"))
async def choose_add_block(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await _session(callback, state)
    if not session:
        return
    _, blocks = session
    block_type = callback.data.rsplit(":", 1)[-1]
    if block_type == "thinking":
        await callback.answer(
            "Thinking متاح في sendRichMessageDraft فقط ولا يمكن إضافته للنتيجة النهائية.",
            show_alert=True,
        )
        return
    if block_type not in FINAL_RICH_BLOCK_TYPES:
        await callback.answer("نوع غير معروف.", show_alert=True)
        return
    if block_type == "heading":
        if isinstance(callback.message, Message):
            await callback.message.answer(
                "اختر مستوى العنوان:",
                reply_markup=build_heading_level_keyboard("add"),
            )
        await callback.answer()
        return
    if block_type == "divider":
        block = new_block("divider", {"html": "<hr/>"})
        block["position"] = len(blocks)
        blocks.append(block)
        normalize_block_positions(blocks)
        await state.update_data(blocks=blocks)
        await callback.answer("تمت إضافة الفاصل")
        await _repost_saved_ui(
            bot,
            state,
            f"✅ تمت إضافة الـBlock بنجاح.\n\n{MAIN_TEXT}",
            build_rich_editor_keyboard(blocks),
        )
        return
    prompts = {
        "paragraph": "أرسل نص الفقرة",
        "heading": "أرسل عنوان القسم",
        "preformatted": "أرسل النص البرمجي",
        "footer": "أرسل نص التذييل",
        "mathematical_expression": "أرسل المعادلة بصيغة LaTeX",
        "anchor": "أرسل اسم المرساة",
        "list": "أرسل عناصر القائمة؛ كل عنصر في سطر منفصل",
        "table": "أرسل صفوف الجدول؛ كل صف بسطر وافصل الأعمدة بعلامة |",
        "blockquote": "أرسل نص الاقتباس",
        "pullquote": "أرسل نص الاقتباس البارز، أو أرسل وسائط/ملفًا لإرفاقه به",
        "details": "أرسل عنوان «تفاصيل» أولًا",
        "collage": "أرسل صور/فيديو أو Album للكولاج",
        "slideshow": "أرسل صور/فيديو أو Album لعرض الشرائح",
        "map": "أرسل موقعًا من مرفقات Telegram",
        "animation": "أرسل GIF أو Animation",
        "audio": "أرسل ملف Audio",
        "document": "أرسل ملفًا",
        "photo": "أرسل صورة",
        "video": "أرسل فيديو",
        "voice": "أرسل بصمة صوتية",
    }
    step = "details_summary" if block_type == "details" else "quote_text" if block_type in QUOTE_TYPES else "content"
    await state.set_state(RichEditorStates.adding_block)
    await state.update_data(pending_add_type=block_type, add_step=step, add_payload={})
    if isinstance(callback.message, Message):
        await _send_add_prompt(callback.message, state, prompts[block_type])
    await callback.answer()


@router.callback_query(F.data == "r:details:add")
async def open_details_inner_blocks(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    if (
        data.get("pending_add_type") != "details"
        or not isinstance(callback.message, Message)
    ):
        await callback.answer("انتهت عملية إضافة التفاصيل.", show_alert=True)
        return
    await state.update_data(add_step="details_child_select", pending_child_type=None)
    await _edit_ui(
        callback.message,
        "اختر نوع البلوك الداخلي المتوافق مع «تفاصيل»:",
        build_inner_block_keyboard("details"),
    )
    await callback.answer()


@router.callback_query(F.data == "r:details:content")
async def return_to_details_content(callback: CallbackQuery, state: FSMContext) -> None:
    data = await state.get_data()
    if (
        data.get("pending_add_type") != "details"
        or not isinstance(callback.message, Message)
    ):
        await callback.answer("انتهت عملية إضافة التفاصيل.", show_alert=True)
        return
    payload = data.get("add_payload") or {}
    children = payload.get("children") or []
    await state.update_data(add_step="details_content", pending_child_type=None)
    await _edit_ui(
        callback.message,
        _details_builder_text(payload),
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
    blocks = data.get("blocks") or []
    if not isinstance(callback.message, Message):
        return
    await _delete_add_step_messages(bot, callback.message, data, state)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        pending_add_type=None,
        pending_child_type=None,
        add_step=None,
        add_payload=None,
    )
    await _edit_saved_ui(
        bot,
        state,
        MAIN_TEXT,
        build_rich_editor_keyboard(blocks),
    )
    await callback.answer("تم إلغاء إضافة التفاصيل")


@router.callback_query(F.data == "r:details:finish")
async def finish_details_builder(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    payload = data.get("add_payload") or {}
    children = payload.get("children") or []
    summary_html = payload.get("summary_html")
    if (
        data.get("pending_add_type") != "details"
        or not isinstance(callback.message, Message)
        or not summary_html
    ):
        await callback.answer("انتهت عملية إضافة التفاصيل.", show_alert=True)
        return
    if not children:
        await callback.answer("أضف بلوكًا داخليًا واحدًا على الأقل.", show_alert=True)
        return
    await _finish_add(
        callback.message,
        state,
        bot,
        new_block("details", details_data(summary_html, children)),
    )
    await callback.answer("تمت إضافة التفاصيل")


@router.callback_query(F.data.startswith("r:details:type:"))
async def choose_details_child_type(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
) -> None:
    data = await state.get_data()
    child_type = callback.data.rsplit(":", 1)[-1]
    if (
        data.get("pending_add_type") != "details"
        or child_type not in compatible_child_block_types("details")
        or not isinstance(callback.message, Message)
    ):
        await callback.answer("نوع بلوك داخلي غير صالح.", show_alert=True)
        return
    if child_type == "divider":
        await _store_details_child(
            callback.message,
            state,
            bot,
            new_block("divider", {"html": "<hr/>"}),
        )
        await callback.answer("تمت إضافة البلوك الداخلي.")
        return
    if child_type == "heading":
        await state.update_data(
            add_step="details_child_heading", pending_child_type="heading",
        )
        await _edit_ui(
            callback.message,
            "اختر مستوى العنوان:",
            build_heading_level_keyboard("details"),
        )
        await callback.answer()
        return
    prompts = {
        "paragraph": "أرسل نص الفقرة",
        "preformatted": "أرسل النص البرمجي",
        "footer": "أرسل نص التذييل",
        "mathematical_expression": "أرسل المعادلة بصيغة LaTeX",
        "anchor": "أرسل اسم المرساة",
        "list": "أرسل عناصر القائمة؛ كل عنصر في سطر منفصل",
        "table": "أرسل صفوف الجدول؛ كل صف بسطر وافصل الأعمدة بعلامة |",
        "blockquote": "أرسل نص الاقتباس",
        "pullquote": "أرسل نص الاقتباس البارز، أو وسائط/ملفًا لإرفاقه به",
        "collage": "أرسل صور/فيديو أو Album للكولاج",
        "slideshow": "أرسل صور/فيديو أو Album لعرض الشرائح",
        "map": "أرسل موقعًا من مرفقات Telegram",
        "animation": "أرسل GIF أو Animation",
        "audio": "أرسل ملف Audio",
        "document": "أرسل ملفًا",
        "photo": "أرسل صورة",
        "video": "أرسل فيديو",
        "voice": "أرسل بصمة صوتية",
    }
    step = "details_child_quote_text" if child_type in QUOTE_TYPES else "details_child_content"
    await state.update_data(add_step=step, pending_child_type=child_type)
    await _edit_ui(
        callback.message,
        prompts[child_type],
        build_inner_block_input_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:hs:"))
async def choose_heading_level(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    parts = callback.data.split(":")
    if len(parts) not in {4, 5} or parts[2] not in {"add", "edit", "details"}:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    action = parts[2]
    try:
        heading_size = int(parts[3])
    except ValueError:
        heading_size = 0
    if heading_size not in range(1, 7):
        await callback.answer("مستوى العنوان غير صالح.", show_alert=True)
        return
    if action == "add":
        await state.set_state(RichEditorStates.adding_block)
        await state.update_data(
            pending_add_type="heading",
            add_step="content",
            add_payload={"heading_size": heading_size},
        )
        await _send_add_prompt(
            callback.message,
            state,
            f"اخترت H{heading_size}. أرسل نص العنوان الآن.",
        )
        try:
            await callback.message.delete()
        except TelegramBadRequest:
            pass
    elif action == "details":
        data = await state.get_data()
        if data.get("pending_add_type") != "details":
            await callback.answer("انتهت عملية إضافة التفاصيل.", show_alert=True)
            return
        payload = dict(data.get("add_payload") or {})
        payload["child_heading_size"] = heading_size
        await state.update_data(
            add_step="details_child_content",
            pending_child_type="heading",
            add_payload=payload,
        )
        await _edit_ui(
            callback.message,
            f"اخترت H{heading_size}. أرسل نص العنوان الآن.",
            build_inner_block_input_keyboard(),
        )
    else:
        if len(parts) != 5:
            await callback.answer("هذا العنوان لم يعد موجودًا.", show_alert=True)
            return
        block_id = parts[4]
        _, blocks = session
        block = get_block_by_id(blocks, block_id)
        if block is None or block["type"] != "heading":
            await callback.answer("هذا العنوان لم يعد موجودًا.", show_alert=True)
            return
        await state.set_state(RichEditorStates.editing_block)
        await state.update_data(
            current_block_id=block_id,
            expected_type="heading",
            edit_field=None,
            heading_size=heading_size,
        )
        await callback.message.answer(f"اخترت H{heading_size}. أرسل نص العنوان الجديد الآن.")
    await callback.answer()


@router.message(RichEditorStates.adding_block)
async def receive_added_block(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    block_type = data.get("pending_add_type")
    step = data.get("add_step")
    payload = data.get("add_payload") or {}
    if block_type not in FINAL_RICH_BLOCK_TYPES:
        await message.answer("انتهت عملية الإضافة. ارجع إلى المحرّر وحاول مجددًا.")
        await state.set_state(RichEditorStates.managing)
        return

    if block_type == "details" and step == "details_summary":
        if not message.text:
            await message.answer("عنوان التفاصيل يجب أن يكون نصًا.")
            return
        await _delete_add_step_messages(bot, message, data, state)
        payload = {"summary_html": message.html_text, "children": []}
        await state.update_data(add_step="details_content", add_payload=payload)
        await _send_add_prompt(
            message,
            state,
            _details_builder_text(payload),
            build_details_content_keyboard(),
        )
        return

    if block_type in QUOTE_TYPES and step == "quote_text":
        if block_type == "pullquote" and not message.text:
            if message.media_group_id:
                collected = await albums.collect(message)
                if collected is None:
                    return
                parsed = messages_to_blocks(collected)
            else:
                parsed = message_to_blocks(message)
            media_children, caption = _pullquote_media_payload(parsed)
            if not media_children:
                await message.answer("أرسل نصًا أو صورة/فيديو/صوتًا/ملفًا للاقتباس البارز.")
                return
            await _delete_add_step_messages(bot, message, data, state)
            next_payload: dict[str, Any] = {"media_children": media_children}
            if caption:
                next_payload.update(
                    quote_text=caption["data"].get("text", ""),
                    quote_html=caption["data"].get("html", ""),
                )
                next_step = "quote_credit"
                prompt = "تم إرفاق الوسائط واعتماد وصفها كنص للاقتباس. أرسل اسم الكاتب، أو /skip."
            else:
                next_step = "quote_media_text"
                prompt = "تم إرفاق الوسائط. أرسل الآن نص الاقتباس البارز."
            await state.update_data(add_step=next_step, add_payload=next_payload)
            await _send_add_prompt(message, state, prompt)
            return
        if not message.text:
            await message.answer("نص الاقتباس يجب أن يكون نصًا.")
            return
        await _delete_add_step_messages(bot, message, data, state)
        await state.update_data(
            add_step="quote_credit",
            add_payload={"quote_text": message.text, "quote_html": message.html_text},
        )
        await _send_add_prompt(message, state, "أرسل اسم الكاتب، أو /skip لإضافته بدون كاتب")
        return

    if block_type == "pullquote" and step == "quote_media_text":
        if not message.text:
            await message.answer("أرسل نص الاقتباس البارز بعد الوسائط.")
            return
        await _delete_add_step_messages(bot, message, data, state)
        await state.update_data(
            add_step="quote_credit",
            add_payload={
                **payload,
                "quote_text": message.text,
                "quote_html": message.html_text,
            },
        )
        await _send_add_prompt(message, state, "أرسل اسم الكاتب، أو /skip لإضافته بدون كاتب")
        return

    if block_type in QUOTE_TYPES and step == "quote_credit":
        if not message.text:
            await message.answer("أرسل اسم الكاتب كنص، أو /skip.")
            return
        credit = None if message.text.strip().lower() == "/skip" else message.html_text
        block = new_block(block_type, {**payload, "credit_html": credit})
        await _finish_add(message, state, bot, block)
        return

    if block_type == "details" and step == "details_child_quote_text":
        if data.get("pending_child_type") == "pullquote" and not message.text:
            if message.media_group_id:
                collected = await albums.collect(message)
                if collected is None:
                    return
                parsed = messages_to_blocks(collected)
            else:
                parsed = message_to_blocks(message)
            media_children, caption = _pullquote_media_payload(parsed)
            if not media_children:
                await message.answer("أرسل نصًا أو وسائط/ملفًا للاقتباس البارز.")
                return
            await _delete_add_step_messages(bot, message, data, state)
            updated_payload = dict(payload)
            updated_payload["child_media_children"] = media_children
            if caption:
                updated_payload["child_quote_text"] = caption["data"].get("text", "")
                updated_payload["child_quote_html"] = caption["data"].get("html", "")
                next_step = "details_child_quote_credit"
                prompt = "تم إرفاق الوسائط واعتماد وصفها كنص. أرسل الكاتب، أو /skip."
            else:
                next_step = "details_child_pullquote_text"
                prompt = "تم إرفاق الوسائط. أرسل الآن نص الاقتباس البارز."
            await state.update_data(add_step=next_step, add_payload=updated_payload)
            await _send_add_prompt(message, state, prompt, build_inner_block_input_keyboard())
            return
        if not message.text:
            await message.answer("نص الاقتباس يجب أن يكون نصًا.")
            return
        await _delete_add_step_messages(bot, message, data, state)
        payload = dict(payload)
        payload["child_quote_text"] = message.text
        payload["child_quote_html"] = message.html_text
        await state.update_data(
            add_step="details_child_quote_credit",
            add_payload=payload,
        )
        await _send_add_prompt(
            message,
            state,
            "أرسل اسم الكاتب، أو /skip لإضافته بدون كاتب",
            build_inner_block_input_keyboard(),
        )
        return

    if block_type == "details" and step == "details_child_pullquote_text":
        if not message.text:
            await message.answer("أرسل نص الاقتباس البارز بعد الوسائط.")
            return
        updated_payload = dict(payload)
        updated_payload["child_quote_text"] = message.text
        updated_payload["child_quote_html"] = message.html_text
        await state.update_data(
            add_step="details_child_quote_credit",
            add_payload=updated_payload,
        )
        await _send_add_prompt(
            message, state, "أرسل اسم الكاتب، أو /skip.", build_inner_block_input_keyboard(),
        )
        return

    if block_type == "details" and step == "details_child_quote_credit":
        if not message.text:
            await message.answer("أرسل اسم الكاتب كنص، أو /skip.")
            return
        child_type = data.get("pending_child_type")
        if child_type not in QUOTE_TYPES:
            await message.answer("انتهت عملية إضافة البلوك الداخلي.")
            return
        credit = None if message.text.strip().lower() == "/skip" else message.html_text
        child = new_block(child_type, {
            "quote_text": payload.get("child_quote_text", ""),
            "quote_html": payload.get("child_quote_html", ""),
            "credit_html": credit,
            "media_children": payload.get("child_media_children", []),
        })
        await _store_details_child(message, state, bot, child)
        return

    if block_type == "details" and step == "details_child_content":
        child_type = data.get("pending_child_type")
        if child_type not in compatible_child_block_types("details"):
            await message.answer("انتهت عملية إضافة البلوك الداخلي.")
            return
        child: dict[str, Any] | None = None
        if child_type in {"collage", "slideshow"}:
            if message.media_group_id:
                collected = await albums.collect(message)
                if collected is None:
                    return
                children = messages_to_blocks(collected)
            else:
                children = message_to_blocks(message)
            children = [item for item in children if item["type"] in {"photo", "video"}]
            if children:
                child = new_block(child_type, container_data(children))
        elif child_type == "map":
            if message.location:
                child = new_block(
                    "map",
                    map_data(message.location.latitude, message.location.longitude),
                )
        elif child_type in {"photo", "video", "animation", "audio", "voice", "document"}:
            parsed = message_to_blocks(message)
            child = next((item for item in parsed if item["type"] == child_type), None)
            if child is not None:
                caption = next((item for item in parsed if item["type"] == "caption"), None)
                if caption:
                    child["data"]["caption_html"] = caption["data"].get("html")
                child["data"].setdefault("credit_html", None)
        elif child_type in {
            "paragraph", "heading", "preformatted", "footer",
            "mathematical_expression", "anchor", "list", "table",
        } and message.text:
            child = new_block(
                child_type,
                text_data(
                    message,
                    child_type,
                    int(payload.get("child_heading_size", 2)),
                ),
            )
        if child is None:
            await message.answer("نوع المحتوى غير صحيح للبلوك الداخلي المحدد.")
            return
        await _store_details_child(message, state, bot, child)
        return

    if block_type == "details" and step == "details_content":
        if message.media_group_id:
            collected = await albums.collect(message)
            if collected is None:
                return
            children = messages_to_blocks(collected)
        else:
            children = message_to_blocks(message)
        if not children:
            await message.answer("هذا المحتوى غير مدعوم داخل «تفاصيل».")
            return
        stored_children = list(payload.get("children") or [])
        for child in children:
            child["position"] = len(stored_children)
            stored_children.append(child)
        normalize_block_positions(stored_children)
        await _finish_add(
            message,
            state,
            bot,
            new_block(
                "details",
                details_data(payload["summary_html"], stored_children),
            ),
        )
        return

    if block_type in {"collage", "slideshow"}:
        if message.media_group_id:
            collected = await albums.collect(message)
            if collected is None:
                return
            children = messages_to_blocks(collected)
        else:
            children = message_to_blocks(message)
        children = [item for item in children if item["type"] in {"photo", "video"}]
        if not children:
            await message.answer("أرسل صورًا أو فيديوهات لهذا النوع.")
            return
        await _finish_add(message, state, bot, new_block(block_type, container_data(children)))
        return

    if block_type == "map":
        if not message.location:
            await message.answer("أرسل موقعًا باستخدام زر المرفقات في Telegram.")
            return
        await _finish_add(
            message, state, bot,
            new_block("map", map_data(message.location.latitude, message.location.longitude)),
        )
        return

    if block_type in {"photo", "video", "animation", "audio", "voice", "document"}:
        parsed = message_to_blocks(message)
        media_block = next((item for item in parsed if item["type"] == block_type), None)
        if media_block is None:
            await message.answer("نوع الوسائط غير صحيح؛ أرسل النوع الذي اخترته.")
            return
        caption_block = next((item for item in parsed if item["type"] == "caption"), None)
        if caption_block:
            media_block["data"]["caption_html"] = caption_block["data"].get("html")
        media_block["data"].setdefault("credit_html", None)
        await _finish_add(message, state, bot, media_block)
        return

    if not message.text:
        await message.answer("هذا النوع يحتاج إلى نص.")
        return
    await _finish_add(
        message, state, bot,
        new_block(block_type, text_data(message, block_type, payload.get("heading_size", 2))),
    )


@router.callback_query(F.data == "r:back")
async def back_to_main(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    await _edit_ui(callback.message, MAIN_TEXT, build_rich_editor_keyboard(blocks))
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        current_block_id=None, current_button_id=None,
        pending_button_action=None, pending_button_text=None,
    )
    await managed_chat_registry.clear_panel(callback.from_user.id)
    await callback.answer()


@router.callback_query(F.data == "r:buttons")
async def open_buttons_manager(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    buttons = data.get("message_buttons", [])
    await state.set_state(RichEditorStates.managing)
    await state.update_data(current_button_id=None, pending_button_action=None)
    await _edit_ui(
        callback.message,
        f"إدارة أزرار الرسالة الغنية\n\nعدد الأزرار: {len(buttons)}\nاختر العملية:",
        build_buttons_manager_keyboard(buttons, _buttons_per_row(data)),
    )
    await callback.answer()


@router.callback_query(F.data == "r:brow")
async def change_buttons_per_row(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    buttons_per_row = 1 if _buttons_per_row(data) >= 8 else _buttons_per_row(data) + 1
    await state.update_data(buttons_per_row=buttons_per_row)
    buttons = data.get("message_buttons", [])
    await _edit_ui(
        callback.message,
        f"إدارة أزرار الرسالة الغنية\n\nعدد الأزرار: {len(buttons)}\nاختر العملية:",
        build_buttons_manager_keyboard(buttons, buttons_per_row),
    )
    await callback.answer(f"عدد الأزرار في الصف: {buttons_per_row}")


@router.callback_query(F.data == "r:ba")
async def start_add_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session:
        return
    data, _ = session
    if len(data.get("message_buttons", [])) >= MAX_BUTTONS:
        await callback.answer("وصلت إلى الحد الأقصى للأزرار.", show_alert=True)
        return
    await state.set_state(RichEditorStates.editing_button)
    await state.update_data(pending_button_action="add_title", current_button_id=None)
    if isinstance(callback.message, Message):
        await callback.message.answer("أرسل عنوان الزر الجديد.")
    await callback.answer()


@router.callback_query(F.data.startswith("r:bat:"))
async def choose_new_button_type(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    button_type = callback.data.rsplit(":", 1)[-1]
    if button_type not in BUTTON_TYPES or not data.get("pending_button_text"):
        await callback.answer("انتهت عملية إضافة الزر. حاول مجدداً.", show_alert=True)
        return
    prompts = {
        "url": "أرسل الرابط؛ يقبل @username أو http:// أو https:// أو tg://",
        "copy": "أرسل النص الذي تريد نسخه عند الضغط على الزر؛ الحد الأقصى 256 حرف.",
        "popup": "أرسل نص التنبيه الذي سيظهر عند الضغط؛ الحد الأقصى 200 حرف.",
        "web_app": "أرسل رابط Web App يبدأ بـ https://",
        "login_url": "أرسل رابط تسجيل الدخول ويجب أن يبدأ بـ https://",
        "switch_inline": "أرسل الاستعلام الذي يُكتب بعد اختيار المحادثة؛ يمكن إرسال /empty لتركه فارغًا.",
        "switch_inline_current": "أرسل الاستعلام الذي يُكتب في المحادثة الحالية؛ يمكن إرسال /empty.",
    }
    if button_type == "disabled":
        buttons = data.get("message_buttons", [])
        button = add_message_button(
            buttons, str(data.get("pending_button_text", "زر")), "", "disabled",
        )
        if button is None:
            await callback.answer("تعذر إضافة الزر؛ وصلت إلى الحد الأقصى.", show_alert=True)
            return
        await state.set_state(RichEditorStates.managing)
        await state.update_data(
            message_buttons=buttons, pending_button_action=None,
            pending_button_text=None, pending_button_type=None,
        )
        await _edit_ui(
            callback.message,
            "✅ تمت إضافة الزر المعطّل. اختر لونه:",
            build_button_style_keyboard(button["id"], "default"),
        )
        await callback.answer("تمت إضافة الزر")
        return
    await state.set_state(RichEditorStates.editing_button)
    await state.update_data(
        pending_button_action=f"add_{button_type}",
        pending_button_type=button_type,
    )
    await callback.message.answer(prompts[button_type])
    await callback.answer()


@router.callback_query(F.data.startswith("r:bs:"))
async def choose_button_action(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    buttons = data.get("message_buttons", [])
    action = callback.data.rsplit(":", 1)[-1]
    if action not in {"delete", "style", "move", "value", "url", "title"}:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    if not buttons:
        await callback.answer("لا توجد أزرار بعد. أضف زرًا أولًا.", show_alert=True)
        return
    labels = {
        "delete": "اختر الزر الذي تريد إزالته:",
        "style": "اختر الزر الذي تريد تغيير لونه:",
        "move": "اختر الزر الذي تريد تغيير ترتيبه:",
        "value": "اختر الزر الذي تريد تغيير محتواه:",
        "url": "اختر الزر الذي تريد تغيير محتواه:",
        "title": "اختر الزر الذي تريد تغيير عنوانه:",
    }
    await _edit_ui(callback.message, labels[action], build_button_picker_keyboard(buttons, action))
    await callback.answer()


@router.callback_query(F.data.startswith("r:bt:"))
async def select_message_button(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    buttons = data.get("message_buttons", [])
    try:
        _, _, action, button_id = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    button = get_message_button(buttons, button_id)
    if button is None:
        await callback.answer("هذا الزر لم يعد موجودًا.", show_alert=True)
        return
    if action == "delete":
        delete_message_button(buttons, button_id)
        await state.update_data(message_buttons=buttons, current_button_id=None)
        await _edit_ui(
            callback.message,
            f"✅ تم إزالة الزر.\n\nإدارة أزرار الرسالة الغنية\nعدد الأزرار: {len(buttons)}",
            build_buttons_manager_keyboard(buttons, _buttons_per_row(data)),
        )
        await callback.answer("تم إزالة الزر")
        return
    if action == "style":
        await _edit_ui(
            callback.message,
            f"تغيير لون الزر: {button['text']}\n\nاختر اللون:",
            build_button_style_keyboard(
                button_id,
                str(button.get("style", "default")),
                allow_link=get_button_type(button) == "popup",
            ),
        )
        await callback.answer()
        return
    if action == "move":
        await _edit_ui(
            callback.message,
            f"تغيير ترتيب الزر: {button['text']}\n\nاختر الموقع الجديد:",
            build_button_position_keyboard(buttons, button_id),
        )
        await callback.answer()
        return
    if action not in {"value", "url", "title"}:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    await state.set_state(RichEditorStates.editing_button)
    pending_action = "value" if action in {"value", "url"} else "title"
    await state.update_data(pending_button_action=pending_action, current_button_id=button_id)
    if pending_action == "title":
        prompt = "أرسل العنوان الجديد للزر."
    else:
        prompt = {
            "url": "أرسل الرابط الجديد للزر؛ يقبل @username أيضاً.",
            "copy": "أرسل النص الجديد الذي سيتم نسخه.",
            "popup": "أرسل نص التنبيه الجديد؛ الحد الأقصى 200 حرف.",
            "web_app": "أرسل رابط Web App الجديد ويبدأ بـ https://",
            "login_url": "أرسل رابط تسجيل الدخول الجديد ويبدأ بـ https://",
            "switch_inline": "أرسل استعلام Inline الجديد، أو /empty.",
            "switch_inline_current": "أرسل استعلام Inline الحالي الجديد، أو /empty.",
            "disabled": "الزر المعطّل لا يحتوي قيمة؛ غيّر نوعه بحذفه وإضافته مجددًا.",
        }[get_button_type(button)]
    await callback.message.answer(prompt)
    await callback.answer()


@router.callback_query(F.data.startswith("r:bsc:"))
async def change_button_style(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    buttons = data.get("message_buttons", [])
    try:
        _, _, button_id, style = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    button = get_message_button(buttons, button_id)
    if (
        button is None
        or style not in BUTTON_STYLES
        or (style == "link" and get_button_type(button) != "popup")
    ):
        await callback.answer("هذا الزر أو اللون لم يعد موجودًا.", show_alert=True)
        return
    button["style"] = style
    await state.update_data(message_buttons=buttons)
    await _edit_ui(
        callback.message,
        "✅ تم تغيير لون الزر.\n\nإدارة أزرار الرسالة الغنية",
        build_buttons_manager_keyboard(buttons, _buttons_per_row(data)),
    )
    await callback.answer("تم تغيير اللون")


@router.callback_query(F.data.startswith("r:bmv:"))
async def change_button_position(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    buttons = data.get("message_buttons", [])
    try:
        _, _, button_id, raw_index = callback.data.split(":", 3)
        new_index = int(raw_index)
    except (ValueError, TypeError):
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    if not move_message_button(buttons, button_id, new_index):
        await callback.answer("تعذر تغيير ترتيب الزر.", show_alert=True)
        return
    await state.update_data(message_buttons=buttons)
    await _edit_ui(
        callback.message,
        "✅ تم تغيير ترتيب الزر.\n\nإدارة أزرار الرسالة الغنية",
        build_buttons_manager_keyboard(buttons, _buttons_per_row(data)),
    )
    await callback.answer("تم تغيير الترتيب")


@router.callback_query(F.data == "r:bpreview")
async def preview_message_buttons(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await _session(callback, state)
    if not session:
        return
    data, _ = session
    buttons = data.get("message_buttons", [])
    if not buttons:
        await callback.answer("لا توجد أزرار لمعاينتها.", show_alert=True)
        return
    prepared_buttons = await _prepare_message_buttons(buttons)
    old_preview_id = data.get("button_preview_message_id")
    if old_preview_id:
        try:
            await bot.delete_message(
                chat_id=callback.from_user.id, message_id=old_preview_id,
            )
        except TelegramBadRequest:
            pass
    with preserve_user_content():
        sent = await bot.send_message(
            callback.from_user.id,
            tr("معاينة الأزرار:"),
            reply_markup=build_message_buttons_keyboard(
                prepared_buttons, buttons_per_row=_buttons_per_row(data),
                include_back=True, back_text=tr("🔙 رجوع"),
            ),
        )
    await state.update_data(button_preview_message_id=sent.message_id)
    await callback.answer("تم فتح المعاينة")


@router.callback_query(F.data == "r:bpback")
async def close_buttons_preview(callback: CallbackQuery, state: FSMContext) -> None:
    if isinstance(callback.message, Message):
        try:
            await callback.message.delete()
        except TelegramBadRequest:
            pass
    await state.update_data(button_preview_message_id=None)
    await callback.answer("تم إغلاق المعاينة")


@router.callback_query(F.data.startswith("r:popup:"))
async def show_popup_button(callback: CallbackQuery) -> None:
    button_id = callback.data.rsplit(":", 1)[-1]
    popup_text = await popup_registry.get(button_id)
    if popup_text is None:
        await callback.answer("هذا التنبيه لم يعد متاحاً.", show_alert=True)
        return
    await callback.answer(popup_text[:200], show_alert=True)


@router.message(RichEditorStates.editing_button)
async def receive_button_value(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    buttons = data.get("message_buttons", [])
    action = data.get("pending_button_action")
    value = (message.text or "").strip()
    if not value:
        await message.answer("أرسل قيمة نصية صحيحة.")
        return
    if action in {"add_title", "title"} and len(value) > 64:
        await message.answer("عنوان الزر طويل جدًا؛ الحد الأقصى 64 حرفًا.")
        return
    if action == "add_title":
        await state.update_data(
            pending_button_action="add_type",
            pending_button_text=value,
            pending_button_type=None,
        )
        await _edit_saved_ui(
            bot,
            state,
            f"نوع الزر الجديد: {value}\n\nاختر وظيفة الزر:",
            build_button_type_keyboard(),
        )
        return

    if isinstance(action, str) and action.startswith("add_") and action != "add_title":
        button_type = str(data.get("pending_button_type") or action.removeprefix("add_"))
        normalized_value, error = _normalize_button_value(button_type, value)
        if error or normalized_value is None:
            await message.answer(error or "قيمة الزر غير صالحة.")
            return
        button = add_message_button(
            buttons,
            str(data.get("pending_button_text", "زر")),
            normalized_value,
            button_type,
        )
        if button is None:
            await message.answer("تعذر إضافة الزر؛ وصلت إلى الحد الأقصى.")
            await state.set_state(RichEditorStates.managing)
            return
        notice = "✅ تمت إضافة الزر. اختر لونه من لوحة التعديل."
    else:
        button = get_message_button(buttons, str(data.get("current_button_id", "")))
        if button is None:
            await message.answer("هذا الزر لم يعد موجودًا.")
            await state.set_state(RichEditorStates.managing)
            return
        if action == "title":
            button["text"] = value
            notice = "✅ تم تغيير عنوان الزر."
        elif action == "value":
            button_type = get_button_type(button)
            normalized_value, error = _normalize_button_value(button_type, value)
            if error or normalized_value is None:
                await message.answer(error or "قيمة الزر غير صالحة.")
                return
            button["value"] = normalized_value
            if button_type in {"url", "web_app", "login_url"}:
                button["url"] = normalized_value
                notice = "✅ تم تغيير رابط الزر."
            elif button_type == "copy":
                notice = "✅ تم تغيير نص النسخ."
            else:
                notice = "✅ تم تغيير نص التنبيه."
        else:
            await message.answer(
                "انتهت عملية تعديل الزر. ارجع إلى لوحة الإدارة وحاول مجددًا."
            )
            await state.set_state(RichEditorStates.managing)
            return
    await state.set_state(RichEditorStates.managing)
    await state.update_data(
        message_buttons=buttons, current_button_id=None,
        pending_button_action=None, pending_button_text=None,
        pending_button_type=None,
    )
    await _edit_saved_ui(
        bot, state,
        f"{notice}\n\nإدارة أزرار الرسالة الغنية\nعدد الأزرار: {len(buttons)}",
        build_buttons_manager_keyboard(buttons, _buttons_per_row(data)),
    )
    await message.answer(notice)


@router.callback_query(F.data.startswith("r:b:"))
async def open_block(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        await _edit_ui(callback.message, MAIN_TEXT, build_rich_editor_keyboard(blocks))
        return
    await state.update_data(current_block_id=block_id)
    await _edit_ui(callback.message, _block_page(block, blocks), build_block_editor_keyboard(block))
    await callback.answer()


TABLE_CELL_ACTIONS = {
    "sh": (True, None, "تم تظليل الخلية"),
    "uh": (False, None, "تم إلغاء تظليل الخلية"),
    "ce": (None, True, "تم توسيط نص الخلية"),
    "ue": (None, False, "تم إلغاء توسيط نص الخلية"),
}
TABLE_ALL_ACTIONS = {
    "sha": (True, None, "تم تظليل جميع الخلايا"),
    "uha": (False, None, "تم إلغاء تظليل جميع الخلايا"),
    "cea": (None, True, "تم توسيط نص جميع الخلايا"),
    "uea": (None, False, "تم إلغاء توسيط نص جميع الخلايا"),
}


@router.callback_query(F.data.startswith("r:tm:"))
async def table_options(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table" or not table_rows(block):
        await callback.answer("هذا الجدول لم يعد موجودًا أو لا يحتوي خلايا.", show_alert=True)
        return
    await _edit_ui(
        callback.message,
        "إعدادات خلايا الجدول\n\nاختر العملية التي تريد تطبيقها:",
        build_table_options_keyboard(block_id),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:ta:"))
async def choose_table_action(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    try:
        _, _, block_id, action = callback.data.split(":", 3)
    except ValueError:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    block = get_block_by_id(blocks, block_id)
    if block is None or block.get("type") != "table":
        await callback.answer("هذا الجدول لم يعد موجودًا.", show_alert=True)
        return
    if action in TABLE_ALL_ACTIONS:
        shaded, centered, notice = TABLE_ALL_ACTIONS[action]
        if not set_all_table_cells_style(block, shaded=shaded, centered=centered):
            await callback.answer("تعذر تعديل خلايا الجدول.", show_alert=True)
            return
        await state.update_data(blocks=blocks)
        await _edit_ui(
            callback.message,
            "إعدادات خلايا الجدول\n\nاختر العملية التي تريد تطبيقها:",
            build_table_options_keyboard(block_id),
        )
        await callback.answer(notice)
        return
    if action not in TABLE_CELL_ACTIONS or not table_rows(block):
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    await _edit_ui(
        callback.message,
        "اختر الخلية المطلوبة\n\nالرقم الأول للصف، والثاني للعمود:",
        build_table_cell_keyboard(block, action),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:tc:"))
async def apply_table_cell_action(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user:
        return
    async with user_locks[callback.from_user.id]:
        session = await _session(callback, state)
        if not session or not isinstance(callback.message, Message):
            return
        _, blocks = session
        try:
            _, _, block_id, action, raw_row, raw_column = callback.data.split(":", 5)
            row_index, column_index = int(raw_row), int(raw_column)
        except (ValueError, TypeError):
            await callback.answer("اختيار خلية غير صالح.", show_alert=True)
            return
        block = get_block_by_id(blocks, block_id)
        settings = TABLE_CELL_ACTIONS.get(action)
        if block is None or block.get("type") != "table" or settings is None:
            await callback.answer("هذا الجدول أو الإجراء لم يعد موجودًا.", show_alert=True)
            return
        shaded, centered, notice = settings
        changed = set_table_cell_style(
            block, row_index, column_index, shaded=shaded, centered=centered,
        )
        if not changed:
            await callback.answer("هذه الخلية لم تعد موجودة.", show_alert=True)
            return
        await state.update_data(blocks=blocks)
        await _edit_ui(
            callback.message,
            "إعدادات خلايا الجدول\n\nاختر العملية التي تريد تطبيقها:",
            build_table_options_keyboard(block_id),
        )
        await callback.answer(notice)


@router.callback_query(F.data.startswith("r:e:"))
async def edit_block(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session:
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    block = get_block_by_id(blocks, block_id)
    if block is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        return
    if block["type"] == "heading":
        if isinstance(callback.message, Message):
            await callback.message.answer(
                "اختر مستوى العنوان الجديد:",
                reply_markup=build_heading_level_keyboard("edit", block_id),
            )
        await callback.answer()
        return
    prompts = {
        "text": "أرسل النص الجديد", "caption": "أرسل الوصف الجديد", "photo": "أرسل الصورة الجديدة",
        "paragraph": "أرسل نص الفقرة الجديد", "heading": "أرسل عنوان القسم الجديد",
        "preformatted": "أرسل النص البرمجي الجديد", "footer": "أرسل التذييل الجديد",
        "mathematical_expression": "أرسل معادلة LaTeX الجديدة", "anchor": "أرسل اسم المرساة الجديد",
        "list": "أرسل عناصر القائمة؛ كل عنصر في سطر", "table": "أرسل صفوف الجدول؛ افصل الأعمدة بعلامة |",
        "blockquote": "أرسل نص الاقتباس الجديد",
        "pullquote": "أرسل نص الاقتباس الجديد، أو وسائط/ملفًا جديدًا لإرفاقه به",
        "collage": "أرسل صور/فيديو أو Album جديدًا للكولاج",
        "slideshow": "أرسل صور/فيديو أو Album جديدًا لعرض الشرائح",
        "map": "أرسل الموقع الجديد من مرفقات Telegram",
        "video": "أرسل الفيديو الجديد", "animation": "أرسل GIF جديدًا", "audio": "أرسل Audio جديدًا",
        "voice": "أرسل بصمة صوتية جديدة", "document": "أرسل الملف الجديد",
        "sticker": "أرسل الملصق الجديد", "video_note": "أرسل فيديو دائريًا جديدًا",
        "details": "أرسل المحتوى الجديد داخل «تفاصيل»؛ يقبل نصًا أو وسائط أو ألبومًا",
    }
    await state.update_data(current_block_id=block_id, expected_type=block["type"], edit_field=None)
    await state.set_state(RichEditorStates.editing_block)
    if isinstance(callback.message, Message):
        await callback.message.answer(prompts.get(block["type"], "أرسل المحتوى الجديد من النوع نفسه"))
    await callback.answer()


@router.message(RichEditorStates.editing_block)
async def receive_replacement(message: Message, state: FSMContext, bot: Bot) -> None:
    data = await state.get_data()
    blocks = data.get("blocks", [])
    block_id = data.get("current_block_id")
    expected = data.get("expected_type")
    edit_field = data.get("edit_field")
    block = get_block_by_id(blocks, block_id)
    if block is None:
        await message.answer("هذا الجزء لم يعد موجودًا.")
        await state.set_state(RichEditorStates.managing)
        return
    if edit_field:
        if not message.text:
            await message.answer("أرسل نصًا لهذا الحقل.")
            return
        remove = message.text.strip().lower() == "/remove"
        if edit_field == "summary" and remove:
            await message.answer("عنوان التفاصيل لا يمكن حذفه؛ أرسل عنوانًا جديدًا.")
            return
        key = {"summary": "summary_html", "caption": "caption_html", "credit": "credit_html"}[edit_field]
        block.setdefault("data", {})[key] = None if remove else message.html_text
        replacement = block["data"]
    elif expected == "details":
        if message.media_group_id:
            collected = await albums.collect(message)
            if collected is None:
                return
            children = messages_to_blocks(collected)
        else:
            children = message_to_blocks(message)
        if not children:
            await message.answer("هذا المحتوى غير مدعوم داخل «تفاصيل».")
            return
        old_data = block.get("data", {})
        replacement = {
            "summary_html": old_data.get("summary_html") or tr("تفاصيل"),
            "children": children,
        }
    elif expected in {"collage", "slideshow"}:
        if message.media_group_id:
            collected = await albums.collect(message)
            if collected is None:
                return
            children = messages_to_blocks(collected)
        else:
            children = message_to_blocks(message)
        children = [item for item in children if item["type"] in {"photo", "video"}]
        replacement = {**block.get("data", {}), "children": children} if children else None
    elif expected == "map":
        if message.location:
            old_data = block.get("data", {})
            replacement = map_data(message.location.latitude, message.location.longitude)
            replacement["caption_html"] = old_data.get("caption_html")
            replacement["credit_html"] = old_data.get("credit_html")
        else:
            replacement = None
    elif expected in QUOTE_TYPES:
        if message.text:
            replacement = quote_data(message, block.get("data", {}).get("credit_html"))
            if expected == "pullquote":
                replacement["media_children"] = block.get("data", {}).get("media_children", [])
        elif expected == "pullquote":
            if message.media_group_id:
                collected = await albums.collect(message)
                if collected is None:
                    return
                parsed = messages_to_blocks(collected)
            else:
                parsed = message_to_blocks(message)
            media_children, caption = _pullquote_media_payload(parsed)
            if media_children:
                replacement = {**block.get("data", {}), "media_children": media_children}
                if caption:
                    replacement["quote_text"] = caption["data"].get("text", "")
                    replacement["quote_html"] = caption["data"].get("html", "")
            else:
                replacement = None
        else:
            replacement = None
    elif expected in {"paragraph", "heading", "preformatted", "footer", "mathematical_expression", "anchor", "list", "table"}:
        replacement = text_data(
            message,
            expected,
            data.get("heading_size", block.get("data", {}).get("size", 2)),
        ) if message.text else None
    else:
        replacement = replacement_data(message, expected)
        if replacement is not None and expected in MEDIA_CAPTION_TYPES:
            replacement["caption_html"] = block.get("data", {}).get("caption_html")
            replacement["credit_html"] = block.get("data", {}).get("credit_html")
    if replacement is None:
        await message.answer("نوع المحتوى غير صحيح. أرسل نفس نوع الجزء المطلوب.")
        return
    # Once a block is edited, its received native payload is stale and must not
    # be reused when producing the final rich message.
    replacement["native"] = False
    replacement.pop("native_data", None)
    block["data"] = replacement
    await state.update_data(blocks=blocks)
    await state.set_state(RichEditorStates.managing)
    await _edit_saved_ui(bot, state, _block_page(block, blocks), build_block_editor_keyboard(block))
    await message.answer("تم تحديث الجزء بنجاح.")


@router.callback_query(F.data.startswith("r:f:"))
async def edit_block_field(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session:
        return
    _, blocks = session
    _, _, block_id, field = callback.data.split(":", 3)
    block = get_block_by_id(blocks, block_id)
    field_allowed = bool(block) and (
        (field == "summary" and block["type"] == "details")
        or (field == "caption" and block["type"] in MEDIA_CAPTION_TYPES)
        or (field == "credit" and block["type"] in MEDIA_CAPTION_TYPES | QUOTE_TYPES)
    )
    if not field_allowed:
        await callback.answer("هذا الحقل لم يعد موجودًا.", show_alert=True)
        return
    prompts = {
        "summary": "أرسل عنوان «تفاصيل» الجديد",
        "caption": "أرسل تذييل الوسائط الجديد، أو /remove لحذفه",
        "credit": "أرسل اسم الكاتب/المصدر الجديد، أو /remove لحذفه",
    }
    await state.update_data(current_block_id=block_id, expected_type=block["type"], edit_field=field)
    await state.set_state(RichEditorStates.editing_block)
    if isinstance(callback.message, Message):
        await callback.message.answer(prompts[field])
    await callback.answer()


@router.callback_query(F.data.startswith("r:d:"))
async def ask_delete(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    if get_block_by_id(blocks, block_id) is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        return
    await _edit_ui(callback.message, "هل تريد حذف هذا الجزء؟", build_delete_confirmation_keyboard(block_id))
    await callback.answer()


@router.callback_query(F.data.startswith("r:dc:"))
async def confirm_delete(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user:
        return
    async with user_locks[callback.from_user.id]:
        session = await _session(callback, state)
        if not session or not isinstance(callback.message, Message):
            return
        _, blocks = session
        block_id = callback.data.rsplit(":", 1)[-1]
        if not delete_block(blocks, block_id):
            await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        else:
            await state.update_data(blocks=blocks, current_block_id=None)
            await callback.answer("تم الحذف")
        if blocks:
            await _edit_ui(callback.message, MAIN_TEXT, build_rich_editor_keyboard(blocks))
        else:
            await _edit_ui(callback.message, "لا توجد أجزاء. أرسل /editor لإنشاء رسالة جديدة.", None)
            await state.clear()


@router.callback_query(F.data.startswith("r:m:"))
async def move_menu(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    block_id = callback.data.rsplit(":", 1)[-1]
    if get_block_by_id(blocks, block_id) is None:
        await callback.answer("هذا الجزء لم يعد موجودًا.", show_alert=True)
        return
    await _edit_ui(callback.message, "اختر الموقع الجديد:", build_block_position_keyboard(blocks, block_id))
    await callback.answer()


@router.callback_query(F.data.startswith("r:mt:"))
async def move_to(callback: CallbackQuery, state: FSMContext) -> None:
    if not callback.from_user:
        return
    async with user_locks[callback.from_user.id]:
        session = await _session(callback, state)
        if not session or not isinstance(callback.message, Message):
            return
        _, blocks = session
        _, _, block_id, raw_index = callback.data.split(":", 3)
        if not move_block(blocks, block_id, int(raw_index)):
            await callback.answer("تعذر نقل الجزء؛ ربما تغيرت الجلسة.", show_alert=True)
            return
        await state.update_data(blocks=blocks, current_block_id=None)
        await _edit_ui(callback.message, MAIN_TEXT, build_rich_editor_keyboard(blocks))
        await callback.answer("تم تغيير الموقع")


async def _render_post_chat_picker(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
    selected_chat_ids: list[int],
) -> list[dict[str, Any]]:
    chats = await _eligible_post_chats(bot, callback.from_user.id)
    available_ids = {int(chat["chat_id"]) for chat in chats}
    selected = [chat_id for chat_id in selected_chat_ids if chat_id in available_ids]
    channel_url, group_url = await _bot_add_links(bot)
    await state.update_data(post_selected_chat_ids=selected)
    await _edit_ui(
        callback.message,
        _post_chats_text(chats, len(selected)),
        build_post_chats_keyboard(chats, channel_url, group_url, selected),
    )
    await managed_chat_registry.remember_panel(
        callback.from_user.id,
        callback.message.chat.id,
        callback.message.message_id,
        selected,
    )
    return chats


@router.callback_query(F.data == "r:post")
async def open_post_chats(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    await state.update_data(
        post_selected_chat_ids=[], post_silent=False, post_protected=False,
    )
    await _render_post_chat_picker(callback, state, bot, [])
    await callback.answer()


@router.callback_query(F.data == "r:postlist")
async def return_to_post_chats(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    await _render_post_chat_picker(callback, state, bot, selected)
    await callback.answer()


@router.callback_query(F.data.startswith("r:postchat:"))
async def select_post_chat(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    try:
        chat_id = int(callback.data.rsplit(":", 1)[-1])
    except (TypeError, ValueError):
        await callback.answer("اختيار محادثة غير صالح.", show_alert=True)
        return
    registered = next(
        (
            chat for chat in await managed_chat_registry.list_for_user(callback.from_user.id)
            if int(chat.get("chat_id", 0)) == chat_id
        ),
        None,
    )
    if registered is None or not await _can_publish_to_chat(
        bot, chat_id, callback.from_user.id,
    ):
        await managed_chat_registry.remove(callback.from_user.id, chat_id)
        await callback.answer(
            "المحادثة لم تعد متاحة، أو أن صلاحيات أحد المشرفين تغيرت.",
            show_alert=True,
        )
        return
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    if chat_id in selected:
        selected.remove(chat_id)
        notice = "تم إلغاء تحديد المحادثة"
    else:
        selected.append(chat_id)
        notice = "تم تحديد المحادثة للإرسال"
    await _render_post_chat_picker(callback, state, bot, selected)
    await callback.answer(notice)


@router.callback_query(F.data == "r:postsettings")
async def open_post_settings(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    eligible = await _eligible_post_chats(bot, callback.from_user.id)
    eligible_ids = {int(chat["chat_id"]) for chat in eligible}
    selected = [chat_id for chat_id in selected if chat_id in eligible_ids]
    if not selected:
        await state.update_data(post_selected_chat_ids=[])
        await callback.answer("حدد محادثة واحدة على الأقل.", show_alert=True)
        return
    await state.update_data(post_selected_chat_ids=selected)
    await managed_chat_registry.clear_panel(callback.from_user.id)
    count = len(selected)
    await _edit_ui(
        callback.message,
        f"إعدادات المنشور\n\nالمحادثات المحددة: {count}\nاختر الإعدادات ثم اضغط إرسال:",
        build_post_settings_keyboard(
            silent=bool(data.get("post_silent", False)),
            protected=bool(data.get("post_protected", False)),
            selected_count=count,
        ),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:pt:"))
async def toggle_post_option(callback: CallbackQuery, state: FSMContext) -> None:
    session = await _session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    data, _ = session
    selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
    if not selected:
        await callback.answer("حدد محادثة واحدة على الأقل.", show_alert=True)
        return
    option = callback.data.rsplit(":", 1)[-1]
    silent = bool(data.get("post_silent", False))
    protected = bool(data.get("post_protected", False))
    if option == "silent":
        silent = not silent
    elif option == "protected":
        protected = not protected
    else:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    await state.update_data(post_silent=silent, post_protected=protected)
    await _edit_ui(
        callback.message,
        f"إعدادات المنشور\n\nالمحادثات المحددة: {len(selected)}\nاختر الإعدادات ثم اضغط إرسال:",
        build_post_settings_keyboard(
            silent=silent, protected=protected, selected_count=len(selected),
        ),
    )
    await callback.answer()


@router.callback_query(F.data == "r:postsend")
async def send_post(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    if not callback.from_user:
        return
    async with user_locks[callback.from_user.id]:
        session = await _session(callback, state)
        if not session or not isinstance(callback.message, Message):
            return
        data, blocks = session
        selected = [int(item) for item in data.get("post_selected_chat_ids", [])]
        if not selected:
            await callback.answer("حدد محادثة واحدة على الأقل.", show_alert=True)
            return
        await callback.answer("جاري إرسال المنشور…")
        registered = {
            int(chat["chat_id"]): chat
            for chat in await managed_chat_registry.list_for_user(callback.from_user.id)
        }
        buttons = data.get("message_buttons", [])
        prepared_buttons = await _prepare_message_buttons(buttons)
        succeeded: list[str] = []
        failed: list[str] = []
        for chat_id in selected:
            title = str(registered.get(chat_id, {}).get("title") or chat_id)
            if not await _can_publish_to_chat(bot, chat_id, callback.from_user.id):
                await managed_chat_registry.remove(callback.from_user.id, chat_id)
                failed.append(title)
                continue
            try:
                await send_rich_message_post(
                    bot,
                    chat_id,
                    blocks,
                    buttons=prepared_buttons,
                    buttons_per_row=_buttons_per_row(data),
                    buttons_align=str(data.get("buttons_align", "center")),
                    disable_notification=bool(data.get("post_silent", False)),
                    protect_content=bool(data.get("post_protected", False)),
                )
            except (RichMessageRenderError, TelegramAPIError) as error:
                logger.exception(
                    "Failed to publish rich message to chat_id=%s for user_id=%s: %s",
                    chat_id,
                    callback.from_user.id,
                    error,
                )
                failed.append(title)
            else:
                succeeded.append(title)

        lines = ["نتيجة الإرسال:", f"✅ نجح: {len(succeeded)}", f"❌ فشل: {len(failed)}"]
        lines.extend(f"✅ {title}" for title in succeeded[:10])
        lines.extend(f"❌ {title}" for title in failed[:10])
        if len(succeeded) + len(failed) > 20:
            lines.append("… تم اختصار قائمة النتائج")
        lines.append("\nيمكنك تغيير الإعدادات وإرسال المنشور مرة أخرى.")
        await _edit_ui(
            callback.message,
            "\n".join(lines),
            build_post_settings_keyboard(
                silent=bool(data.get("post_silent", False)),
                protected=bool(data.get("post_protected", False)),
                selected_count=len(selected),
            ),
        )


@router.callback_query(F.data == "r:result")
async def preview(callback: CallbackQuery, state: FSMContext, bot: Bot) -> None:
    session = await _session(callback, state)
    if not session:
        return
    data, blocks = session
    buttons = data.get("message_buttons", [])
    await callback.answer("جاري إنشاء المعاينة…")
    panel_text = f"✅ المعاينة جاهزة.\n\n{MAIN_TEXT}"
    try:
        prepared_buttons = await _prepare_message_buttons(buttons)
        sent_messages = await send_rich_message_preview(
            bot,
            callback.from_user.id,
            blocks,
            buttons=prepared_buttons,
            buttons_per_row=_buttons_per_row(data),
            buttons_align=str(data.get("buttons_align", "center")),
        ) or []
        if sent_messages:
            for message_id in data.get("preview_message_ids", []):
                try:
                    await bot.delete_message(chat_id=callback.from_user.id, message_id=message_id)
                except TelegramBadRequest as error:
                    logger.debug("Could not remove an old preview message %s: %s", message_id, error)
            await state.update_data(preview_message_ids=[message.message_id for message in sent_messages])
    except RichMessageRenderError as error:
        logger.exception("Telegram rejected the single rich preview for user_id=%s", callback.from_user.id)
        await bot.send_message(
            callback.from_user.id,
            "تعذر إرسال النتيجة كرسالة غنية واحدة؛ لم يتم تقسيمها إلى رسائل منفصلة.\n"
            f"السبب: {error}",
        )
        panel_text = f"⚠️ تعذرت المعاينة.\n\n{MAIN_TEXT}"
    except Exception:
        logger.exception("Failed to render preview for user_id=%s", callback.from_user.id)
        await bot.send_message(callback.from_user.id, "تعذر إنشاء المعاينة. راجع السجل لمعرفة الخطأ.")
        panel_text = f"⚠️ تعذرت المعاينة.\n\n{MAIN_TEXT}"
    if isinstance(callback.message, Message):
        management_id = data.get("management_message_id")
        if callback.message.message_id != management_id:
            try:
                await callback.message.delete()
            except TelegramBadRequest:
                pass
    await _repost_saved_ui(bot, state, panel_text, build_rich_editor_keyboard(blocks))


@router.message(StateFilter(RichEditorStates.managing))
async def managing_extra_message(message: Message) -> None:
    await message.answer("استخدم أزرار المحرّر، أو أرسل /editor لبدء رسالة جديدة.")
