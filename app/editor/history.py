from __future__ import annotations

import copy
from typing import Any, Protocol


class StateLike(Protocol):
    async def get_data(self) -> dict[str, Any]: ...
    async def update_data(self, **kwargs: Any) -> dict[str, Any]: ...


UNDO_KEY = "editor_history_undo"
REDO_KEY = "editor_history_redo"
MAX_HISTORY = 50
SNAPSHOT_KEYS = (
    "blocks",
    "message_buttons",
    "buttons_per_row",
    "buttons_align",
    "current_page_id",
    "current_page_title",
)


def snapshot(data: dict[str, Any]) -> dict[str, Any]:
    return {
        key: copy.deepcopy(data.get(key))
        for key in SNAPSHOT_KEYS
        if key in data
    }


async def remember(state: StateLike, data: dict[str, Any] | None = None) -> None:
    current = data or await state.get_data()
    undo = list(current.get(UNDO_KEY) or [])
    undo.append(snapshot(current))
    if len(undo) > MAX_HISTORY:
        undo = undo[-MAX_HISTORY:]
    await state.update_data(**{UNDO_KEY: undo, REDO_KEY: []})


async def undo(state: StateLike) -> dict[str, Any] | None:
    data = await state.get_data()
    undo_stack = list(data.get(UNDO_KEY) or [])
    if not undo_stack:
        return None
    target = undo_stack.pop()
    redo_stack = list(data.get(REDO_KEY) or [])
    redo_stack.append(snapshot(data))
    await state.update_data(
        **target,
        **{UNDO_KEY: undo_stack, REDO_KEY: redo_stack[-MAX_HISTORY:]},
    )
    return target


async def redo(state: StateLike) -> dict[str, Any] | None:
    data = await state.get_data()
    redo_stack = list(data.get(REDO_KEY) or [])
    if not redo_stack:
        return None
    target = redo_stack.pop()
    undo_stack = list(data.get(UNDO_KEY) or [])
    undo_stack.append(snapshot(data))
    await state.update_data(
        **target,
        **{UNDO_KEY: undo_stack[-MAX_HISTORY:], REDO_KEY: redo_stack},
    )
    return target


async def clear(state: StateLike) -> None:
    await state.update_data(**{UNDO_KEY: [], REDO_KEY: []})
