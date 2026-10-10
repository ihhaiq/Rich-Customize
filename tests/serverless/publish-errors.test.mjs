import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePublishError, publishFailureMessage, isDefinitePublishRejection,
  shouldForgetDestination, EXPECTED_PUBLISH_FAILURES,
} from '../../tgcloud/lib/publish-errors.js';

const botError=(description,code=400)=>({
  name:'BotApiError',
  message:'BotApiError ['+code+']: Bad Request: '+description,
  description:'Bad Request: '+description,
  error_code:code,
});
test('closed topic gets useful Arabic reason and preserves the destination',()=>{
  const failure=normalizePublishError(botError('TOPIC_CLOSED'),{kind:'chat'});
  assert.equal(failure.code,'PUBLISH_TOPIC_CLOSED');
  assert.match(publishFailureMessage(failure,'ar'),/مغلق/);
  assert.equal(shouldForgetDestination(failure.code),false);
  assert.equal(isDefinitePublishRejection(botError('TOPIC_CLOSED')),true);
});
test('deleted and nonexistent topics have distinct classifications',()=>{
  assert.equal(normalizePublishError(botError('TOPIC_DELETED'),{kind:'chat'}).code,'PUBLISH_TOPIC_DELETED');
  assert.equal(normalizePublishError(botError('MESSAGE_THREAD_ID_INVALID'),{kind:'chat'}).code,'PUBLISH_THREAD_INVALID');
});
test('invalid table dimensions are actionable',()=>{
  const failure=normalizePublishError(botError('RICH_MESSAGE_TABLE_COLS_TOO_MANY'),{kind:'chat'});
  assert.equal(failure.code,'PUBLISH_TABLE_LIMIT');
  assert.match(publishFailureMessage(failure,'ar'),/الجدول/);
});
test('missing rights removes destination but closed topic does not',()=>{
  const noRights=normalizePublishError(botError('Forbidden: bot is not an administrator',403),{kind:'chat'});
  assert.equal(noRights.code,'PUBLISH_RIGHTS_MISSING');
  assert.equal(shouldForgetDestination(noRights.code),true);
  assert.equal(shouldForgetDestination('PUBLISH_TOPIC_CLOSED'),false);
});
test('rate limit includes Telegram retry_after but preserves destination',()=>{
  const e=normalizePublishError({error_code:429,description:'Too Many Requests',parameters:{retry_after:17}},{kind:'chat'});
  assert.equal(e.code,'PUBLISH_RATE_LIMITED');
  assert.equal(e.retry_after,17);
  assert.match(publishFailureMessage(e,'ar'),/17/);
  assert.equal(shouldForgetDestination(e.code),false);
  assert.equal(isDefinitePublishRejection(e),true);
});
test('group migration retains Telegram replacement id',()=>{
  const e=normalizePublishError({description:'group chat was migrated',parameters:{migrate_to_chat_id:-100123}},{kind:'chat'});
  assert.equal(e.code,'PUBLISH_CHAT_MIGRATED');
  assert.equal(e.migrate_to_chat_id,-100123);
});
test('transport uncertainty is never treated as definite rejection',()=>{
  const error=new TypeError('fetch failed');
  const normalized=normalizePublishError(error,{kind:'chat'});
  assert.equal(normalized.code,'PUBLISH_FAILED');
  assert.equal(isDefinitePublishRejection(error),false);
  assert.equal(shouldForgetDestination(normalized.code),false);
});
test('already classified errors are idempotent',()=>{
  const e=normalizePublishError(botError('TOPIC_CLOSED'),{kind:'chat'});
  assert.equal(normalizePublishError(e,{kind:'chat'}),e);
  assert.ok(EXPECTED_PUBLISH_FAILURES.has(e.code));
});
