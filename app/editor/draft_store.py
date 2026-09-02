from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Protocol

from app.editor.models import normalize_blocks
from app.editor.types import BlockList


class StateLike(Protocol):
    async def get_data(self) -> dict[str, Any]: ...
    async def update_data(self, **kwargs: Any) -> dict[str, Any]: ...


@dataclass(slots=True)
class EditorDraft:
    blocks: BlockList
    message_buttons: list[dict[str, Any]]
    buttons_per_row: int = 1
    buttons_align: str = "center"
    current_page_id: str | None = None
    current_page_title: str | None = None

    @classmethod
    def from_state(cls, data: dict[str, Any]) -> "EditorDraft":
        blocks = copy.deepcopy(data.get("blocks") or [])
        normalize_blocks(blocks)
        return cls(
            blocks=blocks,
            message_buttons=copy.deepcopy(data.get("message_buttons") or []),
            buttons_per_row=max(1, min(8, int(data.get("buttons_per_row", 1) or 1))),
            buttons_align=str(data.get("buttons_align", "center") or "center"),
            current_page_id=data.get("current_page_id"),
            current_page_title=data.get("current_page_title"),
        )

    def as_state(self) -> dict[str, Any]:
        return {
            "blocks": copy.deepcopy(self.blocks),
            "message_buttons": copy.deepcopy(self.message_buttons),
            "buttons_per_row": self.buttons_per_row,
            "buttons_align": self.buttons_align,
            "current_page_id": self.current_page_id,
            "current_page_title": self.current_page_title,
        }


class FSMDraftStore:
    """Single persistence boundary for editor draft state.

    Today it is FSM-backed, so behavior remains unchanged. A database-backed
    implementation can replace it later without touching routers.
    """

    async def load(self, state: StateLike) -> EditorDraft:
        return EditorDraft.from_state(await state.get_data())

    async def save(
        self,
        state: StateLike,
        draft: EditorDraft | None = None,
        **changes: Any,
    ) -> EditorDraft:
        current = draft or await self.load(state)
        payload = current.as_state()
        payload.update(changes)
        normalized = EditorDraft.from_state(payload)
        await state.update_data(**normalized.as_state())
        return normalized


draft_store = FSMDraftStore()

__all__ = ["EditorDraft", "FSMDraftStore", "draft_store"]
