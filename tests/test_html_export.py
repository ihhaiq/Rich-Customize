import copy
import json
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from aiogram.types import InputRichMessage

from app import i18n_core
from app.editor.models import make_block
from app.keyboards.editor import build_rich_editor_keyboard
from app.lang import SUPPORTED_LANGUAGES
from app.lang.catalogs.html_export import HTML_EXPORT_TRANSLATIONS
from app.routers.editor_export import export_html
from app.services.html_export import export_filename, has_export_content, send_html_export
from app.services.renderer import build_input_rich_message, build_input_rich_message_html
from app.services.rich_html import rich_block_to_html, rich_text_to_html


class HTMLExportTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.locale = i18n_core._language.set('ar')
        self.bot = SimpleNamespace(
            send_rich_message=AsyncMock(), send_document=AsyncMock(), send_message=AsyncMock(),
        )
        self.callback = SimpleNamespace(from_user=SimpleNamespace(id=123), answer=AsyncMock())

    def tearDown(self):
        i18n_core._language.reset(self.locale)

    async def export_state(self, data):
        before = copy.deepcopy(data)
        state = SimpleNamespace(get_data=AsyncMock(return_value=data), update_data=AsyncMock())
        await export_html(self.callback, state, self.bot)
        self.assertEqual(data, before)
        state.update_data.assert_not_awaited()

    async def test_short_literal_code_and_copyable_wrapper(self):
        code = '<p>  عربي English 😀 &amp; &lt;b&gt;\n<b>غامق</b>  </p>'
        await send_html_export(self.bot, 123, code)
        kwargs = self.bot.send_rich_message.call_args.kwargs
        rich = kwargs['rich_message']
        self.assertIsNone(rich.html)
        self.assertIsNone(rich.markdown)
        self.assertEqual([block.type for block in rich.blocks], ['heading', 'divider', 'paragraph', 'divider', 'footer'])
        self.assertEqual(rich.blocks[2].text.type, 'code')
        self.assertEqual(rich.blocks[2].text.text, code)
        self.assertFalse(rich.is_rtl)
        self.assertEqual(rich.blocks[4].text, '📋 اضغط على الكود لنسخه')
        self.assertTrue(kwargs['rich_message'].skip_entity_detection)
        self.assertFalse(kwargs['protect_content'])
        self.assertNotIn('reply_markup', kwargs)
        self.bot.send_document.assert_not_awaited()

    async def test_character_boundaries_include_html_tags_not_utf8_bytes(self):
        for count in (24_999, 25_000, 25_001):
            for letter in ('a', 'ع', '😀', '&'):
                with self.subTest(count=count, letter=letter):
                    self.bot.send_rich_message.reset_mock()
                    self.bot.send_document.reset_mock()
                    code = '<p>' + letter * (count - 7) + '</p>'
                    self.assertEqual(len(code), count)
                    await send_html_export(self.bot, 123, code)
                    if count <= 25_000:
                        self.bot.send_rich_message.assert_awaited_once()
                        rich = self.bot.send_rich_message.call_args.kwargs['rich_message']
                        self.assertEqual(rich.blocks[2].text.type, 'code')
                        self.assertEqual(rich.blocks[2].text.text, code)
                        self.bot.send_document.assert_not_awaited()
                    else:
                        self.bot.send_document.assert_awaited_once()
                        document = self.bot.send_document.call_args.kwargs['document']
                        self.assertEqual(document.data.decode('utf-8'), code)
                        self.assertEqual(document.filename, 'message_html.txt')
                        self.bot.send_rich_message.assert_not_awaited()

    async def test_copy_payload_is_one_code_entity_without_extra_escaping(self):
        code = (
            '<h1>شرح حذف الرسائل</h1><hr/>'
            '<p><code>&lt;rich&gt;&lt;h1&gt;مثال&lt;/h1&gt;</code>'
            ' عربي English 😀 &amp; &#60; &lt;literal&gt;\n'
            '  <a href="https://example.com?a=1&amp;b=2">رابط</a></p><hr/>'
        )
        await send_html_export(self.bot, 123, code)
        rich = self.bot.send_rich_message.call_args.kwargs['rich_message']
        payload = json.loads(rich.model_dump_json(exclude_none=True))
        self.assertNotIn('html', payload)
        self.assertNotIn('markdown', payload)
        self.assertEqual(payload['blocks'][2], {
            'type': 'paragraph', 'text': {'type': 'code', 'text': code},
        })
        self.assertNotIn('اضغط مطولًا', payload['blocks'][4]['text'])
        self.assertFalse(payload['is_rtl'])

    async def test_exported_example_code_keeps_required_html_entities(self):
        literal = '<rich><h1>عنوان</h1></rich>'
        await self.export_state({'blocks': [make_block('paragraph', {
            'rich_text': {'type': 'code', 'text': literal},
        })]})
        rich = self.bot.send_rich_message.call_args.kwargs['rich_message']
        self.assertEqual(rich.blocks[2].text.text,
                         '<p><code>&lt;rich&gt;&lt;h1&gt;عنوان&lt;/h1&gt;&lt;/rich&gt;</code></p>')

    async def test_callback_uses_official_builder_without_mutating_state(self):
        blocks = [make_block('paragraph', {'text': 'العربية English 👩🏽‍💻', 'html': '<b>العربية English 👩🏽‍💻</b>'})]
        data = {'blocks': blocks, 'current_page_id': 'page', 'current_page_title': 'عنوان',
                'history': [{'blocks': copy.deepcopy(blocks)}], 'block_scroll_offset': 90,
                'message_buttons': [{'text': 'External keyboard', 'type': 'url', 'value': 'https://t.me'}]}
        with patch('app.services.renderer.build_input_rich_message', wraps=build_input_rich_message) as builder:
            await self.export_state(data)
        builder.assert_called_once_with(blocks, source_page_id='page')
        rich = self.bot.send_rich_message.call_args.kwargs['rich_message']
        self.assertEqual(rich.blocks[2].text.text, '<p><b>العربية English 👩🏽‍💻</b></p>')

    async def test_long_callback_sends_named_file_without_mutation(self):
        code = '<p>' + 'ع😀' * 13_000 + '</p>'
        await self.export_state({'blocks': [make_block('paragraph', {'html': code})], 'current_page_title': 'صفحتي'})
        document = self.bot.send_document.call_args.kwargs['document']
        self.assertEqual(document.filename, 'صفحتي_html.txt')
        self.assertEqual(document.data, code.encode('utf-8'))
        self.bot.send_rich_message.assert_not_awaited()

    async def test_empty_content_alert(self):
        for blocks in ([], [make_block('paragraph', {'html': '<p><b>  </b></p>'})]):
            await self.export_state({'blocks': blocks})
            self.assertEqual(self.callback.answer.call_args.args[0], 'لا يوجد محتوى لتصديره.')
            self.assertTrue(self.callback.answer.call_args.kwargs['show_alert'])
        self.bot.send_document.assert_not_awaited()
        self.bot.send_rich_message.assert_not_awaited()

    async def test_expired_session(self):
        await self.export_state({})
        self.bot.send_rich_message.assert_not_awaited()
        self.bot.send_document.assert_not_awaited()
        self.assertTrue(self.callback.answer.call_args.kwargs['show_alert'])

    async def test_generation_failure_is_logged_without_traceback_in_alert(self):
        with self.assertLogs('app.routers.editor_export', level='ERROR'):
            await self.export_state({'blocks': [make_block('unsupported', {})]})
        self.assertEqual(self.callback.answer.call_args.args[0], 'تعذر تصدير HTML. حاول مرة ثانية.')
        self.bot.send_document.assert_not_awaited()

    async def test_send_failures_are_reported_without_raw_error(self):
        for text, method in (('ok', self.bot.send_rich_message), ('ع' * 26_000, self.bot.send_document)):
            with self.subTest(length=len(text)):
                method.side_effect = RuntimeError('private traceback detail')
                with self.assertLogs('app.routers.editor_export', level='ERROR'):
                    await self.export_state({'blocks': [make_block('paragraph', {'text': text})]})
                self.assertEqual(self.bot.send_message.call_args.args[1], 'تعذر تصدير HTML. حاول مرة ثانية.')
                method.side_effect = None

    def test_multiple_blocks_keep_final_renderer_semantics(self):
        child = make_block('paragraph', {'html': '<b>B</b><i>I</i><u>U</u><s>S</s><a href="https://example.com?a=1&amp;b=2">link</a>'})
        blocks = [
            make_block('heading', {'text': 'عنوان', 'size': 3}),
            child,
            make_block('blockquote', {'quote_html': '<b>quote</b>', 'credit_html': '<i>Author</i>'}),
            make_block('list', {'items': [{'html': '<b>item</b>', 'has_checkbox': True, 'is_checked': True}]}),
            make_block('table', {'rows': [[{'html': '<i>cell</i>', 'is_header': True, 'colspan': 2}]], 'is_compact': True, 'is_striped': True}),
            make_block('details', {'summary_html': 'more', 'is_open': True, 'children': [child]}),
            make_block('divider'),
            make_block('footer', {'text': 'footer'}),
            make_block('paragraph', {'text': '{next:cbd target#g}'}),
        ]
        for index, block in enumerate(blocks):
            block['position'] = index
        before = copy.deepcopy(blocks)
        code = build_input_rich_message_html(blocks, source_page_id='source').html
        for fragment in ('<h3>عنوان</h3>', child['data']['html'], '<cite><i>Author</i></cite>',
                         '<input type="checkbox" checked>', '<table bordered striped compact>',
                         'colspan="2"', '<details open>', '<footer>footer</footer>', '<hr/>',
                         'type="callback_data"', 'data="r:page:target:source"', 'style="success"'):
            self.assertIn(fragment, code)
        self.assertEqual(blocks, before)
        self.assertNotIn('\n', code)

    def test_native_rich_button_rows_and_media_use_shared_serializer(self):
        raw = {'type': 'details', 'summary': 'media', 'blocks': [
            {'type': 'photo', 'photo': {'file_id': 'file-id'}, 'caption': {'text': 'photo', 'credit': 'Author'}},
            {'type': 'buttons', 'buttons': [{'text': 'Copy', 'copy_text': {'text': '<>&'}}]},
        ]}
        blocks = [make_block('details', {'native': True, 'native_data': raw})]
        before = copy.deepcopy(blocks)
        result = build_input_rich_message_html(blocks)
        self.assertIn('src="tg://photo?id=m_0"', result.html)
        self.assertIn('<figcaption>photo<cite>Author</cite></figcaption>', result.html)
        self.assertIn('text="&lt;&gt;&amp;"', result.html)
        self.assertEqual(result.media[0].media.media, 'file-id')
        self.assertEqual(blocks, before)

    def test_inline_rich_types_are_preserved(self):
        cases = [
            ({'type': 'custom_emoji', 'custom_emoji_id': '123', 'alternative_text': '😀'}, '<tg-emoji emoji-id="123">😀</tg-emoji>'),
            ({'type': 'anchor_link', 'anchor_name': 'a', 'text': 'go'}, '<a href="#a">go</a>'),
            ({'type': 'reference_link', 'reference_name': 'r', 'text': 'ref'}, '<a href="#r">ref</a>'),
            ({'type': 'reference', 'name': 'r', 'text': 'ref'}, '<tg-reference name="r">ref</tg-reference>'),
            ({'type': 'date_time', 'unix_time': 123, 'date_time_format': 'wDT', 'text': 'time'}, '<tg-time unix="123" format="wDT">time</tg-time>'),
            ({'type': 'mathematical_expression', 'expression': 'a<b'}, '<tg-math>a&lt;b</tg-math>'),
        ]
        for value, expected in cases:
            self.assertEqual(rich_text_to_html(value), expected)

    def test_native_expandable_quote_keeps_text_and_credit(self):
        blocks = [make_block('expandable_blockquote', {'native': True, 'native_data': {
            'type': 'expandable_blockquote', 'text': {'type': 'bold', 'text': 'quote'},
            'credit': 'author',
        }})]
        self.assertEqual(
            build_input_rich_message_html(blocks).html,
            '<blockquote expandable><b>quote</b><cite>author</cite></blockquote>',
        )

    def test_media_containers_map_and_preformatted(self):
        blocks = [
            make_block('collage', {'children': [make_block('photo', {'file': {'file_id': 'photo'}})], 'caption_html': 'album'}),
            make_block('slideshow', {'children': [make_block('video', {'file': {'file_id': 'video'}})]}),
            make_block('map', {'latitude': 33.3, 'longitude': 44.4, 'caption_html': '<b>Baghdad</b>'}),
            make_block('preformatted', {'text': '  a < b\n', 'language': 'python'}),
        ]
        result = build_input_rich_message_html(blocks)
        self.assertIn('<tg-collage><img src="tg://photo?id=m_0"/><figcaption>album</figcaption></tg-collage>', result.html)
        self.assertIn('<tg-slideshow><video src="tg://video?id=m_1"></video></tg-slideshow>', result.html)
        self.assertIn('<figure><tg-map lat="33.3" long="44.4"', result.html)
        self.assertIn('<figcaption><b>Baghdad</b></figcaption></figure>', result.html)
        self.assertIn('<pre><code class="language-python">  a &lt; b\n</code></pre>', result.html)
        self.assertEqual([item.media.media for item in result.media], ['photo', 'video'])

    def test_unknown_block_is_not_silently_omitted(self):
        with self.assertRaises(ValueError):
            rich_block_to_html({'type': 'future_type'}, media=[])

    def test_official_builder_result_is_serialized_instead_of_cached_html(self):
        rich = InputRichMessage(blocks=[{'type': 'paragraph', 'text': 'actual final result'}])
        with patch('app.services.renderer.build_input_rich_message', return_value=rich):
            result = build_input_rich_message_html([make_block('paragraph', {'html': '<b>stale</b>'})])
        self.assertEqual(result.html, '<p>actual final result</p>')

    def test_filename_unicode_and_path_safety(self):
        self.assertEqual(export_filename('صفحتي 😀'), 'صفحتي 😀_html.txt')
        self.assertNotIn('/', export_filename('../../page'))
        self.assertNotIn('\\', export_filename('a\\b'))
        self.assertLess(len(export_filename('ع😀' * 300).encode('utf-8')), 255)
        self.assertEqual(export_filename('...'), 'message_html.txt')

    def test_button_is_beside_preview_without_moving_other_rows(self):
        keyboard = build_rich_editor_keyboard([make_block('paragraph', {'text': 'x'})])
        rows = [[button.callback_data for button in row] for row in keyboard.inline_keyboard]
        index = next(i for i, row in enumerate(rows) if 'r:result' in row)
        self.assertEqual(rows[index], ['r:result', 'r:exporthtml'])
        self.assertEqual(rows[index + 1:], [['r:tools'], ['r:addmenu', 'r:post']])

    def test_translations_cover_every_locale_and_content_probe(self):
        self.assertEqual(set(HTML_EXPORT_TRANSLATIONS), set(SUPPORTED_LANGUAGES))
        for locale, values in HTML_EXPORT_TRANSLATIONS.items():
            self.assertEqual(len(values), 6, locale)
        self.assertFalse(has_export_content('<p> &#32; </p>'))
        self.assertTrue(has_export_content('<hr/>'))
        self.assertTrue(has_export_content('<img src="tg://photo?id=m_0"/>'))
