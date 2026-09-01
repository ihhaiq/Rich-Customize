from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.editor.document import (
    add_block,
    delete_block,
    duplicate_block,
    move_block,
    replace_block,
)
from app.editor.models import clone_blocks
from app.editor.registry import block_registry
from app.services.anchors import align_linked_anchors, linked_anchors


@dataclass(slots=True)
class MutationResult:
    blocks: list[dict[str, Any]]
    changed: bool
    block: dict[str, Any] | None = None


class EditorWorkflow:
    """Pure document mutations, independent from Telegram routers and FSM UI."""

    def add(
        self,
        blocks: list[dict[str, Any]],
        block: dict[str, Any],
        *,
        index: int | None = None,
    ) -> MutationResult:
        working = clone_blocks(blocks)
        added = add_block(working, block, index=index)
        align_linked_anchors(working)
        return MutationResult(working, True, added)

    def delete(self, blocks: list[dict[str, Any]], block_id: str) -> MutationResult:
        working = clone_blocks(blocks)
        for anchor in linked_anchors(working, block_id):
            delete_block(working, str(anchor.get("id")))
        changed = delete_block(working, block_id)
        return MutationResult(working, changed)

    def move(
        self,
        blocks: list[dict[str, Any]],
        block_id: str,
        new_index: int,
    ) -> MutationResult:
        working = clone_blocks(blocks)
        changed = move_block(working, block_id, new_index)
        align_linked_anchors(working)
        moved = next((item for item in working if item.get("id") == block_id), None)
        return MutationResult(working, changed, moved)

    def replace(
        self,
        blocks: list[dict[str, Any]],
        block_id: str,
        replacement: dict[str, Any],
    ) -> MutationResult:
        working = clone_blocks(blocks)
        updated = replace_block(working, block_id, replacement)
        return MutationResult(working, updated is not None, updated)

    def duplicate(
        self,
        blocks: list[dict[str, Any]],
        block_id: str,
        *,
        after: bool = True,
    ) -> MutationResult:
        working = clone_blocks(blocks)
        duplicate = duplicate_block(working, block_id, after=after)
        if duplicate is not None and duplicate.get("type") == "anchor":
            data = duplicate.setdefault("data", {})
            data["text"] = f"anchor_{duplicate['id'][:10]}"
            data["html"] = f'<a name="{data["text"]}"></a>'
        align_linked_anchors(working)
        return MutationResult(working, duplicate is not None, duplicate)

    def import_blocks(self, blocks: list[dict[str, Any]]) -> MutationResult:
        imported = clone_blocks(blocks)
        return MutationResult(imported, bool(imported))

    def validate(self, blocks: list[dict[str, Any]]) -> list[str]:
        errors: list[str] = []
        normalized = clone_blocks(blocks)
        for index, block in enumerate(normalized):
            adapter = block_registry.get(str(block.get("type", "")))
            if adapter is None:
                errors.append(f"blocks[{index}]: unsupported type {block.get('type')}")
                continue
            for error in adapter.validate(block):
                errors.append(f"blocks[{index}]: {error}")
        return errors


editor_workflow = EditorWorkflow()

__all__ = ["EditorWorkflow", "MutationResult", "editor_workflow"]
