from __future__ import annotations

from collections.abc import Iterable

from app.editor.adapters import DEFAULT_ADAPTERS
from app.editor.adapters.base import BlockAdapter, InputKind


class BlockRegistry:
    def __init__(self, adapters: Iterable[BlockAdapter] = ()) -> None:
        self._by_type: dict[str, BlockAdapter] = {}
        self._canonical: dict[str, str] = {}
        for adapter in adapters:
            self.register(adapter)

    def register(self, adapter: BlockAdapter) -> None:
        if adapter.block_type in self._by_type:
            raise ValueError(f"Block adapter already registered: {adapter.block_type}")
        self._by_type[adapter.block_type] = adapter
        self._canonical[adapter.block_type] = adapter.block_type
        for alias in adapter.aliases:
            if alias in self._canonical:
                raise ValueError(f"Block alias already registered: {alias}")
            self._canonical[alias] = adapter.block_type

    def canonical_type(self, block_type: str) -> str:
        return self._canonical.get(block_type, block_type)

    def get(self, block_type: str) -> BlockAdapter | None:
        return self._by_type.get(self.canonical_type(block_type))

    def require(self, block_type: str) -> BlockAdapter:
        adapter = self.get(block_type)
        if adapter is None:
            raise KeyError(f"Unsupported block type: {block_type}")
        return adapter

    def supported_types(self) -> tuple[str, ...]:
        return tuple(self._by_type)

    def by_input_kind(self, input_kind: InputKind) -> tuple[str, ...]:
        return tuple(
            block_type
            for block_type, adapter in self._by_type.items()
            if adapter.input_kind == input_kind
        )

    def compatible_children(self, container_type: str) -> tuple[str, ...]:
        adapter = self.get(container_type)
        return adapter.child_types if adapter else ()


block_registry = BlockRegistry(DEFAULT_ADAPTERS)

__all__ = ["BlockRegistry", "InputKind", "block_registry"]
