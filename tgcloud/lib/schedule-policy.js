// Scheduling is not active yet: this module defines server-side validation only.
// Resolve entitlement through getEditorEntitlement(ownerId), never from browser input.
import { normalizePlan } from './subscription-policy.js';

// Free limit is approved. Paid limits are proposals pending product approval.
// A scheduling runner is required before this policy is wired into user actions.
export const SCHEDULE_DESTINATION_LIMITS = Object.freeze({
  free: 2,
  plus: 5,
  golden: 15,
});
export const SCHEDULE_MIN_LEAD_SECONDS = 60;
export const SCHEDULE_MAX_AHEAD_SECONDS = 4 * 24 * 60 * 60;

export function scheduleDestinationLimit(entitlement) {
  if (entitlement?.unlimitedProductQuotas === true) return null;
  return SCHEDULE_DESTINATION_LIMITS[normalizePlan(entitlement?.plan)];
}

export function validateScheduleRequest(
  entitlement,
  { chatIds, sendAt } = {},
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const limit = scheduleDestinationLimit(entitlement);
  if (!Array.isArray(chatIds) || chatIds.length < 1) {
    return { allowed: false, code: 'SCHEDULE_DESTINATIONS_REQUIRED', limit };
  }
  // Fail closed on duplicate/invalid targets, rather than counting duplicates
  // as separate sends or accepting unsafe Number rounding.
  if (!chatIds.every(id => Number.isSafeInteger(id) && id !== 0)) {
    return { allowed: false, code: 'SCHEDULE_DESTINATION_INVALID', limit };
  }
  if (new Set(chatIds).size !== chatIds.length) {
    return { allowed: false, code: 'SCHEDULE_DESTINATION_DUPLICATE', limit };
  }
  if (limit !== null && chatIds.length > limit) {
    return { allowed: false, code: 'SCHEDULE_PLAN_LIMIT', limit };
  }
  if (!Number.isSafeInteger(nowSeconds) || !Number.isSafeInteger(sendAt)) {
    return { allowed: false, code: 'SCHEDULE_DATE_INVALID', limit };
  }
  if (sendAt < nowSeconds + SCHEDULE_MIN_LEAD_SECONDS) {
    return { allowed: false, code: 'SCHEDULE_DATE_TOO_SOON', limit };
  }
  if (sendAt > nowSeconds + SCHEDULE_MAX_AHEAD_SECONDS) {
    return { allowed: false, code: 'SCHEDULE_DATE_TOO_FAR', limit };
  }
  return { allowed: true, code: null, limit };
}
