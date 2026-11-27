import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('Mini App localization adds support to errors without changing success copy', () => {
  const document = {
    documentElement: {},
    readyState: 'loading',
    addEventListener() {},
  };
  const window = {
    MiniAppLocaleOverrides: {},
    Telegram: { WebApp: { initDataUnsafe: { user: { language_code: 'ar' } } } },
  };
  const context = vm.createContext({ document, navigator: { language: 'en' }, window });
  const source = fs.readFileSync(
    new URL('../../app/miniapp_static/miniapp_i18n.js', import.meta.url),
    'utf8',
  );
  vm.runInContext(source, context);

  const copy = window.MiniAppI18n;
  assert.match(copy.t('media.upload_failed', { error: 'network' }), /@Rlchsupportbot/);
  assert.doesNotMatch(copy.t('media.uploaded', { name: 'photo.jpg' }), /@Rlchsupportbot/);
  assert.match(copy.withSupportContact('opaque server error', true), /@Rlchsupportbot/);
});
