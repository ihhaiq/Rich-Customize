from __future__ import annotations

import asyncio
import copy

from app.editor.document import (
    add_block,
    duplicate_block,
    move_block,
    replace_block,
)
from app.editor.draft_store import draft_store
from app.editor.history import redo, remember, undo
from app.editor.models import make_block, normalize_blocks
from app.editor.registry import InputKind, block_registry
from app.editor.specs import FINAL_RICH_BLOCK_TYPES, compatible_child_block_types


class FakeState:
    def __init__(self, data=None):
        self.data = dict(data or {})

    async def get_data(self):
        return copy.deepcopy(self.data)

    async def update_data(self, **kwargs):
        self.data.update(copy.deepcopy(kwargs))
        return copy.deepcopy(self.data)


def test_registry_has_one_adapter_per_final_block_type():
    assert tuple(FINAL_RICH_BLOCK_TYPES) == block_registry.supported_types()
    assert block_registry.get("text") is block_registry.get("paragraph")
    assert block_registry.require("mathematical_expression").input_kind == InputKind.NATIVE
    assert block_registry.require("details").input_kind == InputKind.CONTAINER
    assert "mathematical_expression" in compatible_child_block_types("details")


def test_canonical_block_source_is_top_level():
    generated = make_block("paragraph", {"text": "hello"})
    assert generated["source"] == "generated"
    assert "native" not in generated["data"]

    native = make_block(
        "mathematical_expression",
        {"native_data": {"type": "mathematical_expression", "expression": "x"}},
        source="native",
    )
    assert native["source"] == "native"
    assert native["data"]["native"] is True


def test_document_operations_keep_positions_and_identity():
    blocks = [
        make_block("paragraph", {"text": "a"}, position=8),
        make_block("footer", {"text": "b"}, position=2),
    ]
    normalize_blocks(blocks)
    assert [block["position"] for block in blocks] == [0, 1]

    added = add_block(blocks, make_block("heading", {"text": "h"}), index=1)
    assert blocks[1]["id"] == added["id"]
    assert [block["position"] for block in blocks] == [0, 1, 2]

    assert move_block(blocks, added["id"], 2)
    assert blocks[2]["id"] == added["id"]

    incoming = make_block(
        "mathematical_expression",
        {"native_data": {"type": "mathematical_expression", "expression": "x+1"}},
        source="native",
    )
    old_id = blocks[2]["id"]
    updated = replace_block(blocks, old_id, incoming)
    assert updated is not None
    assert updated["id"] == old_id
    assert updated["source"] == "native"

    duplicate = duplicate_block(blocks, old_id)
    assert duplicate is not None
    assert duplicate["id"] != old_id
    assert duplicate["type"] == updated["type"]


def test_history_supports_multiple_undo_and_redo_steps():
    async def scenario():
        state = FakeState({"blocks": [make_block("paragraph", {"text": "one"})]})
        await remember(state)
        state.data["blocks"] = [make_block("paragraph", {"text": "two"})]
        await remember(state)
        state.data["blocks"] = [make_block("paragraph", {"text": "three"})]

        first = await undo(state)
        assert first["blocks"][0]["data"]["text"] == "two"
        second = await undo(state)
        assert second["blocks"][0]["data"]["text"] == "one"
        restored = await redo(state)
        assert restored["blocks"][0]["data"]["text"] == "two"

    asyncio.run(scenario())


def test_draft_store_is_the_single_fsm_document_boundary():
    async def scenario():
        state = FakeState({
            "blocks": [make_block("footer", {"text": "x"}, position=7)],
            "message_buttons": [{"title": "A"}],
            "buttons_per_row": 99,
            "buttons_align": "right",
        })
        draft = await draft_store.load(state)
        assert draft.blocks[0]["position"] == 0
        assert draft.buttons_per_row == 8

        draft.blocks.append(make_block("divider"))
        saved = await draft_store.save(state, draft)
        assert len(saved.blocks) == 2
        assert len(state.data["blocks"]) == 2

    asyncio.run(scenario())
