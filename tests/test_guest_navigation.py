import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.routers.rich_editor import open_page_link, restore_original_message
from app.services.factory import new_block
from app.services.guest_message_registry import GuestMessageRegistry
from app.services.page_navigation import PageNavigationRegistry
from app.services.page_registry import PageRegistry


class GuestNavigationTests(unittest.IsolatedAsyncioTestCase):
    async def test_guest_callback_opens_target_as_rich_ephemeral_message(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pages = PageRegistry(root / "pages.json")
            guests = GuestMessageRegistry(root / "guests.json")
            navigation = PageNavigationRegistry(root / "navigation.json")
            target = await pages.save(
                1,
                "الصفحة الثانية",
                [new_block("paragraph", {"text": "النص الجديد", "html": "<p>النص الجديد</p>"})],
                [],
                1,
                "center",
            )
            for chat_type in ("supergroup", "channel"):
                with self.subTest(chat_type=chat_type):
                    await guests.remember(
                        "guest-inline-id", -1001234567890, chat_type,
                    )
                    callback = SimpleNamespace(
                        message=None,
                        inline_message_id="guest-inline-id",
                        data=f"r:page:{target}:source123",
                        id="callback-query-id",
                        from_user=SimpleNamespace(id=77),
                        answer=AsyncMock(),
                    )
                    bot = SimpleNamespace(
                        send_rich_message=AsyncMock(),
                        edit_ephemeral_message_text=AsyncMock(),
                    )

                    with (
                        patch("app.routers.editor_core.page_registry", pages),
                        patch("app.routers.editor_core.guest_message_registry", guests),
                        patch(
                            "app.routers.editor_core.page_navigation_registry",
                            navigation,
                        ),
                    ):
                        await open_page_link(callback, bot)

                    bot.send_rich_message.assert_awaited_once()
                    arguments = bot.send_rich_message.await_args.kwargs
                    self.assertEqual(arguments["chat_id"], -1001234567890)
                    parameters = arguments["ephemeral_message_parameters"]
                    self.assertEqual(parameters.receiver_user_id, 77)
                    self.assertEqual(parameters.callback_query_id, "callback-query-id")
                    self.assertTrue(parameters.replace_callback_query_message)
                    rendered = arguments["rich_message"].model_dump(
                        mode="json", exclude_none=True,
                    )
                    self.assertEqual(rendered["blocks"][0]["text"], "النص الجديد")
                    self.assertTrue(
                        rendered["blocks"][1]["buttons"][0]["callback_data"].startswith(
                            "r:pback:",
                        ),
                    )

    async def test_back_deletes_ephemeral_layer_and_reveals_original(self):
        callback = SimpleNamespace(
            message=SimpleNamespace(
                chat=SimpleNamespace(id=-1001234567890),
                ephemeral_message_id=42,
            ),
            from_user=SimpleNamespace(id=77),
            answer=AsyncMock(),
        )
        bot = SimpleNamespace(delete_ephemeral_message=AsyncMock())

        await restore_original_message(callback, bot)

        bot.delete_ephemeral_message.assert_awaited_once_with(
            chat_id=-1001234567890,
            receiver_user_id=77,
            ephemeral_message_id=42,
        )
        callback.answer.assert_awaited_once_with()


if __name__ == "__main__":
    unittest.main()
