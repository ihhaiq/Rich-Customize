import unittest

from app import i18n_core
from app.lang import SUPPORTED_LANGUAGES
from app.lang.catalogs.guide import GUIDE_TRANSLATIONS
from app.lang.catalogs.guide_all import ACTIVE_GUIDE_KEYS
from app.routers.button_guide import button_guide_blocks, button_syntax_examples


class ButtonGuideLocalizationTests(unittest.TestCase):
    def test_every_supported_language_has_a_complete_button_guide(self):
        for language in sorted(SUPPORTED_LANGUAGES - {"en"}):
            with self.subTest(language=language):
                locale = GUIDE_TRANSLATIONS.get(language, {})
                self.assertTrue(
                    set(ACTIVE_GUIDE_KEYS).issubset(locale),
                    f"Missing button-guide translations for {language}",
                )
                self.assertTrue(
                    all(locale[key] != key for key in ACTIVE_GUIDE_KEYS),
                    f"English button-guide fallback remains in {language}",
                )
                token = i18n_core._language.set(language)
                try:
                    blocks = button_guide_blocks(
                        "Send the message you want to customize. "
                        "You can place button syntax anywhere in the text."
                    )
                    examples = button_syntax_examples()
                finally:
                    i18n_core._language.reset(token)
                self.assertEqual(
                    blocks[1]["data"]["summary_html"],
                    locale["📘 Inline button guide — tap to open"],
                )
                self.assertIn(locale["{Next page - CBD:code #color}"], examples)

    def test_every_template_is_copyable_in_every_supported_language(self):
        for language in sorted(SUPPORTED_LANGUAGES):
            with self.subTest(language=language):
                token = i18n_core._language.set(language)
                try:
                    blocks = button_guide_blocks(
                        "Send the message you want to customize. "
                        "You can place button syntax anywhere in the text."
                    )
                finally:
                    i18n_core._language.reset(token)

                examples = [
                    child for child in blocks[1]["data"]["children"]
                    if child["type"] == "preformatted"
                ]
                self.assertEqual(len(examples), 8)
                self.assertTrue(
                    all(
                        example["data"].get("parse_inline_buttons") is False
                        for example in examples
                    )
                )
                self.assertTrue(
                    all(example["data"]["text"].startswith("{") for example in examples)
                )

    def test_arabic_guide_translates_english_semantic_keys(self):
        token = i18n_core._language.set("ar")
        try:
            blocks = button_guide_blocks(
                "أرسل الرسالة التي تريد تخصيصها. تقدر تكتب تنسيق الزر داخل النص بأي مكان."
            )
            rendered = repr(blocks)
            examples = button_syntax_examples()
        finally:
            i18n_core._language.reset(token)

        self.assertIn("دليل الأزرار داخل النص", rendered)
        self.assertIn("الصيغة", rendered)
        self.assertIn("الصفحة التالية", examples)
        self.assertIn("- USER", examples)
        self.assertIn("CBD:الكود #اللون", examples)
        self.assertIn("alert: نص التنبيه #اللون", examples)
        self.assertIn("زران بجانب بعضهما", examples)
        self.assertNotIn("callback_data:", examples)
        self.assertNotIn("Inline button guide", rendered)
        self.assertNotIn("Next page", examples)
        self.assertNotIn("Two buttons side by side", examples)

    def test_french_guide_has_no_arabic_source_labels(self):
        token = i18n_core._language.set("fr")
        try:
            blocks = button_guide_blocks(
                "أرسل الرسالة التي تريد تخصيصها. تقدر تكتب تنسيق الزر داخل النص بأي مكان."
            )
            rendered = repr(blocks)
            examples = button_syntax_examples()
        finally:
            i18n_core._language.reset(token)

        self.assertIn("Envoyez le message", rendered)
        self.assertIn("Guide des boutons intégrés", rendered)
        self.assertIn("Syntaxe", rendered)
        self.assertIn("Page suivante", examples)
        self.assertIn("- USER", examples)
        self.assertIn("alert:", examples)
        self.assertIn("Deux boutons côte à côte", examples)
        self.assertNotIn("callback_data:", examples)
        self.assertNotIn("اسم الزر", rendered)
        self.assertNotIn("الصفحة التالية", examples)
        self.assertNotIn("الألوان", rendered)


if __name__ == "__main__":
    unittest.main()
