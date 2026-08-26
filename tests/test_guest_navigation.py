import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.routers.rich_editor import open_page_link
from app.services.factory import new_block
from app.services.guest_message_registry import GuestMessageRegistry
from app.services.page_registry import PageRegistry


class GuestNavigationTests(unittest.IsolatedAsyncioTestCase):
    async def test_guest_callback_opens_target_as_rich_ephemeral_message(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pages = PageRegistry(root / "pages.json")
            guests = GuestMessageRegistry(root / "guests.json")
            target = await pages.save(
                1,
                "الصفحة الثانية",
                [new_block("paragraph", {"text": "النص الجديد", "html": "<p>النص الجديد</p>"})],
                [],
                1,
                "center",
            )
            await guests.remember("guest-inline-id", -1001234567890, "supergroup")

            callback = SimpleNamespace(
                message=None,
                inline_message_id="guest-inline-id",
                data=f"r:page:{target}",
                id="callback-query-id",
                from_user=SimpleNamespace(id=77),
                answer=AsyncMock(),
            )
            bot = SimpleNamespace(
                send_rich_message=AsyncMock(),
                edit_ephemeral_message_text=AsyncMock(),
            )

            with (
                patch("app.routers.rich_editor.page_registry", pages),
                patch("app.routers.rich_editor.guest_message_registry", guests),
            ):
                await open_page_link(callback, bot)

            bot.send_rich_message.assert_awaited_once()
            arguments = bot.send_rich_message.await_args.kwargs
            self.assertEqual(arguments["chat_id"], -1001234567890)
            self.assertEqual(
                arguments["ephemeral_message_parameters"].receiver_user_id, 77,
            )
            self.assertEqual(
                arguments["ephemeral_message_parameters"].callback_query_id,
                "callback-query-id",
            )
            self.assertTrue(
                arguments["ephemeral_message_parameters"].replace_callback_query_message,
            )
            rendered = arguments["rich_message"].model_dump(mode="json", exclude_none=True)
            self.assertEqual(rendered["blocks"][0]["text"], "النص الجديد")


if __name__ == "__main__":
    unittest.main()
