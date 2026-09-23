from __future__ import annotations

import unittest
from pathlib import Path

from app.lang.catalogs.slideshow import SLIDESHOW_CATALOGS, UNSAFE_MEDIA_TEXTS


ROOT = Path(__file__).resolve().parents[1]


class SlideshowUnsafeLocalizationTests(unittest.TestCase):
    def test_unsafe_media_message_uses_localization_key(self):
        source = (ROOT / "app" / "routers" / "slideshow.py").read_text(encoding="utf-8")

        self.assertIn('t("slideshow.unsafe_media")', source)
        self.assertNotIn(
            'message.answer("الوسائط كبيرة جدًا أو أبعادها غير آمنة للمعالجة.")',
            source,
        )

    def test_unsafe_media_key_exists_for_every_slideshow_locale(self):
        self.assertEqual(set(UNSAFE_MEDIA_TEXTS), set(SLIDESHOW_CATALOGS))
        for language, catalog in SLIDESHOW_CATALOGS.items():
            with self.subTest(language=language):
                self.assertEqual(
                    catalog["slideshow.unsafe_media"],
                    UNSAFE_MEDIA_TEXTS[language],
                )


if __name__ == "__main__":
    unittest.main()
