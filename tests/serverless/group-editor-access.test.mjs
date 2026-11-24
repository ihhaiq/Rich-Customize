import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const groupId = -1003993506865;
const adminId = 5134669938;
const pageId = 'a1b2c3d4';

test('anonymous group messages resolve only through a unique current admin title', async () => {
  const h = await harness({ extraModules:{ home:'lib/editor-home' } });
  h.apiState.administrators[String(groupId)] = [{
    status:'administrator',
    user:{ id:adminId },
    custom_title:'Rich Editor Owner',
  }];
  const message = {
    chat:{ id:groupId, type:'supergroup' },
    sender_chat:{ id:groupId },
    from:{ id:1087968824, is_bot:true },
    author_signature:'Rich Editor Owner',
  };

  const resolved = await h.home.resolveGroupEditorActor(message);
  assert.equal(resolved.status, 'admin');
  assert.equal(resolved.userId, adminId);
  assert.equal(resolved.matchedByTitle, true);
  assert.ok(h.calls.some(call => call.method === 'getChatAdministrators'));

  h.apiState.administrators[String(groupId)].push({
    status:'administrator',
    user:{ id:adminId + 1 },
    custom_title:'Rich Editor Owner',
  });
  const ambiguous = await h.home.resolveGroupEditorActor(message);
  assert.equal(ambiguous.status, 'anonymous');
  assert.equal(ambiguous.userId, undefined);
});

test('group /editor requires admin status and keeps the editor in the source topic', async () => {
  const h = await harness({ extraModules:{ message:'handlers/message' } });
  h.apiState.members[`${groupId}:${adminId}`] = { status:'administrator' };
  await h.message.default({
    message_id:51,
    from:{ id:adminId, language_code:'en' },
    chat:{ id:groupId, type:'supergroup', is_forum:true },
    message_thread_id:77,
    text:'/editor',
  }, { update:{ update_id:51 } });

  const editor = h.calls.find(call => call.method === 'sendRichMessage');
  assert.ok(editor);
  assert.equal(editor.args.chat_id, groupId);
  assert.equal(editor.args.message_thread_id, 77);
  assert.ok(h.records.editorSessions.some(session => session.userId === adminId));
});

test('anonymous /editor offers private chat and unique-title instructions', async () => {
  const h = await harness({ extraModules:{ message:'handlers/message' } });
  await h.message.default({
    message_id:61,
    from:{ id:1087968824, is_bot:true },
    sender_chat:{ id:groupId, title:'Test group' },
    chat:{ id:groupId, type:'supergroup' },
    text:'/editor',
  }, { update:{ update_id:61 } });

  const prompt = h.calls.find(call => call.method === 'sendMessage');
  assert.ok(prompt);
  assert.equal(prompt.args.reply_markup.inline_keyboard[0][0].url,
    'https://t.me/RichCustomizebot?start=group_editor');
  assert.equal(prompt.args.reply_markup.inline_keyboard[1][0].callback_data,
    'r:group_editor:title_help');
  assert.equal(h.calls.some(call => call.method === 'sendRichMessage'), false);
});

test('anonymous /start refreshes admin titles and opens the matched admin editor', async () => {
  const h = await harness({ extraModules:{ message:'handlers/message' } });
  h.apiState.administrators[String(groupId)] = [{
    status:'administrator',
    user:{ id:adminId },
    custom_title:'Rich Editor Owner',
  }];
  await h.message.default({
    message_id:62,
    from:{ id:1087968824, is_bot:true },
    sender_chat:{ id:groupId, title:'Test group' },
    author_signature:'Rich Editor Owner',
    chat:{ id:groupId, type:'supergroup' },
    text:'/start',
  }, { update:{ update_id:62 } });

  assert.ok(h.calls.some(call => call.method === 'getChatAdministrators'));
  assert.ok(h.records.editorSessions.some(session => session.userId === adminId));
  assert.ok(h.calls.some(call => call.method === 'sendRichMessage'
    && call.args.chat_id === groupId));
});

test('group pages disable code copying while keeping page names editable', async () => {
  const h = await harness({ extraModules:{ pages:'lib/pages' } });
  const rendered = h.pages.buildPagesRichMessage(
    [{ pageId, title:'Private title' }],
    'en',
    0,
    null,
    { hideCodes:true },
  );
  const table = rendered.blocks.find(block => block.type === 'table');
  const row = table.cells[1].map(cell => cell.text.button);
  assert.equal(row[2].disabled != null, true);
  assert.equal(row[2].copy_text, undefined);
  assert.equal(row[3].text, 'Private title');
  assert.equal(row[3].callback_data, 'r:pageopen:' + pageId);

  const dashboard = h.ui.editorDashboardRichMessage({
    managementChatId:groupId,
    currentPageId:pageId,
    currentPageTitle:'Private title',
    blocks:[],
    messageButtons:[],
  }, 'en');
  const pageButton = dashboard.blocks
    .find(block => block.type === 'buttons' && block.buttons.some(button => button.text === 'Private title'))
    .buttons[0];
  assert.equal(pageButton.disabled != null, true);
  assert.equal(pageButton.copy_text, undefined);
});

test('group page callbacks show the caller pages and never expose their page code', async () => {
  const h = await harness({ extraModules:{ callback:'handlers/callback_query' } });
  h.apiState.members[`${groupId}:${adminId}`] = { status:'administrator' };
  await h.session.createEditorSession(adminId, groupId, 100);
  h.records.richPages.push({
    pageId,
    ownerId:adminId,
    title:'Private title',
    blocks:[],
    buttons:[],
    buttonsPerRow:1,
    buttonsAlign:'center',
    createdAt:1,
    updatedAt:1,
    quotaVersion:2,
    revision:1,
    syncSeq:0,
  });

  await h.callback.default({
    id:'pages-callback',
    from:{ id:adminId, language_code:'en' },
    message:{
      chat:{ id:groupId, type:'supergroup' },
      message_id:100,
    },
    data:'r:pages',
  }, { update:{ update_id:71 } });

  const pagesView = h.calls.find(call => call.method === 'editMessageText');
  assert.ok(pagesView);
  const pageTable = pagesView.args.rich_message.blocks.find(block => block.type === 'table');
  const copyButton = pageTable.cells[1][2].text.button;
  assert.equal(copyButton.disabled != null, true);
  assert.equal(copyButton.copy_text, undefined);
  assert.equal(pageTable.cells[1][3].text.button.text, 'Private title');

  await h.callback.default({
    id:'open-page-callback',
    from:{ id:adminId, language_code:'en' },
    message:{
      chat:{ id:groupId, type:'supergroup' },
      message_id:100,
    },
    data:'r:pageopen:' + pageId,
  }, { update:{ update_id:73 } });
  const editorView = h.calls.filter(call => call.method === 'editMessageText').at(-1);
  const dashboardPageButton = editorView.args.rich_message.blocks
    .find(block => block.type === 'buttons' && block.buttons.some(button => button.text === 'Private title'))
    .buttons[0];
  assert.equal(dashboardPageButton.disabled != null, true);
  assert.equal(dashboardPageButton.copy_text, undefined);
});

test('saving a group page omits its code from the confirmation and editor panel', async () => {
  const h = await harness({ extraModules:{ editorPages:'lib/editor-pages' } });
  await h.session.createEditorSession(adminId, groupId, 100);
  await h.session.updateEditorSession(adminId, {
    state:'saving_page_name',
    blocks:[{ type:'paragraph', id:'block-one', position:1, text:'Hello' }],
  });

  await h.editorPages.handleEditorPageMessage({
    from:{ id:adminId, language_code:'en' },
    chat:{ id:groupId, type:'group' },
    message_id:101,
    text:'Private title',
  });

  const savedNotice = h.calls.find(call => call.method === 'sendMessage'
    && call.args.chat_id === groupId);
  assert.match(savedNotice.args.text, /Page saved\./);
  assert.doesNotMatch(savedNotice.args.text, /Code:/);
  const editorPanel = h.calls.find(call => call.method === 'editMessageText');
  const pageButton = editorPanel.args.rich_message.blocks
    .find(block => block.type === 'buttons' && block.buttons.some(button => button.disabled))
    .buttons[0];
  assert.equal(pageButton.copy_text, undefined);
});

test('non-admin page callbacks receive a popup and do not render private pages', async () => {
  const h = await harness({ extraModules:{ callback:'handlers/callback_query' } });
  const userId = adminId + 100;
  h.apiState.members[`${groupId}:${userId}`] = { status:'member' };
  await h.callback.default({
    id:'denied-pages-callback',
    from:{ id:userId, language_code:'en' },
    message:{
      chat:{ id:groupId, type:'supergroup' },
      message_id:100,
    },
    data:'r:pages',
  }, { update:{ update_id:72 } });

  const alert = h.calls.find(call => call.method === 'answerCallbackQuery');
  assert.equal(alert.args.show_alert, true);
  assert.match(alert.args.text, /group administrators/i);
  assert.equal(h.calls.some(call => call.method === 'editMessageText'), false);
});
