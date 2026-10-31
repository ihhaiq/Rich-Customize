import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../app/miniapp_static/', import.meta.url);
const helperSource = fs.readFileSync(new URL('custom_emoji_code.js', root), 'utf8');

test('Mini App parses HTML and Markdown custom-emoji codes into safe preview HTML', () => {
  const context = {window:{}};
  vm.runInNewContext(helperSource, context);
  const parsed = context.window.RichCustomEmojiCode.parseText(
    'Hello <tg-emoji emoji-id="5368324170671202286">👍</tg-emoji> ![🔥](tg://emoji?id=5368324170671202287)',
  );
  assert.equal(parsed.text, 'Hello 👍 🔥');
  assert.equal(parsed.changed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.richText)), [
    'Hello ',
    {type:'custom_emoji', custom_emoji_id:'5368324170671202286', alternative_text:'👍'},
    ' ',
    {type:'custom_emoji', custom_emoji_id:'5368324170671202287', alternative_text:'🔥'},
  ]);
  assert.equal(
    parsed.html,
    'Hello <tg-emoji emoji-id="5368324170671202286">👍</tg-emoji> '
      + '<tg-emoji emoji-id="5368324170671202287">🔥</tg-emoji>',
  );
  assert.equal(parsed.replacements.length, 2);
});

test('Mini App leaves malformed codes literal and escapes surrounding HTML', () => {
  const context = {window:{}};
  vm.runInNewContext(helperSource, context);
  const parsed = context.window.RichCustomEmojiCode.parseText(
    '<script>x</script> ![x](tg://emoji?id=0)',
  );
  assert.equal(parsed.changed, false);
  assert.equal(parsed.html, '&lt;script&gt;x&lt;/script&gt; ![x](tg://emoji?id=0)');
});

test('Mini App rich text and table editors convert typed codes before serialization', () => {
  const inlineTools = fs.readFileSync(new URL('inline_text_tools.js', root), 'utf8');
  const livePreview = fs.readFileSync(new URL('live_preview.js', root), 'utf8');
  const emojiRenderer = fs.readFileSync(new URL('apple_inline_emoji.js', root), 'utf8');
  const emojiStyles = fs.readFileSync(new URL('apple_inline_emoji.css', root), 'utf8');
  assert.match(inlineTools, /RichCustomEmojiCode\?\.convertEditor\?\.\(editor\)/);
  assert.match(livePreview, /RichCustomEmojiCode\?\.convertEditor\?\.\(editor\)/);
  assert.match(livePreview, /rich-table-cell-editor rich-inline-editor/);
  assert.match(emojiRenderer, /customEmojiPreviewFailed/);
  assert.match(emojiStyles, /data-custom-emoji-preview-failed="1"/);
  assert.match(fs.readFileSync(new URL('editor.html', root), 'utf8'), /custom_emoji_code\.js/);
});

test('Mini App intercepts code paste as plain text and converts before editor sync', () => {
  const helper = fs.readFileSync(new URL('custom_emoji_code.js', root), 'utf8');
  const picker = fs.readFileSync(new URL('apple_emoji_picker.js', root), 'utf8');
  const nestedEditor = fs.readFileSync(new URL('details_nested_editor.js', root), 'utf8');
  const inlineTools = fs.readFileSync(new URL('inline_text_tools.js', root), 'utf8');
  const bridge = fs.readFileSync(new URL('../../tgcloud/lib/miniapp-bridge.js', import.meta.url), 'utf8');
  assert.match(helper, /clipboardCodeText/);
  assert.match(helper, /clipboardData\?\.getData\?\.\('text\/plain'\)/);
  assert.match(helper, /clipboardData\?\.getData\?\.\('text\/html'\)/);
  assert.match(helper, /event\.preventDefault\(\)/);
  assert.match(helper, /convertEditor\(editor\)/);
  assert.match(helper, /document\.addEventListener\('paste', handlePaste\)/);
  assert.match(picker, /custom_emoji\.pack_sync/);
  assert.match(picker, /await loadPackAccessFromServer\(\)/);
  assert.match(picker, /CUSTOM_EMOJI_PACK_LIMIT/);
  assert.ok(
    picker.indexOf('await loadPackAccessFromServer()')
      < picker.indexOf('fetch("/miniapp/api/custom-emoji/pack"'),
    'legacy packs must synchronize before a new pack is claimed',
  );
  assert.match(nestedEditor, /details-child-text live-editor rich-inline-editor/);
  assert.match(nestedEditor, /RichCustomEmojiCode\?\.convertEditor\?\.\(editor\)/);
  assert.match(nestedEditor, /details-child-list-item/);
  assert.match(nestedEditor, /RichCustomEmojiCode\?\.convertEditor\?\.\(editor\)/);
  assert.match(inlineTools, /window\.RichInlineTextTools = Object\.freeze\(\{sanitizeInlineHtml\}\)/);
  assert.match(bridge, /CUSTOM_EMOJI_STATE_CONFLICT/);
  assert.doesNotMatch(picker, /catch \(error\) \{\s*if \(typeof toast === "function"\) toast\(mt\("emoji\.pack_load_failed"\)\)/);
});
