import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveEditorEntitlement } from '../../tgcloud/lib/subscription-policy.js';
import {
  SCHEDULE_DESTINATION_LIMITS,
  SCHEDULE_MAX_AHEAD_SECONDS,
  parseBaghdadDate,
  scheduleMaxAheadTimestamp,
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
  assert.equal(scheduleMaxAheadTimestamp(developer, NOW), NOW + SCHEDULE_MAX_AHEAD_SECONDS);
  assert.equal(validateScheduleRequest(developer, request(chatIds), NOW).allowed, true);
  assert.equal(validateScheduleRequest(developer, request([0]), NOW).code, 'SCHEDULE_DESTINATION_INVALID');
  assert.equal(validateScheduleRequest(developer, request([chatIds[0], chatIds[0]]), NOW).code, 'SCHEDULE_DESTINATION_DUPLICATE');
});

test('time window is 60 seconds to 4 days, inclusive', () => {
  const free = resolveEditorEntitlement();
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], NOW + 59), NOW).code, 'SCHEDULE_DATE_TOO_SOON');
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], NOW + 60), NOW).allowed, true);
  const max = scheduleMaxAheadTimestamp(free, NOW);
  assert.equal(max, NOW + SCHEDULE_MAX_AHEAD_SECONDS);
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], max), NOW).allowed, true);
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], max + 1), NOW).code, 'SCHEDULE_DATE_TOO_FAR');
  assert.equal(validateScheduleRequest(free, request([chatIds[0]], 'tomorrow'), NOW).code, 'SCHEDULE_DATE_INVALID');
});

test('active paid subscriptions can schedule through two Baghdad calendar months', () => {
  const start = Date.UTC(2026, 9, 25, 10, 38) / 1000;
  const paid = resolveEditorEntitlement({ plan: 'plus', active: true });
  const free = resolveEditorEntitlement();
  const max = scheduleMaxAheadTimestamp(paid, start);
  const localMax = new Date((max + 3 * 60 * 60) * 1000);
  assert.equal(localMax.getUTCFullYear(), 2026);
  assert.equal(localMax.getUTCMonth(), 11);
  assert.equal(localMax.getUTCDate(), 25);
  assert.equal(validateScheduleRequest(paid, request([chatIds[0]], max), start).allowed, true);
  assert.equal(validateScheduleRequest(paid, request([chatIds[0]], max + 1), start).code, 'SCHEDULE_DATE_TOO_FAR');
  assert.equal(
    scheduleMaxAheadTimestamp(resolveEditorEntitlement({ plan: 'golden', active: false }), start),
    start + SCHEDULE_MAX_AHEAD_SECONDS,
  );
  assert.equal(scheduleMaxAheadTimestamp(free, start), start + SCHEDULE_MAX_AHEAD_SECONDS);
});

test('Baghdad date input accepts unambiguous 12-hour dates and infers the next year', () => {
  const now = Date.UTC(2026, 9, 25, 10, 38) / 1000;
  assert.equal(parseBaghdadDate('10-28 10:19 PM', now), Date.UTC(2026, 9, 28, 19, 19) / 1000);
  assert.equal(parseBaghdadDate('10-28 12:00 AM', now), Date.UTC(2026, 9, 27, 21, 0) / 1000);
  assert.equal(parseBaghdadDate('10-28 12:00 PM', now), Date.UTC(2026, 9, 28, 9, 0) / 1000);
  assert.equal(parseBaghdadDate('01-02 10:00 AM', now), Date.UTC(2027, 0, 2, 7, 0) / 1000);
  assert.equal(parseBaghdadDate('02-30 10:00 AM', now), null);
  assert.equal(parseBaghdadDate('10-28 18:00', now), null);
});
