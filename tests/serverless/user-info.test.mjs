import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildUserInfoMessage,
  userInfoText,
} from '../../tgcloud/lib/user-info-copy.js';

const locales = [
  'ar','en','es','de','it','pt','nl','pl','uk','ru','tr','ur','hi','id','ja','ko','vi','th','zh-hans','zh-hant',
];

test('unknown account response is translated for every supported locale', () => {
  for (const locale of locales) {
    const text = userInfoText(locale, 'unknown');
    assert.ok(text);
    if (locale !== 'en') assert.notEqual(text, userInfoText('en', 'unknown'));
  }
  assert.equal(userInfoText('ar-IQ', 'unknown'), 'ما اعرف هذا الحساب');
  assert.equal(userInfoText('zh-TW', 'unknown'), userInfoText('zh-hant', 'unknown'));
});

test('user profile message links the complete display name to the Telegram account', () => {
  const message = buildUserInfoMessage({
    id: 123456,
    first_name: '🌟 Noor',
    last_name: 'Ali',
    username: 'noor_ali',
  }, 'en');

  assert.equal(message.text, 'Account ID: 123456\n🌟 Noor Ali\nUsername: @noor_ali');
  const entity = message.entities[0];
  assert.equal(entity.type, 'text_link');
  assert.equal(
    message.text.slice(entity.offset, entity.offset + entity.length),
    '🌟 Noor Ali',
  );
  assert.equal(entity.url, 'tg://user?id=123456');
});

test('profile without a public username remains identifiable and invalid profiles are rejected', () => {
  const message = buildUserInfoMessage({
    id: 9,
    first_name: 'سارة',
  }, 'ar');

  assert.match(message.text, /اسم المستخدم: لا يوجد/);
  assert.equal(buildUserInfoMessage({ id: 9, username: 'sara_name' }, 'ar'), null);
  assert.equal(buildUserInfoMessage({ id: 0, first_name: 'Sara' }, 'ar'), null);
});

test('/info is routed before the private-chat-only editor path', () => {
  const handler = readFileSync(
    new URL('../../tgcloud/handlers/message.js', import.meta.url),
    'utf8',
  );
  const infoRoute = handler.indexOf("matchesCommand(command, 'info')");
  const privateOnlyEditorPath = handler.indexOf("if (!matchesCommand(command, 'start'))");

  assert.notEqual(infoRoute, -1);
  assert.ok(infoRoute < privateOnlyEditorPath);
  assert.match(handler, /handleInfoCommand\(message, commandArgument\(message\?\.text, 'info'\), languageCode\)/);
});

test('/info accepts username and numeric ID targets', () => {
  const source = readFileSync(
    new URL('../../tgcloud/lib/user-info.js', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function validUserId');
  const end = source.indexOf('export async function handleInfoCommand');
  const parseTarget = new Function(
    source.slice(start, end) + '; return commandTarget;',
  )();

  assert.deepEqual(parseTarget({}, '@Some_User'), {
    kind: 'username',
    username: 'Some_User',
  });
  assert.deepEqual(parseTarget({}, '123456'), {
    kind: 'id',
    id: 123456,
  });
  assert.deepEqual(parseTarget({}, 'not-a-user'), { kind: 'invalid' });
});
