import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './harness.mjs';

function sourcePairs() {
  const pairs = new Map();
  for (const file of ['i18n', 'editor-import', 'editor-renderer']) {
    const source = readFileSync('tgcloud/lib/' + file + '.js', 'utf8');
    const pattern = /(?:\bw\(|\bwords\([^,]*,)\s*('(?:\\.|[^'\\])*')\s*,\s*('(?:\\.|[^'\\])*')/g;
    for (const [, ar, en] of source.matchAll(pattern)) {
      const decode = value => new Function('return ' + value)();
      pairs.set(decode(en), decode(ar));
    }
  }
  return pairs;
}

test('all 20 tutorial locales cover every UI, lesson and starter-content string', async () => {
  const h = await harness({ extraModules: { tutorialI18n: 'lib/i18n', copy: 'lib/i18n', model: 'lib/editor-import', view: 'lib/editor-renderer', store: 'lib/editor-session' } });
  const pairs = sourcePairs();
  assert.equal(pairs.size, 98, 'review new tutorial strings and translate them in every catalog');
  const locales = h.i18n.supportedLocales();
  assert.deepEqual(Object.keys(h.tutorialI18n.TUTORIAL_TRANSLATIONS).sort(), Array.from(locales).filter(l => !['ar', 'en'].includes(l)).sort());
  for (const locale of locales) {
    const catalog = h.tutorialI18n.TUTORIAL_TRANSLATIONS[locale];
    if (catalog) assert.deepEqual(Object.keys(catalog).sort(), [...pairs.keys()].sort(), locale);
    for (const [en, ar] of pairs) {
      const translated = h.tutorialI18n.tutorialWords(locale, ar, en);
      assert.ok(translated.trim(), locale + ': ' + en);
      if (catalog) {
        assert.equal(translated, catalog[en]);
        assert.notEqual(translated, en, locale + ': unintended English fallback');
      }
      for (const marker of ['CBD', '[x]', '[ ]', '|', '64']) {
        if (en.includes(marker)) assert.ok(translated.includes(marker), locale + ': lost ' + marker);
      }
      assert.doesNotMatch(translated, /inline|إنلاين|انلاين/i);
    }
    const tasks = h.model.templateBlocks('task_list', locale)[1].data.items;
    assert.equal(tasks.filter(item => item.is_checked).length, 2, locale);
    const table = h.model.templateBlocks('heading_table', locale)[1];
    assert.ok(h.renderer.buildInputRichMessage([table]).blocks.length);
    const state = h.store.initialTutorial(123, 123, 10);
    state.blocks = h.model.templateBlocks('regular_post', locale);
    state.step = 'complete';
    const view = h.view.tutorialView(state, locale);
    assert.equal(Boolean(view.rich_message.is_rtl), ['ar', 'ur'].includes(locale));
    assert.ok(h.copy.tutorialCopy(locale).cbd.includes('CBD'));
  }
  assert.equal(h.copy.tutorialCopy('zh-TW').entry, h.copy.tutorialCopy('zh-hant').entry);
  assert.equal(h.copy.tutorialCopy('pt-BR').entry, h.copy.tutorialCopy('pt').entry);
  assert.equal(h.copy.tutorialCopy('ar-IQ').entry, 'شلون استعمل البوت 🤔');
  assert.equal(h.copy.tutorialCopy('fr').entry, h.copy.tutorialCopy('en').entry);
});

test('subscriber-only CBD restores the original Arabic popup and still denies non-members', async () => {
  const h = await harness({ extraModules: { navigation: 'lib/page-navigation' } });
  const query = { id: 'restricted', from: { id: 333, language_code: 'ar-IQ' }, message: { message_id: 7, chat: { id: -100987, type: 'supergroup' } }, data: 'r:cbds:missing' };
  h.apiState.members = { '333': { status: 'left' } };
  await h.navigation.handlePageNavigationCallback(query);
  let answer = h.calls.filter(call => call.method === 'answerCallbackQuery').at(-1).args;
  assert.equal(answer.text, 'انت مو من المقربين ابتعد عني .... ');
  assert.equal(answer.show_alert, true);
  assert.equal(h.calls.filter(call => call.method === 'sendRichMessage').length, 0);
  await h.navigation.handlePageNavigationCallback({ ...query, from: { ...query.from, language_code: 'en' } });
  answer = h.calls.filter(call => call.method === 'answerCallbackQuery').at(-1).args;
  assert.equal(answer.text, 'You are not subscribed.');
  h.apiState.members['333'] = { status: 'member' };
  await h.navigation.handlePageNavigationCallback(query);
  answer = h.calls.filter(call => call.method === 'answerCallbackQuery').at(-1).args;
  assert.notEqual(answer.text, 'انت مو من المقربين ابتعد عني .... ');
});
