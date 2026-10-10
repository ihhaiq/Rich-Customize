// A page persisted before new quotas may be sent again without mutation.
// The exception is never inferred from client-supplied previousBlocks.
import { validateEditorLimits } from 'lib/editor-blocks';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const result = {};
    for (const key of Object.keys(value).sort()) result[key] = stable(value[key]);
    return result;
  }
  return value;
}
const equal = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

// Pages created before the 2026-10-11 Baghdad cutover are publish-only.
// This is a deterministic pre-deployment content boundary; subsequent pages
// remain editable only while they meet the current plan limits.
export const LEGACY_CUTOFF_SECONDS = Date.parse('2026-10-10T21:00:00Z') / 1000;
export function isLegacySavedPage(page, userId, entitlement) {
  if (!page || Number(page.ownerId) !== Number(userId)) return false;
  const createdAt = Number(page.createdAt || 0);
  if (!Number.isFinite(createdAt) || createdAt < LEGACY_CUTOFF_SECONDS) return true;
  return !validateEditorLimits(page.blocks || [], userId, { entitlement }).ok;
}

export function isSavedPageUnchanged(page, draft, { includeTitle = false } = {}) {
  if (!page || !draft) return false;
  if (!equal(page.blocks || [], draft.blocks || [])) return false;
  if (!equal(page.buttons || [], draft.messageButtons ?? draft.buttons ?? [])) return false;
  if (Number(page.buttonsPerRow || 1) !== Number(draft.buttonsPerRow || draft.buttons_per_row || 1)) return false;
  if (String(page.buttonsAlign || 'center') !== String(draft.buttonsAlign || draft.buttons_align || 'center')) return false;
  if (includeTitle && String(page.title || '') !== String(draft.title ?? draft.currentPageTitle ?? '')) return false;
  return true;
}

export function assertWritableSavedPage(page, userId, entitlement) {
  if (isLegacySavedPage(page, userId, entitlement)) {
    const error = new Error('LEGACY_PAGE_READ_ONLY');
    error.code = 'LEGACY_PAGE_READ_ONLY';
    throw error;
  }
}

export function legacyPagePublishOptions(page, userId, entitlement) {
  // Caller MUST supply an owner-verified row read from richPages, never user JSON.
  if (!page || Number(page.ownerId) !== Number(userId)) {
    throw new Error('Saved page is not owned by publisher');
  }
  return { technicalOnly: isLegacySavedPage(page, userId, entitlement) };
}
