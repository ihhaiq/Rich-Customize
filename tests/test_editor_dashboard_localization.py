import unittest

from app import i18n_core
from app.editor.draft_store import EditorDraft
from app.routers.editor_ui import editor_dashboard_text


class EditorDashboardLocalizationTests(unittest.TestCase):
    def test_arabic_dashboard_does_not_fall_back_to_english_labels(self):
        token = i18n_core._language.set("ar")
        try:
            text = editor_dashboard_text(EditorDraft(blocks=[], message_buttons=[]))
        finally:
            i18n_core._language.reset(token)

        self.assertIn("تخصيص الرسالة", text)
        self.assertIn("💾 حفظ الصفحة: —", text)
        self.assertNotIn("Customize message", text)
        self.assertNotIn("💾 Save Page", text)


if __name__ == "__main__":
    unittest.main()
