import unittest

from app import i18n_core
from app.routers.button_guide import button_guide_blocks, button_syntax_examples


class ButtonGuideLocalizationTests(unittest.TestCase):
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
        self.assertIn("Deux boutons côte à côte", examples)
        self.assertNotIn("اسم الزر", rendered)
        self.assertNotIn("الصفحة التالية", examples)
        self.assertNotIn("الألوان", rendered)


if __name__ == "__main__":
    unittest.main()
