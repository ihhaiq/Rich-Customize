// Subscription entitlement policy for Rich Customize.
// Foundation only: payment verification, entitlement persistence and runtime
// integration must be completed before enabling paid tiers.
export const PLAN_LIMITS = Object.freeze({
  free: Object.freeze({ text: 20000, pages: 12, blocks: 30, emojiPacks: 2 }),
  plus: Object.freeze({ text: 25000, pages: 50, blocks: 60, emojiPacks: 8 }),
  golden: Object.freeze({ text: 32000, pages: 150, blocks: 120, emojiPacks: 50 }),
});

// Owner-approved plan benefits. They remain inaccessible until a server-verified
// active subscription exists; this constant does not authorize payments.
export const APPROVED_LIMITS = Object.freeze(['text', 'emojiPacks', 'pages', 'blocks']);
export const PLAN_PRICES_STARS = Object.freeze({ free:0, plus:150, golden:350 });
export const PLAN_PERIOD_DAYS = 30;
export const PLAN_HISTORY_LIMITS = Object.freeze({ free:0, plus:5, golden:20 });
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

export const LEGACY_FREE_TEXT_LIMIT = 25000;
// Previous count must come only from a verified stored page, not user-supplied JSON.
export function checkEditorTextQuota(entitlement, count, { previousCount = 0 } = {}) {
  if (!Number.isSafeInteger(count) || count < 0) throw new Error('Invalid character count');
  if (!Number.isSafeInteger(previousCount) || previousCount < 0) throw new Error('Invalid previous character count');
  if (entitlement?.unlimitedProductQuotas === true) return { allowed:true, limit:null, actual:count, legacy:false };
  const limit=PLAN_LIMITS[normalizePlan(entitlement?.plan)].text;
  const legacy=previousCount>limit && count<=previousCount;
  return { allowed:count<=limit||legacy, limit, actual:count, legacy };
}

export function planBenefit(entitlement, key) {
  const developer = entitlement?.unlimitedProductQuotas === true;
  const plan = developer ? 'golden' : normalizePlan(entitlement?.plan);
  if (key === 'history') return developer ? 50 : PLAN_HISTORY_LIMITS[plan];
  if (key === 'brandingIncluded') return developer || plan !== 'free';
  if (key === 'earlyAccess') return developer || plan === 'golden';
  throw new Error('Unsupported benefit ' + key);
}

export function safePlanLimit(entitlement, key) {
  if (!APPROVED_LIMITS.includes(key)) throw new Error('Unknown plan quota: ' + key);
  return entitlement?.unlimitedProductQuotas === true ? null : PLAN_LIMITS[normalizePlan(entitlement?.plan)][key];
}
