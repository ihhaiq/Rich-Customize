from __future__ import annotations

import ast
import re
import unittest
from pathlib import Path

from app import i18n_core
from app.i18n import EN, tr
from app.locales import TRANSLATIONS
from app.locales.pages import PAGE_AR_TO_EN
from app.locales.recent_ui import RECENT_AR_TO_EN

ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
ROOT = Path(__file__).resolve().parents[1]
SCAN_PATHS = [
    ROOT / "app" / "keyboards.py",
    ROOT / "app" / "routers" / "block_preview.py",
    ROOT / "app" / "routers" / "editor_core.py",
    ROOT / "app" / "services" / "blocks.py",
]


def _english_normalize(text: str) -> str:
    translated = text
    for source, target in sorted(EN.items(), key=lambda item: len(item[0]), reverse=True):
        translated = translated.replace(source, target)
    return translated


def _arabic_literals() -> list[tuple[str, int, str]]:
    found: list[tuple[str, int, str]] = []
    for path in SCAN_PATHS:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and ARABIC_RE.search(node.value):
                found.append((str(path.relative_to(ROOT)), getattr(node, "lineno", 0), node.value))
    return found


class I18nCoverageTests(unittest.TestCase):
    def test_registered_recent_ui_has_english_normalization(self):
        for source in {**PAGE_AR_TO_EN, **RECENT_AR_TO_EN}:
            normalized = _english_normalize(source)
            self.assertIsNone(ARABIC_RE.search(normalized), source)

    def test_recent_ui_never_leaks_arabic_in_non_arabic_locales(self):
        sources = list(PAGE_AR_TO_EN) + list(RECENT_AR_TO_EN)
        for language in TRANSLATIONS:
            if language in {"ar"}:
                continue
            token = i18n_core._language.set(language)
            try:
                for source in sources:
                    rendered = tr(source)
                    self.assertIsNone(
                        ARABIC_RE.search(rendered),
                        f"{language}: {source!r} -> {rendered!r}",
                    )
            finally:
                i18n_core._language.reset(token)

    def test_source_audit_reports_only_registered_or_legacy_ui(self):
        # This is intentionally a diagnostic inventory rather than a blanket
        # ban on Arabic literals: editor_core still contains the Arabic source
        # copy of the button-syntax guide, and showcase.py has an intentional
        # Arabic-only branch. New feature strings must be registered in EN.
        uncovered = []
        recent_sources = set(PAGE_AR_TO_EN) | set(RECENT_AR_TO_EN)
        for path, line, text in _arabic_literals():
            if text in recent_sources:
                continue
            normalized = _english_normalize(text)
            if ARABIC_RE.search(normalized):
                uncovered.append(f"{path}:{line}: {text!r}")
        # Keep the inventory bounded. A sudden increase means new hard-coded UI
        # was added without localization and should be moved to a locale bundle.
        self.assertLess(
            len(uncovered),
            80,
            "Too many uncovered Arabic UI literals; register new strings in i18n.\n"
            + "\n".join(uncovered),
        )


if __name__ == "__main__":
    unittest.main()
