import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGED_BOT_PLANS,
  MANAGED_BOT_PERMANENT_EXPIRES_AT,
  parseManagedBotPayload,
} from '../../tgcloud/lib/managed-bot-billing-policy.js';

test('Managed Bot catalog uses the approved monthly and permanent Stars prices', () => {
  assert.equal(MANAGED_BOT_PLANS.monthly.amount, 50);
  assert.equal(MANAGED_BOT_PLANS.permanent.amount, 999);
  assert.equal(MANAGED_BOT_PLANS.monthly.durationMs, 30 * 24 * 60 * 60 * 1000);
  assert.equal(MANAGED_BOT_PLANS.permanent.durationMs, null);
});

test('Managed Bot invoice payloads are scoped to a known plan and order', () => {
  assert.deepEqual(parseManagedBotPayload('managed_bot:v1:monthly:mbo_1234567890123456').plan, MANAGED_BOT_PLANS.monthly);
  assert.equal(parseManagedBotPayload('managed_bot:v1:permanent:mbo_1234567890123456').plan, MANAGED_BOT_PLANS.permanent);
  assert.equal(parseManagedBotPayload('managed_bot:v1:monthly:bad'), null);
  assert.equal(parseManagedBotPayload('branding:v1:monthly:mbo_1234567890123456'), null);
});

test('Permanent licenses use a stable far-future expiry understood by Cloudflare', () => {
  assert.ok(MANAGED_BOT_PERMANENT_EXPIRES_AT > Date.now());
});
