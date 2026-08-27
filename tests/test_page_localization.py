import re
import unittest

from app import i18n_core
from app.i18n import tr
from app.locales import TRANSLATIONS
from app.routers.editor_core import _math_input_prompt, _opened_page_text, _saved_pages_text

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


class SavedPagesLocalizationTests(unittest.TestCase):
    def test_arabic_math_prompt_explains_escaped_space(self):
        token = i18n_core._language.set("ar")
        try:
            prompt = _math_input_prompt("أرسل المعادلة بصيغة LaTeX")
        finally:
            i18n_core._language.reset(token)

        self.assertIn("لإضافة مسافة بين النصوص", prompt)
        self.assertTrue(prompt.endswith("\\ "))

    def test_saved_pages_show_copyable_codes_in_message_text(self):
        pages = [
            {"page_id": "a86d3132", "title": "الأولى"},
            {"page_id": "b1234567", "title": "<صفحة>"},
        ]

        rendered = _saved_pages_text(pages)

        self.assertIn("📄 الأولى — <code>a86d3132</code>", rendered)
        self.assertIn("📄 &lt;صفحة&gt; — <code>b1234567</code>", rendered)

    def test_opened_page_editor_shows_copyable_code(self):
        rendered = _opened_page_text("a86d3132", {"title": "الأولى"})

        self.assertIn("📄 الأولى — <code>a86d3132</code>", rendered)
        self.assertIn("تخصيص الرسالة", rendered)

    def test_french_saved_pages_screen_has_no_arabic(self):
        token = i18n_core._language.set("fr")
        try:
            rendered = tr("📚 صفحاتك المحفوظة\n\nاختر صفحة لفتحها وتعديلها:")
            self.assertEqual(
                rendered,
                "📚 Vos pages enregistrées\n\nChoisissez une page à ouvrir et modifier :",
            )
            self.assertIsNone(ARABIC_RE.search(rendered))
            self.assertIsNone(ARABIC_RE.search(tr("ما عندك صفحات محفوظة بعد.")))
            self.assertIsNone(ARABIC_RE.search(tr("الصفحة محذوفة أو لا تخصك.")))
        finally:
            i18n_core._language.reset(token)

    def test_every_added_locale_translates_saved_pages_heading(self):
        expected = {
            "es", "fr", "de", "it", "pt", "ru", "tr", "fa", "ku",
            "hi", "ur", "id", "ja", "ko", "uk", "nl", "pl", "vi", "th",
        }
        for language in expected:
            pack = TRANSLATIONS[language]
            self.assertIn("📚 Your saved pages", pack, language)
            self.assertIn("Choose a page to open and edit:", pack, language)
            self.assertIn("You don't have any saved pages yet.", pack, language)


if __name__ == "__main__":
    unittest.main()
