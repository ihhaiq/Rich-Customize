import unittest
from datetime import datetime, timezone

from aiogram.types import Chat, Message, MessageEntity, User

from app.services.factory import details_data, new_block, table_data
from app.services.buttons import add_message_button
from app.services.parser import message_to_blocks
from app.services.renderer import build_input_rich_message
from app.services.inline_buttons import (
    find_user_button_markers, inline_button_rich_text, resolve_user_button_marker,
)
from app import i18n_core
from app.routers.button_guide import button_guide_blocks as _button_guide_blocks
from app.routers.editor_ui import friendly_rich_error as _friendly_rich_error


class FormattedTextParserTests(unittest.TestCase):
    def test_button_guide_contains_expandable_copyable_examples(self):
        token = i18n_core._language.set("ar")
        try:
            rich = build_input_rich_message(
                _button_guide_blocks("أرسل عنوان الزر"),
            ).model_dump(mode="json", exclude_none=True)
        finally:
            i18n_core._language.reset(token)

        self.assertEqual([block["type"] for block in rich["blocks"]], ["paragraph", "details"])
        details = rich["blocks"][1]
        self.assertEqual(details["type"], "details")
        self.assertIn("دليل الأزرار", details["summary"])
        quote_blocks = [
            block for block in details["blocks"] if block["type"] == "blockquote"
        ]
        self.assertGreater(len(quote_blocks), 4)
        examples = "\n".join(block["blocks"][0]["text"] for block in quote_blocks)
        self.assertIn("{الملف الشخصي - USER #p}", examples)
        self.assertIn("{الصفحة التالية - CBD:الكود #اللون}", examples)
        self.assertIn("{تنبيه - alert: نص التنبيه #اللون}", examples)
        self.assertNotIn("callback_data:", examples)
        self.assertNotIn("web_app", examples)
        self.assertNotIn("login_url", examples)
        self.assertEqual(
            details["blocks"][-1]["text"],
            "الألوان: #r أحمر، #b أو #p أزرق، #g أخضر. يقبل أيضًا RED وBLUE وGREEN وأسماء الألوان العربية.",
        )

    def test_inline_button_type_accepts_case_and_accidental_spaces(self):
        parsed = inline_button_rich_text(
            "{نسخ - CoPy : النص#g} {نفذ - CALLBACK DATA : action:1#r}"
        )
        buttons = [
            item["button"] for item in parsed
            if isinstance(item, dict) and item.get("type") == "button"
        ]

        self.assertEqual(buttons[0]["copy_text"]["text"], "النص")
        self.assertEqual(buttons[1]["callback_data"], "action:1")

    def test_inline_url_and_callback_buttons_keep_their_text_position(self):
        paragraph = new_block("paragraph", {
            "text": "قبل {الموقع:url https://example.com#p} وسط {نفذ:callback_data action:1#r} بعد",
            "html": "<p>قبل {الموقع:url https://example.com#p} وسط {نفذ:callback_data action:1#r} بعد</p>",
        })
        rich = build_input_rich_message([paragraph]).model_dump(mode="json", exclude_none=True)
        text = rich["blocks"][0]["text"]

        self.assertEqual(text[0], "قبل ")
        self.assertEqual(text[1]["type"], "button")
        self.assertEqual(text[1]["button"]["url"], "https://example.com")
        self.assertEqual(text[1]["button"]["style"], "primary")
        self.assertEqual(text[3]["button"]["callback_data"], "action:1")
        self.assertEqual(text[3]["button"]["style"], "danger")
        self.assertEqual(text[4], " بعد")

    def test_inline_popup_button_uses_the_builtin_alert_handler(self):
        paragraph = new_block("paragraph", {
            "text": "{تنبيه:popup هذا نص التنبيه#r}",
            "html": "<p>{تنبيه:popup هذا نص التنبيه#r}</p>",
        })

        rich = build_input_rich_message([paragraph]).model_dump(
            mode="json", exclude_none=True,
        )
        button = rich["blocks"][0]["text"]["button"]

        self.assertEqual(button["callback_data"], "r:poptext:هذا نص التنبيه")

    def test_inline_alert_alias_uses_the_builtin_alert_handler(self):
        parsed = inline_button_rich_text("{تنبيه - ALERT : انتبه #r}")
        button = parsed["button"]

        self.assertEqual(button["callback_data"], "r:poptext:انتبه")
        self.assertEqual(button["style"], "danger")
        self.assertEqual(button["style"], "danger")

    def test_invalid_short_http_host_is_treated_as_telegram_username(self):
        paragraph = new_block("paragraph", {
            "text": "{الحساب:url https://IHHAI#b}",
            "html": "<p>{الحساب:url https://IHHAI#b}</p>",
        })

        rich = build_input_rich_message([paragraph]).model_dump(
            mode="json", exclude_none=True,
        )

        self.assertEqual(
            rich["blocks"][0]["text"]["button"]["url"],
            "https://t.me/ihhai",
        )

    def test_user_marker_is_resolved_before_rendering(self):
        marker = "{حساب حسين:user#g}"
        blocks = [new_block("paragraph", {
            "text": f"قبل {marker} بعد",
            "html": f"<p>قبل {marker} بعد</p>",
        })]
        markers = find_user_button_markers(blocks[0]["data"]["text"])
        self.assertEqual(markers[0]["title"], "حساب حسين")

        resolve_user_button_marker(blocks, marker, 123456789)
        rich = build_input_rich_message(blocks).model_dump(mode="json", exclude_none=True)
        button = rich["blocks"][0]["text"][1]["button"]

        self.assertEqual(button["url"], "tg://user?id=123456789")
        self.assertEqual(button["style"], "success")

    def test_user_marker_prefers_username_link(self):
        marker = "{حساب:user#p}"
        blocks = [new_block("paragraph", {
            "text": marker,
            "html": f"<p>{marker}</p>",
        })]

        resolve_user_button_marker(blocks, marker, 123456789, "@ihhaiq")
        rich = build_input_rich_message(blocks).model_dump(
            mode="json", exclude_none=True,
        )

        self.assertEqual(
            rich["blocks"][0]["text"]["button"]["url"],
            "https://t.me/ihhaiq",
        )

    def test_bot_api_10_3_rich_buttons_are_embedded_as_blocks(self):
        paragraph = new_block("paragraph", {"text": "النص", "html": "<p>النص</p>"})
        buttons = []
        url = add_message_button(buttons, "الموقع", "https://t.me/ihhai", "url")
        copy = add_message_button(buttons, "نسخ", "قيمة", "copy")
        popup = add_message_button(buttons, "تنبيه", "مرحبًا", "popup")
        disabled = add_message_button(buttons, "متوقف", "", "disabled")
        assert url and copy and popup and disabled
        url["style"] = "primary"
        popup["style"] = "link"

        rich = build_input_rich_message(
            [paragraph], buttons, buttons_per_row=2, buttons_align="right",
        ).model_dump(mode="json", exclude_none=True)

        self.assertEqual(
            [block["type"] for block in rich["blocks"]],
            ["paragraph", "buttons", "buttons"],
        )
        self.assertEqual(rich["blocks"][1]["align"], "right")
        self.assertEqual(rich["blocks"][1]["buttons"][0]["style"], "primary")
        self.assertEqual(rich["blocks"][1]["buttons"][1]["copy_text"]["text"], "قيمة")
        self.assertEqual(rich["blocks"][2]["buttons"][0]["style"], "link")
        self.assertTrue(rich["blocks"][2]["buttons"][0]["callback_data"].startswith("r:popup:"))
        self.assertEqual(rich["blocks"][2]["buttons"][1]["disabled"], {})

    def test_page_button_keeps_source_for_ephemeral_back_navigation(self):
        paragraph = new_block("paragraph", {"text": "الأولى", "html": "<p>الأولى</p>"})
        buttons = []
        add_message_button(buttons, "التالي", "deadbeef", "page")

        rich = build_input_rich_message(
            [paragraph], buttons, source_page_id="c0ffee00",
        ).model_dump(mode="json", exclude_none=True)

        self.assertEqual(
            rich["blocks"][1]["buttons"][0]["callback_data"],
            "r:page:deadbeef:c0ffee00",
        )
        self.assertLessEqual(
            len(rich["blocks"][1]["buttons"][0]["callback_data"].encode()), 64,
        )

    def test_cbd_is_simple_inline_saved_page_navigation(self):
        paragraph = new_block("paragraph", {
            "text": "قبل {التالي:cbd a86d3132#g} بعد",
            "html": "<p>قبل {التالي:cbd a86d3132#g} بعد</p>",
        })

        rich = build_input_rich_message(
            [paragraph], source_page_id="c0ffee00",
        ).model_dump(mode="json", exclude_none=True)
        button = rich["blocks"][0]["text"][1]["button"]

        self.assertEqual(button["text"], "التالي")
        self.assertEqual(button["style"], "success")
        self.assertEqual(
            button["callback_data"],
            "r:page:a86d3132:c0ffee00",
        )

    def test_cbd_sub_audience_is_gated_via_r_cbds_prefix(self):
        paragraph = new_block("paragraph", {
            "text": "قبل {للمشتركين:cbd a86d3132#g sub} بعد",
            "html": "<p>قبل {للمشتركين:cbd a86d3132#g sub} بعد</p>",
        })

        rich = build_input_rich_message(
            [paragraph], source_page_id="c0ffee00",
        ).model_dump(mode="json", exclude_none=True)
        button = rich["blocks"][0]["text"][1]["button"]

        self.assertEqual(button["callback_data"], "r:spage:a86d3132:c0ffee00")

    def test_cbd_all_audience_matches_default_public_behavior(self):
        paragraph = new_block("paragraph", {
            "text": "{عام:cbd a86d3132 all}",
            "html": "<p>{عام:cbd a86d3132 all}</p>",
        })

        rich = build_input_rich_message(
            [paragraph], source_page_id="c0ffee00",
        ).model_dump(mode="json", exclude_none=True)
        button = rich["blocks"][0]["text"]["button"]

        self.assertEqual(button["callback_data"], "r:page:a86d3132:c0ffee00")

    def test_page_button_with_subscribers_audience_flag(self):
        paragraph = new_block("paragraph", {"text": "الأولى", "html": "<p>الأولى</p>"})
        buttons = []
        add_message_button(buttons, "للمشتركين", "deadbeef", "page")
        buttons[0]["audience"] = "subscribers"

        rich = build_input_rich_message(
            [paragraph], buttons, source_page_id="c0ffee00",
        ).model_dump(mode="json", exclude_none=True)

        self.assertEqual(
            rich["blocks"][1]["buttons"][0]["callback_data"],
            "r:spage:deadbeef:c0ffee00",
        )

    def test_domain_error_explains_botfather_fix(self):
        reason = _friendly_rich_error(ValueError("Bad Request: BOT_DOMAIN_INVALID"))
        self.assertIn("/setdomain", reason)
        self.assertIn("URL عادي", reason)

    def test_document_is_a_native_rich_block(self):
        document = new_block("document", {
            "file": {"file_id": "document-file-id", "file_name": "report.pdf"},
            "caption_html": "التقرير",
        })
        rich = build_input_rich_message([document]).model_dump(mode="json", exclude_none=True)

        self.assertEqual(rich["blocks"][0]["type"], "document")
        self.assertEqual(rich["blocks"][0]["document"]["media"], "document-file-id")
        self.assertEqual(rich["blocks"][0]["caption"]["text"], "التقرير")

    def test_pullquote_media_is_nested_inside_a_block_quotation(self):
        photo = new_block("photo", {"file": {"file_id": "photo-file-id"}})
        pullquote = new_block("pullquote", {
            "quote_text": "النص",
            "quote_html": "النص",
            "credit_html": "الكاتب",
            "media_children": [photo],
        })
        rich = build_input_rich_message([pullquote]).model_dump(mode="json", exclude_none=True)

        quote = rich["blocks"][0]
        self.assertEqual(quote["type"], "blockquote")
        self.assertEqual([block["type"] for block in quote["blocks"]], ["photo", "paragraph"])
        self.assertEqual(quote["blocks"][1]["text"], "النص")
        self.assertEqual(quote["credit"], "الكاتب")

    def test_blockquote_media_is_nested_inside_the_quotation(self):
        photo = new_block("photo", {"file": {"file_id": "photo-file-id"}})
        blockquote = new_block("blockquote", {
            "quote_text": "وصف الصورة",
            "quote_html": "وصف الصورة",
            "media_children": [photo],
        })

        rich = build_input_rich_message([blockquote]).model_dump(
            mode="json", exclude_none=True,
        )
        quote = rich["blocks"][0]

        self.assertEqual(quote["type"], "blockquote")
        self.assertEqual(
            [block["type"] for block in quote["blocks"]],
            ["photo", "paragraph"],
        )

    def test_single_cell_row_automatically_spans_table_width(self):
        data = table_data("النص\nالخلية | الخلية")
        table = new_block("table", data)

        rich = build_input_rich_message([table]).model_dump(
            mode="json", exclude_none=True,
        )
        first_row = rich["blocks"][0]["cells"][0]

        self.assertEqual(len(first_row), 1)
        self.assertEqual(first_row[0]["colspan"], 2)

    def test_single_column_table_does_not_add_redundant_colspan(self):
        data = table_data("الأول\nالثاني")
        self.assertEqual(data["rows"], [["الأول"], ["الثاني"]])

    def test_list_inside_details_survives_typed_rendering(self):
        child = new_block("list", {
            "items": ["الأول", "الثاني"],
            "text": "الأول\nالثاني",
            "html": "<ul><li>الأول</li><li>الثاني</li></ul>",
        })
        details = new_block("details", details_data("العنوان", [child]))

        rich = build_input_rich_message([details]).model_dump(
            mode="json", exclude_none=True,
        )
        nested = rich["blocks"][0]["blocks"]

        self.assertEqual(nested[0]["type"], "list")
        self.assertEqual(
            [item["blocks"][0]["text"] for item in nested[0]["items"]],
            ["الأول", "الثاني"],
        )

    def test_footer_can_follow_a_specific_block_inside_details(self):
        paragraph = new_block("paragraph", {
            "text": "المعلومة", "html": "<p>المعلومة</p>",
        })
        footer = new_block("footer", {
            "text": "المصدر", "html": "<footer>المصدر</footer>",
        })
        paragraph["position"] = 0
        footer["position"] = 1
        details = new_block("details", details_data("العنوان", [paragraph, footer]))

        rich = build_input_rich_message([details]).model_dump(
            mode="json", exclude_none=True,
        )

        self.assertEqual(
            [block["type"] for block in rich["blocks"][0]["blocks"]],
            ["paragraph", "footer"],
        )

    def test_quote_inside_details_survives_typed_rendering(self):
        message = Message(
            message_id=1,
            date=datetime.now(timezone.utc),
            chat=Chat(id=1, type="private"),
            from_user=User(id=1, is_bot=False, first_name="Test"),
            text="قبل\nاقتباس غامق\nبعد",
            entities=[
                MessageEntity(type="blockquote", offset=4, length=11),
                MessageEntity(type="bold", offset=11, length=4),
            ],
        )

        children = message_to_blocks(message)
        self.assertEqual([block["type"] for block in children], ["text", "blockquote", "text"])
        self.assertIn("<b>غامق</b>", children[1]["data"]["quote_html"])

        details = new_block("details", details_data("عنوان", children))
        rich = build_input_rich_message([details]).model_dump(mode="json", exclude_none=True)
        nested = rich["blocks"][0]["blocks"]
        self.assertEqual([block["type"] for block in nested], ["paragraph", "blockquote", "paragraph"])


if __name__ == "__main__":
    unittest.main()
