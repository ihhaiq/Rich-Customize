from __future__ import annotations

from aiogram.types import Message

from app.editor.models import normalize_blocks
from app.editor.registry import block_registry
from app.services.parser import message_to_blocks, messages_to_blocks


def import_message(message: Message) -> list[dict]:
    return normalize_blocks(message_to_blocks(message))


def import_messages(messages: list[Message]) -> list[dict]:
    return normalize_blocks(messages_to_blocks(messages))


def first_block_of_type(message: Message, block_type: str) -> dict | None:
    wanted = block_registry.canonical_type(block_type)
    return next(
        (
            block for block in import_message(message)
            if block_registry.canonical_type(str(block.get("type", ""))) == wanted
        ),
        None,
    )


__all__ = ["first_block_of_type", "import_message", "import_messages"]
