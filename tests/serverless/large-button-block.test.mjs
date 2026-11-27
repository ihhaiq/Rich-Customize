import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { harness } from './harness.mjs';
import '../../app/miniapp_static/publish_validation.js';

const check = globalThis.RichPublishValidation.checkPage;
const miniAppLocaleScripts = [
  '../../app/miniapp_static/miniapp_i18n_locales.js',
  '../../app/miniapp_static/miniapp_i18n.js',
  '../../app/miniapp_static/miniapp_i18n_coverage.js',
].map(path => readFileSync(new URL(path, import.meta.url), 'utf8'));

test('large button blocks render Rich Message buttons and validate their actions', async () => {
  const h = await harness();
  const pageButton = h.blocks.makeBlock('buttons', {
    buttons: [{ text: 'Open page', callback_data: 'r:cbd:welcome', style: 'primary' }],
  });
  const copyButton = h.blocks.makeBlock('buttons', {
    buttons: [{ text: 'Copy code', copy_text: { text: 'ABC' } }],
  });
  const result = h.renderer.buildInputRichMessage([pageButton, copyButton], { technicalOnly: true });

  assert.deepEqual(JSON.parse(JSON.stringify(result.blocks)), [{
    type: 'buttons',
    buttons: [{ text: 'Open page', callback_data: 'r:page:welcome', style: 'primary' }],
    align: 'center',
  }, {
    type: 'buttons',
    buttons: [{ text: 'Copy code', copy_text: { text: 'ABC' } }],
    align: 'center',
  }]);
  assert.throws(
    () => h.renderer.buildInputRichMessage([h.blocks.makeBlock('buttons', { buttons: [] })]),
    /between 1 and 100 buttons/,
  );
  const multipleButtons = [
    { text: 'One', url: 'https://example.com' },
    { text: 'Two', url: 'https://example.org' },
  ];
  assert.deepEqual(
    JSON.parse(JSON.stringify(h.renderer.buildInputRichMessage([
      h.blocks.makeBlock('buttons', { buttons: multipleButtons }),
    ]).blocks[0].buttons)),
    multipleButtons,
  );
  assert.throws(
    () => h.renderer.buildInputRichMessage([
      h.blocks.makeBlock('buttons', {
        buttons: Array.from({ length: 101 }, (_, index) => ({
          text: 'Button ' + index,
          url: 'https://example.com',
        })),
      }),
    ]),
    /between 1 and 100 buttons/,
  );
  assert.throws(
    () => h.renderer.buildInputRichMessage([
      h.blocks.makeBlock('buttons', { buttons: [{ text: 'Broken', callback_data: 'x'.repeat(65) }] }),
    ]),
    /buttons block has an invalid button/,
  );
});

test('large button labels count toward the text quota and are trimmed safely', async () => {
  const h = await harness();
  const blocks = [
    h.blocks.makeBlock('paragraph', { text: 'p'.repeat(19950) }),
    h.blocks.makeBlock('buttons', { buttons: [{ text: 'b'.repeat(64), url: 'https://example.com' }] }),
  ];

  assert.equal(h.blocks.visibleCharacterCount(blocks), 20014);
  const trimmed = h.blocks.trimEditorBlocksToLimits(blocks, 999999).blocks;
  assert.equal(trimmed[1].data.buttons[0].text.length, 50);
  assert.equal(h.blocks.visibleCharacterCount(trimmed), 20000);
  assert.equal(blocks[1].data.buttons[0].text.length, 64);
});

test('publish validation rejects empty and malformed large-button blocks', () => {
  assert.equal(check({ blocks: [{ type: 'buttons', data: { buttons: [] } }] })[0].code, 'missing_buttons');
  assert.equal(check({
    blocks: [{ type: 'buttons', data: { buttons: Array.from({ length: 101 }, (_, index) => ({
      text: 'Button ' + index,
      url: 'https://example.com',
    })) } }],
  })[0].code, 'invalid_button_layout');
  assert.equal(check({
    blocks: [{ type: 'buttons', data: { buttons: [{ text: 'Broken', callback_data: 'x'.repeat(65) }] } }],
  })[0].code, 'invalid_button');
  assert.equal(check({
    blocks: [{ type: 'buttons', data: { buttons: [{ text: 'Open', url: 'https://example.com' }] } }],
  }).length, 0);
  assert.equal(check({
    blocks: [{ type: 'buttons', data: { buttons: [
      { text: 'One', url: 'https://example.com' },
      { text: 'Two', url: 'https://example.org' },
    ] } }],
  }).length, 0);
  assert.equal(check({
    blocks: [{ type: 'buttons', data: { buttons: Array.from({ length: 100 }, (_, index) => ({
      text: 'Button ' + index,
      url: 'https://example.com',
    })) } }],
  }).length, 0);
  assert.equal(check({
    blocks: [{ type: 'buttons', data: { buttons: Array.from({ length: 101 }, (_, index) => ({
      text: 'Button ' + index,
      url: 'https://example.com',
    })) } }],
  })[0].code, 'invalid_button_layout');
});

test('large-button labels resolve for every supported Mini App locale', () => {
  const locales = [
    'ar', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'uk', 'ru',
    'tr', 'ur', 'hi', 'id', 'ja', 'ko', 'vi', 'th', 'zh-hans', 'zh-hant',
  ];
  const keys = ['button.large', 'button.large_desc', 'button.add', 'button.edit_name', 'button.delete'];

  for (const language of locales) {
    const document = {
      documentElement: {},
      readyState: 'complete',
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
    };
    const window = {
      Telegram: { WebApp: { initDataUnsafe: { user: { language_code: language } } } },
    };
    const context = { document, navigator: { language }, window };
    for (const source of miniAppLocaleScripts) runInNewContext(source, context);

    for (const key of keys) {
      const value = window.MiniAppI18n.t(key);
      assert.ok(value.trim(), `${language} is missing ${key}`);
      assert.notEqual(value, key, `${language} returned the untranslated key ${key}`);
    }
  }
});

test('Telegram editor lists, creates, and edits large-button blocks', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 71;
  const chatId = 71;
  const managementMessageId = 900;
  await h.session.createEditorSession(userId, chatId, managementMessageId);
  const addButton = h.ui.buildAddBlockKeyboard('en').inline_keyboard
    .flat()
    .find(button => button.callback_data === 'r:add:buttons');

  assert.ok(addButton);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'add-large-button',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: chatId }, message_id: managementMessageId },
    data: addButton.callback_data,
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: chatId },
    message_id: 901,
    text: '{Open website - https://example.com #r} {Copy link - copy:https://example.com #g}',
  });

  let updated = await h.session.loadEditorSession(userId, { touch: false });
  assert.equal(updated.state, 'managing');
  assert.equal(updated.blocks.at(-1).type, 'buttons');
  assert.deepEqual(updated.blocks.at(-1).data.buttons, [{
    text: 'Open website',
    url: 'https://example.com',
    style: 'danger',
  }, {
    text: 'Copy link',
    copy_text: { text: 'https://example.com' },
    style: 'success',
  }]);
  assert.equal(
    h.renderer.buildInputRichMessage(updated.blocks, { technicalOnly: true }).blocks.at(-1).buttons.length,
    2,
  );

  await h.editorBlocks.handleEditorBlockCallback({
    id: 'edit-large-button',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: chatId }, message_id: updated.managementMessageId },
    data: 'r:e:' + updated.blocks.at(-1).id,
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: chatId },
    message_id: 903,
    text: 'Visit support - https://example.com/help #g',
  });

  updated = await h.session.loadEditorSession(userId, { touch: false });
  assert.equal(updated.state, 'managing');
  assert.deepEqual(updated.blocks.at(-1).data.buttons, [{
    text: 'Visit support',
    url: 'https://example.com/help',
    style: 'success',
  }]);
});

test('large-button editor rejects invalid URLs without ending the add flow', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 72;
  const chatId = 72;
  await h.session.createEditorSession(userId, chatId, 910);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'add-large-button-invalid',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: chatId }, message_id: 910 },
    data: 'r:add:buttons',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: chatId },
    message_id: 911,
    text: 'Open website - javascript:alert(1)',
  });

  const session = await h.session.loadEditorSession(userId, { touch: false });
  assert.equal(session.state, 'adding_block');
  assert.equal(session.addStep, 'large_button_entry');
  assert.equal(session.blocks.length, 0);
});

test('large-button editor rejects direct user-ID links', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 79;
  await h.session.createEditorSession(userId, userId, 912);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'add-large-button-user-id',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: userId }, message_id: 912 },
    data: 'r:add:buttons',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId },
    message_id: 913,
    text: '{Profile:USER 12345}',
  });

  const session = await h.session.loadEditorSession(userId, { touch: false });
  assert.equal(session.state, 'adding_block');
  assert.equal(session.addStep, 'large_button_entry');
  assert.equal(session.blocks.length, 0);
  assert.ok(h.calls.some(call => call.method === 'sendMessage'
    && String(call.args.text).includes('public @username')));
});

test('large-button CBD input only links to a page owned by the editor', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 73;
  const chatId = 73;
  await h.session.createEditorSession(userId, chatId, 920);
  h.records.richPages.push({ pageId: 'welcome', ownerId: userId, title: 'Welcome' });
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'add-large-cbd-button',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: chatId }, message_id: 920 },
    data: 'r:add:buttons',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: chatId },
    message_id: 921,
    text: 'Open welcome - cbd:welcome #g',
  });

  const session = await h.session.loadEditorSession(userId, { touch: false });
  assert.deepEqual(session.blocks.at(-1).data.buttons, [{
    text: 'Open welcome',
    callback_data: 'r:cbd:welcome',
    style: 'success',
  }]);
  assert.equal(h.renderer.buildInputRichMessage(session.blocks, { technicalOnly: true }).blocks.at(-1).buttons[0].callback_data, 'r:page:welcome');

  await h.session.createEditorSession(74, 74, 922);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'add-unowned-cbd-button',
    from: { id: 74, language_code: 'en' },
    message: { chat: { id: 74 }, message_id: 922 },
    data: 'r:add:buttons',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: 74, language_code: 'en' },
    chat: { id: 74 },
    message_id: 923,
    text: 'Open welcome - cbd:welcome',
  });
  const otherSession = await h.session.loadEditorSession(74, { touch: false });
  assert.equal(otherSession.blocks.length, 0);
  assert.equal(otherSession.addStep, 'large_button_entry');
});

test('large-button input accepts Telegram usernames, t.me links, and color codes', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const cases = [
    ['Open account - @sample_user #r', 'https://t.me/sample_user', 'danger'],
    ['Open channel - t.me/samplechannel #b', 'https://t.me/samplechannel', 'primary'],
    ['Open site - https://example.com #g', 'https://example.com', 'success'],
  ];

  for (let index = 0; index < cases.length; index += 1) {
    const [input, url, style] = cases[index];
    const userId = 75 + index;
    await h.session.createEditorSession(userId, userId, 925 + index);
    await h.editorBlocks.handleEditorBlockCallback({
      id: 'add-colored-button-' + index,
      from: { id: userId, language_code: 'en' },
      message: { chat: { id: userId }, message_id: 925 + index },
      data: 'r:add:buttons',
    });
    await h.editorBlocks.handleEditorBlockMessage({
      from: { id: userId, language_code: 'en' },
      chat: { id: userId },
      message_id: 935 + index,
      text: input,
    });
    const session = await h.session.loadEditorSession(userId, { touch: false });
    assert.deepEqual(session.blocks.at(-1).data.buttons, [{
      text: input.split(' - ')[0],
      url,
      style,
    }]);
    assert.deepEqual(
      JSON.parse(JSON.stringify(
        h.renderer.buildInputRichMessage(session.blocks, { technicalOnly: true }).blocks.at(-1).buttons[0],
      )),
      session.blocks.at(-1).data.buttons[0],
    );
  }
});

test('large-button input reuses rich formats and shows a concise multiple-button guide', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 78;
  await h.session.createEditorSession(userId, userId, 928);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'large-button-rich-prompt',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: userId }, message_id: 928 },
    data: 'r:add:buttons',
  });
  const promptCall = h.calls.find(call => call.method === 'sendRichMessage');
  assert.ok(promptCall);
  assert.deepEqual(
    promptCall.args.rich_message.blocks.map(block => block.type),
    ['heading', 'paragraph', 'divider', 'details'],
  );
  const guideText = JSON.stringify(promptCall.args.rich_message.blocks);
  assert.ok(guideText.includes('Add large button'));
  assert.ok(guideText.includes('Send the button format'));
  const details = promptCall.args.rich_message.blocks[3];
  assert.equal(details.type, 'details');
  const detailsText = JSON.stringify(details.blocks);
  for (const format of ['USER', 'alert:', 'callback_data:', 'copy:', 'web_app:', 'switch_inline_query']) {
    assert.ok(detailsText.includes(format), `missing ${format} from the expandable button guide`);
  }
  assert.equal(detailsText.includes('login_url:'), false);
  assert.ok(detailsText.includes('Multiple buttons side by side'));
  assert.ok(!JSON.stringify(promptCall.args.rich_message.blocks.slice(0, 3)).includes('Website'));

  const cases = [
    ['{Alert - alert:Hello #r}', { text: 'Alert', callback_data: 'r:poptext:Hello', style: 'danger' }],
    ['{Action - callback_data:action:1 #r}', { text: 'Action', callback_data: 'action:1', style: 'danger' }],
    ['{Copy - copy:ABC #g}', { text: 'Copy', copy_text: { text: 'ABC' }, style: 'success' }],
    ['{Search - switch_inline_query:tea}', { text: 'Search', switch_inline_query: 'tea' }],
    ['{Search here - switch_inline_query_current_chat:tea}', { text: 'Search here', switch_inline_query_current_chat: 'tea' }],
    ['{Open app - web_app:https://example.com #b}', { text: 'Open app', web_app: { url: 'https://example.com' }, style: 'primary' }],
    ['{Sign in - login_url:https://example.com #b}', { text: 'Sign in', login_url: { url: 'https://example.com' }, style: 'primary' }],
    ['{Disabled - disabled #r}', { text: 'Disabled', disabled: {}, style: 'danger' }],
  ];
  for (let index = 0; index < cases.length; index += 1) {
    const [text, expected] = cases[index];
    const nextUserId = expected.login_url ? 8997225441 : userId + index + 1;
    await h.session.createEditorSession(nextUserId, nextUserId, 940 + index);
    await h.editorBlocks.handleEditorBlockCallback({
      id: 'large-button-rich-' + index,
      from: { id: nextUserId, language_code: 'en' },
      message: { chat: { id: nextUserId }, message_id: 940 + index },
      data: 'r:add:buttons',
    });
    await h.editorBlocks.handleEditorBlockMessage({
      from: { id: nextUserId, language_code: 'en' },
      chat: { id: nextUserId },
      message_id: 950 + index,
      text,
    });
    const session = await h.session.loadEditorSession(nextUserId, { touch: false });
    assert.deepEqual(session.blocks.at(-1).data.buttons, [expected]);
  }
});

test('regular users cannot add login URL buttons, while bot developers can', async () => {
  const h = await harness({
    extraModules: {
      editorBlocks: 'lib/editor-block-flow',
      editorButtons: 'lib/editor-buttons',
    },
  });
  const regularUserId = 78321;
  await h.session.createEditorSession(regularUserId, regularUserId, 1200);
  await h.session.updateEditorSession(regularUserId, {
    messageButtons:[{ id:'existing', text:'Website', type:'url', value:'https://example.com', url:'https://example.com' }],
  });

  await h.editorButtons.handleEditorButtonCallback({
    id:'hide-login-url-type',
    from:{ id:regularUserId, language_code:'en' },
    message:{ chat:{ id:regularUserId }, message_id:1200 },
    data:'r:bedit:type:existing',
  });
  const typeMenu = h.calls.filter(call => call.method === 'editMessageText').at(-1);
  assert.equal(typeMenu.args.reply_markup.inline_keyboard.flat()
    .some(button => button.callback_data === 'r:bct:existing:login_url'), false);

  await h.editorButtons.handleEditorButtonCallback({
    id:'reject-login-url-type',
    from:{ id:regularUserId, language_code:'en' },
    message:{ chat:{ id:regularUserId }, message_id:1200 },
    data:'r:bct:existing:login_url',
  });
  assert.equal(h.calls.at(-1).args.text, 'Login URL unavailable.\n\n@Rlchsupportbot');

  await h.editorButtons.handleEditorButtonCallback({
    id:'prompt-login-url',
    from:{ id:regularUserId, language_code:'en' },
    message:{ chat:{ id:regularUserId }, message_id:1200 },
    data:'r:ba',
  });
  await h.editorButtons.handleEditorButtonMessage({
    from:{ id:regularUserId, language_code:'en' },
    chat:{ id:regularUserId },
    text:'{Sign in - login_url:https://example.com/login}',
  });
  const regularSession = await h.session.loadEditorSession(regularUserId, { touch:false });
  assert.equal(regularSession.messageButtons.length, 1);
  assert.ok(h.calls.some(call => call.method === 'sendMessage'
    && call.args.text === 'Login URL unavailable.\n\n@Rlchsupportbot'));

  const developerId = 8997225441;
  await h.session.createEditorSession(developerId, developerId, 1201);
  await h.editorButtons.handleEditorButtonCallback({
    id:'developer-login-url',
    from:{ id:developerId, language_code:'en' },
    message:{ chat:{ id:developerId }, message_id:1201 },
    data:'r:ba',
  });
  await h.editorButtons.handleEditorButtonMessage({
    from:{ id:developerId, language_code:'en' },
    chat:{ id:developerId },
    text:'{Sign in - login_url:https://example.com/login}',
  });
  const developerSession = await h.session.loadEditorSession(developerId, { touch:false });
  assert.equal(developerSession.messageButtons[0].type, 'login_url');
});

test('login URL restriction copy is brief and available in every supported locale', async () => {
  const h = await harness();
  const locales = [
    'ar', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'uk', 'ru',
    'tr', 'ur', 'hi', 'id', 'ja', 'ko', 'vi', 'th', 'zh-hans', 'zh-hant',
  ];
  assert.equal(h.i18n.loginUrlRestrictionMessage('ar'),
    'زر تسجيل الدخول غير متاح, لانك لست مخول لاستعماله');
  const english = h.i18n.loginUrlRestrictionMessage('en');
  assert.equal(english, 'Login URL unavailable.');
  for (const locale of locales) {
    const text = h.i18n.loginUrlRestrictionMessage(locale);
    assert.ok(text.length > 0, locale);
    if (locale !== 'en') assert.notEqual(text, english, locale);
  }
});

test('regular users receive a clear rejection for login URLs in large buttons', async () => {
  const h = await harness({ extraModules:{ editorBlocks:'lib/editor-block-flow' } });
  const userId = 78322;
  await h.session.createEditorSession(userId, userId, 1202);
  await h.editorBlocks.handleEditorBlockCallback({
    id:'prompt-restricted-large-button',
    from:{ id:userId, language_code:'en' },
    message:{ chat:{ id:userId }, message_id:1202 },
    data:'r:add:buttons',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from:{ id:userId, language_code:'en' },
    chat:{ id:userId },
    message_id:1203,
    text:'{Sign in - login_url:https://example.com/login}',
  });

  assert.ok(h.calls.some(call => call.method === 'sendMessage'
    && call.args.text === 'Login URL unavailable.\n\n@Rlchsupportbot'));
  const session = await h.session.loadEditorSession(userId, { touch:false });
  assert.equal(session.blocks.some(block => block.type === 'buttons'), false);
});

test('large-button CBD accepts saved page names and reports invalid references in a quote', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 78;
  h.records.richPages.push({
    pageId: 'page-code-1',
    ownerId: userId,
    title: 'صفحة المستخدم',
    blocks: [{ type: 'paragraph', data: { text: 'Saved content' } }],
    buttons: [],
  });
  await h.session.createEditorSession(userId, userId, 928);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'large-button-cbd-name',
    from: { id: userId, language_code: 'ar' },
    message: { chat: { id: userId }, message_id: 928 },
    data: 'r:add:buttons',
  });

  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'ar' },
    chat: { id: userId },
    message_id: 929,
    text: '{افتح الصفحة - CBD: صفحة المستخدم}',
  });
  let session = await h.session.loadEditorSession(userId, { touch: false });
  assert.deepEqual(session.blocks.at(-1).data.buttons, [{
    text: 'افتح الصفحة',
    callback_data: 'r:cbd:page-code-1',
  }]);

  const otherUserId = 79;
  await h.session.createEditorSession(otherUserId, otherUserId, 931);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'large-button-cbd-invalid',
    from: { id: otherUserId, language_code: 'ar' },
    message: { chat: { id: otherUserId }, message_id: 931 },
    data: 'r:add:buttons',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: otherUserId, language_code: 'ar' },
    chat: { id: otherUserId },
    message_id: 932,
    text: '{افتح الصفحة - CBD: صفحة غير موجودة}',
  });
  const error = h.calls.find(call => (
    call.method === 'sendRichMessage'
    && call.args.rich_message?.blocks?.[0]?.text?.startsWith('التنسيق غلط.')
  ));
  assert.ok(error);
  assert.match(error.args.rich_message.blocks[0].text, /@Rlchsupportbot/);
  assert.equal(error.args.rich_message.blocks[1].type, 'blockquote');
  assert.match(error.args.rich_message.blocks[1].blocks[0].text, /اسم صفحة محفوظة عندك كما هو أو كودها/);
  session = await h.session.loadEditorSession(otherUserId, { touch: false });
  assert.equal(session.addStep, 'large_button_entry');
});

test('large-button USER format uses the existing Telegram user picker', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 77;
  await h.session.createEditorSession(userId, userId, 927);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'large-button-user',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: userId }, message_id: 927 },
    data: 'r:add:buttons',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId },
    message_id: 928,
    text: '{Profile - USER #p}',
  });
  let session = await h.session.loadEditorSession(userId, { touch: false });
  assert.equal(session.state, 'selecting_button_user');
  const picker = h.calls.filter(call => call.method === 'sendMessage').at(-1);
  const requestId = picker.args.reply_markup.keyboard[0][0].request_users.request_id;

  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId },
    message_id: 929,
    users_shared: { request_id: requestId, users: [{ user_id: 12345, username: '@profile_user' }] },
  });
  session = await h.session.loadEditorSession(userId, { touch: false });
  assert.equal(session.state, 'managing');
  assert.deepEqual(session.blocks.at(-1).data.buttons, [{
    text: 'Profile',
    url: 'https://t.me/profile_user',
    style: 'primary',
  }]);
  assert.equal(
    h.renderer.buildInputRichMessage(session.blocks, { technicalOnly: true }).blocks.at(-1).buttons[0].url,
    'https://t.me/profile_user',
  );
});

test('large-button USER selection without a public username asks for another account', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 80;
  await h.session.createEditorSession(userId, userId, 929);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'large-button-user-no-username',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: userId }, message_id: 929 },
    data: 'r:add:buttons',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId },
    message_id: 930,
    text: '{Profile - USER #p}',
  });
  let session = await h.session.loadEditorSession(userId, { touch: false });
  const firstPicker = h.calls.filter(call => call.method === 'sendMessage').at(-1);
  const firstRequestId = firstPicker.args.reply_markup.keyboard[0][0].request_users.request_id;
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId },
    message_id: 931,
    users_shared: { request_id: firstRequestId, users: [{ user_id: 12346 }] },
  });

  session = await h.session.loadEditorSession(userId, { touch: false });
  const nextPicker = h.calls.filter(call => call.method === 'sendMessage').at(-1);
  const nextRequestId = nextPicker.args.reply_markup.keyboard[0][0].request_users.request_id;
  assert.equal(session.state, 'selecting_button_user');
  assert.notEqual(nextRequestId, firstRequestId);
  assert.equal(session.blocks.length, 0);
  assert.ok(h.calls.some(call => call.method === 'sendMessage'
    && String(call.args.text).includes('public @username')));
});

test('old direct user-ID buttons remain editable without sending the invalid target', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 81;
  const chatId = 81;
  const block = h.blocks.makeBlock('buttons', {
    buttons: [{ text: 'Profile', url: 'tg://user?id=12345' }],
  });
  await h.session.createEditorSession(userId, chatId, 940);
  await h.session.updateEditorSession(userId, { blocks: [block] });
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'open-old-account-button',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: chatId }, message_id: 940 },
    data: 'r:b:' + block.id,
  });

  const edit = h.calls.filter(call => call.method === 'editMessageText').at(-1);
  assert.ok(edit);
  assert.ok(JSON.stringify(edit.args.rich_message.blocks).includes('Telegram rejected'));
  assert.equal(JSON.stringify(edit.args.rich_message.blocks).includes('tg://user?id=12345'), false);
  assert.equal(JSON.stringify(edit.args.rich_message.blocks).includes('"type":"buttons"'), false);
  assert.ok(edit.args.reply_markup.inline_keyboard.length > 0);
});

test('a rejected login URL domain falls back to an actionable text editor panel', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 82;
  const chatId = 82;
  const block = h.blocks.makeBlock('buttons', {
    buttons: [{
      id:'login-button',
      text:'Sign in',
      type:'login_url',
      value:'https://example.com/login',
      url:'https://example.com/login',
      style:'default',
      position:0,
    }],
  });
  await h.session.createEditorSession(userId, chatId, 941);
  await h.session.updateEditorSession(userId, { blocks:[block] });
  h.apiState.editErrors = [new Error('BotApiError [400]: Bad Request: BOT_DOMAIN_INVALID')];

  await h.editorBlocks.handleEditorBlockCallback({
    id:'open-invalid-login-button',
    from:{ id:userId, language_code:'en' },
    message:{ chat:{ id:chatId, type:'private' }, message_id:941 },
    data:'r:b:' + block.id,
  });

  const edits = h.calls.filter(call => call.method === 'editMessageText');
  assert.equal(edits.length, 2);
  assert.ok(edits[0].args.rich_message);
  assert.equal(edits[1].args.rich_message, undefined);
  assert.match(edits[1].args.text, /domain is not connected.*\/setdomain/i);
  assert.ok(edits[1].args.reply_markup.inline_keyboard.flat().some(button =>
    button.callback_data === 'r:e:' + block.id));
  const session = await h.session.loadEditorSession(userId, { touch:false });
  assert.equal(session.currentBlockId, block.id);
});

test('media choice preserves each incoming Telegram media type', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const cases = [
    ['photo', { photo: [{ file_id: 'photo-file', width: 10, height: 10 }] }],
    ['document', { document: { file_id: 'document-file', file_name: 'file.pdf' } }],
    ['voice', { voice: { file_id: 'voice-file', duration: 2 } }],
    ['video', { video: { file_id: 'video-file', width: 10, height: 10 } }],
    ['audio', { audio: { file_id: 'audio-file', duration: 2 } }],
    ['animation', { animation: { file_id: 'animation-file', width: 10, height: 10 } }],
  ];

  const menu = h.ui.buildAddBlockKeyboard('en').inline_keyboard.flat();
  assert.ok(menu.some(button => button.callback_data === 'r:add:media' && button.text === '📎 Media'));
  assert.ok(h.ui.buildAddBlockKeyboard('ar').inline_keyboard.flat()
    .some(button => button.callback_data === 'r:add:media' && button.text === '📎 الوسائط'));
  for (const removed of ['collage', 'animation', 'audio', 'photo', 'document', 'video', 'voice']) {
    assert.ok(!menu.some(button => button.callback_data === 'r:add:' + removed));
  }

  await h.session.createEditorSession(79, 79, 929);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'choose-media-invalid-input',
    from: { id: 79, language_code: 'en' },
    message: { chat: { id: 79 }, message_id: 929 },
    data: 'r:add:media',
  });
  await h.editorBlocks.handleEditorBlockMessage({
    from: { id: 79, language_code: 'en' },
    chat: { id: 79 },
    message_id: 939,
    text: 'not a media message',
  });
  const invalidSession = await h.session.loadEditorSession(79, { touch: false });
  assert.equal(invalidSession.state, 'adding_block');
  assert.equal(invalidSession.pendingAddType, 'media');

  for (let index = 0; index < cases.length; index += 1) {
    const [expectedType, media] = cases[index];
    const userId = 80 + index;
    await h.session.createEditorSession(userId, userId, 930 + index);
    await h.editorBlocks.handleEditorBlockCallback({
      id: 'choose-media-' + expectedType,
      from: { id: userId, language_code: 'en' },
      message: { chat: { id: userId }, message_id: 930 + index },
      data: 'r:add:media',
    });
    await h.editorBlocks.handleEditorBlockMessage({
      from: { id: userId, language_code: 'en' },
      chat: { id: userId },
      message_id: 940 + index,
      ...media,
    });
    const session = await h.session.loadEditorSession(userId, { touch: false });
    assert.equal(session.blocks.at(-1).type, expectedType);
    assert.equal(session.state, 'managing');
  }
});

test('media choice collects Telegram photo albums as collage blocks', async () => {
  const h = await harness({ extraModules: { editorBlocks: 'lib/editor-block-flow' } });
  const userId = 91;
  const chatId = 91;
  await h.session.createEditorSession(userId, chatId, 950);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'choose-media-album',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: chatId }, message_id: 950 },
    data: 'r:add:media',
  });
  for (const [messageId, fileId] of [[951, 'album-photo-1'], [952, 'album-photo-2']]) {
    await h.editorBlocks.handleEditorBlockMessage({
      from: { id: userId, language_code: 'en' },
      chat: { id: chatId },
      message_id: messageId,
      media_group_id: 'group-1',
      photo: [{ file_id: fileId, width: 10, height: 10 }],
    });
  }
  for (const row of h.records.editorAlbumItems) row.createdAt = Math.floor(Date.now() / 1000) - 2;
  const prompt = h.calls.filter(call => call.method === 'sendMessage').at(-1);
  const doneCallback = prompt.args.reply_markup.inline_keyboard.flat()
    .find(button => button.callback_data.startsWith('r:collage:done:'));
  assert.ok(doneCallback);
  await h.editorBlocks.handleEditorBlockCallback({
    id: 'finish-media-album',
    from: { id: userId, language_code: 'en' },
    message: { chat: { id: chatId }, message_id: 100 },
    data: doneCallback.callback_data,
  });

  const session = await h.session.loadEditorSession(userId, { touch: false });
  assert.equal(session.blocks.at(-1).type, 'collage');
  assert.deepEqual(session.blocks.at(-1).data.children.map(block => block.data.file.file_id), [
    'album-photo-1',
    'album-photo-2',
  ]);
});

test('Telegram media and button prompts are localized for every supported locale', async () => {
  const h = await harness();
  const locales = [
    'ar', 'en', 'es', 'de', 'it', 'pt', 'nl', 'pl', 'uk', 'ru',
    'tr', 'ur', 'hi', 'id', 'ja', 'ko', 'vi', 'th', 'zh-hans', 'zh-hant',
  ];
  const sources = [
    'Media',
    'Send one line in this format:\nButton name - URL\nor\nButton name - cbd:page_code',
    'The link may be a URL, @username, or t.me/username. Optional colors: #r red, #b blue, #g green.',
    'Send a photo, file, voice note, video, audio file, animation (GIF), or photo album (collage). Each item is saved as its original media block type.',
  ];

  for (const locale of locales) {
    for (const source of sources) {
      const value = h.i18n.tr(locale, source);
      assert.ok(value.trim(), `${locale} is missing ${source}`);
      if (locale !== 'en' && source !== 'Media') {
        assert.notEqual(value, source, `${locale} returned untranslated text`);
      }
    }
  }
});
