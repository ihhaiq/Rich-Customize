from __future__ import annotations

import unittest

from app.editor.models import make_block
from app.editor.workflow import editor_workflow
from app.keyboards.blocks import (
    build_anchor_target_keyboard,
    build_block_editor_keyboard,
    build_linked_anchor_delete_keyboard,
)
from app.routers.block_keyboard import build_managed_block_keyboard
from app.services.anchors import (
    anchor_display_name,
    anchor_name,
    align_linked_anchors,
    linked_anchors,
    new_anchor_data,
    retarget_linked_anchors,
    set_anchor_display_name,
    set_anchor_target,
)
from app.services.renderer import build_input_rich_message


class AnchorRelationshipTests(unittest.TestCase):
    def setUp(self) -> None:
        self.first = make_block("heading", {"text": "First"}, block_id="first")
        self.second = make_block("paragraph", {"text": "Second"}, block_id="second")
        self.anchor = make_block(
            "anchor",
            new_anchor_data("الأسعار", self.second["id"]),
            block_id="anchor",
        )

    def test_new_anchor_separates_display_name_from_internal_identifier(self):
        self.assertEqual(anchor_display_name(self.anchor), "الأسعار")
        self.assertRegex(anchor_name(self.anchor), r"^anchor_[0-9a-f]{10}$")
        self.assertIn(anchor_name(self.anchor), self.anchor["data"]["html"])

    def test_linked_anchor_is_placed_immediately_before_target(self):
        blocks = [self.anchor, self.first, self.second]
        align_linked_anchors(blocks)
        self.assertEqual([block["id"] for block in blocks], ["first", "anchor", "second"])

    def test_moving_target_keeps_anchor_attached(self):
        blocks = [self.first, self.anchor, self.second]
        result = editor_workflow.move(blocks, self.second["id"], 0)
        self.assertEqual([block["id"] for block in result.blocks], ["anchor", "second", "first"])

    def test_deleting_target_also_deletes_linked_anchor(self):
        blocks = [self.first, self.anchor, self.second]
        result = editor_workflow.delete(blocks, self.second["id"])
        self.assertTrue(result.changed)
        self.assertEqual([block["id"] for block in result.blocks], ["first"])

    def test_retargeting_before_delete_preserves_anchor(self):
        blocks = [self.first, self.anchor, self.second]
        self.assertTrue(retarget_linked_anchors(blocks, "second", "first"))
        result = editor_workflow.delete(blocks, "second")
        self.assertEqual([block["id"] for block in result.blocks], ["anchor", "first"])
        self.assertEqual(linked_anchors(result.blocks, "first")[0]["id"], "anchor")

    def test_changing_display_name_keeps_existing_links_valid(self):
        original_name = anchor_name(self.anchor)
        self.assertTrue(set_anchor_display_name(self.anchor, "الأسعار الجديدة"))
        self.assertEqual(anchor_display_name(self.anchor), "الأسعار الجديدة")
        self.assertEqual(anchor_name(self.anchor), original_name)

    def test_changing_target_repositions_anchor(self):
        blocks = [self.first, self.anchor, self.second]
        self.assertTrue(set_anchor_target(blocks, "anchor", "first"))
        self.assertEqual([block["id"] for block in blocks], ["anchor", "first", "second"])

    def test_renderer_uses_internal_identifier(self):
        rendered = build_input_rich_message([self.anchor, self.second]).model_dump(
            mode="json",
            exclude_none=True,
        )
        self.assertEqual(rendered["blocks"][0], {
            "type": "paragraph",
            "text": {
                "type": "anchor_link",
                "text": "الأسعار",
                "anchor_name": anchor_name(self.anchor),
            },
        })
        self.assertEqual(rendered["blocks"][1], {
            "type": "anchor",
            "name": anchor_name(self.anchor),
        })

    def test_renamed_anchor_updates_visible_link_without_breaking_target(self):
        original_name = anchor_name(self.anchor)
        set_anchor_display_name(self.anchor, "الأسعار الجديدة")
        rendered = build_input_rich_message([self.anchor, self.second]).model_dump(
            mode="json",
            exclude_none=True,
        )
        self.assertEqual(rendered["blocks"][0]["text"]["text"], "الأسعار الجديدة")
        self.assertEqual(rendered["blocks"][0]["text"]["anchor_name"], original_name)

    def test_multiple_anchors_render_as_clickable_navigation_row(self):
        second_anchor = make_block(
            "anchor",
            new_anchor_data("التفاصيل", self.first["id"]),
            block_id="anchor-two",
        )
        rendered = build_input_rich_message([
            second_anchor,
            self.first,
            self.anchor,
            self.second,
        ]).model_dump(mode="json", exclude_none=True)
        navigation = rendered["blocks"][0]["text"]
        self.assertEqual(navigation[0]["text"], "التفاصيل")
        self.assertEqual(navigation[1], " · ")
        self.assertEqual(navigation[2]["text"], "الأسعار")

    def test_legacy_anchor_without_display_name_stays_invisible(self):
        legacy = make_block("anchor", {"text": "legacy"}, block_id="legacy")
        rendered = build_input_rich_message([legacy, self.second]).model_dump(
            mode="json",
            exclude_none=True,
        )
        self.assertEqual(rendered["blocks"][0], {"type": "anchor", "name": "legacy"})

    def test_target_picker_lists_content_blocks_but_not_anchors(self):
        blocks = [self.first, self.anchor, self.second]
        keyboard = build_anchor_target_keyboard(blocks)
        callbacks = {
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data and button.callback_data.startswith("r:at:")
        }
        self.assertEqual(callbacks, {"r:at:first", "r:at:second"})

    def test_linked_anchor_uses_target_change_instead_of_manual_move(self):
        keyboard = build_block_editor_keyboard(self.anchor, [self.first, self.anchor, self.second])
        callbacks = {
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data
        }
        self.assertIn("r:am:anchor", callbacks)
        self.assertNotIn("r:mu:anchor", callbacks)
        self.assertNotIn("r:md:anchor", callbacks)
        managed_callbacks = {
            button.callback_data
            for row in build_managed_block_keyboard(
                self.anchor,
                [self.first, self.anchor, self.second],
            ).inline_keyboard
            for button in row
            if button.callback_data
        }
        self.assertNotIn("r:dup:anchor", managed_callbacks)

    def test_linked_target_delete_requires_retarget_or_cascade(self):
        keyboard = build_linked_anchor_delete_keyboard(
            self.second["id"],
            [self.first, self.anchor, self.second],
        )
        callbacks = {
            button.callback_data
            for row in keyboard.inline_keyboard
            for button in row
            if button.callback_data
        }
        self.assertIn("r:adr:second:first", callbacks)
        self.assertIn("r:adc:second", callbacks)


if __name__ == "__main__":
    unittest.main()
