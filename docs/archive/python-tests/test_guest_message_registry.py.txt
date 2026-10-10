import tempfile
import unittest
from pathlib import Path

from app.services.guest_message_registry import GuestMessageRegistry


class GuestMessageRegistryTests(unittest.IsolatedAsyncioTestCase):
    async def test_guest_inline_id_restores_chat_after_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "guest.json"
            registry = GuestMessageRegistry(path)

            await registry.remember("inline-123", -1001234567890, "supergroup")
            restored = await GuestMessageRegistry(path).get("inline-123")

            self.assertEqual(restored["chat_id"], -1001234567890)
            self.assertEqual(restored["chat_type"], "supergroup")
            self.assertIsInstance(restored["created_at"], int)

    async def test_unknown_guest_inline_id_returns_none(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = GuestMessageRegistry(Path(directory) / "guest.json")
            self.assertIsNone(await registry.get("missing"))


if __name__ == "__main__":
    unittest.main()
