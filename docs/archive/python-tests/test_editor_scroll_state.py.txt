from __future__ import annotations

import copy
import unittest

from app.editor.draft_store import EditorDraft, draft_store
from app.editor.view_state import BLOCK_SCROLL_SIZE, set_block_scroll_offset
from app.keyboards.editor import build_rich_editor_keyboard
from app.services.page_editor import persist_page_draft_change


class FakeState:
    def __init__(self, data: dict) -> None:
        self.data = copy.deepcopy(data)

    async def get_data(self) -> dict:
        return copy.deepcopy(self.data)

    async def update_data(self, **kwargs) -> dict:
        self.data.update(copy.deepcopy(kwargs))
        return copy.deepcopy(self.data)


class EditorScrollStateTests(unittest.IsolatedAsyncioTestCase):
    @staticmethod
    def _blocks(count: int, prefix: str = "b") -> list[dict]:
        return [
            {
                "id": f"{prefix}{index + 1}",
                "type": "paragraph",
                "position": index,
                "data": {},
            }
            for index in range(count)
        ]

    async def asyncTearDown(self) -> None:
        set_block_scroll_offset(0)

    async def test_draft_load_keeps_scroll_for_later_panel_redraw(self):
        blocks = self._blocks(BLOCK_SCROLL_SIZE * 2 + 1)
        state = FakeState({
            "blocks": blocks,
            "message_buttons": [],
            "block_scroll_offset": BLOCK_SCROLL_SIZE,
        })

        draft = await draft_store.load(state)
        keyboard = build_rich_editor_keyboard(draft.blocks, draft.message_buttons)

        self.assertEqual(
            keyboard.inline_keyboard[0][0].callback_data,
            "r:blockscroll:0",
        )
        visible = [
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data and button.callback_data.startswith("r:b:")
        ]
        self.assertEqual(
            visible,
            [f"r:b:b{index}" for index in range(9, 17)],
        )

    async def test_stale_scroll_is_clamped_when_blocks_shrink(self):
        state = FakeState({
            "blocks": self._blocks(BLOCK_SCROLL_SIZE + 1),
            "message_buttons": [],
            "block_scroll_offset": BLOCK_SCROLL_SIZE * 2,
        })

        await draft_store.load(state)

        self.assertEqual(state.data["block_scroll_offset"], BLOCK_SCROLL_SIZE)

    async def test_switching_to_different_page_content_resets_scroll(self):
        before = EditorDraft(
            blocks=self._blocks(BLOCK_SCROLL_SIZE * 2 + 1, "old"),
            message_buttons=[],
            current_page_id="old-page",
            current_page_title="Old",
        )
        after = EditorDraft(
            blocks=self._blocks(3, "new"),
            message_buttons=[],
            current_page_id="new-page",
            current_page_title="New",
        )
        state = FakeState({
            **before.as_state(),
            "block_scroll_offset": BLOCK_SCROLL_SIZE * 2,
        })

        changed = await persist_page_draft_change(state, before, after)

        self.assertTrue(changed)
        self.assertEqual(state.data["block_scroll_offset"], 0)

    async def test_switching_between_identical_saved_pages_resets_scroll(self):
        blocks = self._blocks(BLOCK_SCROLL_SIZE * 2 + 1)
        before = EditorDraft(
            blocks=blocks,
            message_buttons=[],
            current_page_id="page-one",
            current_page_title="One",
        )
        after = EditorDraft(
            blocks=copy.deepcopy(blocks),
            message_buttons=[],
            current_page_id="page-two",
            current_page_title="Two",
        )
        state = FakeState({
            **before.as_state(),
            "block_scroll_offset": BLOCK_SCROLL_SIZE * 2,
        })

        changed = await persist_page_draft_change(state, before, after)

        self.assertTrue(changed)
        self.assertEqual(state.data["block_scroll_offset"], 0)

    async def test_detaching_deleted_current_page_keeps_scroll(self):
        blocks = self._blocks(BLOCK_SCROLL_SIZE * 2 + 1)
        before = EditorDraft(
            blocks=blocks,
            message_buttons=[],
            current_page_id="page-one",
            current_page_title="One",
        )
        after = EditorDraft(
            blocks=copy.deepcopy(blocks),
            message_buttons=[],
            current_page_id=None,
            current_page_title=None,
        )
        state = FakeState({
            **before.as_state(),
            "block_scroll_offset": BLOCK_SCROLL_SIZE,
        })

        changed = await persist_page_draft_change(state, before, after)

        self.assertTrue(changed)
        self.assertEqual(state.data["block_scroll_offset"], BLOCK_SCROLL_SIZE)

    async def test_explicit_page_open_reset_handles_identical_unsaved_content(self):
        blocks = self._blocks(BLOCK_SCROLL_SIZE * 2 + 1)
        before = EditorDraft(blocks=blocks, message_buttons=[])
        after = EditorDraft(
            blocks=copy.deepcopy(blocks),
            message_buttons=[],
            current_page_id="saved-page",
            current_page_title="Saved",
        )
        state = FakeState({
            **before.as_state(),
            "block_scroll_offset": BLOCK_SCROLL_SIZE * 2,
        })

        changed = await persist_page_draft_change(
            state,
            before,
            after,
            reset_scroll=True,
        )

        self.assertTrue(changed)
        self.assertEqual(state.data["block_scroll_offset"], 0)

    async def test_saving_current_content_as_page_does_not_jump_to_top(self):
        blocks = self._blocks(BLOCK_SCROLL_SIZE * 2 + 1)
        before = EditorDraft(blocks=blocks, message_buttons=[])
        after = EditorDraft(
            blocks=copy.deepcopy(blocks),
            message_buttons=[],
            current_page_id="saved-page",
            current_page_title="Saved",
        )
        state = FakeState({
            **before.as_state(),
            "block_scroll_offset": BLOCK_SCROLL_SIZE,
        })

        changed = await persist_page_draft_change(state, before, after)

        self.assertTrue(changed)
        self.assertEqual(state.data["block_scroll_offset"], BLOCK_SCROLL_SIZE)


if __name__ == "__main__":
    unittest.main()
