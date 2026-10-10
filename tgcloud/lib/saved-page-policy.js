// A page persisted before new quotas may be sent again without mutation.
// The exception is never inferred from client-supplied previousBlocks.
import { normalizeBlocks, validateEditorLimits } from 'lib/editor-blocks';

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
function canonicalBlocks(blocks) {
  const copied = JSON.parse(JSON.stringify(Array.isArray(blocks) ? blocks : []));
  normalizeBlocks(copied);
  const stripIds = items => {
    for (const block of items) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      // Generated IDs on hydration are not user edits; the stored snapshot
      // remains authoritative for delivery, so they cannot alter the post.
      delete block.id;
      const data = block.data && typeof block.data === 'object' ? block.data : {};
      if (Array.isArray(data.children)) stripIds(data.children);
      if (Array.isArray(data.media_children)) stripIds(data.media_children);
      if (Array.isArray(data.items)) for (const item of data.items) {
        if (Array.isArray(item?.blocks)) stripIds(item.blocks);
      }
    }
  };
  stripIds(copied);
  return copied;
}

// The DB migration defaults existing rows to policy version 1. Only new
// server-authorized CREATE flows write version 2. No date guesses or bulk
// modifications to existing user content are needed.
export const CURRENT_PAGE_QUOTA_VERSION = 2;
export function isLegacySavedPage(page, userId, entitlement) {
  if (!page || Number(page.ownerId) !== Number(userId)) return false;
  if (Number(page.quotaVersion || 1) < CURRENT_PAGE_QUOTA_VERSION) return true;
  // Downgraded subscriptions also make over-quota saved pages read-only.
  return !validateEditorLimits(page.blocks || [], userId, { entitlement }).ok;
}

export function isSavedPageUnchanged(page, draft, { includeTitle = false } = {}) {
  if (!page || !draft) return false;
  if (!equal(canonicalBlocks(page.blocks), canonicalBlocks(draft.blocks))) return false;
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
