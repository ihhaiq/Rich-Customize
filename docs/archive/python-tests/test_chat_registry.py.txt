import asyncio
import tempfile
import unittest
from pathlib import Path

from app.services.chat_registry import ManagedChatRegistry


class ManagedChatRegistryTests(unittest.TestCase):
    def test_remember_list_and_remove(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = ManagedChatRegistry(Path(directory) / "managed_chats.json")

            async def scenario():
                await registry.remember(10, -1002, "Beta", "channel")
                await registry.remember(10, -1001, "Alpha", "supergroup")
                chats = await registry.list_for_user(10)
                self.assertEqual([chat["title"] for chat in chats], ["Alpha", "Beta"])
                await registry.remove(10, -1001)
                chats = await registry.list_for_user(10)
                self.assertEqual([chat["chat_id"] for chat in chats], [-1002])
                await registry.remove_chat(-1002)
                self.assertEqual(await registry.list_for_user(10), [])

            asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
