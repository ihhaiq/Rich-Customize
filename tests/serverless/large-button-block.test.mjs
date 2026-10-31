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
    /must contain exactly one button/,
  );
  assert.throws(
    () => h.renderer.buildInputRichMessage([
      h.blocks.makeBlock('buttons', { buttons: [{ text: 'One', url: 'https://example.com' }, { text: 'Two', url: 'https://example.com' }] }),
    ]),
    /must contain exactly one button/,
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
    blocks: [{ type: 'buttons', data: { buttons: [
      { text: 'One', url: 'https://example.com' },
      { text: 'Two', url: 'https://example.com' },
    ] } }],
  })[0].code, 'invalid_button_layout');
  assert.equal(check({
    blocks: [{ type: 'buttons', data: { buttons: [{ text: 'Broken', callback_data: 'x'.repeat(65) }] } }],
  })[0].code, 'invalid_button');
  assert.equal(check({
    blocks: [{ type: 'buttons', data: { buttons: [{ text: 'Open', url: 'https://example.com' }] } }],
  }).length, 0);
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
    text: 'Open website - https://example.com #r',
  });

  let updated = await h.session.loadEditorSession(userId, { touch: false });
  assert.equal(updated.state, 'managing');
  assert.equal(updated.blocks.at(-1).type, 'buttons');
  assert.deepEqual(updated.blocks.at(-1).data.buttons, [{
    text: 'Open website',
    url: 'https://example.com',
    style: 'danger',
  }]);

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
