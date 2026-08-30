from __future__ import annotations

import secrets
from typing import Any

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest, TelegramForbiddenError
from aiogram.fsm.context import FSMContext
from aiogram.types import (
    KeyboardButton,
    KeyboardButtonRequestChat,
    KeyboardButtonRequestUsers,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)

from app.services.inline_buttons import find_user_button_markers, resolve_user_button_marker
from app.states import RichEditorStates

from app.routers import editor_core as core


router = Router(name="button_target_picker")


async def ask_for_button_user(
    message: Message,
    state: FSMContext,
    marker: dict[str, str | None],
) -> None:
    request_id = secrets.randbelow(2_147_483_647) + 1
    chat_request_id = secrets.randbelow(2_147_483_647) + 1
    while chat_request_id == request_id:
        chat_request_id = secrets.randbelow(2_147_483_647) + 1
    await state.update_data(
        pending_user_request_id=request_id,
        pending_chat_request_id=chat_request_id,
    )
    keyboard = ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(
                text=f"👤 اختيار مستخدم لزر «{marker.get('title') or 'مستخدم'}»",
                request_users=KeyboardButtonRequestUsers(
                    request_id=request_id,
                    max_quantity=1,
                    request_name=True,
                    request_username=True,
                    request_photo=True,
                ),
            )],
            [KeyboardButton(
                text=f"📢 اختيار قناة لزر «{marker.get('title') or 'قناة'}»",
                request_chat=KeyboardButtonRequestChat(
                    request_id=chat_request_id,
                    chat_is_channel=True,
                    chat_has_username=True,
                    request_title=True,
                    request_username=True,
                    request_photo=True,
                ),
            )],
        ],
        resize_keyboard=True,
        one_time_keyboard=True,
        selective=True,
    )
    await message.answer(
        f"اختر المستخدم أو القناة التي سيفتحها زر «{marker.get('title') or 'مستخدم'}»:",
        reply_markup=keyboard,
    )


async def defer_text_for_user_buttons(
    message: Message,
    state: FSMContext,
    resume: str,
) -> bool:
    markers = find_user_button_markers(message.text)
    if not markers:
        return False
    data = await state.get_data()
    if data.get("resuming_user_buttons"):
        return False
    await state.set_state(RichEditorStates.selecting_button_user)
    await state.update_data(
        pending_user_resume=resume,
        pending_user_message=message.model_dump(
            mode="json", exclude_none=True, exclude_unset=True,
        ),
        pending_user_markers=markers,
        pending_user_marker_index=0,
        pending_user_resolutions=[],
    )
    await ask_for_button_user(message, state, markers[0])
    return True


async def complete_button_target(
    message: Message,
    state: FSMContext,
    data: dict[str, Any],
    target_id: int,
    username: str | None,
) -> None:
    blocks = data.get("pending_user_blocks")
    markers = data.get("pending_user_markers")
    resume = str(data.get("pending_user_resume") or "open_editor")
    pending_message = data.get("pending_user_message")
    resolutions = list(data.get("pending_user_resolutions") or [])
    index = int(data.get("pending_user_marker_index", 0))
    marker = markers[index]
    if isinstance(blocks, list):
        resolve_user_button_marker(
            blocks, str(marker.get("marker", "")), target_id, username,
        )
    resolutions.append({
        "marker": str(marker.get("marker", "")),
        "user_id": target_id,
        "username": username,
    })
    next_index = index + 1
    if next_index < len(markers):
        await state.update_data(
            pending_user_blocks=blocks,
            pending_user_marker_index=next_index,
            pending_user_resolutions=resolutions,
        )
        await ask_for_button_user(message, state, markers[next_index])
        return

    await message.answer("✅ تم ربط الوجهة بالزر.", reply_markup=ReplyKeyboardRemove())
    if resume == "open_editor":
        await state.clear()
        await core._open_editor(message, state, blocks)
        return

    clean_data = {
        key: value for key, value in data.items()
        if not key.startswith(("pending_user_", "pending_chat_"))
        and key != "resuming_user_buttons"
    }
    clean_data["resuming_user_buttons"] = True
    await state.set_data(clean_data)
    await state.set_state(
        RichEditorStates.adding_block
        if resume == "adding_block"
        else RichEditorStates.editing_block
    )
    original = Message.model_validate(pending_message, context={"bot": message.bot})
    if resume == "adding_block":
        await core.receive_added_block(original, state, message.bot)
    else:
        await core.receive_replacement(original, state, message.bot)

    resumed_data = await state.get_data()
    resumed_data.pop("resuming_user_buttons", None)
    wrapped = [{"data": resumed_data}]
    for resolution in resolutions:
        resolve_user_button_marker(
            wrapped,
            str(resolution["marker"]),
            int(resolution["user_id"]),
            resolution.get("username"),
        )
    await state.set_data(wrapped[0]["data"])


@router.message(RichEditorStates.selecting_button_user, F.users_shared)
async def receive_button_user(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    shared = message.users_shared
    markers = data.get("pending_user_markers")
    index = int(data.get("pending_user_marker_index", 0))
    resume = str(data.get("pending_user_resume") or "open_editor")
    if (
        shared is None
        or shared.request_id != data.get("pending_user_request_id")
        or not shared.users
        or not isinstance(markers, list)
        or not 0 <= index < len(markers)
        or (resume == "open_editor" and not isinstance(data.get("pending_user_blocks"), list))
        or (resume != "open_editor" and not isinstance(data.get("pending_user_message"), dict))
    ):
        await message.answer("اختيار المستخدم لا يخص الزر الحالي. استخدم زر الاختيار الظاهر.")
        return

    marker = markers[index]
    selected_user = shared.users[0]
    user_id = selected_user.user_id
    username = getattr(selected_user, "username", None)
    if not username:
        try:
            known_user = await message.bot.get_chat(user_id)
        except (TelegramBadRequest, TelegramForbiddenError):
            await message.answer(
                "تعذر إنشاء زر لهذا الحساب: الحساب بلا username وغير معروف للبوت. "
                "خليه يرسل /start للبوت أولًا، أو اختر حسابًا عنده username.",
            )
            await ask_for_button_user(message, state, marker)
            return
        username = getattr(known_user, "username", None)
    await complete_button_target(message, state, data, user_id, username)


@router.message(RichEditorStates.selecting_button_user, F.chat_shared)
async def receive_button_channel(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    shared = message.chat_shared
    markers = data.get("pending_user_markers")
    index = int(data.get("pending_user_marker_index", 0))
    resume = str(data.get("pending_user_resume") or "open_editor")
    if (
        shared is None
        or shared.request_id != data.get("pending_chat_request_id")
        or not shared.username
        or not isinstance(markers, list)
        or not 0 <= index < len(markers)
        or (resume == "open_editor" and not isinstance(data.get("pending_user_blocks"), list))
        or (resume != "open_editor" and not isinstance(data.get("pending_user_message"), dict))
    ):
        await message.answer("اختيار القناة لا يخص الزر الحالي. استخدم زر الاختيار الظاهر.")
        return
    await complete_button_target(message, state, data, shared.chat_id, shared.username)


@router.message(RichEditorStates.selecting_button_user)
async def wait_for_button_user(message: Message, state: FSMContext) -> None:
    data = await state.get_data()
    markers = data.get("pending_user_markers") or []
    index = int(data.get("pending_user_marker_index", 0))
    if 0 <= index < len(markers):
        await ask_for_button_user(message, state, markers[index])
    else:
        await state.set_state(RichEditorStates.waiting_input)
        await core._answer_with_button_guide(
            message,
            "انتهى طلب اختيار المستخدم. أرسل الرسالة مرة أخرى.",
            reply_markup=ReplyKeyboardRemove(),
        )


__all__ = [
    "ask_for_button_user",
    "complete_button_target",
    "defer_text_for_user_buttons",
    "receive_button_channel",
    "receive_button_user",
    "router",
    "wait_for_button_user",
]
