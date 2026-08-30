from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.editor.document import (
    add_block,
    delete_block,
    move_block,
    replace_block,
)
from app.editor.models import clone_blocks, normalize_blocks
from app.editor.registry import block_registry


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
        return MutationResult(working, True, added)

    def delete(self, blocks: list[dict[str, Any]], block_id: str) -> MutationResult:
        working = clone_blocks(blocks)
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
        return MutationResult(working, changed)

    def replace(
        self,
        blocks: list[dict[str, Any]],
        block_id: str,
        replacement: dict[str, Any],
    ) -> MutationResult:
        working = clone_blocks(blocks)
        updated = replace_block(working, block_id, replacement)
        return MutationResult(working, updated is not None, updated)

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
