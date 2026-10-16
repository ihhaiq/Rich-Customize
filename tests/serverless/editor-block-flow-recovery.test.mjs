import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const userId = 1;
const chatId = 1;
const managementMessageId = 900;

async function fixture() {
  const h = await harness({ extraModules:{ editorBlocks:'lib/editor-block-flow' } });
  await h.session.createEditorSession(userId, chatId, managementMessageId);
  const blocks = [
    h.blocks.makeBlock('paragraph', { text:'First' }, 0, null, 'first'),
    h.blocks.makeBlock('footer', { text:'Footer preview' }, 1, null, 'footer'),
  ];
  await h.session.updateEditorSession(userId, { blocks, currentBlockId:'footer' });
  return { h, blocks };
}

test('block preview and movement buttons show its live position and order', async () => {
  const h = await harness();
  const blocks = [
    h.blocks.makeBlock('paragraph', { text:'First' }, 0, null, 'first'),
    h.blocks.makeBlock('footer', { text:'Footer preview' }, 1, null, 'footer'),
    h.blocks.makeBlock('paragraph', { text:'Last' }, 2, null, 'last'),
  ];

  const preview = h.ui.blockEditorRichMessage(blocks[1], blocks, 'en');
  assert.match(preview.blocks[0].text, /Current position: 2 of 3/);
  assert.match(preview.blocks[0].text, /Block order:\n1\. 📝 Paragraph\n◀️ 2\. 🔻 Footer\n3\. 📝 Paragraph/);

  const keyboard = h.ui.buildBlockEditorKeyboard(blocks[1], blocks, 'en');
  const moveButtons = keyboard.inline_keyboard.flat().filter(button =>
    button.callback_data === 'r:mu:footer' || button.callback_data === 'r:md:footer');
  assert.deepEqual(JSON.parse(JSON.stringify(moveButtons.map(button => button.text))), [
    '⬆️ Move up · 2/3',
    '⬇️ Move down · 2/3',
  ]);
});

test('a missing preview message is replaced after a successful block move', async () => {
  const { h } = await fixture();
  h.apiState.editError = 'Bad Request: message to edit not found';

  await h.editorBlocks.handleEditorBlockCallback({
    id:'move-footer-up',
    from:{ id:userId, language_code:'en' },
    message:{ chat:{ id:chatId, type:'private' }, message_id:managementMessageId },
    data:'r:mu:footer',
  });

  const session = await h.session.loadEditorSession(userId, { touch:false });
  assert.deepEqual(session.blocks.map(block => block.id), ['footer', 'first']);
  assert.equal(session.managementMessageId, 100);
  const replacement = h.calls.find(call =>
    call.method === 'sendRichMessage'
    && Number(call.args.chat_id) === chatId);
  assert.ok(replacement);
  assert.match(replacement.args.rich_message.blocks[0].text, /Current position: 1 of 2/);
  assert.ok(replacement.args.reply_markup.inline_keyboard.flat().some(button =>
    button.text === '⬇️ Move down · 1/2' && button.callback_data === 'r:md:footer'));
  assert.ok(h.calls.some(call =>
    call.method === 'answerCallbackQuery'
    && call.args.callback_query_id === 'move-footer-up'));
});

test('non-missing edit failures still surface instead of creating a replacement panel', async () => {
  const { h } = await fixture();
  h.apiState.editError = 'Telegram temporarily unavailable';

  await assert.rejects(
    () => h.editorBlocks.handleEditorBlockCallback({
      id:'move-footer-up',
      from:{ id:userId, language_code:'en' },
      message:{ chat:{ id:chatId, type:'private' }, message_id:managementMessageId },
      data:'r:mu:footer',
    }),
    /Telegram temporarily unavailable/,
  );
  assert.equal(h.calls.filter(call => call.method === 'sendRichMessage').length, 0);
});
