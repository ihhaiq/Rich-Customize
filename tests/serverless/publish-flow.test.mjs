import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const userId = 6317684;
const botId = 999999;

async function setupPublish({ count = 8, deniedIndex = 2 } = {}) {
  const h = await harness({ extraModules: { publish: 'lib/publish' } });
  await h.session.createEditorSession(userId, userId, 100);
  await h.session.updateEditorSession(userId, {
    blocks: [{ type: 'paragraph', text: 'Publish test' }],
  });
  h.apiState.me = { id: botId, username: 'RichCustomizebot' };
  h.apiState.chats = {};
  h.query = (data, languageCode = 'en') => ({
    id: 'publish-query',
    from: { id: userId, language_code: languageCode },
    message: { chat: { id: userId, type: 'private' }, message_id: 100 },
    data,
  });

  for (let index = 0; index < count; index += 1) {
    const chatId = -1000000001 - index;
    const title = 'Destination ' + (index + 1);
    const type = index % 2 ? 'channel' : 'supergroup';
    h.records.managedChats.push({
      key: userId + ':' + chatId,
      userId,
      chatId,
      title,
      type,
      username: 'destination' + (index + 1),
      updatedAt: 1,
    });
    h.apiState.chats[String(chatId)] = { id: chatId, title, type };
    h.apiState.members[chatId + ':' + botId] = { status: 'administrator', can_post_messages: true };
    h.apiState.members[chatId + ':' + userId] = {
      status: index === deniedIndex ? 'member' : 'administrator',
    };
  }
  return h;
}

function renderedRichMessage(h) {
  return h.calls.filter((call) => call.method === 'editMessageText').at(-1).args.rich_message;
}

function renderedButtons(richMessage) {
  const buttons = [];
  const collect = (value) => {
    if (Array.isArray(value)) {
      value.forEach(collect);
    } else if (value && typeof value === 'object') {
      if (value.type === 'button' && value.button) buttons.push(value.button);
      else if (value.type === 'buttons' && Array.isArray(value.buttons)) buttons.push(...value.buttons);
      else Object.values(value).forEach(collect);
    }
  };
  collect(richMessage);
  return buttons;
}

function hasRichBlockButton(richMessage, callbackData) {
  return richMessage.blocks.some((block) => block.type === 'buttons'
    && block.buttons.some((button) => button.callback_data === callbackData));
}

test('destination picker paginates, reports missing access, and retains destination records', async () => {
  const h = await setupPublish();
  await h.session.updateEditorSession(userId, { postSelectedChatIds: [-1000000001] });
  await h.publish.handlePublishCallback(h.query('r:postlist'));

  let rich = renderedRichMessage(h);
  let buttons = renderedButtons(rich);
  assert.equal(buttons.filter((button) => /^r:postchat:-/.test(button.callback_data || '')).length, 6);
  assert.ok(buttons.some((button) => button.callback_data === 'r:postchat:page:all:1'));
  assert.ok(buttons.some((button) => button.callback_data === 'r:postsettings'));
  const filterButtons = rich.blocks[1].text.filter((part) => part?.type === 'button').map((part) => part.button);
  assert.deepEqual(filterButtons.map((button) => button.style), ['success', undefined, undefined]);
  assert.match(rich.blocks.map((block) => block.text || '').join('\n'), /Destination 3: Administrator access is missing/);
  const table = rich.blocks.find((block) => block.type === 'table');
  assert.equal(table.cells.length, 6);
  assert.ok(table.cells.every((row) => row.length === 1));
  assert.equal(table.is_bordered, true);
  assert.equal(table.is_striped, true);
  assert.equal(table.cells[0][0].text[0].button.text, '👥 Destination 1');
  assert.equal(table.cells[0][0].text[1], ' | ');
  assert.equal(table.cells[0][0].text[2].button.text, 'Selected');
  assert.equal(table.cells[0][0].text[2].button.style, 'success');
  assert.ok(rich.blocks.every((block) => block.type !== 'button'));
  assert.ok(hasRichBlockButton(rich, 'r:postsettings'));
  assert.match(rich.blocks[0].text, /1\/2/);
  const footerIndex = rich.blocks.findIndex((block) => block.type === 'footer');
  assert.ok(footerIndex > rich.blocks.indexOf(table));
  assert.match(rich.blocks[footerIndex].text, /current filter/);
  assert.equal(rich.blocks.at(-1).type, 'buttons');
  assert.equal(rich.blocks.at(-1).buttons.length, 2);
  assert.equal(rich.blocks.at(-1).buttons.filter((button) => button.url).length, 2);
  assert.ok(rich.blocks.at(-1).buttons.every((button) => button.style === undefined));
  assert.deepEqual(rich.blocks.at(-1).buttons.map((button) => button.text), [
    '➕ Add the bot to the channel',
    '➕ Add the bot to the group',
  ]);
  assert.equal(h.records.managedChats.length, 8);

  await h.publish.handlePublishCallback(h.query('r:postchat:page:all:1'));
  rich = renderedRichMessage(h);
  buttons = renderedButtons(rich);
  assert.equal(buttons.filter((button) => /^r:postchat:-/.test(button.callback_data || '')).length, 2);
  assert.ok(buttons.some((button) => button.callback_data === 'r:postchat:page:all:0'));
  assert.equal(h.guard.isEditorSessionCallback('r:postchat:filter:channels'), true);

  await h.publish.handlePublishCallback(h.query('r:postchat:filter:channels'));
  rich = renderedRichMessage(h);
  const channelFilterButtons = rich.blocks[1].text.filter((part) => part?.type === 'button').map((part) => part.button);
  assert.deepEqual(channelFilterButtons.map((button) => button.style), ['success', undefined, undefined]);
  const channelSelectionIds = renderedButtons(rich)
    .map((button) => button.callback_data || '')
    .filter((callback) => /^r:postchat:-/.test(callback))
    .map((callback) => Number(callback.split(':')[2]));
  assert.deepEqual(channelSelectionIds, [-1000000002, -1000000004, -1000000006, -1000000008]);

  await h.publish.handlePublishCallback(h.query('r:postchat:filter:groups'));
  rich = renderedRichMessage(h);
  const groupSelectionIds = renderedButtons(rich)
    .map((button) => button.callback_data || '')
    .filter((callback) => /^r:postchat:-/.test(callback))
    .map((callback) => Number(callback.split(':')[2]));
  assert.deepEqual(groupSelectionIds, [-1000000001, -1000000003, -1000000005, -1000000007]);

  await h.publish.handlePublishCallback(h.query('r:postlist', 'ar'));
  rich = renderedRichMessage(h);
  assert.deepEqual(rich.blocks[1].text
    .filter((part) => part?.type === 'button')
    .map((part) => part.button.text), ['الكل', 'القنوات', 'المجموعات']);
  assert.deepEqual(rich.blocks[1].text
    .filter((part) => part?.type === 'button')
    .map((part) => part.button.style), ['success', undefined, undefined]);
  assert.equal(renderedButtons(rich).find((button) => button.callback_data === 'r:postsettings').text, 'التالي');
  assert.equal(renderedButtons(rich).find((button) => button.callback_data === 'r:postchat:-1000000001:0:all').text, 'تم التحديد');
  assert.deepEqual(rich.blocks.at(-1).buttons.map((button) => button.text), [
    '➕ اضف البوت الى قناة',
    '➕ اضف البوت الى مجموعة',
  ]);

  await h.publish.handlePublishCallback(h.query('r:postchat:-1000000002:0:all', 'ar'));
  rich = renderedRichMessage(h);
  const newlySelected = renderedButtons(rich).find((button) => button.callback_data === 'r:postchat:-1000000002:0:all');
  assert.equal(newlySelected.text, 'تم التحديد');
  assert.equal(newlySelected.style, 'success');
});

test('permission failures block selection but allow deselecting without deleting the destination', async () => {
  const h = await setupPublish({ count: 1, deniedIndex: 0 });
  await h.publish.handlePublishCallback(h.query('r:postlist'));
  await h.publish.handlePublishCallback(h.query('r:postchat:-1000000001:0'));

  assert.equal(h.records.managedChats.length, 1);
  const rich = renderedRichMessage(h);
  assert.doesNotMatch(rich.blocks[0].text, /1\/1/);
  const deniedTable = rich.blocks.find((block) => block.type === 'table');
  assert.equal(deniedTable.cells[0][0].text[2].button.text, 'Select');
  assert.deepEqual((await h.session.loadEditorSession(userId, { touch: false })).postSelectedChatIds, []);
  assert.ok(h.calls.some((call) => call.method === 'answerCallbackQuery'
    && call.args.show_alert
    && /Administrator access is missing/.test(call.args.text)));
  assert.equal((await h.publish.listMiniAppDestinations(userId)).some((destination) => destination.kind === 'chat'), false);
  assert.equal(h.records.managedChats.length, 1);

  await h.session.updateEditorSession(userId, { postSelectedChatIds: [-1000000001] });
  await h.publish.handlePublishCallback(h.query('r:postchat:-1000000001:0'));
  assert.deepEqual((await h.session.loadEditorSession(userId, { touch: false })).postSelectedChatIds, []);
  assert.equal(h.records.managedChats.length, 1);
});

test('select all covers every chat in the active filter and uses large button blocks', async () => {
  const h = await setupPublish({ count: 8, deniedIndex: -1 });
  await h.publish.handlePublishCallback(h.query('r:postlist', 'ar'));
  await h.publish.handlePublishCallback(h.query('r:postchat:select_all:all:0', 'ar'));

  const session = await h.session.loadEditorSession(userId, { touch: false });
  assert.deepEqual(session.postSelectedChatIds, [
    -1000000001, -1000000002, -1000000003, -1000000004,
    -1000000005, -1000000006, -1000000007, -1000000008,
  ]);
  const rich = renderedRichMessage(h);
  const selectAllBlock = rich.blocks.find((block) => block.type === 'buttons'
    && block.buttons.some((button) => button.callback_data === 'r:postchat:select_all:all:0'));
  assert.equal(selectAllBlock.buttons[0].text, 'تحديد الكل');
  assert.equal(selectAllBlock.buttons[0].style, 'success');
  assert.match(rich.blocks.find((block) => block.type === 'footer').text, /الفلتر الحالي/);
  assert.equal(h.calls.filter((call) => call.method === 'answerCallbackQuery').at(-1).args.text, 'تم تحديد الكل');
  assert.equal(h.guard.isEditorSessionCallback('r:postchat:select_all:all:0'), true);

  await h.publish.handlePublishCallback(h.query('r:postchat:page:all:1', 'ar'));
  const pageTwoTable = renderedRichMessage(h).blocks.find((block) => block.type === 'table');
  assert.equal(pageTwoTable.cells.length, 2);
  assert.ok(pageTwoTable.cells.every((row) => row[0].text[2].button.text === 'تم التحديد'));
});

test('select all excludes inaccessible chats and preserves selections outside the filter', async () => {
  const h = await setupPublish({ count: 8, deniedIndex: 3 });
  await h.session.updateEditorSession(userId, { postSelectedChatIds: [-1000000001] });
  await h.publish.handlePublishCallback(h.query('r:postlist'));
  await h.publish.handlePublishCallback(h.query('r:postchat:select_all:channels:0'));

  const selected = (await h.session.loadEditorSession(userId, { touch: false })).postSelectedChatIds;
  assert.deepEqual(selected, [-1000000001, -1000000002, -1000000006, -1000000008]);
  assert.equal(h.calls.filter((call) => call.method === 'answerCallbackQuery').at(-1).args.text,
    'All available chats in this filter were selected.');
});

test('next opens post settings with a large confirmation button and separate selection controls', async () => {
  const h = await setupPublish({ count: 1, deniedIndex: -1 });
  await h.session.updateEditorSession(userId, { postSelectedChatIds: [-1000000001] });

  await h.publish.handlePublishCallback(h.query('r:postsettings'));
  let rich = renderedRichMessage(h);
  let buttons = renderedButtons(rich);
  assert.ok(rich.blocks.every((block) => block.type !== 'button'));
  assert.ok(hasRichBlockButton(rich, 'r:postsend:1'));
  assert.ok(buttons.some((button) => button.callback_data === 'r:pt:silent:1'));
  assert.ok(buttons.some((button) => button.callback_data === 'r:pt:protected:1'));
  assert.ok(buttons.some((button) => button.callback_data === 'r:postschedule:1'));
  const optionsTable = rich.blocks.find((block) => block.type === 'table');
  assert.ok(!renderedButtons({ blocks: [optionsTable] })
    .some((button) => String(button.callback_data || '').startsWith('r:postsend')));
  assert.equal(h.calls.filter((call) => call.method === 'editMessageText').at(-1)
    .args.reply_markup.inline_keyboard[0][0].callback_data, 'r:postlist');

  await h.publish.handlePublishCallback(h.query('r:postconfirm'));
  rich = renderedRichMessage(h);
  assert.ok(rich.blocks.every((block) => block.type !== 'button'));
  assert.ok(hasRichBlockButton(rich, 'r:postsend:1'));
});
