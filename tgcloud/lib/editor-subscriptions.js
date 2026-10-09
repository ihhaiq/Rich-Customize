import { db } from 'sdk';
import { eq } from 'sdk/db';
import { editorSubscriptions } from 'schema';
import { isDeveloper } from 'lib/developer-access';
import { resolveEditorEntitlement, planBenefit, safePlanLimit } from 'lib/subscription-policy';

// This is a read-only trusted entitlement resolver. No HTTP/browser parameter
// may create or activate a paid subscription.
export const VERIFIED_EDITOR_SOURCES = Object.freeze(['richdonate:verified']);
export function verifiedSubscriptionRow(row, now = Math.floor(Date.now()/1000)) {
  if (!row || row.status !== 'active') return null;
  if (!VERIFIED_EDITOR_SOURCES.includes(String(row.source || ''))) return null;
  if (!['plus','golden'].includes(String(row.plan || ''))) return null;
  if (!Number.isSafeInteger(Number(row.expiresAt)) || Number(row.expiresAt) <= now) return null;
  return String(row.plan);
}

export async function getEditorEntitlement(userId, { now = Math.floor(Date.now()/1000) } = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return resolveEditorEntitlement();
  if (isDeveloper(id)) return resolveEditorEntitlement({ developer:true });
  let row;
  try {
    row = await db.select().from(editorSubscriptions)
      .where(eq(editorSubscriptions.userId, id)).get();
  } catch (error) {
    // During a schema rollout, never break editor operations or grant access.
    // Missing/misconfigured storage fails closed to Free.
    console.warn('Editor subscription lookup failed; falling back to Free', error);
    return resolveEditorEntitlement();
  }
  const plan = verifiedSubscriptionRow(row, now);
  return plan
    ? resolveEditorEntitlement({plan,active:true})
    : resolveEditorEntitlement();
}

export async function getEditorPlanLimits(userId) {
  const entitlement = await getEditorEntitlement(userId);
  return {
    plan: entitlement.plan,
    limits: entitlement.limits,
    brandingIncluded: planBenefit(entitlement,'brandingIncluded'),
    earlyAccess: planBenefit(entitlement,'earlyAccess'),
  };
}

export async function hasGoldenEarlyAccess(userId) {
  return (await getEditorPlanLimits(userId)).earlyAccess;
}
