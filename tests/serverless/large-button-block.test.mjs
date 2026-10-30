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
