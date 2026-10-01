import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { harness } from './harness.mjs';
const emoji = { type: 'custom_emoji', custom_emoji_id: '5368324170671202286', alternative_text: '👍' };
const html = '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>';
const pack = (count) => ({ sticker_type: 'custom_emoji', title: 'Test pack', stickers: Array.from({ length: count }, (_, i) => ({ custom_emoji_id: String(5368324170671202200n + BigInt(i)), emoji: i % 2 ? '👨‍👩‍👧‍👦' : '👍' })) });
const setup = async () => {
  const h = await harness();
  await h.session.createEditorSession(1, 1, 100);
  const block = h.blocks.makeBlock('paragraph', { html: '<b>مرحبًا</b> <a href="https://example.com">world</a>\nEnglish 👨‍👩‍👧‍👦 é' });
  await h.session.updateEditorSession(1, { blocks: [block] });
  h.apiState.pack = pack(60);
  h.get = () => h.records.editorSessions[0];
  h.query = (data, overrides = {}) => ({ id: crypto.randomUUID(), from: { id: 1, language_code: 'ar' }, message: { chat: { id: 1, type: 'private' }, message_id: 100 }, data, ...overrides });
  h.press = async (action, arg) => h.flow.handlePremiumEmojiCallback(h.query('r:emoji:' + h.get().addPayload.premiumEmoji.token + ':' + action + (arg == null ? '' : ':' + arg)));
  h.message = (text) => h.flow.handlePremiumEmojiMessage({ text, from: { id: 1, language_code: 'ar' }, chat: { id: 1, type: 'private' }, message_id: 101 });
  h.open = async () => { await h.flow.handlePremiumEmojiCallback(h.query('r:emoji:open')); await h.message('https://t.me/addemoji/Test'); };
  return h;
};

test('valid Telegram pack URLs only; reject stickers, incomplete packs and invalid IDs', async () => {
  const { flow } = await harness();
  for (const link of ['https://t.me/addemoji/Test', 't.me/addemoji/Test', 'https://telegram.me/addemoji/Test/', 'tg://addemoji?set=Test']) assert.equal(flow.emojiPackName(link), 'Test');
  for (const link of ['https://t.me/addstickers/Test','https://evil.test/addemoji/Test','https://t.me.evil.test/addemoji/Test','https://x@t.me/addemoji/Test','https://t.me/addemoji/a/b']) assert.equal(flow.emojiPackName(link), null);
  assert.equal(flow.customEmojiPack({ ...pack(1), sticker_type: 'regular' }), null);
  assert.equal(flow.customEmojiPack({ sticker_type: 'custom_emoji', stickers: [{ custom_emoji_id: '123' }] }), null);
  assert.equal(flow.customEmojiPack(pack(300)).length, 300);
});

test('pasted emoji HTML preserves UTF-16 entities, Arabic, links and native emoji', async () => {
  const { text, clone } = await harness();
  const source = 'عربي ' + html + ' bold link 🙂';
  const message = { text: source, entities: [
    { type: 'bold', offset: 0, length: source.indexOf(' link') },
    { type: 'text_link', offset: source.indexOf('link'), length: 4, url: 'https://example.com' },
    { type: 'custom_emoji', offset: source.indexOf('🙂'), length: 2, custom_emoji_id: '12345' },
  ] };
  const original = clone(message);
  const rich = text.messageRichText(message);
  assert.equal(text.plainRichText(rich), 'عربي 👍 bold link 🙂');
  assert.match(text.richTextToHtml(rich), /<b>عربي <tg-emoji/);
  assert.match(text.richTextToHtml(rich), /<a href="https:\/\/example.com">link<\/a>/);
  assert.match(text.richTextToHtml(rich), /emoji-id="12345"/);
  assert.deepEqual(message, original);
  assert.equal(text.plainRichText(text.messageRichText({ text: 'a < b <script>x</script>' })), 'a < b <script>x</script>');
  assert.equal(text.messageRichText({ text: '<tg-emoji emoji-id="bad">🙂</tg-emoji>' }), '<tg-emoji emoji-id="bad">🙂</tg-emoji>');
  assert.doesNotThrow(() => text.messageRichText({ text: '<tg-emoji emoji-id="123">&#99999999999;</tg-emoji>' }));
});

test('copied code entity becomes emoji; list and table text paths interpret HTML without entities', async () => {
  const { text, blocks, renderer } = await harness();
  const rich = text.messageRichText({ text: html, entities: [{ type: 'code', offset: 0, length: html.length }] });
  assert.equal(rich.type, 'custom_emoji');
  for (const type of ['paragraph','heading','footer','list','table']) {
    const message = { text: type === 'table' ? 'A|' + html : html };
    const data = blocks.textData(message, type, 2, text.messageRichText(message), text.messageHtmlText(message));
    const rendered = renderer.buildSingleBlockRichMessage(blocks.makeBlock(type, data));
    assert.match(JSON.stringify(rendered), /"type":"custom_emoji"/, type);
    assert.doesNotMatch(JSON.stringify(rendered), /&lt;tg-emoji/, type);
  }
  const code = blocks.textData({ text: html }, 'preformatted', 2, text.messageRichText({ text: html }), text.messageHtmlText({ text: html }));
  assert.equal(code.text, html); // A code block must stay literal.
});

test('grapheme-safe movement preserves RichText, links, Arabic marks and Enter lines', async () => {
  const { movement: m, text, clone } = await harness();
  const value = [{ type: 'bold', text: 'عَرَبِي ' }, { type: 'url', url: 'https://example.com', text: 'é👩🏽‍💻🇮🇶' }, emoji, '\nEnglish\n'];
  const original = clone(value);
  const initial = m.initialEmojiPosition(value);
  assert.equal(initial.line, 0);
  let pos = m.moveEmojiPosition(value, initial, 'right');
  assert.equal(pos.column, initial.column - 1); // RTL visual-right moves toward logical start.
  let inserted = m.insertEmojiAt(value, [emoji], pos);
  assert.equal(text.plainRichText(inserted).replace('👍👍','👍'), text.plainRichText(value));
  for (const [lineIndex, line] of m.emojiLines(value).entries()) for (let column = 0; column < line.boundaries.length; column++) {
    const result = m.insertEmojiAt(value, [emoji], { line: lineIndex, column });
    assert.doesNotThrow(() => JSON.stringify(result));
  }
  pos = m.moveEmojiPosition(value, initial, 'down');
  assert.equal(pos.line, 1);
  pos = m.moveEmojiPosition(value, pos, 'left', false);
  assert.equal(pos.column, 6);
  const family = '👨‍👩‍👧‍👦';
  assert.equal(m.emojiLines('a' + family + 'b')[0].boundaries.length, 4);
  assert.equal(m.emojiLines(['e', { type: 'bold', text: '\u0301' }])[0].boundaries.length, 2);
  assert.deepEqual(clone(value), original);
  inserted = m.insertEmojiAt(value, [emoji], { line: 1, column: 2 });
  assert.match(text.richTextToHtml(inserted), /href="https:\/\/example.com"/);
  assert.equal(m.emojiLines('a\r\nb\rc\n').length, 4);
});

test('targets preserve imported table formatting and native details editable caches', async () => {
  const h = await harness();
  const native = h.blocks.makeBlock('table', { native: true, native_data: { type: 'table', is_compact: true, is_bordered: true, cells: [[{ text: { type: 'bold', text: 'cell' }, colspan: 3, align: 'center', valign: 'middle' }]] } });
  const target = h.targets.emojiTargets(native)[0];
  const changed = h.targets.applyEmojiTarget(native, target, h.movement.insertEmojiAt(target.value, [emoji], h.movement.initialEmojiPosition(target.value)));
  assert.equal(changed.data.native_data.cells[0][0].colspan, 3);
  assert.equal(changed.data.native_data.cells[0][0].align, 'center');
  assert.match(JSON.stringify(h.renderer.buildSingleBlockRichMessage(changed)), /custom_emoji/);
  const details = h.blocks.makeBlock('details', { native: true, summary_html: 'old', children: [h.blocks.makeBlock('text', { text: 'old' })], native_data: { type: 'details', summary: 'Title', blocks: [{ type: 'paragraph', text: 'child' }] } });
  const childId = details.data.children[0].id;
  const childTarget = h.targets.emojiTargets(details)[1];
  const edited = h.targets.applyEmojiTarget(details, childTarget, ['child', emoji]);
  assert.equal(edited.data.children[0].id, childId);
  assert.match(edited.data.children[0].data.html, /tg-emoji/);
  assert.match(edited.data.children[0].data.native_data.text[1].type, /custom_emoji/);
  assert.equal(h.targets.emojiTargets(h.blocks.makeBlock('divider')).length, 0);
  assert.equal(h.targets.emojiTargets(h.blocks.makeBlock('preformatted', { text: 'x' })).length, 0);
});

test('picker has exact three columns, merged finish/more rows and complete extra pagination', async () => {
  const h = await harness();
  const emojis = h.flow.customEmojiPack(pack(300));
  const flow = { token: 'test', title: 'Pack', emojis, selected: [0], more: true, page: 0 };
  const view = h.flow.emojiPickerView(flow, 'ar');
  const main = view.blocks[1];
  assert.deepEqual(h.clone(main.cells[0].map(c => c.text)), ['اختر الإيموجي','معاينة الإيموجي','كود الإيموجي']);
  assert.equal(main.cells.length, 12);
  assert.equal(main.cells[10][0].colspan, 3);
  assert.equal(main.cells[10][0].text.button.text, 'إنهاء اختيار الإيموجي');
  assert.equal(main.cells[11][0].text.button.text, 'عرض المزيد');
  assert.equal(view.blocks[2].type, 'details');
  assert.equal(view.blocks[2].blocks[0].cells[1][1].text.custom_emoji_id, emojis[9].custom_emoji_id);
  const seen = new Set();
  for (let page = 0; 9 + page * 18 < emojis.length; page++) {
    const v = h.flow.emojiPickerView({ ...flow, page }, 'en');
    for (const row of v.blocks[2].blocks[0].cells.slice(1,-1)) seen.add(row[1].text.custom_emoji_id);
    assert.ok(JSON.stringify(v).length < 20000);
    const visit = x => { if (!x || typeof x !== 'object') return; if (x.callback_data) assert.ok(Buffer.byteLength(x.callback_data) <= 64); Object.values(x).forEach(visit); };
    visit(v);
  }
  assert.equal(seen.size, 291);
  for (const e of emojis.slice(0,9)) assert.ok(!seen.has(e.custom_emoji_id));
});

test('all 20 catalogs contain every emoji key with matching placeholders', async () => {
  const h = await harness();
  const { MESSAGE_KEYS, SUPPORTED_LOCALES } = await import('../../lib/i18n-keys.js');
  for (const locale of SUPPORTED_LOCALES) {
    const { default: values } = await import('../../lib/lang/' + locale + '.js');
    assert.equal(values.length, MESSAGE_KEYS.length);
    for (const key of MESSAGE_KEYS.filter(key => key.startsWith('emoji.'))) assert.ok(h.i18n.t(locale, key));
    assert.doesNotMatch(h.i18n.t(locale, 'emoji.range', { start: 10, end: 27, total: 60 }), /\{\w+\}/);
  }
  assert.equal(SUPPORTED_LOCALES.length, 20);
});

test('complete selection, toggle, positioning, cancel, confirm, undo/redo and storage roundtrip', async () => {
  const h = await setup();
  const original = h.clone(h.get().blocks);
  await h.open();
  await h.press('select', 0); assert.equal(h.get().addPayload.premiumEmoji.selected.length, 1);
  await h.press('select', 0); assert.equal(h.get().addPayload.premiumEmoji.selected.length, 0);
  await h.press('more'); await h.press('page', 1); await h.press('select', 29);
  await h.press('select', 1); await h.press('finish'); await h.press('block', 0);
  assert.equal(h.get().addPayload.premiumEmoji.stage, 'position');
  await h.press('move', 'right'); await h.press('move', 'down');
  assert.deepEqual(h.get().blocks, original);
  assert.equal(h.get().undoStack.length, 0);
  await h.press('cancel'); assert.deepEqual(h.get().blocks, original);
  await h.press('finish'); await h.press('block', 0);
  const stale = h.query('r:emoji:' + h.get().addPayload.premiumEmoji.token + ':confirm');
  await h.flow.handlePremiumEmojiCallback(stale);
  const committed = h.clone(h.get().blocks);
  assert.notDeepEqual(committed, original);
  assert.equal(h.get().undoStack.length, 1);
  assert.equal(h.records.richPages.length, 0); // No implicit page save.
  await h.flow.handlePremiumEmojiCallback(stale);
  assert.equal(h.get().undoStack.length, 1);
  await h.session.undoEditorState(1); assert.deepEqual(h.get().blocks, original);
  await h.session.redoEditorState(1); assert.deepEqual(h.get().blocks, committed);
  const serialized = JSON.parse(JSON.stringify(committed));
  h.blocks.normalizeBlocks(serialized);
  assert.match(JSON.stringify(h.renderer.buildInputRichMessage(serialized)), /custom_emoji/);
  assert.match(JSON.stringify(h.renderer.buildInputRichMessage(serialized)), /https:\/\/example.com/);
});

test('invalid/unavailable packs retry in same panel; old buttons, ownership and TTL are guarded', async () => {
  const h = await setup();
  await h.flow.handlePremiumEmojiCallback(h.query('r:emoji:open'));
  await h.message('https://evil.test/pack'); assert.equal(h.get().addPayload.premiumEmoji.error, 'invalid');
  h.apiState.error = true; await h.message('t.me/addemoji/Test'); assert.equal(h.get().addPayload.premiumEmoji.error, 'load_failed');
  h.apiState.error = false; await h.message('t.me/addemoji/Test');
  const stale = h.query('r:emoji:' + h.get().addPayload.premiumEmoji.token + ':select:0');
  await h.press('select', 1);
  await h.flow.handlePremiumEmojiCallback(stale);
  assert.deepEqual(h.get().addPayload.premiumEmoji.selected, [1]);
  await h.flow.handlePremiumEmojiCallback(h.query('r:emoji:open', { from: { id: 2, language_code: 'ar' } }));
  assert.equal(h.get().addPayload.premiumEmoji.stage, 'pack');
  h.records.richPages.push({ pageId: 'foreign', ownerId: 2 });
  await h.session.updateEditorSession(1, { currentPageId: 'foreign' });
  await h.press('select', 3); assert.deepEqual(h.get().addPayload.premiumEmoji.selected, [1]);
  h.get().lastActivityAt = Math.floor(Date.now() / 1000) - 7200;
  assert.equal(await h.guard.guardEditorCallback(stale), true);
  assert.equal(h.records.editorSessions.length, 0);
});

test('parallel duplicate clicks mutate only once and preview rendering errors preserve usable state', async () => {
  const h = await setup(); await h.open();
  const query = h.query('r:emoji:' + h.get().addPayload.premiumEmoji.token + ':select:0');
  await Promise.all([h.flow.handlePremiumEmojiCallback(query), h.flow.handlePremiumEmojiCallback(query)]);
  assert.deepEqual(h.get().addPayload.premiumEmoji.selected, [0]);
  const before = h.clone(h.get().addPayload);
  h.apiState.editError = 'temporary Telegram failure';
  await assert.rejects(() => h.press('select', 1));
  assert.deepEqual(h.get().addPayload, before);
});

test('entry and private-input wiring is present; JavaScript only with bare runtime imports', async () => {
  for (const file of ['editor-premium-emoji','editor-emoji-targets','premium-emoji-text']) {
    const source = fs.readFileSync(new URL('../../lib/' + file + '.js', import.meta.url), 'utf8');
    assert.doesNotMatch(source, /from ['"](?:node:|\.\/|\.\.\/)/);
  }
  assert.match(fs.readFileSync(new URL('../../handlers/message.js', import.meta.url),'utf8'), /handlePremiumEmojiMessage\(message\)/);
  assert.match(fs.readFileSync(new URL('../../handlers/callback_query.js', import.meta.url),'utf8'), /handlePremiumEmojiCallback\(query\)/);
});

test('table field selection inserts into the chosen cell without losing merge or formatting', async () => {
  const h = await setup();
  const block = h.blocks.makeBlock('table', { rows: [[{ text: 'أول', html: '<b>أول</b>', colspan: 2 }, { text: 'second', align: 'center' }]], is_compact: true });
  await h.session.updateEditorSession(1, { blocks: [block] });
  await h.open(); await h.press('select', 0); await h.press('finish'); await h.press('block', 0);
  assert.equal(h.get().addPayload.premiumEmoji.stage, 'fields');
  await h.press('field', 2); // Caption, first cell, second cell.
  await h.press('move', 'left'); await h.press('confirm');
  const saved = h.get().blocks[0];
  assert.equal(saved.data.rows[0][0].colspan, 2);
  assert.equal(saved.data.rows[0][0].html, '<b>أول</b>');
  assert.equal(saved.data.rows[0][1].align, 'center');
  assert.equal(h.text.plainRichText(saved.data.rows[0][1].rich_text), 'secon👍d');
  assert.equal(saved.data.is_compact, true);
});

test('page limit rejects insertion before changing draft or history; stale target cannot overwrite edits', async () => {
  const h = await setup();
  await h.session.updateEditorSession(1, { blocks: [h.blocks.makeBlock('paragraph', { text: 'x'.repeat(25000) })] });
  await h.open(); await h.press('select', 0); await h.press('finish'); await h.press('block', 0);
  assert.equal(h.get().addPayload.premiumEmoji.stage, 'blocks');
  assert.equal(h.get().undoStack.length, 0);
  assert.equal(h.get().blocks[0].data.text.length, 25000);
  assert.ok(h.calls.at(-1).args.show_alert);
  await h.session.updateEditorSession(1, { blocks: [h.blocks.makeBlock('paragraph', { text: 'short' })] });
  await h.press('block', 0);
  h.get().blocks[0].data.text = 'concurrent edit';
  await h.press('confirm');
  assert.equal(h.get().blocks[0].data.text, 'concurrent edit');
  assert.equal(h.get().undoStack.length, 0);
});

test('all generated text containers and native media keep emoji through normalize/reopen', async () => {
  const h = await harness();
  const candidates = [
    h.blocks.makeBlock('details', { summary_html: 'Title', children: [h.blocks.makeBlock('paragraph', { text: 'child' })] }),
    h.blocks.makeBlock('list', { items: [{ text: 'one', has_checkbox: true, is_checked: true }] }),
    h.blocks.makeBlock('blockquote', { quote_html: '<i>quote</i>', credit_html: 'author' }),
    h.blocks.makeBlock('photo', { native: true, native_data: { type: 'photo', photo: [{ file_id: 'photo-file' }] } }),
  ];
  for (const block of candidates) {
    const target = h.targets.emojiTargets(block)[0];
    const changed = h.targets.applyEmojiTarget(block, target, h.movement.insertEmojiAt(target.value, [emoji], h.movement.initialEmojiPosition(target.value)));
    const reopened = JSON.parse(JSON.stringify([changed]));
    h.blocks.normalizeBlocks(reopened);
    assert.match(JSON.stringify(h.renderer.buildInputRichMessage(reopened)), /custom_emoji/);
  }
});
