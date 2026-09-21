from __future__ import annotations

import copy
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.editor.draft_store import EditorDraft
from app.keyboards.message_buttons import build_message_buttons_keyboard
from app.services.button_layout_ui import build_button_layout_ui
from app.services.buttons import button_rows, normalize_button_url, set_button_row_width
from app.services.renderer import send_rich_message_preview


def buttons(count=12):
    return [dict(id=str(i), text=str(i), position=i, type="url", value="https://example.com")
            for i in range(count)]


def test_custom_layout_survives_draft_and_renders_without_losing_buttons():
    items = buttons()
    set_button_row_width(items, 2, 0, 1)
    set_button_row_width(items, 2, 1, 4)
    restored = EditorDraft.from_state(EditorDraft([], items, 2).as_state())
    keyboard = build_message_buttons_keyboard(restored.message_buttons, buttons_per_row=2)
    assert [len(row) for row in keyboard.inline_keyboard][:2] == [1, 4]
    assert [b.text for row in keyboard.inline_keyboard for b in row] == [str(i) for i in range(12)]
    for count in (8, 1, 3):
        set_button_row_width(items, 2, 0, count)
        rows = button_rows(items, 2)
        assert len(rows[0]) == count
        assert all(1 <= len(row) <= 8 for row in rows)
        assert [b['id'] for row in rows for b in row] == [str(i) for i in range(12)]


def test_custom_layout_handles_add_delete_and_reorder():
    items = buttons(20)
    set_button_row_width(items, 2, 0, 8)
    items.pop(7)
    items[0]['position'] = 100
    items.extend(buttons(2))
    rows = button_rows(items, 2)
    assert sum(map(len, rows)) == len(items)
    assert all(1 <= len(row) <= 8 for row in rows)


def test_rich_layout_pages_and_navigation():
    rich, markup = build_button_layout_ui(buttons(), 2)
    table = rich.blocks[1]
    assert [c.text.button.callback_data for row in table.cells for c in row] == [
        f'r:browset:{i}' for i in range(1, 9)]
    assert rich.blocks[2].text.button.callback_data == 'r:browcustompage:0'
    assert markup.inline_keyboard[-1][0].callback_data == 'r:buttons'
    rich, markup = build_button_layout_ui(buttons(100), 1, custom=True, page=1)
    assert len(rich.blocks[1].cells) == 8
    assert rich.blocks[1].cells[0][1].text.button.callback_data == 'r:browcustom:8:1:1'
    assert markup.inline_keyboard[-1][0].callback_data == 'r:brow'
    rich, _ = build_button_layout_ui(buttons(2), 1, custom=True)
    assert rich.blocks[1].cells[0][3].text == '—'


@pytest.mark.parametrize(('value', 'expected'), [
    ('YouTube.com', 'https://YouTube.com'),
    ('youtube.com/watch?v=X-Y&t=10', 'https://youtube.com/watch?v=X-Y&t=10'),
    ('example.com:8443/path', 'https://example.com:8443/path'),
    ('@hello_world', 'https://t.me/hello_world'),
    ('tg://user?id=123', 'tg://user?id=123'),
    ('http://example.com', 'http://example.com'),
    ('javascript:alert(1)', None), ('https://', None), ('not a link.com', None),
    ('foo', None), ('file:///tmp/test.com', None),
])
def test_optional_https(value, expected):
    assert normalize_button_url(value) == expected


def test_preview_sends_final_without_waiting_for_a_draft():
    import asyncio
    bot = SimpleNamespace(send_rich_message=AsyncMock(return_value='sent'),
                          send_rich_message_draft=AsyncMock())
    blocks = [{'id': 'text', 'type': 'paragraph', 'position': 0, 'data': {'text': 'Hello'}}]
    result = asyncio.run(send_rich_message_preview(bot, 1, copy.deepcopy(blocks)))
    assert result == ['sent']
    bot.send_rich_message_draft.assert_not_awaited()
    bot.send_rich_message.assert_awaited_once()


def test_layout_callbacks_save_custom_rows_and_uniform_reset_with_undo():
    import asyncio
    from unittest.mock import MagicMock, patch
    from aiogram.types import Message
    from app.editor.history import undo
    from app.routers.button_manager import change_buttons_per_row, select_button_layout

    class State:
        def __init__(self):
            self.data = EditorDraft([], buttons(8), 2).as_state()

        async def get_data(self):
            return copy.deepcopy(self.data)

        async def update_data(self, **kwargs):
            self.data.update(copy.deepcopy(kwargs))
            return copy.deepcopy(self.data)

    async def run():
        state = State()
        callback = SimpleNamespace(message=MagicMock(spec=Message), answer=AsyncMock(), data='r:brow')
        with patch('app.routers.button_manager.edit_pages_ui', AsyncMock()):
            original = await state.get_data()
            await change_buttons_per_row(callback, state)
            assert state.data['buttons_per_row'] == original['buttons_per_row']
            assert 'editor_history_undo' not in state.data
            callback.data = 'r:browcustom:0:1:0'
            await select_button_layout(callback, state)
            callback.data = 'r:browcustom:1:4:0'
            await select_button_layout(callback, state)
            assert [len(row) for row in button_rows(state.data['message_buttons'], 2)][:2] == [1, 4]
            callback.data = 'r:browset:3'
            await select_button_layout(callback, state)
            assert state.data['buttons_per_row'] == 3
            assert all('row_end' not in button for button in state.data['message_buttons'])
            await undo(state)
            assert [len(row) for row in button_rows(state.data['message_buttons'], 2)][:2] == [1, 4]
            before_invalid = await state.get_data()
            callback.data = 'r:browcustom:99:4:0'
            await select_button_layout(callback, state)
            assert state.data == before_invalid
            assert callback.answer.await_args.kwargs['show_alert'] is True
    asyncio.run(run())
