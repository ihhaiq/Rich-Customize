from __future__ import annotations

import re
import unittest

from app import i18n_core
from app.editor.models import make_block
from app.keyboards.blocks import build_block_editor_keyboard
from app.keyboards.publishing import build_chat_reached_keyboard


ARABIC_RE = re.compile(r"[\u0600-\u06FF]")


class CoreKeyboardLocalizationTests(unittest.TestCase):
    def test_russian_paragraph_management_controls_have_no_arabic(self):
        block = make_block("paragraph", {"text": "demo", "html": "demo"})
        token = i18n_core._language.set("ru")
        try:
            keyboard = build_block_editor_keyboard(block, [block])
        finally:
            i18n_core._language.reset(token)

        labels = [button.text for row in keyboard.inline_keyboard for button in row]
        for label in labels:
            self.assertIsNone(ARABIC_RE.search(label), label)

    def test_russian_chat_reached_shortcut_has_no_arabic(self):
        token = i18n_core._language.set("ru")
        try:
            keyboard = build_chat_reached_keyboard(-1001234567890)
        finally:
            i18n_core._language.reset(token)

        label = keyboard.inline_keyboard[0][0].text
        self.assertIsNone(ARABIC_RE.search(label), label)


if __name__ == "__main__":
    unittest.main()
