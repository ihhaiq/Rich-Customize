from __future__ import annotations

import string
import unittest

from app.lang.catalogs.pages import (
    PAGE_LIMIT_SOURCE,
    PAGE_LIMIT_TRANSLATIONS,
    PAGE_TRANSLATIONS,
)


def _fields(value: str) -> set[str]:
    return {
        field_name
        for _, field_name, _, _ in string.Formatter().parse(value)
        if field_name
    }


class PageLimitLocalizationTests(unittest.TestCase):
    def test_page_limit_message_has_every_non_arabic_locale(self):
        expected = {
            "es", "fr", "de", "it", "pt", "nl", "pl", "uk", "ru", "tr",
            "fa", "ku", "ur", "hi", "id", "ja", "ko", "vi", "th",
            "zh-hans", "zh-hant",
        }
        self.assertEqual(set(PAGE_LIMIT_TRANSLATIONS), expected)
        for language in expected:
            with self.subTest(language=language):
                self.assertEqual(
                    PAGE_TRANSLATIONS[language][PAGE_LIMIT_SOURCE],
                    PAGE_LIMIT_TRANSLATIONS[language],
                )
                self.assertEqual(
                    _fields(PAGE_LIMIT_TRANSLATIONS[language]),
                    {"limit"},
                )


if __name__ == "__main__":
    unittest.main()
