from __future__ import annotations

import unittest

from app.editor.limits import (
    EDITOR_SESSION_TTL_SECONDS,
    EditorLimitError,
    MAX_PAGE_BLOCKS,
    MAX_SAVED_PAGES,
    MAX_TABLE_COLUMNS,
    MAX_TABLE_ROWS,
    MAX_VISIBLE_CHARACTERS,
    validate_editor_limits,
)


def paragraph(text: str = "x") -> dict:
    return {"type": "paragraph", "data": {"text": text}}


def table(rows: int, columns: int) -> dict:
    return {
        "type": "table",
        "data": {
            "rows": [["x" for _ in range(columns)] for _ in range(rows)],
        },
    }


class EditorResourceLimitTests(unittest.TestCase):
    def test_configured_limits_match_capacity_policy(self) -> None:
        self.assertEqual(EDITOR_SESSION_TTL_SECONDS, 2 * 60 * 60)
        self.assertEqual(MAX_PAGE_BLOCKS, 30)
        self.assertEqual(MAX_VISIBLE_CHARACTERS, 25_000)
        self.assertEqual(MAX_TABLE_COLUMNS, 25)
        self.assertEqual(MAX_TABLE_ROWS, 50)
        self.assertEqual(MAX_SAVED_PAGES, 12)

    def test_thirty_blocks_are_allowed_and_thirty_one_are_rejected(self) -> None:
        validate_editor_limits([paragraph() for _ in range(30)])

        with self.assertRaises(EditorLimitError) as raised:
            validate_editor_limits([paragraph() for _ in range(31)])

        self.assertEqual(raised.exception.code, "blocks")

    def test_nested_blocks_count_toward_the_same_limit(self) -> None:
        valid = {
            "type": "details",
            "data": {
                "summary_html": "<b>Details</b>",
                "children": [paragraph() for _ in range(29)],
            },
        }
        validate_editor_limits([valid])

        invalid = {
            "type": "details",
            "data": {
                "summary_html": "<b>Details</b>",
                "children": [paragraph() for _ in range(30)],
            },
        }
        with self.assertRaises(EditorLimitError) as raised:
            validate_editor_limits([invalid])

        self.assertEqual(raised.exception.code, "blocks")

    def test_slideshow_media_keep_their_own_50_item_limit(self) -> None:
        slideshow = {
            "type": "slideshow",
            "data": {
                "children": [
                    {"type": "photo", "data": {"file": {"file_id": str(index)}}}
                    for index in range(50)
                ],
            },
        }
        validate_editor_limits([slideshow])

    def test_visible_character_limit_is_25000(self) -> None:
        validate_editor_limits([paragraph("x" * 25_000)])

        with self.assertRaises(EditorLimitError) as raised:
            validate_editor_limits([paragraph("x" * 25_001)])

        self.assertEqual(raised.exception.code, "characters")

    def test_table_limits_are_50_rows_by_25_columns(self) -> None:
        validate_editor_limits([table(50, 25)])

        with self.assertRaises(EditorLimitError) as rows_error:
            validate_editor_limits([table(51, 25)])
        self.assertEqual(rows_error.exception.code, "table_rows")

        with self.assertRaises(EditorLimitError) as columns_error:
            validate_editor_limits([table(50, 26)])
        self.assertEqual(columns_error.exception.code, "table_columns")


if __name__ == "__main__":
    unittest.main()
