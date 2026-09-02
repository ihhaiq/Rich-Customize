from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from aiogram.fsm.context import FSMContext
from aiogram.types import CallbackQuery

from app.editor.draft_store import draft_store
from app.editor.types import BlockList
from app.services.albums import AlbumCollector


albums = AlbumCollector()
user_locks: defaultdict[int, asyncio.Lock] = defaultdict(asyncio.Lock)


async def load_editor_session(
    callback: CallbackQuery,
    state: FSMContext,
) -> tuple[dict[str, Any], BlockList] | None:
    data = await state.get_data()
    if not isinstance(data.get("blocks"), list):
        await callback.answer(
            "انتهت الجلسة. أرسل /editor للبدء من جديد.",
            show_alert=True,
        )
        return None
    draft = await draft_store.load(state)
    data.update(draft.as_state())
    return data, draft.blocks


__all__ = ["albums", "load_editor_session", "user_locks"]
