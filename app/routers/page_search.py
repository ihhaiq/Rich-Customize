from __future__ import annotations

from aiogram import Bot, F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery, Message

from app.i18n import t
from app.keyboards import build_page_sort_keyboard
from app.states import RichEditorStates

from app.editor.session import load_editor_session
from app.routers.editor_ui import delete_add_step_messages, edit_ui, send_add_prompt
from app.routers.page_support import render_pages_screen


router = Router(name="page_search")


@router.callback_query(F.data == "r:pages")
@router.callback_query(F.data.startswith("r:pages:"))
@router.callback_query(F.data.startswith("r:presults:"))
async def list_pages(callback: CallbackQuery, state: FSMContext) -> None:
    session = await load_editor_session(callback, state)
    if not session or not isinstance(callback.message, Message):
        return
    if callback.data == "r:pages":
        await state.update_data(pages_search_query="")
    try:
        requested_index = (
            int(callback.data.rsplit(":", 1)[-1])
            if callback.data != "r:pages"
            else 0
        )
    except ValueError:
        requested_index = 0
    rendered = await render_pages_screen(
        callback.message,
        state,
        callback.from_user.id,
        requested_index,
    )
    if not rendered:
        await callback.answer("ما عندك صفحات محفوظة بعد.", show_alert=True)
        return
    await callback.answer()


@router.callback_query(F.data == "r:psearch")
async def request_page_search(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    await state.set_state(RichEditorStates.searching_page)
    await send_add_prompt(callback.message, state, t("pages.search_prompt"))
    await callback.answer()


@router.message(RichEditorStates.searching_page)
async def receive_page_search(message: Message, state: FSMContext, bot: Bot) -> None:
    query = (message.text or "").strip()
    if not query:
        await message.answer("أرسل كلمة بحث صحيحة.")
        return
    data = await state.get_data()
    query = "" if query.casefold() == "/all" else query[:64]
    await delete_add_step_messages(bot, message, data, state)
    await state.set_state(RichEditorStates.managing)
    await state.update_data(pages_search_query=query)
    await render_pages_screen(message, state, message.from_user.id, saved=True)


@router.callback_query(F.data == "r:psort")
async def open_page_sort(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    data = await state.get_data()
    current_sort = str(data.get("pages_sort_mode") or "updated")
    await edit_ui(
        callback.message,
        t("pages.sort_text"),
        build_page_sort_keyboard(current_sort),
    )
    await callback.answer()


@router.callback_query(F.data.startswith("r:psortset:"))
async def set_page_sort(callback: CallbackQuery, state: FSMContext) -> None:
    if not isinstance(callback.message, Message):
        return
    sort_mode = callback.data.rsplit(":", 1)[-1]
    if sort_mode not in {"updated", "newest", "oldest", "title"}:
        await callback.answer("اختيار غير صالح.", show_alert=True)
        return
    await state.update_data(pages_sort_mode=sort_mode)
    await render_pages_screen(callback.message, state, callback.from_user.id)
    await callback.answer(t("pages.sort_done"))


__all__ = [
    "list_pages",
    "open_page_sort",
    "receive_page_search",
    "request_page_search",
    "router",
    "set_page_sort",
]
