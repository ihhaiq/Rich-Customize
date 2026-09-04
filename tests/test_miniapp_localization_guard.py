from __future__ import annotations

import ast
import json
import re
import unittest
from pathlib import Path

from app.lang import SUPPORTED_LANGUAGES


ROOT = Path(__file__).resolve().parents[1]
APP_ROOT = ROOT / "app"
STATIC_ROOT = APP_ROOT / "miniapp_static"
PUBLIC_UI_DIRS = (APP_ROOT / "routers", APP_ROOT / "keyboards")
PUBLIC_UI_EXCLUDED_FILES = {APP_ROOT / "routers" / "developer.py"}
ARABIC_RE = re.compile(r"[\u0600-\u06FF]")
JS_KEY_CALL_RE = re.compile(r"\b(?:mt|tr)\(\s*(['\"`])([A-Za-z][A-Za-z0-9_.-]*)\1")
JS_FALLBACK_RE = re.compile(
    r"\btr\(\s*(['\"`])[^'\"`]+\1\s*,\s*(['\"`])([^'\"`]*)\2"
)


def _english_miniapp_keys() -> set[str]:
    source = (STATIC_ROOT / "miniapp_i18n.js").read_text(encoding="utf-8")
    match = re.search(r"\n\s*en:\s*\{(?P<body>.*?)\n\s*\},\n\s*ru:\s*\{", source, re.S)
    if not match:
        raise AssertionError("Could not locate the English Mini App dictionary")
    return set(re.findall(r"[\"']([A-Za-z][A-Za-z0-9_.-]*)[\"']\s*:", match.group("body")))


def _feature_translation_keys() -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    excluded = {
        "miniapp_i18n.js",
        "miniapp_i18n_locales.js",
        "miniapp_i18n_coverage.js",
    }
    for path in STATIC_ROOT.glob("*.js"):
        if path.name in excluded:
            continue
        source = path.read_text(encoding="utf-8")
        keys = [match.group(2) for match in JS_KEY_CALL_RE.finditer(source)]
        if keys:
            result[str(path.relative_to(ROOT))] = keys
    return result


def _semantic_term_rows() -> tuple[list[str], dict[str, list[str]]]:
    source = (STATIC_ROOT / "miniapp_i18n_coverage.js").read_text(encoding="utf-8")
    key_match = re.search(r"const TERM_KEYS = \[(?P<body>.*?)\n\s*\];", source, re.S)
    row_match = re.search(r"const TERM_ROWS = \{(?P<body>.*?)\n\s*\};", source, re.S)
    if not key_match or not row_match:
        raise AssertionError("TERM_KEYS/TERM_ROWS were not found in miniapp_i18n_coverage.js")
    keys = re.findall(r'"([A-Za-z][A-Za-z0-9_-]*)"', key_match.group("body"))
    rows: dict[str, list[str]] = {}
    for match in re.finditer(
        r'^\s*(?:"([^"]+)"|([a-z][a-z0-9-]*))\s*:\s*(\[[^\n]*\]),?$',
        row_match.group("body"),
        re.M,
    ):
        language = match.group(1) or match.group(2)
        rows[language] = json.loads(match.group(3))
    return keys, rows


def _contains_localization_call(node: ast.AST) -> bool:
    for child in ast.walk(node):
        if not isinstance(child, ast.Call):
            continue
        if isinstance(child.func, ast.Name) and child.func.id in {"t", "tr"}:
            return True
    return False


class MiniAppLocalizationGuardTests(unittest.TestCase):
    def test_feature_translation_keys_exist_in_english_dictionary(self):
        registered = _english_miniapp_keys()
        missing: dict[str, list[str]] = {}
        for path, keys in _feature_translation_keys().items():
            unknown = sorted({key for key in keys if key not in registered})
            if unknown:
                missing[path] = unknown
        self.assertFalse(
            missing,
            "Mini App feature code references localization keys missing from the English catalog: "
            f"{missing}",
        )

    def test_native_coverage_terms_include_every_additional_locale(self):
        _, rows = _semantic_term_rows()
        expected = set(SUPPORTED_LANGUAGES) - {"en", "ar", "ru"}
        covered = set(rows)
        self.assertEqual(
            expected,
            covered,
            f"Mini App native fallback coverage differs: missing={sorted(expected - covered)}, "
            f"extra={sorted(covered - expected)}",
        )

    def test_native_coverage_rows_match_term_schema(self):
        keys, rows = _semantic_term_rows()
        invalid = {
            language: {
                "expected": len(keys),
                "actual": len(values),
                "empty": [index for index, value in enumerate(values) if not str(value).strip()],
            }
            for language, values in rows.items()
            if len(values) != len(keys) or any(not str(value).strip() for value in values)
        }
        self.assertFalse(invalid, f"Malformed Mini App semantic locale rows: {invalid}")

    def test_coverage_layer_loads_before_feature_scripts(self):
        html = (STATIC_ROOT / "index.html").read_text(encoding="utf-8")
        locales = html.find("miniapp_i18n_locales.js")
        core = html.find("miniapp_i18n.js")
        coverage = html.find("miniapp_i18n_coverage.js")
        app = html.find("app.js")
        self.assertTrue(
            -1 not in {locales, core, coverage, app},
            "Mini App localization scripts or app.js are missing from index.html",
        )
        self.assertLess(locales, core)
        self.assertLess(core, coverage)
        self.assertLess(coverage, app)

    def test_translation_fallback_literals_are_locale_neutral_for_all_quote_styles(self):
        leaks: list[str] = []
        excluded = {
            "miniapp_i18n.js",
            "miniapp_i18n_locales.js",
            "miniapp_i18n_coverage.js",
        }
        for path in STATIC_ROOT.glob("*.js"):
            if path.name in excluded:
                continue
            source = path.read_text(encoding="utf-8")
            for match in JS_FALLBACK_RE.finditer(source):
                fallback = match.group(3)
                if ARABIC_RE.search(fallback):
                    line = source.count("\n", 0, match.start()) + 1
                    leaks.append(f"{path.relative_to(ROOT)}:{line}")
        self.assertFalse(
            leaks,
            "Mini App tr(...) fallbacks must stay locale-neutral, including backtick literals: "
            + ", ".join(leaks),
        )

    def test_public_modules_do_not_freeze_localization_at_import_time(self):
        frozen: list[str] = []
        for directory in PUBLIC_UI_DIRS:
            for path in directory.rglob("*.py"):
                if path in PUBLIC_UI_EXCLUDED_FILES:
                    continue
                tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
                for statement in tree.body:
                    value: ast.AST | None = None
                    if isinstance(statement, (ast.Assign, ast.AnnAssign)):
                        value = statement.value
                    elif isinstance(statement, ast.AugAssign):
                        value = statement.value
                    if value is None or not _contains_localization_call(value):
                        continue
                    frozen.append(
                        f"{path.relative_to(ROOT)}:{getattr(statement, 'lineno', 0)}"
                    )
        self.assertFalse(
            frozen,
            "Module-level t()/tr() calls freeze the default locale at import time: "
            + ", ".join(frozen),
        )

    def test_lazy_main_text_is_not_retranslated(self):
        offenders = []
        for path in (APP_ROOT / "routers").rglob("*.py"):
            source = path.read_text(encoding="utf-8")
            if re.search(r"\btr\(\s*MAIN_TEXT\s*\)", source):
                offenders.append(str(path.relative_to(ROOT)))
        self.assertFalse(
            offenders,
            "MAIN_TEXT already resolves through semantic t(...) and must be converted with str(), "
            "not passed back through tr(): " + ", ".join(offenders),
        )


if __name__ == "__main__":
    unittest.main()
