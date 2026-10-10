import test from 'node:test';
import assert from 'node:assert/strict';
import { handleError, HttpError } from '../../functions/_lib/http.js';

test('server configuration errors never reveal BOT_TOKEN to clients',async()=>{
  const response=handleError(new HttpError(500,'BOT_TOKEN is not configured: secret-value'));
  assert.equal(response.status,500);
  const payload=await response.json();
  assert.equal(payload.error.code,'SERVICE_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(payload),/BOT_TOKEN|secret-value/);
});
test('bridge failures retain the HTTP code but hide internal request details',async()=>{
  const response=handleError(new HttpError(502,'Bridge request_id mismatch, request=123456'));
  assert.equal(response.status,502);
  const payload=await response.json();
  assert.equal(payload.retryable,true);
  assert.doesNotMatch(JSON.stringify(payload),/123456|request_id mismatch/);
});
test('normal validation messages remain backward compatible as text',async()=>{
  const response=handleError(new HttpError(400,'Invalid JSON'));
  assert.equal(response.status,400);
  assert.equal(await response.text(),'Invalid JSON');
});
test('unexpected backend exceptions get a safe error object',async()=>{
  const response=handleError(new Error('database password=private'));
  assert.equal(response.status,500);
  const payload=await response.json();
  assert.equal(payload.ok,false);
  assert.doesNotMatch(JSON.stringify(payload),/password|private/);
});
