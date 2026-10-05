import test from 'node:test';
import assert from 'node:assert/strict';
import { MARKETING_COPY, marketingCopy } from '../../lib/marketing-copy.js';

const LOCALES = [
  'ar','en','es','de','it','pt','nl','pl','uk','ru',
  'tr','ur','hi','id','ja','ko','vi','th','zh-hans','zh-hant',
];

test('marketing landing copy covers every supported locale and campaign', () => {
  assert.deepEqual(Object.keys(MARKETING_COPY).sort(), [...LOCALES].sort());

  for (const locale of LOCALES) {
    const copy = MARKETING_COPY[locale];
    assert.ok(copy.detailsTitle);
    assert.equal(copy.detailsItems.length, 3);
    assert.ok(copy.startButton);
    assert.ok(copy.examplesButton);

    for (const source of ['ad_a', 'ad_b', 'ad_c']) {
      const campaign = copy.campaigns[source];
      assert.ok(campaign.heading, locale + ' ' + source + ' heading');
      assert.ok(campaign.body, locale + ' ' + source + ' body');
      assert.ok(campaign.note, locale + ' ' + source + ' note');
    }
  }
});

test('campaign copy is actually selected by locale', () => {
  const ar = marketingCopy('ar', 'ad_c');
  const ru = marketingCopy('ru', 'ad_c');
  const en = marketingCopy('en', 'ad_c');

  assert.match(ar.campaign.body, /تليكرام/);
  assert.doesNotMatch(ar.campaign.body, /Telegram/);
  assert.match(ru.campaign.heading, /[А-Яа-яЁё]/);
  assert.doesNotMatch(ru.campaign.heading + ru.campaign.body, /[\u0600-\u06FF]/);
  assert.notEqual(ru.campaign.heading, ar.campaign.heading);
  assert.notEqual(en.campaign.heading, ar.campaign.heading);
});

test('unknown locale and campaign have safe fallbacks', () => {
  assert.equal(marketingCopy('xx', 'ad_a').campaign.heading, MARKETING_COPY.en.campaigns.ad_a.heading);
  assert.equal(marketingCopy('ru', 'unknown').campaign.heading, MARKETING_COPY.ru.campaigns.ad_c.heading);
});
