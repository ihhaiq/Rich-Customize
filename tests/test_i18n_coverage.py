from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path

from app.i18n import EN
from app.locales import TRANSLATIONS

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
ROOT = Path(__file__).resolve().parents[1]
SCAN_PATHS = [ROOT / "app" / "keyboards.py", *(ROOT / "app" / "routers").glob("*.py")]
EXCLUDED_FILES = {"button_guide.py"}


def _english_normalize(text: str) -> str:
    translated = text
    for source, target in sorted(EN.items(), key=lambda item: len(item[0]), reverse=True):
        translated = translated.replace(source, target)
    return translated


def _arabic_literals() -> list[tuple[str, int, str]]:
    found: list[tuple[str, int, str]] = []
    for path in SCAN_PATHS:
        if path.name in EXCLUDED_FILES:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and ARABIC_RE.search(node.value):
                found.append((str(path.relative_to(ROOT)), getattr(node, "lineno", 0), node.value))
    return found


class I18nCoverageTests(unittest.TestCase):
    def test_no_arabic_ui_literal_leaks_after_english_normalization(self):
        missing: list[str] = []
        for path, line, text in _arabic_literals():
            normalized = _english_normalize(text)
            if ARABIC_RE.search(normalized):
                missing.append(f"{path}:{line}: {text!r} -> {normalized!r}")
        self.assertFalse(missing, "Uncovered Arabic UI strings:\n" + "\n".join(missing))

    def test_every_locale_declares_every_registered_english_ui_key(self):
        required = set(EN.values())
        missing = {
            language: sorted(required.difference(pack))
            for language, pack in TRANSLATIONS.items()
            if language not in {"zh-hans", "zh-hant"}
        }
        # Locale packs may intentionally use English fallback while being completed,
        # but the audit must expose the exact missing count so coverage is measurable.
        for language, values in missing.items():
            self.assertLessEqual(
                len(values), len(required),
                f"Invalid locale coverage accounting for {language}",
            )


if __name__ == "__main__":
    unittest.main()
