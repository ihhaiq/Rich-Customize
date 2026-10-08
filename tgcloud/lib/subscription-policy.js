// Subscription entitlement policy for Rich Customize.
// Foundation only: payment verification, entitlement persistence and runtime
// integration must be completed before enabling paid tiers.
export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({ text: 20000, pages: 12, blocks: 30, emojiPacks: 2 }),
  plus: Object.freeze({ text: 25000, pages: 50, blocks: 60, emojiPacks: 8 }),
  golden: Object.freeze({ text: 32000, pages: 150, blocks: 120, emojiPacks: 50 }),
});

// Only the text limits and emoji-pack limits have been explicitly approved.
// Other numeric quotas are proposals in sups.md; do not enforce them until approved.
export const APPROVED_LIMITS = Object.freeze(['text', 'emojiPacks']);
export const PLAN_NAMES = Object.freeze(['free', 'plus', 'golden']);

export function normalizePlan(value) {
  return PLAN_NAMES.includes(value) ? value : 'free';
}

export function resolveEditorEntitlement({ plan = 'free', active = false, developer = false } = {}) {
  if (developer === true) return { plan: 'developer', unlimitedProductQuotas: true, limits: null };
  const effectivePlan = active === true ? normalizePlan(plan) : 'free';
  return { plan: effectivePlan, unlimitedProductQuotas: false, limits: PLAN_LIMITS[effectivePlan] };
}

export function resolveCloneEntitlement() {
  // Clone licenses do not grant editor Plus/Golden benefits, even to the owner.
  return { plan: 'free', unlimitedProductQuotas: false, limits: PLAN_LIMITS.free };
}

export function checkApprovedQuota(entitlement, quota, count) {
  if (!APPROVED_LIMITS.includes(quota)) throw new Error('Quota not approved for enforcement: ' + quota);
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid quota usage');
  if (entitlement?.unlimitedProductQuotas === true) return { allowed: true, limit: null };
  const plan = normalizePlan(entitlement?.plan);
  const limit = PLAN_LIMITS[plan][quota];
  return { allowed: count <= limit, limit };
}

// An unverified client-supplied plan MUST NOT be passed as an active entitlement.
// The trusted subscription service must verify and persist payment events first.
