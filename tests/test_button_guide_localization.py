import unittest

from app import i18n_core
from app.routers.button_guide import button_guide_blocks, button_syntax_examples


class ButtonGuideLocalizationTests(unittest.TestCase):
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
