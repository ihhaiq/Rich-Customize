import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEditorEntitlement } from '../../tgcloud/lib/subscription-policy.js';
import {
  SCHEDULE_DESTINATION_LIMITS,
  SCHEDULE_MAX_AHEAD_SECONDS,
  scheduleDestinationLimit,
  validateScheduleRequest,
} from '../../tgcloud/lib/schedule-policy.js';

const NOW = 1_800_000_000;
const chatIds = [-1001111111111, -1002222222222, -1003333333333];
const request = (ids, at = NOW + 600) => ({ chatIds: ids, sendAt: at });

test('free supports one or two destinations and rejects three', () => {
  const free = resolveEditorEntitlement();
  assert.equal(scheduleDestinationLimit(free), 2);
  assert.equal(validateScheduleRequest(free, request(chatIds.slice(0, 1)), NOW).allowed, true);
  assert.equal(validateScheduleRequest(free, request(chatIds.slice(0, 2)), NOW).allowed, true);
  assert.deepEqual(validateScheduleRequest(free, request(chatIds), NOW), {
    allowed: false, code: 'SCHEDULE_PLAN_LIMIT', limit: 2,
  });
});

test('unverified paid plan cannot bypass free scheduling limit', () => {
  const fake = resolveEditorEntitlement({ plan: 'golden', active: false });
  assert.equal(validateScheduleRequest(fake, request(chatIds), NOW).code, 'SCHEDULE_PLAN_LIMIT');
  assert.deepEqual(SCHEDULE_DESTINATION_LIMITS, { free: 2, plus: 5, golden: 15 });
});

test('active Plus and Golden use their proposed destination limits', () => {
  for (const [plan, max] of [['plus', 5], ['golden', 15]]) {
    const entitlement = resolveEditorEntitlement({ plan, active: true });
    assert.equal(scheduleDestinationLimit(entitlement), max);
    assert.equal(validateScheduleRequest(entitlement, request(Array.from({ length: max }, (_, i) => -(i + 1))), NOW).allowed, true);
    assert.equal(validateScheduleRequest(entitlement, request(Array.from({ length: max + 1 }, (_, i) => -(i + 1))), NOW).code, 'SCHEDULE_PLAN_LIMIT');
  }
});

test('developer quota exemption does not bypass date and input validation', () => {
  const developer = resolveEditorEntitlement({ developer: true });
  assert.equal(scheduleDestinationLimit(developer), null);
  assert.equal(validateScheduleRequest(developer, request(chatIds), NOW).allowed, true);
  assert.equal(validateScheduleRequest(developer, request([0]), NOW).code, 'SCHEDULE_DESTINATION_INVALID');
  assert.equal(validateScheduleRequest(developer, request([chatIds[0], chatIds[0]]), NOW).code, 'SCHEDULE_DESTINATION_DUPLICATE');
});

test('time window is 60 seconds to 4 days, inclusive', () => {
  const free = resolveEditorEntitlement();
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], NOW + 59), NOW).code, 'SCHEDULE_DATE_TOO_SOON');
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], NOW + 60), NOW).allowed, true);
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], NOW + SCHEDULE_MAX_AHEAD_SECONDS), NOW).allowed, true);
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], NOW + SCHEDULE_MAX_AHEAD_SECONDS + 1), NOW).code, 'SCHEDULE_DATE_TOO_FAR');
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], 'tomorrow'), NOW).code, 'SCHEDULE_DATE_INVALID');
});
