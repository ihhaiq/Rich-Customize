import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const publishSource = fs.readFileSync(new URL('../../tgcloud/lib/publish-errors.js', import.meta.url), 'utf8');
const operationalSource = fs.readFileSync(new URL('../../tgcloud/lib/operational-errors.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\s*$/gm, '');
const errors = new Function(
  publishSource.replace(/\bexport /g, '') + '\n' + operationalSource.replace(/\bexport /g, '')
  + '\nreturn {explainOperationalError,userOperationalError,isEditorLimitFailure,isDatabaseFailure};',
)();
const { explainOperationalError, userOperationalError, isEditorLimitFailure, isDatabaseFailure } = errors;

test('editor quota rejections are recognized as expected preview failures', () => {
  const failure = new Error('EDITOR_LIMIT:media_attachments:11:10');
  assert.equal(isEditorLimitFailure(failure), true);
  assert.equal(explainOperationalError(failure).expected, true);
  assert.equal(isEditorLimitFailure(new Error('RICH_MESSAGE_TABLE_COLS_TOO_MANY')), false);
});

test('expired callbacks and unchanged edits are harmless, not internal errors', () => {
  for (const [message, code] of [
    ['Bad Request: query is too old and response timeout expired', 'CALLBACK_EXPIRED'],
    ['Bad Request: message is not modified', 'MESSAGE_NOT_MODIFIED'],
  ]) {
    const result = explainOperationalError(new Error(message));
    assert.equal(result.code, code);
    assert.equal(result.silent, true);
    assert.equal(result.expected, true);
  }
});
test('concurrent edits give a clear recovery action', () => {
  const result = explainOperationalError(new Error('Canceled by new edit message request'));
  assert.equal(result.code, 'EDIT_SUPERSEDED');
  assert.equal(result.kind, 'temporary');
  assert.match(result.action, /قفل/);
});
test('deleted panel has an actionable replacement message', () => {
  const result = explainOperationalError(new Error("Bad Request: message to edit not found"));
  assert.equal(result.code, 'MESSAGE_TARGET_UNAVAILABLE');
  assert.match(result.userMessageAr, /المحرر/);
});
test('invalid user links in editor edits are not misreported as publish failures', () => {
  const error = new Error(
    'BotApiError [400]: Bad Request: BUTTON_USER_INVALID | api.editMessageText failed',
  );
  const result = explainOperationalError(error);
  assert.equal(result.code, 'EDITOR_BUTTON_USER_INVALID');
  assert.match(result.reason, /ليس فشلاً في التعرّف/);
  assert.match(result.action, /t\.me/);
});
test('invalid channel participants are recognized as unknown membership checks', () => {
  const result = explainOperationalError(new Error(
    'BotApiError [400]: Bad Request: PARTICIPANT_ID_INVALID | api.getChatMember failed',
  ));
  assert.equal(result.code, 'BROADCAST_MEMBERSHIP_UNKNOWN');
  assert.equal(result.kind, 'expected');
  assert.match(result.reason, /لم تثبت حالة اشتراك/);
  assert.match(result.action, /لا ترسل/);
});
test('known broadcast invariant and input failures have explicit classifications', () => {
  for (const [marker, code, expected] of [
    ['BROADCAST_CONTROL_STATUS_INVALID', 'BROADCAST_CONTROL_STATUS_INVALID', false],
    ['BROADCAST_EXCLUSION_ID_INVALID', 'BROADCAST_EXCLUSION_ID_INVALID', false],
    ['BROADCAST_BOT_ID_UNAVAILABLE', 'BROADCAST_BOT_ID_UNAVAILABLE', false],
    ['BROADCAST_CHANNEL_ADMIN_REQUIRED', 'BROADCAST_CHANNEL_ADMIN_REQUIRED', true],
    ['BROADCAST_MEMBERSHIP_STATUS_INVALID', 'BROADCAST_MEMBERSHIP_STATUS_INVALID', false],
    ['BROADCAST_OUTCOME_CHUNK_INVALID', 'BROADCAST_OUTCOME_CHUNK_INVALID', false],
    ['BROADCAST_OUTCOME_CONFLICT', 'BROADCAST_OUTCOME_CONFLICT', false],
    ['BROADCAST_OUTCOME_SEQUENCE_INVALID', 'BROADCAST_OUTCOME_SEQUENCE_INVALID', false],
    ['BROADCAST_OUTCOME_MISSING', 'BROADCAST_OUTCOME_MISSING', false],
    ['BROADCAST_SOURCE_UNSUPPORTED', 'BROADCAST_SOURCE_UNSUPPORTED', true],
  ]) {
    const result = explainOperationalError(new Error(marker), {
      scope: 'developer.broadcast.delivery',
    });
    assert.equal(result.code, code, marker);
    assert.equal(result.expected, expected, marker);
  }

  const source = explainOperationalError(new Error('Bad Request: MESSAGE_ID_INVALID'), {
    scope: 'developer.broadcast.source',
  });
  assert.equal(source.code, 'BROADCAST_SOURCE_UNAVAILABLE');
});
test('unknown errors in broadcast scopes retain a broadcast-specific classification', () => {
  const internal = explainOperationalError(new Error('new internal broadcast failure'), {
    scope: 'developer.broadcast.report',
  });
  assert.equal(internal.code, 'BROADCAST_INTERNAL_ERROR');
  assert.equal(internal.expected, false);
  assert.match(userOperationalError(
    new Error('new internal broadcast failure'),
    'ar',
    { scope: 'developer.broadcast.report' },
  ), /مسار الإذاعة/);

  const telegram = Object.assign(
    new Error('Bad Request: NEW_TELEGRAM_ERROR'),
    { name: 'BotApiError', code: 400 },
  );
  assert.equal(
    explainOperationalError(telegram, { scope: 'developer.broadcast.delivery' }).code,
    'BROADCAST_TELEGRAM_ERROR',
  );
  assert.equal(
    explainOperationalError(new Error('new callback failure'), {
      scope: 'callback_query',
      callbackData: 'dev:broadcast:confirm',
    }).code,
    'BROADCAST_INTERNAL_ERROR',
  );
  assert.equal(
    explainOperationalError(new Error('new cleanup failure'), {
      scope: 'miniapp_bridge.tick_cleanup',
      extra: 'kind=broadcast',
    }).code,
    'BROADCAST_INTERNAL_ERROR',
  );
});
test('custom emoji and missing packs are differentiated', () => {
  assert.equal(explainOperationalError(new Error('RICH_MESSAGE_EMOJI_INVALID')).code, 'RICH_EMOJI_INVALID');
  assert.equal(explainOperationalError(new Error('STICKERSET_INVALID')).code, 'EMOJI_PACK_UNAVAILABLE');
});
test('closed topics and table limits receive human explanations', () => {
  const topic = explainOperationalError(new Error('BotApiError [400]: Bad Request: TOPIC_CLOSED'));
  assert.equal(topic.code, 'PUBLISH_TOPIC_CLOSED');
  assert.match(topic.userMessageAr, /مغلق/);
  const table = explainOperationalError(new Error('RICH_MESSAGE_TABLE_COLS_TOO_MANY'));
  assert.equal(table.code, 'PUBLISH_TABLE_LIMIT');
});
test('transport errors remain distinguishable from deterministic rejection', () => {
  const result = explainOperationalError(new TypeError('fetch failed'));
  assert.equal(result.code, 'TRANSPORT_FAILURE');
  assert.equal(result.kind, 'temporary');
  assert.match(result.action, /لا تعاود/);
});
test('unexpected code errors are reported as technical defects', () => {
  const e = new ReferenceError('logError is not defined');
  const result = explainOperationalError(e);
  assert.equal(result.code, 'REFERENCE_ERROR');
  assert.equal(result.expected, false);
  assert.match(result.reason, /استيراد/);
  assert.doesNotMatch(userOperationalError(e, 'ar'), /logError|ReferenceError/);
});
test('unknown failures have a safe fallback without revealing technical text', () => {
  const e = new Error('SECRET_INTERNAL_DATABASE_MESSAGE');
  assert.equal(explainOperationalError(e).code, 'UNCLASSIFIED_ERROR');
  assert.doesNotMatch(userOperationalError(e, 'ar'), /SECRET_INTERNAL_DATABASE_MESSAGE/);
  assert.match(userOperationalError(e, 'en'), /contact support/i);
});

test('SQLite outages receive a safe, retryable notice without leaking details', () => {
  for (const failure of [
    new Error('Sqlite error'),
    Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }),
    new Error('no such table: editor_sessions'),
  ]) {
    assert.equal(isDatabaseFailure(failure), true);
    const result = explainOperationalError(failure);
    assert.equal(result.code, 'DATABASE_UNAVAILABLE');
    assert.equal(result.kind, 'temporary');
    assert.match(userOperationalError(failure, 'ar'), /قاعدة البيانات/);
    assert.match(userOperationalError(failure, 'en'), /temporarily unavailable/i);
    assert.doesNotMatch(userOperationalError(failure, 'en'), /editor_sessions|Sqlite error/i);
  }
  assert.equal(isDatabaseFailure(new Error('Telegram Bad Request: CHAT_NOT_FOUND')), false);
});

test('editor validation failures are actionable and never shown as raw exceptions', () => {
  for (const [message, code] of [
    ['EDITOR_LIMIT:blocks:31:30', 'EDITOR_LIMIT_REACHED'],
    ['native photo block has no reusable file_id', 'EDITOR_MEDIA_MISSING'],
    ['table block has no cells', 'EDITOR_BLOCK_INVALID'],
    ['Invalid Huffman code', 'BACKUP_CORRUPT'],
    ['PAGE_NOT_FOUND', 'PAGE_NOT_FOUND'],
  ]) {
    const result = explainOperationalError(new Error(message));
    assert.equal(result.code, code);
    assert.equal(result.expected, true);
    assert.notEqual(userOperationalError(new Error(message), 'ar'), message);
  }
});
