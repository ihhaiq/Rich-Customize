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

test('Mini App converts saved literal emoji codes when rich text, list, and table editors render', () => {
  const inlineTools = fs.readFileSync(new URL('inline_text_tools.js', root), 'utf8');
  const livePreview = fs.readFileSync(new URL('live_preview.js', root), 'utf8');
  assert.match(inlineTools, /requestAnimationFrame\(\(\) => \{\s*if \(editor\.isConnected\) window\.RichCustomEmojiCode\?\.convertEditor\?\.\(editor\);/);
  assert.equal((livePreview.match(/if \(editor\.isConnected\) window\.RichCustomEmojiCode\?\.convertEditor\?\.\(editor\);/g) || []).length, 2);
});

test('custom emoji previews render even if the external Unicode emoji catalog is unavailable', async () => {
  const renderer = fs.readFileSync(new URL('apple_inline_emoji.js', root), 'utf8');
  const scheduleEditor = renderer.slice(
    renderer.indexOf('function scheduleEditor(editor) {'),
    renderer.indexOf('\n  function scheduleAll()', renderer.indexOf('function scheduleEditor(editor) {')),
  );
  const scheduleAll = renderer.slice(
    renderer.indexOf('function scheduleAll() {'),
    renderer.indexOf('\n  // Existing rich-text serialization', renderer.indexOf('function scheduleAll() {')),
  );
  assert.ok(scheduleEditor.indexOf('decorateEditor(editor);') < scheduleEditor.indexOf('await loadCatalog();'));
  assert.ok(scheduleAll.indexOf('forEach(decorateEditor);') < scheduleAll.indexOf('await loadCatalog();'));

  const frames = [];
  const previewRequests = [];
  const selectionChanges = [];
  const tag = {
    isConnected:true,
    textContent:'👍',
    dataset:{},
    style:{},
    classList:{add(){}},
    getAttribute:name=>name === 'emoji-id' ? '5368324170671202286' : null,
    setAttribute(){},
  };
  const editor = {
    isConnected:true,
    matches:selector=>selector.includes('.rich-inline-editor'),
    contains:()=>false,
    querySelectorAll:selector=>selector === 'tg-emoji[emoji-id]' ? [tag] : [],
  };
  class TestNode {
    cloneNode() {}
  }
  const window = {
    RichCustomEmojiPreview:{
      getBlob:async ({custom_emoji_id})=>{
        previewRequests.push(custom_emoji_id);
        return {size:1};
      },
    },
    addEventListener(){},
    getSelection:()=>({
      rangeCount:1,
      isCollapsed:true,
      getRangeAt:()=>({startContainer:editor,endContainer:editor,startOffset:0,endOffset:0}),
      removeAllRanges:()=>selectionChanges.push('removeAllRanges'),
      addRange:()=>selectionChanges.push('addRange'),
    }),
  };
  const document = {
    addEventListener(){},
    getElementById:()=>null,
    createRange:()=>({
      setStart(){},
      setEnd(){},
    }),
  };
  editor.nodeType=1;
  editor.childNodes=[tag];
  editor.contains=node=>node===editor||node===tag;
  tag.parentNode=editor;
  tag.matches=selector=>selector==='tg-emoji[emoji-id]';
  vm.runInNewContext(renderer, {
    window,
    document,
    Node:Object.assign(TestNode,{ELEMENT_NODE:1,TEXT_NODE:3}),
    NodeFilter:{SHOW_TEXT:4},
    Intl,
    URL:{createObjectURL:()=>'blob:custom-emoji'},
    requestAnimationFrame:callback=>{frames.push(callback);return frames.length;},
    fetch:async()=>{throw new Error('Unicode catalog unavailable');},
  });

  window.RichAppleInlineEmoji.decorate(editor);
  frames[0]();
  await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(previewRequests,['5368324170671202286']);
  assert.equal(tag.dataset.customEmojiRendered,'1');
  assert.equal(tag.style.backgroundImage,'url("blob:custom-emoji")');
  assert.deepEqual(selectionChanges,[]);
});

test('adding an already-saved emoji pack checks Serverless state before posting again', () => {
  const picker = fs.readFileSync(new URL('apple_emoji_picker.js', root), 'utf8');
  const addHandler = picker.slice(
    picker.indexOf('card.addEventListener("submit"'),
    picker.indexOf('\n    });', picker.indexOf('card.addEventListener("submit"')),
  );
  const accessRefresh = addHandler.indexOf('const access = await loadPackAccessFromServer()');
  const savedPackCheck = addHandler.indexOf('access.custom_emoji_packs.includes(requestedPackName)');
  const savedPackRead = addHandler.indexOf('fetchPackFromServer(requestedPackName)');
  const addRequest = addHandler.indexOf('fetch("/miniapp/api/custom-emoji/pack"');

  assert.ok(accessRefresh >= 0);
  assert.ok(savedPackCheck > accessRefresh && savedPackCheck < addRequest);
  assert.ok(savedPackRead > savedPackCheck && savedPackRead < addRequest);
});

test('Apple emoji decoration leaves IME composition and an unmodified caret alone', () => {
  const renderer = fs.readFileSync(new URL('apple_inline_emoji.js', root), 'utf8');
  const start = renderer.indexOf('function decorateEditor(editor) {');
  const end = renderer.indexOf('\n  function scheduleEditor(editor)', start);
  assert.ok(start >= 0 && end > start);
  const decorateEditor = renderer.slice(start, end);
  const editor = {isConnected:true,matches:()=>true};
  const calls = [];
  const run = composing => {
    const context = {
      composingEditors:new WeakSet(composing ? [editor] : []),
      EDITOR_SELECTOR:'.rich-inline-editor,.rich-table-cell-editor',
      decorateCustomEmoji:()=>calls.push('decorate'),
      emojiMap:null,
      selectionSnapshot:()=>calls.push('snapshot'),
      restoreSelection:()=>calls.push('restore'),
    };
    vm.runInNewContext(`${decorateEditor}; decorateEditor(editor);`, {
      ...context,
      editor,
    });
  };

  run(false);
  assert.deepEqual(calls,['decorate']);
  calls.length=0;
  run(true);
  assert.deepEqual(calls,[]);
  assert.match(renderer,/document\.addEventListener\("compositionstart"[\s\S]*composingEditors\.add/);
  assert.match(renderer,/document\.addEventListener\("compositionend"[\s\S]*composingEditors\.delete/);
});

test('Details titles use the shared rich-text editor and preserve custom emoji metadata', () => {
  const nested = fs.readFileSync(new URL('details_nested_editor.js', root), 'utf8');
  const inlineTools = fs.readFileSync(new URL('inline_text_tools.js', root), 'utf8');
  const styles = fs.readFileSync(new URL('details_nested_editor.css', root), 'utf8');
  assert.match(nested, /function summaryEditor\(block/);
  assert.match(nested, /details-title-input rich-inline-editor/);
  assert.match(nested, /d\.summary_rich_text = null/);
  assert.match(inlineTools, /richTextToHtml/);
  assert.match(inlineTools, /serializeEditor/);
  assert.match(styles, /details-title-input tg-emoji\.custom-inline-emoji/);
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
  assert.match(inlineTools, /window\.RichInlineTextTools = Object\.freeze\(\{sanitizeInlineHtml,richTextToHtml,serializeEditor\}\)/);
  assert.match(bridge, /CUSTOM_EMOJI_STATE_CONFLICT/);
  assert.doesNotMatch(picker, /catch \(error\) \{\s*if \(typeof toast === "function"\) toast\(mt\("emoji\.pack_load_failed"\)\)/);
});
