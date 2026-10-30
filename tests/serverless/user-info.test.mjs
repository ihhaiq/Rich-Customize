import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildUserInfoMessage,
  userInfoText,
} from '../../tgcloud/lib/user-info-copy.js';
import { DEVELOPER_IDS } from '../../tgcloud/lib/developer-access.js';
import { harness } from './harness.mjs';

const locales = [
  'ar','en','es','de','it','pt','nl','pl','uk','ru','tr','ur','hi','id','ja','ko','vi','th','zh-hans','zh-hant',
];

test('unknown account response is translated for every supported locale', () => {
  const synchronizedKeys = [
    'unknown',
    'id',
    'username',
    'noUsername',
    'details',
    'name',
    'subscription',
    'noPhoto',
    'free',
    'profilePhoto',
    'photoError',
    'guestDatabaseError',
    'guestTelegramError',
    'guestInternalError',
    'guestErrorReference',
  ];
  for (const locale of locales) {
    for (const key of synchronizedKeys) {
      const text = userInfoText(locale, key);
      assert.ok(text, `${locale}.${key} must be translated`);
    }
    if (locale !== 'en') {
      for (const key of [
        'guestDatabaseError',
        'guestTelegramError',
        'guestInternalError',
        'guestErrorReference',
      ]) {
        assert.notEqual(
          userInfoText(locale, key),
          userInfoText('en', key),
          `${locale}.${key} must have a localized value`,
        );
      }
    }
  }
  assert.equal(userInfoText('ar-IQ', 'unknown'), 'ما اعرف هذا الحساب');
  assert.match(userInfoText('ar-IQ', 'photoError'), /حدث خطأ/);
  assert.equal(userInfoText('zh-TW', 'unknown'), userInfoText('zh-hant', 'unknown'));
});

test('user info uses ordinary bullet blocks and puts only the photo in details', () => {
  const message = buildUserInfoMessage({
    id: 123456,
    first_name: '🌟 Noor',
    last_name: 'Ali',
    username: 'noor_ali',
  }, 'en', { photoFileId: 'photo-file-id', subscription: 'Plus' });

  const topLevel = message.rich_message.blocks;
  assert.deepEqual(topLevel.slice(0, 4).map((block) => block.type), [
    'paragraph', 'paragraph', 'paragraph', 'paragraph',
  ]);
  assert.deepEqual(topLevel[5], { type: 'divider' });
  assert.equal(topLevel[6].type, 'details');
  assert.equal(topLevel[6].summary, 'Account photo');
  assert.equal(topLevel[6].is_open, true);
  assert.deepEqual(topLevel[6].blocks[0], {
    type: 'photo',
    photo: { type: 'photo', media: 'photo-file-id' },
  });
  assert.match(topLevel[0].text, /• 🆔 Account ID: 123456/);
  assert.deepEqual(topLevel[1].text, {
    type: 'button',
    button: { text: '📋 123456', copy_text: { text: '123456' } },
  });
  assert.equal(topLevel[2].text[1].type, 'url');
  assert.equal(topLevel[2].text[1].text, '🌟 Noor Ali');
  assert.equal(topLevel[2].text[1].url, 'tg://user?id=123456');
  assert.doesNotMatch(JSON.stringify(message.rich_message), /"type":"text_link"/);
  assert.match(topLevel[3].text, /• 🔗 Username: @noor_ali/);
  assert.match(topLevel[4].text, /• 🎖 Subscription tier: Plus/);
});

test('profile without a public username remains identifiable and invalid IDs are rejected', () => {
  const message = buildUserInfoMessage({
    id: 9,
    first_name: 'سارة',
  }, 'ar');

  assert.match(message.text, /اسم المستخدم: لا يوجد/);
  assert.match(message.text, /رتبة الاشتراك: مجاني/);
  assert.deepEqual(message.rich_message.blocks.slice(0, 4).map((block) => block.type), [
    'paragraph', 'paragraph', 'paragraph', 'paragraph',
  ]);
  assert.equal(message.rich_message.blocks.length, 5);
  assert.doesNotMatch(message.text, /لا توجد صورة ملف شخصي/);
  const usernameOnly = buildUserInfoMessage({ id: 10, username: 'sara_name' }, 'ar');
  assert.match(JSON.stringify(usernameOnly.rich_message), /@sara_name/);
  assert.equal(buildUserInfoMessage({ id: 0, first_name: 'Sara' }, 'ar'), null);
});

test('/info shows the Telegram sender ID without requiring a usage profile', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  const message = {
    chat: { id: -100123, type: 'supergroup' },
    from: {
      id: 765432,
      username: 'hxh_aot',
      first_name: 'Noor',
      last_name: 'Ali',
      language_code: 'en',
    },
  };

  await h.info.handleInfoCommand(message, '', 'en');

  const sent = h.calls.find((call) => call.method === 'sendRichMessage');
  assert.equal(sent.args.chat_id, message.chat.id);
  assert.match(JSON.stringify(sent.args.rich_message), /Account ID: 765432/);
  assert.match(JSON.stringify(sent.args.rich_message), /@hxh_aot/);
  assert.equal(h.calls.some((call) => call.method === 'sendMessage'), false);
  assert.equal(buildUserInfoMessage({ id: 0, first_name: 'Sara' }, 'ar'), null);
});

test('a user without a profile photo is shown as ordinary user info with no photo section', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
  });
  h.apiState.profilePhotos['123456'] = { total_count: 0, photos: [] };

  await h.info.handleInfoCommand({
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
  }, '123456', 'en');

  const sent = h.calls.find((call) => call.method === 'sendRichMessage');
  assert.equal(sent.args.rich_message.blocks.length, 5);
  assert.doesNotMatch(JSON.stringify(sent.args.rich_message), /photo|details|No profile photo/);
});

test('photo retrieval failure keeps the user list and adds an error footer', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
  });
  h.apiState.profilePhotoError = 'Telegram photo lookup failed';

  await h.info.handleInfoCommand({
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
  }, '@noor_ali', 'en');

  const sent = h.calls.find((call) => call.method === 'sendRichMessage');
  const blocks = sent.args.rich_message.blocks;
  assert.deepEqual(blocks.slice(0, 4).map((block) => block.type), [
    'paragraph', 'paragraph', 'paragraph', 'paragraph',
  ]);
  assert.match(JSON.stringify(blocks), /Noor/);
  assert.deepEqual(blocks[5], { type: 'divider' });
  assert.deepEqual(blocks[6], {
    type: 'footer',
    text: userInfoText('en', 'photoError'),
  });
});

test('/info and the bot-mention guest syntax are routed before the private editor path', () => {
  const handler = readFileSync(
    new URL('../../tgcloud/handlers/message.js', import.meta.url),
    'utf8',
  );
  const infoRoute = handler.indexOf('infoCommandArgument(message?.text)');
  const privateOnlyEditorPath = handler.indexOf("if (!matchesCommand(command, 'start'))");

  assert.notEqual(infoRoute, -1);
  assert.ok(infoRoute < privateOnlyEditorPath);
  assert.match(handler, /handleInfoCommand\(message, infoArgument, languageCode\)/);
  assert.match(handler, /reportInfoRequestFailure\(message, error, updateId\)/);
  assert.match(handler, /logErrorSafely\('info\.guest', error/);
});

test('/info accepts username and numeric ID targets', () => {
  const source = readFileSync(
    new URL('../../tgcloud/lib/user-info.js', import.meta.url),
    'utf8',
  );
  const start = source.indexOf('function commandTarget');
  const end = source.indexOf('export async function prepareUserInfoMessage', start);
  const parseTarget = new Function(
    'validUserId',
    source.slice(start, end) + '; return commandTarget;',
  )((value) => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });

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

test('guest mention syntax and addressed /info syntax both extract the target', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  assert.equal(h.info.infoCommandArgument('@RichCustomizebot @Some_User'), '@Some_User');
  assert.equal(h.info.infoCommandArgument('/info@RichCustomizebot @Some_User'), '@Some_User');
  assert.equal(h.info.infoCommandArgument('/id'), '');
  assert.equal(h.info.infoCommandArgument('/id@RichCustomizebot'), '');
  assert.equal(h.info.infoCommandArgument('@RichCustomizebot /info'), '');
  assert.equal(h.info.infoCommandArgument('@RichCustomizebot /id'), '');
  assert.equal(h.info.infoCommandArgument('/id @Some_User'), null);
  assert.equal(h.info.infoCommandArgument('@OtherBot @Some_User'), null);
  assert.equal(h.info.infoCommandArgument('/info@OtherBot @Some_User'), null);
  assert.equal(h.info.infoCommandArgument('@RichCustomizebot /page @Some_User'), null);
  assert.equal(h.info.infoCommandArgument('@RichCustomizebot 123456'), null);
});

test('/id shows the sender profile through the same rich info message', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  const message = {
    chat: { id: 765432, type: 'private' },
    from: {
      id: 765432,
      username: 'noor_ali',
      first_name: 'Noor',
      last_name: 'Ali',
      language_code: 'en',
    },
  };

  const argument = h.info.infoCommandArgument('/id');
  await h.info.handleInfoCommand(message, argument, 'en');

  const sent = h.calls.find((call) => call.method === 'sendRichMessage');
  assert.equal(sent.args.chat_id, message.chat.id);
  assert.match(JSON.stringify(sent.args.rich_message), /Account ID: 765432/);
  assert.match(JSON.stringify(sent.args.rich_message), /@noor_ali/);
  assert.match(JSON.stringify(sent.args.rich_message), /Noor Ali/);
});

test('guest_message answers /info mention with one rich guest reply outside bot membership', async () => {
  const h = await harness({ extraModules: { guest: 'handlers/guest_message' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
    lastName: 'Ali',
  });
  h.apiState.profilePhotos['123456'] = {
    total_count: 1,
    photos: [[{ file_id: 'guest-profile-photo' }]],
  };
  const guestUpdate = {
    guest_query_id: 'guest-query-1',
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
    text: '@RichCustomizebot @noor_ali',
  };

  await h.guest.default(guestUpdate, { update: { update_id: 9001 } });

  const replies = h.calls.filter((call) => call.method === 'answerGuestQuery');
  assert.equal(replies.length, 1);
  assert.equal(replies[0].args.guest_query_id, 'guest-query-1');
  assert.equal(replies[0].args.result.type, 'article');
  assert.match(
    JSON.stringify(replies[0].args.result.input_message_content.rich_message),
    /Noor/,
  );
  assert.match(
    JSON.stringify(replies[0].args.result.input_message_content.rich_message),
    /guest-profile-photo/,
  );
  assert.equal(h.calls.some((call) => call.method === 'sendMessage'), false);
  assert.equal(h.calls.some((call) => call.method === 'sendRichMessage'), false);
});

test('guest /info without a target uses the Telegram sender ID even when not stored', async () => {
  const h = await harness({ extraModules: { guest: 'handlers/guest_message' } });

  await h.guest.default({
    guest_query_id: 'guest-query-self-alias',
    chat: { id: -100123, type: 'supergroup' },
    from: {
      id: 765432,
      username: 'hxh_aot',
      first_name: 'Noor',
      last_name: 'Ali',
      language_code: 'en',
    },
    text: '@RichCustomizebot /info',
  }, { update: { update_id: 9003 } });

  const reply = h.calls.find((call) => call.method === 'answerGuestQuery');
  assert.equal(reply.args.result.type, 'article');
  assert.match(
    JSON.stringify(reply.args.result.input_message_content.rich_message),
    /Account ID: 765432/,
  );
  assert.match(
    JSON.stringify(reply.args.result.input_message_content.rich_message),
    /@hxh_aot/,
  );
});

test('guest user info retries without photo when the group forbids photos', async () => {
  const h = await harness({ extraModules: { guest: 'handlers/guest_message' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
    lastName: 'Ali',
  });
  h.apiState.profilePhotos['123456'] = {
    total_count: 1,
    photos: [[{ file_id: 'guest-profile-photo' }]],
  };
  h.apiState.guestQueryErrors.push(
    new h.BotApiError(400, 'CHAT_SEND_PHOTOS_FORBIDDEN'),
  );

  await h.guest.default({
    guest_query_id: 'guest-query-no-photo-permission',
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
    text: '@RichCustomizebot @noor_ali',
  }, { update: { update_id: 9002 } });

  const replies = h.calls.filter((call) => call.method === 'answerGuestQuery');
  assert.equal(replies.length, 2);
  assert.equal(replies[0].args.guest_query_id, 'guest-query-no-photo-permission');
  assert.equal(replies[1].args.guest_query_id, 'guest-query-no-photo-permission');
  assert.match(
    JSON.stringify(replies[0].args.result.input_message_content.rich_message),
    /guest-profile-photo/,
  );
  const fallback = replies[1].args.result.input_message_content.rich_message;
  assert.match(JSON.stringify(fallback), /Noor/);
  assert.doesNotMatch(JSON.stringify(fallback), /guest-profile-photo|Account photo|details/i);
  assert.equal(h.calls.some((call) => call.method === 'sendMessage'), false);
});

test('guest requests distinguish username lookup from an explicitly named page and numeric page code', async () => {
  const h = await harness({ extraModules: { guest: 'handlers/guest_message' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
    lastName: 'Ali',
  });
  h.records.richPages.push({
    pageId: '123456',
    ownerId: 765432,
    title: '@noor_ali',
    blocks: [{ type: 'paragraph', text: 'Saved page content' }],
    buttons: [],
    buttonsPerRow: 1,
  });

  await h.guest.default({
    guest_query_id: 'guest-info-user',
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
    text: '@RichCustomizebot @noor_ali',
  }, { update: { update_id: 9010 } });
  const userResult = h.calls.filter((call) => call.method === 'answerGuestQuery').at(-1).args.result;
  assert.equal(userResult.type, 'article');
  assert.match(JSON.stringify(userResult.input_message_content.rich_message), /Account ID: 123456/);

  await h.guest.default({
    guest_query_id: 'guest-page-name',
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
    text: '@RichCustomizebot /page @noor_ali',
  }, { update: { update_id: 9011 } });
  const namedPageResult = h.calls.filter((call) => call.method === 'answerGuestQuery').at(-1).args.result;
  assert.equal(namedPageResult.id, 'page-123456');
  assert.equal(namedPageResult.title, '@noor_ali');

  await h.guest.default({
    guest_query_id: 'guest-page-code',
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
    text: '@RichCustomizebot 123456',
  }, { update: { update_id: 9012 } });
  const codeResult = h.calls.filter((call) => call.method === 'answerGuestQuery').at(-1).args.result;
  assert.equal(codeResult.id, 'page-123456');

  await h.guest.default({
    guest_query_id: 'guest-info-id',
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
    text: '/info@RichCustomizebot 123456',
  }, { update: { update_id: 9013 } });
  const idResult = h.calls.filter((call) => call.method === 'answerGuestQuery').at(-1).args.result;
  assert.equal(idResult.id, 'guest-user-info');
  assert.match(JSON.stringify(idResult.input_message_content.rich_message), /Account ID: 123456/);
});

test('@RichCustomizebot @username uses the same stored profile lookup as /info', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
    lastName: 'Ali',
  });

  const argument = h.info.infoCommandArgument('@RichCustomizebot @noor_ali');
  assert.equal(argument, '@noor_ali');
  await h.info.handleInfoCommand({
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
  }, argument, 'en');

  const sent = h.calls.find((call) => call.method === 'sendRichMessage');
  assert.equal(sent.args.chat_id, -100123);
  assert.match(JSON.stringify(sent.args.rich_message), /Noor/);
});

test('/info in a group returns the target profile photo and trusted subscription tier', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
    lastName: 'Ali',
  });
  h.records.editorSubscriptions.push({
    userId: 123456,
    plan: 'plus',
    status: 'active',
    source: 'richdonate:verified',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  });
  h.apiState.profilePhotos['123456'] = {
    total_count: 1,
    photos: [[{ file_id: 'profile-small' }, { file_id: 'profile-large' }]],
  };

  await h.info.handleInfoCommand({
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
  }, '123456', 'en');

  const photoRequest = h.calls.find((call) => call.method === 'getUserProfilePhotos');
  assert.deepEqual(photoRequest.args, { user_id: 123456, limit: 1 });
  assert.equal(photoRequest.args.limit, 1);
  const sent = h.calls.find((call) => call.method === 'sendRichMessage');
  assert.equal(sent.args.chat_id, -100123);
  assert.equal(sent.args.rich_message.blocks[0].type, 'paragraph');
  assert.equal(sent.args.rich_message.blocks[5].type, 'divider');
  assert.equal(sent.args.rich_message.blocks[6].summary, 'Account photo');
  assert.equal(sent.args.rich_message.blocks[6].blocks[0].photo.media, 'profile-large');
  assert.match(JSON.stringify(sent.args.rich_message), /Plus/);
});

test('/info shows the configured developer tier instead of downgrading it to Free', async () => {
  const developerId = DEVELOPER_IDS[0];
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  h.records.usageUsers.push({
    userId: developerId,
    username: 'developer',
    firstName: 'Developer',
  });

  await h.info.handleInfoCommand({
    chat: { id: developerId, type: 'private' },
    from: { id: developerId, language_code: 'en' },
  }, String(developerId), 'en');

  const sent = h.calls.find((call) => call.method === 'sendRichMessage');
  assert.match(JSON.stringify(sent.args.rich_message), /Subscription tier: Developer/);
  assert.doesNotMatch(JSON.stringify(sent.args.rich_message), /Subscription tier: Free/);
});

test('/info omits the photo section without an error if the group forbids sending photos', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
  });
  h.apiState.profilePhotos['123456'] = {
    total_count: 1,
    photos: [[{ file_id: 'profile-large' }]],
  };
  h.apiState.richSendErrors = {
    '-100123': [new h.BotApiError(400, 'CHAT_SEND_PHOTOS_FORBIDDEN')],
  };

  await h.info.handleInfoCommand({
    chat: { id: -100123, type: 'supergroup' },
    from: { id: 765432, language_code: 'en' },
  }, '123456', 'en');

  const sends = h.calls.filter((call) => call.method === 'sendRichMessage');
  assert.equal(sends.length, 2);
  assert.equal(sends[0].args.rich_message.blocks[0].type, 'paragraph');
  assert.equal(sends[0].args.rich_message.blocks[5].type, 'divider');
  assert.equal(sends[0].args.rich_message.blocks[6].blocks[0].photo.media, 'profile-large');
  assert.equal(sends[1].args.rich_message.blocks.length, 5);
  assert.doesNotMatch(JSON.stringify(sends[1].args.rich_message), /photo|details|error/i);
  assert.match(JSON.stringify(sends[1].args.rich_message), /Noor/);
  assert.equal(h.calls.some((call) => call.method === 'sendMessage'), false);
});

test('/info does not silently replace a failed Rich Message with plain text', async () => {
  const h = await harness({ extraModules: { info: 'lib/user-info' } });
  h.records.usageUsers.push({
    userId: 123456,
    username: 'noor_ali',
    firstName: 'Noor',
  });
  h.apiState.richSendErrors = {
    '-100123': new h.BotApiError(500, 'Internal server error'),
  };

  await assert.rejects(
    h.info.handleInfoCommand({
      chat: { id: -100123, type: 'supergroup' },
      from: { id: 765432, language_code: 'en' },
    }, '123456', 'en'),
    /Internal server error/,
  );
  assert.equal(h.calls.some((call) => call.method === 'sendMessage'), false);
});
