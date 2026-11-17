import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const userId = 987654;

function query(id, data, messageId = 50, languageCode = 'en') {
  return {
    id,
    from: { id: userId, language_code: languageCode },
    message: { chat: { id: userId, type: 'private' }, message_id: messageId },
    data,
  };
}

test('pull-quote author can be skipped using its inline button', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'adding_block',
    pendingAddType: 'pullquote',
    addStep: 'quote_text',
    addPayload: {},
  });
  await h.extra.handleExtraBlockMessage({
    from: { id: userId, language_code: 'ar' },
    chat: { id: userId, type: 'private' },
    message_id: 60,
    text: 'A quote',
  }, await h.session.loadEditorSession(userId));

  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  assert.equal(prompt.args.text, 'أرسل اسم الكاتب كنص.');
  assert.doesNotMatch(prompt.args.text, /\/skip/i);
  assert.deepEqual(prompt.args.reply_markup.inline_keyboard[0][0], {
    text: 'إلغاء / تخطي',
    callback_data: 'r:field:skip',
  });

  await h.extra.handleExtraBlockCallback(
    query('skip-credit', 'r:field:skip', 100),
    await h.session.loadEditorSession(userId),
  );
  const session = await h.session.loadEditorSession(userId);
  assert.equal(session.state, 'managing');
  assert.equal(session.blocks[0].type, 'pullquote');
  assert.equal(session.blocks[0].data.credit_html, null);
});

test('pull-quote inside Details can skip its author', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'adding_block',
    pendingAddType: 'details',
    pendingChildType: 'pullquote',
    addStep: 'details_child_quote_credit',
    addPayload: { summary_html: 'Details', children: [], child_quote_text: 'A quote' },
  });

  await h.extra.handleExtraBlockCallback(
    query('skip-nested-credit', 'r:field:skip', 100),
    await h.session.loadEditorSession(userId),
  );
  const session = await h.session.loadEditorSession(userId);
  assert.equal(session.state, 'adding_block');
  assert.equal(session.addPayload.children[0].type, 'pullquote');
  assert.equal(session.addPayload.children[0].data.credit_html, null);
});

test('pull-quote text can be skipped after media is attached', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const photo = h.blocks.makeBlock('photo', { file: { file_id: 'quote-photo' } }, 0);
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'adding_block',
    pendingAddType: 'pullquote',
    addStep: 'quote_media_text',
    addPayload: { media_children: [photo] },
  });

  await h.extra.handleExtraBlockCallback(
    query('skip-quote-text', 'r:field:skip', 100),
    await h.session.loadEditorSession(userId),
  );
  const awaitingAuthor = await h.session.loadEditorSession(userId);
  assert.equal(awaitingAuthor.addStep, 'quote_credit');
  assert.equal(awaitingAuthor.addPayload.quote_text, '');
  assert.equal(
    h.calls.filter((call) => call.method === 'sendMessage').at(-1).args.reply_markup.inline_keyboard[0][0].callback_data,
    'r:field:skip',
  );

  await h.extra.handleExtraBlockCallback(
    query('skip-quote-author', 'r:field:skip', 101),
    awaitingAuthor,
  );
  const saved = await h.session.loadEditorSession(userId);
  assert.equal(saved.blocks[0].type, 'pullquote');
  assert.equal(saved.blocks[0].data.quote_text, '');
  assert.equal(saved.blocks[0].data.media_children[0].data.file.file_id, 'quote-photo');
  assert.equal(saved.state, 'managing');
});

test('pull-quote text inside Details can be skipped after media is attached', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const photo = h.blocks.makeBlock('photo', { file: { file_id: 'nested-quote-photo' } }, 0);
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'adding_block',
    pendingAddType: 'details',
    pendingChildType: 'pullquote',
    addStep: 'details_child_pullquote_text',
    addPayload: {
      summary_html: 'Details',
      children: [],
      child_media_children: [photo],
    },
  });

  await h.extra.handleExtraBlockCallback(
    query('skip-nested-quote-text', 'r:field:skip', 100),
    await h.session.loadEditorSession(userId),
  );
  const awaitingAuthor = await h.session.loadEditorSession(userId);
  assert.equal(awaitingAuthor.addStep, 'details_child_quote_credit');
  await h.extra.handleExtraBlockCallback(
    query('skip-nested-quote-author', 'r:field:skip', 101),
    awaitingAuthor,
  );

  const saved = await h.session.loadEditorSession(userId);
  assert.equal(saved.addPayload.children[0].type, 'pullquote');
  assert.equal(saved.addPayload.children[0].data.quote_text, '');
  assert.equal(
    saved.addPayload.children[0].data.media_children[0].data.file.file_id,
    'nested-quote-photo',
  );
});

test('existing media fields can be removed using their inline button', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const photo = h.blocks.makeBlock('photo', {
    file: { file_id: 'photo-1' },
    caption_html: '<b>Caption</b>',
    credit_html: 'Source',
  }, 0, null, 'photo');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [photo],
  });

  await h.extra.handleExtraBlockCallback(
    query('edit-caption', 'r:f:photo:caption', 50),
    await h.session.loadEditorSession(userId),
  );
  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  assert.equal(prompt.args.text, 'Send the new media caption.');
  assert.deepEqual(prompt.args.reply_markup.inline_keyboard[0][0], {
    text: 'Remove',
    callback_data: 'r:field:remove',
  });

  await h.extra.handleExtraBlockCallback(
    query('remove-caption', 'r:field:remove', 100),
    await h.session.loadEditorSession(userId),
  );
  const updated = (await h.session.loadEditorSession(userId)).blocks[0];
  assert.equal(updated.data.caption_html, null);
  assert.equal(updated.data.credit_html, 'Source');
});

test('nested media source can be removed using its inline button', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const photo = h.blocks.makeBlock('photo', {
    file: { file_id: 'photo-3' },
    credit_html: 'Source',
  }, 0, null, 'nested-photo');
  const details = h.blocks.makeBlock('details', { children: [photo] }, 0, null, 'details');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'editing_block',
    blocks: [details],
    nestedDetailsId: 'details',
    nestedChildId: 'nested-photo',
    nestedAction: 'credit',
    expectedType: 'photo',
    addPromptChatId: userId,
    addPromptMessageId: 60,
  });

  await h.extra.handleExtraBlockCallback(
    query('remove-nested-source', 'r:field:remove', 60),
    await h.session.loadEditorSession(userId),
  );
  const updated = (await h.session.loadEditorSession(userId)).blocks[0].data.children[0];
  assert.equal(updated.data.credit_html, null);
});

test('slideshow accepts new media while editing and keeps one count prompt', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const slideshow = h.blocks.makeBlock('slideshow', {
    children: [
      h.blocks.makeBlock('photo', { file: { file_id: 'existing-1' } }, 0),
      h.blocks.makeBlock('video', { file: { file_id: 'existing-2' } }, 1),
    ],
  }, 0, null, 'slides');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [slideshow],
  });

  const blockKeyboard = h.ui.buildBlockEditorKeyboard(slideshow, [slideshow], 'en');
  assert.ok(blockKeyboard.inline_keyboard.flat().some((button) => (
    button.callback_data === 'r:slides:edit:add:slides'
  )));
  await h.extra.handleExtraBlockCallback(
    query('open-media-picker', 'r:slides:edit:add:slides'),
    await h.session.loadEditorSession(userId),
  );
  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  assert.match(prompt.args.text, /Current media: 2/);
  assert.match(prompt.args.text, /New media: 0/);
  const promptId = prompt.args.message_id || 100;
  for (const [messageId, fileId] of [[61, 'new-1'], [62, 'new-2']]) {
    await h.extra.handleExtraBlockMessage({
      from: { id: userId, language_code: 'en' },
      chat: { id: userId, type: 'private' },
      message_id: messageId,
      photo: [{ file_id: fileId, width: 320, height: 240 }],
    }, await h.session.loadEditorSession(userId));
  }
  assert.equal(h.calls.filter((call) => call.method === 'sendMessage').length, 1);
  const latestPrompt = h.calls.filter((call) => call.method === 'editMessageText').at(-1);
  assert.match(latestPrompt.args.text, /Current media: 2/);
  assert.match(latestPrompt.args.text, /New media: 2/);
  assert.equal(Number(latestPrompt.args.message_id), Number(promptId));
  await h.extra.handleExtraBlockCallback(
    query(
      'save-new-media',
      prompt.args.reply_markup.inline_keyboard[0][0].callback_data,
      promptId,
    ),
    await h.session.loadEditorSession(userId),
  );
  const session = await h.session.loadEditorSession(userId);
  const updated = session.blocks.find((block) => block.id === 'slides');
  assert.equal(updated.data.children.length, 4);
  assert.deepEqual(
    updated.data.children.map((child) => child.data.file.file_id),
    ['existing-1', 'existing-2', 'new-1', 'new-2'],
  );
  assert.equal(session.state, 'managing');
});

test('a Telegram slideshow album updates one prompt and saves every image once', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  await h.session.createEditorSession(userId, userId, 50);
  await h.extra.handleExtraBlockCallback(
    query('start-slideshow', 'r:add:slideshow'),
    await h.session.loadEditorSession(userId),
  );
  const initialPrompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  const promptId = initialPrompt.args.message_id || 100;
  assert.ok(promptId);

  for (const [messageId, fileId] of [
    [61, 'album-photo-1'],
    [62, 'album-photo-2'],
    [63, 'album-photo-3'],
  ]) {
    await h.extra.handleExtraBlockMessage({
      from: { id: userId, language_code: 'en' },
      chat: { id: userId, type: 'private' },
      message_id: messageId,
      media_group_id: 'slideshow-album',
      photo: [{ file_id: fileId, width: 320, height: 240 }],
    }, await h.session.loadEditorSession(userId));
  }

  assert.equal(h.calls.filter((call) => call.method === 'sendMessage').length, 1);
  const promptEdits = h.calls.filter((call) => call.method === 'editMessageText');
  assert.equal(promptEdits.length, 3);
  assert.ok(promptEdits.every((call) => Number(call.args.message_id) === Number(promptId)));
  assert.match(promptEdits.at(-1).args.text, /3\/50/);
  assert.equal(
    h.calls.filter((call) => call.method === 'deleteMessage' && [61, 62, 63].includes(call.args.message_id)).length,
    3,
  );

  const done = promptEdits.at(-1).args.reply_markup.inline_keyboard[0][0].callback_data;
  await h.extra.handleExtraBlockCallback(
    query('finish-slideshow', done, promptId),
    await h.session.loadEditorSession(userId),
  );
  const session = await h.session.loadEditorSession(userId, { touch: false });
  const slideshow = session.blocks.find((block) => block.type === 'slideshow');
  assert.deepEqual(
    slideshow.data.children.map((child) => child.data.file.file_id),
    ['album-photo-1', 'album-photo-2', 'album-photo-3'],
  );
  assert.equal(session.state, 'managing');
  assert.equal(
    h.i18n.tr('ar', 'The album is still receiving items. Try again in a moment.'),
    'بعد تليكرام يستقبل صور الألبوم. انتظر لحظة ثم اضغط «خلصت إضافة الوسائط» مرة ثانية.',
  );
});

test('completed media upload restores the editor when its prompt is missing', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const slideshow = h.blocks.makeBlock('slideshow', { children: [] }, 0, null, 'slides');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [slideshow],
  });
  await h.extra.handleExtraBlockCallback(
    query('open-media-picker', 'r:slides:edit:add:slides'),
    await h.session.loadEditorSession(userId),
  );
  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  await h.extra.handleExtraBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId, type: 'private' },
    message_id: 68,
    photo: [{ file_id: 'recovery-photo', width: 320, height: 240 }],
  }, await h.session.loadEditorSession(userId));
  h.apiState.editError = 'Bad Request: message to edit not found';

  await h.extra.handleExtraBlockCallback(
    query(
      'save-after-prompt-deleted',
      prompt.args.reply_markup.inline_keyboard[0][0].callback_data,
      100,
    ),
    await h.session.loadEditorSession(userId),
  );

  const saved = await h.session.loadEditorSession(userId);
  assert.equal(saved.blocks[0].data.children[0].data.file.file_id, 'recovery-photo');
  assert.equal(saved.managementMessageId, 100);
  assert.ok(h.calls.some((call) => (
    call.method === 'sendMessage'
    && call.args.reply_markup?.inline_keyboard?.flat().some((button) => (
      button.callback_data === 'r:slides:edit:add:slides'
    ))
  )));
});

test('new media appends to a collage without replacing existing items', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const collage = h.blocks.makeBlock('collage', {
    children: [h.blocks.makeBlock('photo', { file: { file_id: 'old-photo' } }, 0)],
  }, 0, null, 'collage');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [collage],
  });

  const keyboard = h.ui.buildBlockEditorKeyboard(collage, [collage], 'en');
  const addButton = keyboard.inline_keyboard.flat().find((button) => (
    button.callback_data === 'r:media:edit:add:collage'
  ));
  assert.ok(addButton);
  assert.equal(h.extra.isExtraBlockCallback(addButton.callback_data), true);
  await h.extra.handleExtraBlockCallback(
    query('add-to-collage', addButton.callback_data),
    await h.session.loadEditorSession(userId),
  );
  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  assert.match(prompt.args.text, /Current media: 1/);
  await h.extra.handleExtraBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId, type: 'private' },
    message_id: 65,
    photo: [{ file_id: 'new-photo', width: 320, height: 240 }],
  }, await h.session.loadEditorSession(userId));
  await h.extra.handleExtraBlockCallback(
    query('save-collage-media', prompt.args.reply_markup.inline_keyboard[0][0].callback_data),
    await h.session.loadEditorSession(userId),
  );

  const saved = await h.session.loadEditorSession(userId);
  assert.deepEqual(
    saved.blocks[0].data.children.map((child) => child.data.file.file_id),
    ['old-photo', 'new-photo'],
  );
});

test('new media appends to quote media and preserves quote text', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const quote = h.blocks.makeBlock('pullquote', {
    quote_text: 'Keep this text',
    media_children: [h.blocks.makeBlock('photo', { file: { file_id: 'quote-old' } }, 0)],
  }, 0, null, 'quote');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [quote],
  });
  await h.extra.handleExtraBlockCallback(
    query('add-to-quote', 'r:media:edit:add:quote'),
    await h.session.loadEditorSession(userId),
  );
  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  await h.extra.handleExtraBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId, type: 'private' },
    message_id: 66,
    video: { file_id: 'quote-new' },
  }, await h.session.loadEditorSession(userId));
  const done = prompt.args.reply_markup.inline_keyboard[0][0].callback_data;
  await h.extra.handleExtraBlockCallback(
    query('save-quote-media', done),
    await h.session.loadEditorSession(userId),
  );

  const updated = (await h.session.loadEditorSession(userId)).blocks[0];
  assert.equal(updated.data.quote_text, 'Keep this text');
  assert.deepEqual(
    updated.data.media_children.map((child) => child.data.file.file_id),
    ['quote-old', 'quote-new'],
  );
});

test('new media beside a media block inserts a sibling instead of replacing it', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const photo = h.blocks.makeBlock('photo', { file: { file_id: 'first-photo' } }, 0, null, 'photo');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [photo],
  });
  await h.extra.handleExtraBlockCallback(
    query('add-beside-photo', 'r:media:edit:add:photo'),
    await h.session.loadEditorSession(userId),
  );
  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  await h.extra.handleExtraBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId, type: 'private' },
    message_id: 67,
    photo: [{ file_id: 'second-photo', width: 320, height: 240 }],
  }, await h.session.loadEditorSession(userId));
  await h.extra.handleExtraBlockCallback(
    query('save-beside-photo', prompt.args.reply_markup.inline_keyboard[0][0].callback_data),
    await h.session.loadEditorSession(userId),
  );

  const saved = await h.session.loadEditorSession(userId);
  assert.deepEqual(saved.blocks.map((block) => block.data.file.file_id), ['first-photo', 'second-photo']);
  assert.equal(saved.blocks[0].id, 'photo');
});

test('new media beside a nested media block stays inside Details', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const photo = h.blocks.makeBlock('photo', { file: { file_id: 'nested-first' } }, 0, null, 'nested-photo');
  const details = h.blocks.makeBlock('details', { children: [photo] }, 0, null, 'details');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [details],
  });
  const keyboard = h.ui.buildDetailsInnerBlockKeyboard(details, photo, 'en');
  const addButton = keyboard.inline_keyboard.flat().find((button) => (
    button.callback_data === 'r:dmedia:edit:add:details:nested-photo'
  ));
  assert.ok(addButton);
  await h.extra.handleExtraBlockCallback(
    query('add-nested-media', addButton.callback_data),
    await h.session.loadEditorSession(userId),
  );
  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  await h.extra.handleExtraBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId, type: 'private' },
    message_id: 69,
    video: { file_id: 'nested-second' },
  }, await h.session.loadEditorSession(userId));
  await h.extra.handleExtraBlockCallback(
    query('save-nested-media', prompt.args.reply_markup.inline_keyboard[0][0].callback_data),
    await h.session.loadEditorSession(userId),
  );

  const saved = await h.session.loadEditorSession(userId);
  assert.deepEqual(
    saved.blocks[0].data.children.map((child) => child.data.file.file_id),
    ['nested-first', 'nested-second'],
  );
});

test('slideshow append rejects unsupported messages without changing its prompt state', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const slideshow = h.blocks.makeBlock('slideshow', { children: [] }, 0, null, 'slides');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [slideshow],
  });
  await h.extra.handleExtraBlockCallback(
    query('open-media-picker', 'r:slides:edit:add:slides'),
    await h.session.loadEditorSession(userId),
  );
  await h.extra.handleExtraBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId, type: 'private' },
    message_id: 63,
    text: 'not media',
  }, await h.session.loadEditorSession(userId));

  const session = await h.session.loadEditorSession(userId);
  assert.deepEqual(session.addPayload.mediaAppend.items, []);
  assert.equal(Number(session.addPromptMessageId), 100);
  assert.equal(h.calls.filter((call) => call.method === 'sendMessage').length, 2);
  assert.equal(h.calls.some((call) => call.method === 'deleteMessage' && call.args.message_id === 63), false);
});

test('full slideshows do not open an append flow', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const children = Array.from({ length: 50 }, (_, index) => (
    h.blocks.makeBlock('photo', { file: { file_id: 'photo-' + index } }, index)
  ));
  const slideshow = h.blocks.makeBlock('slideshow', { children }, 0, null, 'slides');
  const session = {
    state: 'managing',
    blocks: [slideshow],
  };

  await h.extra.handleExtraBlockCallback(
    query('open-full-media-picker', 'r:slides:edit:add:slides'),
    session,
  );

  assert.equal(h.calls.filter((call) => call.method === 'sendMessage').length, 0);
  assert.ok(h.calls.some((call) => (
    call.method === 'answerCallbackQuery'
    && /item limit/.test(call.args.text || '')
  )));
});

test('slideshow inside Details accepts new media', async () => {
  const h = await harness({ extraModules: { extra: 'lib/editor-extra-blocks' } });
  const slideshow = h.blocks.makeBlock('slideshow', { children: [] }, 1, null, 'nested-slides');
  const details = h.blocks.makeBlock('details', {
    children: [slideshow],
  }, 0, null, 'details');
  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state: 'managing',
    blocks: [details],
  });

  const keyboard = h.ui.buildDetailsInnerBlockKeyboard(details, slideshow, 'en');
  assert.ok(keyboard.inline_keyboard.flat().some((button) => (
    button.callback_data === 'r:dslides:edit:add:details:nested-slides'
  )));
  await h.extra.handleExtraBlockCallback(
    query('open-nested-picker', 'r:dslides:edit:add:details:nested-slides'),
    await h.session.loadEditorSession(userId),
  );
  const prompt = h.calls.filter((call) => call.method === 'sendMessage').at(-1);
  await h.extra.handleExtraBlockMessage({
    from: { id: userId, language_code: 'en' },
    chat: { id: userId, type: 'private' },
    message_id: 63,
    video: { file_id: 'video-2', width: 320, height: 240 },
  }, await h.session.loadEditorSession(userId));
  await h.extra.handleExtraBlockCallback(
    query('save-nested-media', 'r:slides:append:done:' + prompt.args.reply_markup.inline_keyboard[0][0].callback_data.split(':').at(-1)),
    await h.session.loadEditorSession(userId),
  );
  const updatedDetails = (await h.session.loadEditorSession(userId)).blocks[0];
  const updatedSlideshow = updatedDetails.data.children.find((block) => block.id === 'nested-slides');
  assert.equal(updatedSlideshow.data.children.length, 1);
  assert.equal(updatedSlideshow.data.children[0].data.file.file_id, 'video-2');
});

test('Arabic callback labels use Skip and Remove actions without command text', async () => {
  const h = await harness();
  assert.equal(h.i18n.tr('ar', 'Skip'), 'إلغاء / تخطي');
  assert.equal(h.i18n.tr('ar', 'Remove'), 'إزالة');
});
