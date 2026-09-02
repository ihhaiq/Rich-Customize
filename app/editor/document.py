from __future__ import annotations

import copy

from app.editor.models import clone_blocks, make_block, normalize_block, normalize_blocks
from app.editor.types import Block, BlockData, BlockList


def normalize_block_positions(blocks: BlockList) -> BlockList:
    return normalize_blocks(blocks)


def _reindex_current_order(blocks: BlockList) -> BlockList:
    for index, block in enumerate(blocks):
        normalize_block(block, position=index)
    return blocks


def get_block_by_id(
    blocks: BlockList,
    block_id: str | None,
) -> Block | None:
    if not block_id:
        return None
    return next((block for block in blocks if block.get("id") == block_id), None)


def add_block(
    blocks: BlockList,
    block: Block,
    *,
    index: int | None = None,
) -> Block:
    normalize_block(block)
    target = len(blocks) if index is None else max(0, min(int(index), len(blocks)))
    blocks.insert(target, block)
    _reindex_current_order(blocks)
    return block


def delete_block(blocks: BlockList, block_id: str) -> bool:
    block = get_block_by_id(blocks, block_id)
    if block is None:
        return False
    blocks.remove(block)
    _reindex_current_order(blocks)
    return True


def move_block(blocks: BlockList, block_id: str, new_index: int) -> bool:
    normalize_blocks(blocks)
    block = get_block_by_id(blocks, block_id)
    if block is None or not 0 <= int(new_index) < len(blocks):
        return False
    old_index = blocks.index(block)
    if old_index != int(new_index):
        blocks.insert(int(new_index), blocks.pop(old_index))
        _reindex_current_order(blocks)
    return True


def replace_block(
    blocks: BlockList,
    block_id: str,
    replacement: Block,
    *,
    preserve_id: bool = True,
) -> Block | None:
    current = get_block_by_id(blocks, block_id)
    if current is None:
        return None
    index = blocks.index(current)
    replacement = copy.deepcopy(replacement)
    normalize_block(replacement, position=index)
    if preserve_id:
        replacement["id"] = current["id"]
    blocks[index] = replacement
    normalize_blocks(blocks)
    return replacement


def replace_block_data(
    blocks: BlockList,
    block_id: str,
    data: BlockData,
    *,
    source: str | None = None,
) -> Block | None:
    current = get_block_by_id(blocks, block_id)
    if current is None:
        return None
    resolved_source = source
    if resolved_source is None:
        resolved_source = (
            "native"
            if data.get("native") or isinstance(data.get("native_data"), dict)
            else "generated"
        )
    replacement = make_block(
        str(current.get("type", "content")),
        data,
        position=int(current.get("position", 0)),
        source=resolved_source,
        block_id=str(current.get("id")),
    )
    return replace_block(blocks, block_id, replacement)


def duplicate_block(
    blocks: BlockList,
    block_id: str,
    *,
    after: bool = True,
) -> Block | None:
    current = get_block_by_id(blocks, block_id)
    if current is None:
        return None
    index = blocks.index(current) + (1 if after else 0)
    duplicate = make_block(
        str(current.get("type", "content")),
        copy.deepcopy(current.get("data", {})),
        source=current.get("source"),
    )
    add_block(blocks, duplicate, index=index)
    return duplicate


def child_blocks(container: Block) -> BlockList:
    data = container.setdefault("data", {})
    children = data.setdefault("children", [])
    if not isinstance(children, list):
        children = []
        data["children"] = children
    return normalize_blocks(children)


def add_child(
    container: Block,
    child: Block,
    *,
    index: int | None = None,
) -> Block:
    return add_block(child_blocks(container), child, index=index)


def delete_child(container: Block, child_id: str) -> bool:
    return delete_block(child_blocks(container), child_id)


def move_child(container: Block, child_id: str, new_index: int) -> bool:
    return move_block(child_blocks(container), child_id, new_index)


def replace_child(
    container: Block,
    child_id: str,
    replacement: Block,
) -> Block | None:
    return replace_block(child_blocks(container), child_id, replacement)


def snapshot_blocks(blocks: BlockList) -> BlockList:
    return clone_blocks(blocks)
