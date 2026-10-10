import tempfile
import unittest
from pathlib import Path

from app.i18n import t
from app.editor.builders import new_block
from app.services.page_navigation import PageNavigationRegistry
from app.services.renderer import build_input_rich_message


class PageNavigationRegistryTests(unittest.IsolatedAsyncioTestCase):
    async def test_nested_back_keeps_the_complete_history(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = PageNavigationRegistry(Path(directory) / "navigation.json")

            second = await registry.navigate(77, "page-one", "page-two")
            third = await registry.navigate(
                77, "page-two", "page-three", second.token,
            )

            self.assertEqual(third.stack, ("page-one", "page-two", "page-three"))
            self.assertTrue(third.can_go_home)

            back_to_second = await registry.back(third.token, 77)
            assert back_to_second is not None
            self.assertEqual(back_to_second.stack, ("page-one", "page-two"))
            self.assertTrue(back_to_second.can_go_back)
            self.assertFalse(back_to_second.can_go_home)

            back_to_first = await registry.back(third.token, 77)
            assert back_to_first is not None
            self.assertEqual(back_to_first.stack, ("page-one",))
            self.assertTrue(back_to_first.is_at_root)

    async def test_standalone_page_becomes_its_own_root_only_after_a_link_is_opened(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = PageNavigationRegistry(Path(directory) / "navigation.json")

            opened = await registry.navigate(77, "page-two", "page-three")

            self.assertEqual(opened.root_page_id, "page-two")
            self.assertEqual(opened.stack, ("page-two", "page-three"))
            self.assertTrue(opened.can_go_back)
            self.assertFalse(opened.can_go_home)

    async def test_navigation_session_is_scoped_to_the_user(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = PageNavigationRegistry(Path(directory) / "navigation.json")
            navigation = await registry.navigate(77, "one", "two")

            self.assertIsNone(await registry.back(navigation.token, 88))

    async def test_failed_back_can_be_rolled_back_without_breaking_the_button(self):
        with tempfile.TemporaryDirectory() as directory:
            registry = PageNavigationRegistry(Path(directory) / "navigation.json")
            navigation = await registry.navigate(77, "one", "two")

            at_root = await registry.back(navigation.token, 77)
            assert at_root is not None
            self.assertEqual(at_root.stack, ("one",))
            await registry.rollback_back(navigation.token, 77)

            retried = await registry.back(navigation.token, 77)
            assert retried is not None
            self.assertEqual(retried.stack, ("one",))


class PageNavigationRenderingTests(unittest.TestCase):
    def test_nested_page_callbacks_keep_the_navigation_token(self):
        paragraph = new_block("paragraph", {
            "text": "{الثالثة:cbd page-three}",
            "html": "<p>{الثالثة:cbd page-three}</p>",
        })
        rich = build_input_rich_message(
            [paragraph],
            source_page_id="page-two",
            navigation_token="abcdef123456",
        ).model_dump(mode="json", exclude_none=True)

        callback_data = rich["blocks"][0]["text"]["button"]["callback_data"]
        self.assertEqual(
            callback_data,
            "r:page:page-three:page-two:abcdef123456",
        )
        self.assertLessEqual(len(callback_data.encode()), 64)

    def test_back_and_home_have_a_separate_two_button_row(self):
        paragraph = new_block("paragraph", {
            "text": "الثالثة", "html": "<p>الثالثة</p>",
        })
        navigation_buttons = [
            {
                "id": "back", "text": "🔙 رجوع", "type": "callback_data",
                "value": "r:pback:abcdef123456", "position": 0,
            },
            {
                "id": "home", "text": "🏠 الصفحة الرئيسية",
                "type": "callback_data", "value": "r:phome:abcdef123456",
                "position": 1, "style": "primary",
            },
        ]
        rich = build_input_rich_message(
            [paragraph],
            source_page_id="page-three",
            navigation_token="abcdef123456",
            navigation_buttons=navigation_buttons,
        ).model_dump(mode="json", exclude_none=True)

        navigation_row = rich["blocks"][-1]
        self.assertEqual(navigation_row["type"], "buttons")
        self.assertEqual(
            [button["callback_data"] for button in navigation_row["buttons"]],
            ["r:pback:abcdef123456", "r:phome:abcdef123456"],
        )

    def test_home_label_is_translated_for_every_supported_language(self):
        from app import i18n_core
        from app.lang import SUPPORTED_LANGUAGES

        for language in SUPPORTED_LANGUAGES:
            with self.subTest(language=language):
                token = i18n_core._language.set(language)
                try:
                    label = t("navigation.home")
                finally:
                    i18n_core._language.reset(token)
                self.assertTrue(label.startswith("🏠 "))
                self.assertNotEqual(label, "🏠 Home" if language != "en" else "")


if __name__ == "__main__":
    unittest.main()
