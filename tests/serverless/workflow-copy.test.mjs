import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

test('media and channel-access copy is localized with placeholders in every supported locale', async () => {
  const h = await harness();
  const locales = h.i18n.supportedLocales();

  for (const locale of locales) {
    const collage = h.i18n.t(locale, 'media.received', {
      count: 3,
      type: h.i18n.t(locale, 'block.collage'),
    });
    const slideshow = h.i18n.t(locale, 'media.received', {
      count: '3/50',
      type: h.i18n.t(locale, 'block.slideshow'),
    });
    const ready = h.i18n.t(locale, 'publish.bot_added', { title: 'News' });
    const noRights = h.i18n.t(locale, 'publish.bot_no_post_right', { title: 'News' });
    const addHint = h.i18n.t(locale, 'publish.add_hint');
    const collagePrompt = h.i18n.t(locale, 'media.send_collage');
    const slideshowPrompt = h.i18n.t(locale, 'media.send_slideshow');
    const batchPrompt = h.i18n.t(locale, 'media.finish_batch');

    assert.match(collage, /3/);
    assert.match(slideshow, /3\/50/);
    assert.match(ready, /News/);
    assert.match(noRights, /News/);
    assert.ok(addHint.trim(), locale);
    for (const text of [collage, slideshow, ready, noRights, addHint, collagePrompt, slideshowPrompt, batchPrompt]) {
      assert.doesNotMatch(text, /\{(?:count|type|title)\}/, locale);
      assert.ok(text.trim(), locale);
    }
    if (locale !== 'en') {
      for (const key of [
        'media.done',
        'media.add_more',
        'media.send_collage',
        'media.send_slideshow',
        'media.finish_batch',
      ]) {
        assert.notEqual(h.i18n.t(locale, key), h.i18n.t('en', key), locale + ': ' + key);
      }
    }
  }
});
