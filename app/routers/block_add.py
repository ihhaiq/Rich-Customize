from __future__ import annotations

from typing import Any

from aiogram import Bot, F, Router
from aiogram.dispatcher.event.bases import SkipHandler
from aiogram.exceptions import TelegramBadRequest
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.i18n import t
from app.keyboards import (
    build_add_block_keyboard,
    build_anchor_target_keyboard,
    build_heading_level_keyboard,
    build_list_type_keyboard,
)
from app.editor.builders import container_data, map_data, new_block, text_data
from app.editor.specs import FINAL_RICH_BLOCK_TYPES, QUOTE_TYPES
from app.services.parser import message_to_blocks, messages_to_blocks, replacement_block
from app.services.anchors import anchor_name, anchor_targets, new_anchor_data
from app.states import RichEditorStates

from app.editor.document import get_block_by_id
from app.editor.session import albums, load_editor_session
from app.routers.block_input_support import (
    code_input_prompt,
    math_input_prompt,
    quote_media_payload,
)
from app.routers.block_support import finish_add
from app.routers.button_target_picker import defer_text_for_user_buttons
from app.routers.editor_ui import delete_add_step_messages, edit_ui, send_add_prompt


router = Router(name="block_add")


@router.callback_query(F.data == "r:addmenu")
async def add_block_menu(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    await edit_ui(
        callback.message,
        "اختر نوع الـBlock الجديد:",
        build_add_block_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data == "r:add:listmenu")
async def open_list_type_menu(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    await edit_ui(
        callback.message,
        t("list.menu_title"),
        build_list_type_keyboard(),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:addlist:"))
async def choose_list_type(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    list_kind = callback.data.rsplit(":", 1)[-1]
    if list_kind not in {"bullet", "numbered", "checklist"}:
        await callback.answer(t("list.invalid"), show_alert=True)
        return
    await state.set_state(RichEditorStates.adding_block)
    await state.update_data(
        pending_add_type="list",
        add_step="content",
        add_payload={"list_kind": list_kind},
    )
    await send_add_prompt(
        callback.message,
        state,
        t(f"list.{list_kind}_prompt"),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:add:"))
async def choose_add_block(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
) -> None:
    session = await load_editor_session(callback, state)
    if not session:
        return
    _, blocks = session
    block_type = callback.data.rsplit(":", 1)[-1]

    if block_type == "details":
        raise SkipHandler
    if block_type == "thinking":
        await callback.answer(
            "Thinking متاح في sendRichMessageDraft فقط ولا يمكن إضافته للنتيجة النهائية.",
            show_alert=True,
        )
        return
    if block_type not in FINAL_RICH_BLOCK_TYPES:
        await callback.answer("نوع غير معروف.", show_alert=True)
        return
    if block_type == "anchor" and not anchor_targets(blocks):
        await callback.answer(t("anchor.no_targets"), show_alert=True)
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
        if not isinstance(callback.message, Message):
            return
        await finish_add(
            callback.message,
            state,
            bot,
            new_block("divider", {"html": "<hr/>"}),
        )
        await callback.answer("تمت إضافة الفاصل")
        return

    prompts = {
        "paragraph": "أرسل نص الفقرة",
        "preformatted": code_input_prompt(),
        "footer": "أرسل نص التذييل",
        "mathematical_expression": math_input_prompt(),
        "anchor": t("details.send_anchor"),
        "list": "أرسل عناصر القائمة؛ كل عنصر في سطر منفصل",
        "table": "أرسل جدولًا جاهزًا، أو أرسل صفوف الجدول؛ كل صف بسطر وافصل الأعمدة بعلامة |",
        "blockquote": "أرسل نص الاقتباس، أو أرسل وسائط/ملفًا لوضعه داخل الاقتباس",
        "pullquote": "أرسل نص الاقتباس البارز، أو أرسل وسائط/ملفًا لإرفاقه به",
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
    if block_type not in prompts:
        await callback.answer("هذا النوع لا يملك مسار إضافة مباشر حاليًا.", show_alert=True)
        return
    step = "quote_text" if block_type in QUOTE_TYPES else "content"
    await state.set_state(RichEditorStates.adding_block)
    await state.update_data(
        pending_add_type=block_type,
        add_step=step,
        add_payload={},
    )
    if isinstance(callback.message, Message):
        await send_add_prompt(callback.message, state, prompts[block_type])
    await callback.answer()


@router.callback_query(F.data.startswith("r:hs:"))
async def choose_heading_level(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    parts = callback.data.split(":")
    if len(parts) not in {4, 5} or parts[2] not in {"add", "edit", "details"}:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    action = parts[2]
    if action == "details":
        raise SkipHandler
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
        await send_add_prompt(
            callback.message,
            state,
            f"اخترت H{heading_size}. أرسل نص العنوان الآن.",
        )
    else:
        if len(parts) != 5:
            await callback.answer("هذا العنوان لم يعد موجودًا.", show_alert=True)
            return
        block_id = parts[4]
        _, blocks = session
        block = get_block_by_id(blocks, block_id)
        if block is None or block.get("type") != "heading":
            await callback.answer("هذا العنوان لم يعد موجودًا.", show_alert=True)
            return
        await state.set_state(RichEditorStates.editing_block)
        await state.update_data(
            current_block_id=block_id,
            expected_type="heading",
            edit_field=None,
            heading_size=heading_size,
        )
        await send_add_prompt(
            callback.message,
            state,
            f"اخترت H{heading_size}. أرسل نص العنوان الجديد الآن.",
        )
    try:
        await callback.message.delete()
    except TelegramBadRequest:
        pass
    await callback.answer()


@router.message(RichEditorStates.adding_block)
async def receive_added_block(
    message: Message,
    state: FSMContext,
    bot: Bot,
) -> None:
    data = await state.get_data()
    block_type = data.get("pending_add_type")
    if block_type == "details":
        raise SkipHandler
    if await defer_text_for_user_buttons(message, state, "adding_block"):
        return

    step = data.get("add_step")
    payload = data.get("add_payload") or {}
    if block_type not in FINAL_RICH_BLOCK_TYPES:
        await message.answer("انتهت عملية الإضافة. ارجع إلى المحرّر وحاول مجددًا.")
        await state.set_state(RichEditorStates.managing)
        return

    if block_type == "anchor" and step == "content":
        display_name = " ".join((message.text or "").split()).strip()[:64]
        if not display_name:
            await message.answer(t("anchor.name_required"))
            return
        blocks = data.get("blocks") if isinstance(data.get("blocks"), list) else []
        targets = anchor_targets(blocks)
        if not targets:
            await message.answer(t("anchor.no_targets"))
            return
        await delete_add_step_messages(bot, message, data, state)
        await state.update_data(
            add_step="anchor_target",
            add_payload={"display_name": display_name},
        )
        await send_add_prompt(
            message,
            state,
            t("anchor.choose_target", name=display_name),
            reply_markup=build_anchor_target_keyboard(blocks),
        )
        return

    if block_type == "anchor" and step == "anchor_target":
        await message.answer(
            t("anchor.choose_target", name=str(payload.get("display_name", ""))),
        )
        return

    if block_type in QUOTE_TYPES and step == "quote_text":
        if not message.text:
            if message.media_group_id:
                collected = await albums.collect(message)
                if collected is None:
                    return
                parsed = messages_to_blocks(collected)
            else:
                parsed = message_to_blocks(message)
            media_children, caption = quote_media_payload(parsed)
            if not media_children:
                await message.answer("أرسل نصًا أو صورة/فيديو/صوتًا/ملفًا للاقتباس البارز.")
                return
            await delete_add_step_messages(bot, message, data, state)
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
            await send_add_prompt(message, state, prompt)
            return
        await delete_add_step_messages(bot, message, data, state)
        await state.update_data(
            add_step="quote_credit",
            add_payload={"quote_text": message.text, "quote_html": message.html_text},
        )
        await send_add_prompt(
            message,
            state,
            "أرسل اسم الكاتب، أو /skip لإضافته بدون كاتب",
        )
        return

    if block_type in QUOTE_TYPES and step == "quote_media_text":
        if not message.text:
            await message.answer("أرسل نص الاقتباس البارز بعد الوسائط.")
            return
        await delete_add_step_messages(bot, message, data, state)
        await state.update_data(
            add_step="quote_credit",
            add_payload={
                **payload,
                "quote_text": message.text,
                "quote_html": message.html_text,
            },
        )
        await send_add_prompt(
            message,
            state,
            "أرسل اسم الكاتب، أو /skip لإضافته بدون كاتب",
        )
        return

    if block_type in QUOTE_TYPES and step == "quote_credit":
        if not message.text:
            await message.answer("أرسل اسم الكاتب كنص، أو /skip.")
            return
        credit = None if message.text.strip().lower() == "/skip" else message.html_text
        await finish_add(
            message,
            state,
            bot,
            new_block(block_type, {**payload, "credit_html": credit}),
        )
        return

    if block_type == "table" and message.rich_message:
        table_block = replacement_block(message, "table")
        if table_block is None:
            await message.answer("الرسالة الغنية لا تحتوي على جدول. أرسل جدولًا جاهزًا أو صفوفًا نصية.")
            return
        await finish_add(message, state, bot, table_block)
        return

    if block_type in {"collage", "slideshow"}:
        if message.media_group_id:
            collected = await albums.collect(message)
            if collected is None:
                return
            children = messages_to_blocks(collected)
        else:
            children = message_to_blocks(message)
        children = [item for item in children if item.get("type") in {"photo", "video"}]
        if not children:
            await message.answer("أرسل صورًا أو فيديوهات لهذا النوع.")
            return
        await finish_add(
            message,
            state,
            bot,
            new_block(block_type, container_data(children)),
        )
        return

    if block_type == "map":
        if not message.location:
            await message.answer("أرسل موقعًا باستخدام زر المرفقات في Telegram.")
            return
        await finish_add(
            message,
            state,
            bot,
            new_block(
                "map",
                map_data(message.location.latitude, message.location.longitude),
            ),
        )
        return

    if block_type in {"photo", "video", "animation", "audio", "voice", "document"}:
        parsed = message_to_blocks(message)
        media_block = next(
            (item for item in parsed if item.get("type") == block_type),
            None,
        )
        if media_block is None:
            await message.answer("نوع الوسائط غير صحيح؛ أرسل النوع الذي اخترته.")
            return
        caption_block = next(
            (item for item in parsed if item.get("type") == "caption"),
            None,
        )
        if caption_block:
            media_block["data"]["caption_html"] = caption_block["data"].get("html")
        media_block["data"].setdefault("credit_html", None)
        await finish_add(message, state, bot, media_block)
        return

    if not message.text:
        await message.answer("هذا النوع يحتاج إلى نص.")
        return
    prepared = text_data(
        message,
        str(block_type),
        payload.get("heading_size", 2),
        str(payload.get("list_kind", "bullet")),
    )
    if block_type == "list" and not prepared.get("items"):
        await message.answer(t("list.empty"))
        return
    await finish_add(
        message,
        state,
        bot,
        new_block(str(block_type), prepared),
    )


@router.callback_query(F.data.startswith("r:at:"))
async def choose_anchor_target(
    callback: CallbackQuery,
    state: FSMContext,
    bot: Bot,
) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    _, blocks = session
    state_data = await state.get_data()
    payload = state_data.get("add_payload") or {}
    if (
        state_data.get("pending_add_type") != "anchor"
        or state_data.get("add_step") != "anchor_target"
        or not payload.get("display_name")
    ):
        await callback.answer(t("navigation.expired"), show_alert=True)
        return
    target_id = callback.data.rsplit(":", 1)[-1]
    target = next(
        (
            block
            for block in anchor_targets(blocks)
            if str(block.get("id")) == target_id
        ),
        None,
    )
    if target is None:
        await callback.answer(t("editor.block_missing"), show_alert=True)
        return
    anchor = new_block(
        "anchor",
        new_anchor_data(
            str(payload["display_name"]),
            target_id,
            existing_names=(anchor_name(block) for block in blocks),
        ),
    )
    await finish_add(
        callback.message,
        state,
        bot,
        anchor,
        index=int(target.get("position", 0)),
    )
    await callback.answer(t("anchor.added"))


__all__ = [
    "add_block_menu",
    "choose_add_block",
    "choose_anchor_target",
    "choose_heading_level",
    "choose_list_type",
    "open_list_type_menu",
    "receive_added_block",
    "router",
]
