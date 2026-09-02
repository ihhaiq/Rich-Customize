from __future__ import annotations

import logging
from typing import Any

from aiogram import Bot, F, Router
from aiogram.exceptions import TelegramAPIError, TelegramBadRequest
from aiogram.types import CallbackQuery, EphemeralMessageParameters, Message

from app.i18n import t
from app.services.page_navigation import PageNavigation
from app.services.renderer import RichMessageRenderError, build_input_rich_message

from app.routers.editor_ui import friendly_rich_error
from app.routers.publish_support import chat_type_value, is_chat_subscriber
from app.services.guest_message_registry import guest_message_registry
from app.services.page_navigation import page_navigation_registry
from app.services.page_registry import page_registry
from app.routers.button_support import prepare_message_buttons


router = Router(name="page_navigation")
logger = logging.getLogger(__name__)


def page_navigation_buttons(navigation: PageNavigation) -> list[dict[str, Any]]:
    buttons: list[dict[str, Any]] = []
    if navigation.can_go_back:
        buttons.append({
            "id": "navigation-back",
            "text": t("back"),
            "type": "callback_data",
            "value": f"r:pback:{navigation.token}",
            "position": len(buttons),
            "style": "default",
        })
    if navigation.can_go_home:
        buttons.append({
            "id": "navigation-home",
            "text": t("navigation.home"),
            "type": "callback_data",
            "value": f"r:phome:{navigation.token}",
            "position": len(buttons),
            "style": "primary",
        })
    return buttons


@router.callback_query(F.data.startswith("r:page:"))
async def open_page_link(callback: CallbackQuery, bot: Bot) -> None:
    await _open_page_link(callback, bot, require_subscription=False)


@router.callback_query(F.data.startswith("r:spage:"))
async def open_gated_page_link(callback: CallbackQuery, bot: Bot) -> None:
    await _open_page_link(callback, bot, require_subscription=True)


async def _open_page_link(
    callback: CallbackQuery,
    bot: Bot,
    require_subscription: bool,
) -> None:
    callback_message = callback.message if isinstance(callback.message, Message) else None
    guest_context = (
        await guest_message_registry.get(callback.inline_message_id or "")
        if callback_message is None
        else None
    )
    if callback_message is None and guest_context is None:
        await callback.answer("تعذر تحديد محادثة رسالة Guest.", show_alert=True)
        return
    if callback_message is not None:
        chat_id = callback_message.chat.id
        chat_type = chat_type_value(callback_message.chat)
    else:
        assert guest_context is not None
        chat_id = int(guest_context["chat_id"])
        chat_type = str(guest_context.get("chat_type", ""))
    if require_subscription and not await is_chat_subscriber(
        bot, chat_id, callback.from_user.id,
    ):
        await callback.answer("انت مو من المقربين ابتعد عني .... ", show_alert=True)
        return
    parts = callback.data.split(":")
    target_id = parts[2] if len(parts) > 2 else ""
    source_id = parts[3] if len(parts) > 3 and parts[3] else None
    navigation_token = parts[4] if len(parts) > 4 and parts[4] else None
    page = await page_registry.get(target_id)
    if page is None:
        await callback.answer("هذه الصفحة لم تعد موجودة أو انتهت صلاحيتها.", show_alert=True)
        return
    ephemeral_message_id = (
        callback_message.ephemeral_message_id if callback_message is not None else None
    )
    navigation = await page_navigation_registry.navigate(
        callback.from_user.id,
        source_id,
        target_id,
        navigation_token,
    )
    prepared_buttons = await prepare_message_buttons(list(page.get("buttons") or []))
    try:
        rich_message = build_input_rich_message(
            page.get("blocks", []),
            prepared_buttons,
            buttons_per_row=int(page.get("buttons_per_row", 1)),
            buttons_align=str(page.get("buttons_align", "center")),
            source_page_id=target_id,
            navigation_token=navigation.token,
            navigation_buttons=page_navigation_buttons(navigation),
        )
        if ephemeral_message_id:
            await bot.edit_ephemeral_message_text(
                chat_id=chat_id,
                receiver_user_id=callback.from_user.id,
                ephemeral_message_id=ephemeral_message_id,
                rich_message=rich_message,
            )
        elif chat_type in {"group", "supergroup", "channel"}:
            await bot.send_rich_message(
                chat_id=chat_id,
                rich_message=rich_message,
                ephemeral_message_parameters=EphemeralMessageParameters(
                    receiver_user_id=callback.from_user.id,
                    callback_query_id=callback.id,
                    replace_callback_query_message=True,
                ),
            )
        else:
            await bot.send_rich_message(
                chat_id=callback.from_user.id,
                rich_message=rich_message,
            )
    except (RichMessageRenderError, TelegramAPIError, ValueError) as error:
        logger.exception(
            "Failed to open page_id=%s for user_id=%s",
            target_id,
            callback.from_user.id,
        )
        await callback.answer(
            f"تعذر فتح الصفحة: {friendly_rich_error(error)[:160]}",
            show_alert=True,
        )
        return
    try:
        await callback.answer(None)
    except TelegramBadRequest:
        pass


async def render_navigation_page(
    callback: CallbackQuery,
    bot: Bot,
    page_id: str,
    navigation: PageNavigation,
) -> bool:
    page = await page_registry.get(page_id)
    if page is None:
        await callback.answer(
            "هذه الصفحة لم تعد موجودة أو انتهت صلاحيتها.", show_alert=True,
        )
        return False
    callback_message = callback.message if isinstance(callback.message, Message) else None
    if callback_message is None:
        await callback.answer(t("navigation.message_missing"), show_alert=True)
        return False
    try:
        prepared_buttons = await prepare_message_buttons(page.get("buttons") or [])
        rich_message = build_input_rich_message(
            page.get("blocks", []),
            prepared_buttons,
            buttons_per_row=int(page.get("buttons_per_row", 1)),
            buttons_align=str(page.get("buttons_align", "center")),
            source_page_id=page_id,
            navigation_token=navigation.token,
            navigation_buttons=page_navigation_buttons(navigation),
        )
        if callback_message.ephemeral_message_id:
            await bot.edit_ephemeral_message_text(
                chat_id=callback_message.chat.id,
                receiver_user_id=callback.from_user.id,
                ephemeral_message_id=callback_message.ephemeral_message_id,
                rich_message=rich_message,
            )
        else:
            await bot.send_rich_message(
                chat_id=callback_message.chat.id,
                rich_message=rich_message,
            )
    except (RichMessageRenderError, TelegramAPIError, ValueError) as error:
        logger.exception(
            "Failed to render navigation page_id=%s for user_id=%s",
            page_id,
            callback.from_user.id,
        )
        await callback.answer(
            f"تعذر فتح الصفحة: {friendly_rich_error(error)[:160]}",
            show_alert=True,
        )
        return False
    return True


async def restore_navigation_root(
    callback: CallbackQuery,
    bot: Bot,
    navigation: PageNavigation,
) -> bool:
    callback_message = callback.message if isinstance(callback.message, Message) else None
    ephemeral_message_id = (
        callback_message.ephemeral_message_id if callback_message is not None else None
    )
    if callback_message is not None and ephemeral_message_id:
        await bot.delete_ephemeral_message(
            chat_id=callback_message.chat.id,
            receiver_user_id=callback.from_user.id,
            ephemeral_message_id=ephemeral_message_id,
        )
        return True
    if navigation.root_page_id:
        root = PageNavigation(
            navigation.token,
            navigation.user_id,
            (navigation.root_page_id,),
            False,
        )
        return await render_navigation_page(
            callback, bot, navigation.root_page_id, root,
        )
    await callback.answer(t("navigation.original_above"), show_alert=True)
    return False


@router.callback_query(F.data.startswith("r:pback:"))
async def navigate_page_back(callback: CallbackQuery, bot: Bot) -> None:
    token = callback.data.rsplit(":", 1)[-1]
    navigation = await page_navigation_registry.back(token, callback.from_user.id)
    if navigation is None:
        await callback.answer(t("navigation.expired"), show_alert=True)
        return
    try:
        if navigation.is_at_root:
            restored = await restore_navigation_root(callback, bot, navigation)
            if restored:
                await page_navigation_registry.finish(token)
            else:
                await page_navigation_registry.rollback_back(
                    token, callback.from_user.id,
                )
        else:
            restored = await render_navigation_page(
                callback, bot, navigation.stack[-1], navigation,
            )
            if restored:
                await page_navigation_registry.commit_back(
                    token, callback.from_user.id,
                )
            else:
                await page_navigation_registry.rollback_back(
                    token, callback.from_user.id,
                )
    except TelegramAPIError as error:
        await page_navigation_registry.rollback_back(token, callback.from_user.id)
        logger.exception("Failed to navigate back for user_id=%s", callback.from_user.id)
        await callback.answer(t(
            "navigation.back_failed",
            error=friendly_rich_error(error)[:140],
        ), show_alert=True)
        return
    if restored:
        try:
            await callback.answer()
        except TelegramBadRequest:
            pass


@router.callback_query(F.data.startswith("r:phome:"))
async def navigate_page_home(callback: CallbackQuery, bot: Bot) -> None:
    token = callback.data.rsplit(":", 1)[-1]
    navigation = await page_navigation_registry.home(token, callback.from_user.id)
    if navigation is None:
        await callback.answer(t("navigation.expired"), show_alert=True)
        return
    try:
        restored = await restore_navigation_root(callback, bot, navigation)
    except TelegramAPIError as error:
        logger.exception("Failed to navigate home for user_id=%s", callback.from_user.id)
        await callback.answer(t(
            "navigation.home_failed",
            error=friendly_rich_error(error)[:140],
        ), show_alert=True)
        return
    if restored:
        await page_navigation_registry.finish(token)
        try:
            await callback.answer()
        except TelegramBadRequest:
            pass


@router.callback_query(F.data == "r:ephemeral:restore")
async def restore_original_message(callback: CallbackQuery, bot: Bot) -> None:
    callback_message = callback.message
    chat = getattr(callback_message, "chat", None)
    ephemeral_message_id = getattr(callback_message, "ephemeral_message_id", None)
    if chat is None or not ephemeral_message_id:
        await callback.answer("الرسالة الأصلية غير متاحة.", show_alert=True)
        return
    try:
        await bot.delete_ephemeral_message(
            chat_id=chat.id,
            receiver_user_id=callback.from_user.id,
            ephemeral_message_id=ephemeral_message_id,
        )
    except TelegramAPIError as error:
        logger.exception(
            "Failed to restore original message for user_id=%s",
            callback.from_user.id,
        )
        await callback.answer(
            f"تعذر الرجوع إلى الرسالة الأصلية: {friendly_rich_error(error)[:140]}",
            show_alert=True,
        )
        return
    try:
        await callback.answer()
    except TelegramBadRequest:
        pass


__all__ = [
    "_open_page_link",
    "navigate_page_back",
    "navigate_page_home",
    "open_gated_page_link",
    "open_page_link",
    "page_navigation_buttons",
    "render_navigation_page",
    "restore_navigation_root",
    "restore_original_message",
    "router",
]
