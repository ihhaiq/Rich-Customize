// Scheduled publishing validates requests server-side. Resolve entitlement
// through getEditorEntitlement(ownerId), never from browser input.
import { normalizePlan } from './subscription-policy.js';

// Free limit is approved. Paid limits are proposals pending product approval.
// Paid destination limits remain provisional pending final product approval.
export const SCHEDULE_DESTINATION_LIMITS = Object.freeze({
  free: 2,
  plus: 5,
  golden: 15,
});
export const SCHEDULE_MIN_LEAD_SECONDS = 60;
// The free-tier horizon; active paid plans use two Baghdad calendar months.
export const SCHEDULE_MAX_AHEAD_SECONDS = 4 * 24 * 60 * 60;
const BAGHDAD_OFFSET_SECONDS = 3 * 60 * 60;

export function scheduleMaxAheadTimestamp(entitlement, nowSeconds) {
  const plan = normalizePlan(entitlement?.plan);
  if (plan !== 'plus' && plan !== 'golden') {
    return nowSeconds + SCHEDULE_MAX_AHEAD_SECONDS;
  }

  const localNow = new Date((nowSeconds + BAGHDAD_OFFSET_SECONDS) * 1000);
  const targetMonth = localNow.getUTCMonth() + 2;
  const targetYear = localNow.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normalizedMonth = targetMonth % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(localNow.getUTCDate(), lastDay);
  return Date.UTC(
    targetYear,
    normalizedMonth,
    targetDay,
    localNow.getUTCHours() - 3,
    localNow.getUTCMinutes(),
    localNow.getUTCSeconds(),
  ) / 1000;
}

export function parseBaghdadDate(value, nowSeconds = Math.floor(Date.now() / 1000)) {
  const match = String(value || '').trim().match(
    /^(\d{2})-(\d{2})\s+(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i,
  );
  if (!match || !Number.isSafeInteger(nowSeconds)) return null;

  const [, rawMonth, rawDay, rawHour, rawMinute, rawMeridiem] = match;
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const twelveHour = Number(rawHour);
  const minute = Number(rawMinute);
  const meridiem = rawMeridiem.toUpperCase();
  if (month < 1 || month > 12) return null;

  const hour = (twelveHour % 12) + (meridiem === 'PM' ? 12 : 0);
  const currentBaghdadYear = new Date(
    (nowSeconds + BAGHDAD_OFFSET_SECONDS) * 1000,
  ).getUTCFullYear();
  const candidate = (year) => {
    const timestamp = Date.UTC(year, month - 1, day, hour - 3, minute) / 1000;
    const local = new Date((timestamp + BAGHDAD_OFFSET_SECONDS) * 1000);
    if (
      local.getUTCFullYear() !== year
      || local.getUTCMonth() + 1 !== month
      || local.getUTCDate() !== day
      || local.getUTCHours() !== hour
      || local.getUTCMinutes() !== minute
    ) return null;
    return timestamp;
  };

  let timestamp = candidate(currentBaghdadYear);
  if (timestamp == null) return null;
  if (timestamp < nowSeconds + SCHEDULE_MIN_LEAD_SECONDS) {
    timestamp = candidate(currentBaghdadYear + 1);
  }
  return timestamp;
}

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
  if (sendAt > scheduleMaxAheadTimestamp(entitlement, nowSeconds)) {
    return { allowed: false, code: 'SCHEDULE_DATE_TOO_FAR', limit };
  }
  return { allowed: true, code: null, limit };
}
