import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const publishSource = fs.readFileSync(new URL('../../tgcloud/lib/publish-errors.js', import.meta.url), 'utf8');
const operationalSource = fs.readFileSync(new URL('../../tgcloud/lib/operational-errors.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\s*$/gm, '');
const errors = new Function(
  publishSource.replace(/\bexport /g, '') + '\n' + operationalSource.replace(/\bexport /g, '')
  + '\nreturn {explainOperationalError,userOperationalError};',
)();
const { explainOperationalError, userOperationalError } = errors;

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
