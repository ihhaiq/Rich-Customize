from __future__ import annotations

import asyncio
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.base import StorageKey
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import Message

from app.lang import SUPPORTED_LANGUAGES
from app.lang.catalogs.slideshow import KEYS, SLIDESHOW_CATALOGS
from app.routers.block_add import choose_add_block, receive_added_block
from app.routers.details_builder import choose_details_child_type, receive_details_add
from app.routers.slideshow import confirm_slideshow
from app.services.albums import AlbumCollector
from app.states import RichEditorStates


def message(number=1, *, group=None, video=False, text=None):
    payload = {
        "message_id": number, "date": 1, "chat": {"id": 10, "type": "private"},
        "from_user": {"id": 10, "is_bot": False, "first_name": "Test"},
        "media_group_id": group,
    }
    if text is not None:
        payload["text"] = text
    elif video:
        payload["video"] = {
            "file_id": str(number), "file_unique_id": str(number),
            "width": 100, "height": 100, "duration": 1,
        }
    else:
        payload["photo"] = [{
            "file_id": str(number), "file_unique_id": str(number), "width": 100, "height": 100,
        }]
    return Message.model_validate(payload)


class SlideshowBatchTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.storage = MemoryStorage()
        self.state = FSMContext(self.storage, StorageKey(bot_id=1, chat_id=10, user_id=10))
        await self.state.set_data({"blocks": [], "message_buttons": []})
        self.bot = AsyncMock()
        self.prompt_number = 1000

        async def answer(*args, **kwargs):
            self.prompt_number += 1
            return message(self.prompt_number, text="prompt")

        self.answers = AsyncMock(side_effect=answer)
        for target, replacement in (
            ("aiogram.types.Message.answer", self.answers),
            ("app.routers.block_support.repost_saved_ui", AsyncMock()),
            ("app.routers.details_builder.edit_ui", AsyncMock()),
            ("app.services.parser.media_store.remember_blocks", lambda _: None),
            ("app.routers.slideshow.albums", AlbumCollector(quiet_seconds=0.01)),
            ("app.routers.block_add.albums", AlbumCollector(quiet_seconds=0.01)),
        ):
            patcher = patch(target, replacement)
            patcher.start()
            self.addCleanup(patcher.stop)
        await choose_add_block(self.callback("r:add:slideshow"), self.state, self.bot)
        self.answers.reset_mock()

    async def asyncTearDown(self):
        await self.storage.close()

    def callback(self, data, msg=None):
        return SimpleNamespace(data=data, message=msg or message(900, text="menu"), answer=AsyncMock())

    async def action(self, action="done"):
        data = await self.state.get_data()
        return self.callback(
            f"r:slides:{action}:{data['slideshow']['token']}",
            message(data["add_prompt_message_id"], text="confirmation"),
        )

    async def batch(self, start, size=10, *, nested=False):
        handler = receive_details_add if nested else receive_added_block
        await asyncio.gather(*(
            handler(message(i, group=str(start), video=i % 2 == 0), self.state, self.bot)
            for i in reversed(range(start, start + size))
        ))

    async def test_five_albums_wait_for_confirmation_and_save_one_ordered_block(self):
        for start in range(1, 51, 10):
            await self.batch(start)
            data = await self.state.get_data()
            self.assertEqual(len(data["slideshow"]["children"]), start + 9)
            self.assertEqual(data["blocks"], [])
            self.assertEqual(await self.state.get_state(), RichEditorStates.adding_block.state)
            if start < 41:
                await confirm_slideshow(await self.action("more"), self.state, self.bot)
        markup = self.answers.await_args.kwargs["reply_markup"]
        self.assertEqual(len(markup.inline_keyboard[0]), 1)
        callback = await self.action()
        await asyncio.gather(*[confirm_slideshow(callback, self.state, self.bot) for _ in range(2)])
        data = await self.state.get_data()
        self.assertEqual(len(data["blocks"]), 1)
        children = data["blocks"][0]["data"]["children"]
        self.assertEqual([child["data"]["file"]["file_id"] for child in children], [str(i) for i in range(1, 51)])
        self.assertEqual(len(data["editor_history_undo"]), 1)
        self.assertIsNone(data["slideshow"])
        self.assertEqual(await self.state.get_state(), RichEditorStates.managing.state)

    async def test_continue_after_ten_without_adding_more(self):
        await self.batch(1)
        self.assertEqual(self.answers.await_count, 1)
        await confirm_slideshow(await self.action(), self.state, self.bot)
        self.assertEqual(len((await self.state.get_data())["blocks"][0]["data"]["children"]), 10)

    async def test_overflow_keeps_first_fifty_and_reports_rejected_media(self):
        for start in range(1, 41, 10):
            await self.batch(start)
        await self.batch(41, 7)
        await self.batch(48)
        self.assertEqual(len((await self.state.get_data())["slideshow"]["children"]), 50)
        self.assertIn("7", self.answers.await_args.args[0])
        await self.batch(58)
        self.assertEqual(len((await self.state.get_data())["slideshow"]["children"]), 50)

    async def test_old_buttons_and_cancelled_flow_cannot_commit(self):
        await self.batch(1)
        old = await self.action()
        await confirm_slideshow(await self.action("more"), self.state, self.bot)
        await confirm_slideshow(old, self.state, self.bot)
        self.assertEqual((await self.state.get_data())["blocks"], [])
        current = await self.action()
        await self.state.set_state(RichEditorStates.managing)
        await confirm_slideshow(current, self.state, self.bot)
        self.assertEqual((await self.state.get_data())["blocks"], [])
        await choose_add_block(self.callback("r:add:slideshow"), self.state, self.bot)
        await confirm_slideshow(current, self.state, self.bot)
        self.assertEqual((await self.state.get_data())["slideshow"]["children"], [])

    async def test_inflight_album_blocks_continue_and_preserves_new_batch(self):
        await self.batch(1)
        callback = await self.action()
        started, release = asyncio.Event(), asyncio.Event()

        async def collect(msg):
            started.set()
            await release.wait()
            return [msg]

        with patch("app.routers.slideshow.albums.collect", side_effect=collect):
            task = asyncio.create_task(receive_added_block(message(11, group="next"), self.state, self.bot))
            await started.wait()
            await confirm_slideshow(callback, self.state, self.bot)
            self.assertEqual((await self.state.get_data())["blocks"], [])
            release.set()
            await task
        await confirm_slideshow(await self.action(), self.state, self.bot)
        self.assertEqual(len((await self.state.get_data())["blocks"][0]["data"]["children"]), 11)

    async def test_nested_slideshow_preserves_details_and_other_children(self):
        sibling = {"id": "existing", "type": "paragraph", "data": {"text": "Keep", "html": "Keep"}}
        await self.state.update_data(
            pending_add_type="details", add_step="details_child_select",
            add_payload={"summary_html": "Summary", "children": [sibling]},
        )
        await choose_details_child_type(self.callback("r:details:type:slideshow"), self.state, self.bot)
        await self.batch(1, nested=True)
        await confirm_slideshow(await self.action("more"), self.state, self.bot)
        await self.batch(11, nested=True)
        await confirm_slideshow(await self.action(), self.state, self.bot)
        data = await self.state.get_data()
        self.assertEqual(data["add_payload"]["summary_html"], "Summary")
        self.assertEqual(data["add_payload"]["children"][0]["data"]["text"], "Keep")
        self.assertEqual(len(data["add_payload"]["children"][1]["data"]["children"]), 20)
        self.assertEqual(data["add_step"], "details_content")
        self.assertEqual(data["blocks"], [])

    async def test_single_photo_and_invalid_text_keep_upload_open(self):
        await receive_added_block(message(1), self.state, self.bot)
        await receive_added_block(message(2, text="invalid"), self.state, self.bot)
        self.assertEqual(len((await self.state.get_data())["slideshow"]["children"]), 1)
        await confirm_slideshow(await self.action(), self.state, self.bot)
        self.assertEqual(len((await self.state.get_data())["blocks"]), 1)

    async def test_collage_still_finishes_after_one_album(self):
        await choose_add_block(self.callback("r:add:collage"), self.state, self.bot)
        await self.batch(1)
        data = await self.state.get_data()
        self.assertEqual(data["blocks"][0]["type"], "collage")
        self.assertEqual(len(data["blocks"][0]["data"]["children"]), 10)
        self.assertEqual(await self.state.get_state(), RichEditorStates.managing.state)

    def test_slideshow_prompts_cover_all_supported_languages(self):
        self.assertEqual(set(SLIDESHOW_CATALOGS), SUPPORTED_LANGUAGES)
        for catalog in SLIDESHOW_CATALOGS.values():
            self.assertEqual(len(catalog), len(KEYS))
            for text in catalog.values():
                text.format(count=10, limit=50)
