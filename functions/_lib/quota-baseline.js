// Owner-scoped D1 mirror is advisory: it may relax only the gateway check.
// Verify the client revision against the cached revision. Serverless still
// applies ownership, optimistic concurrency and authoritative quota checks.
export async function quotaSafeMirrorBaseline(db, ownerId, pageId, body, { ready, getPage }) {
  const baseRevision = Number(body?.base_revision || 0);
  const baseUpdatedAt = Number(body?.base_updated_at || 0);
  if ((!Number.isSafeInteger(baseRevision) || baseRevision <= 0)
      && (!Number.isSafeInteger(baseUpdatedAt) || baseUpdatedAt <= 0)) return null;
  if (!await ready(db)) return null;
  const page = await getPage(db, ownerId, pageId);
  if (!page || !Array.isArray(page.blocks)) return null;
  const match = Number.isSafeInteger(baseRevision) && baseRevision > 0
    ? Number(page.revision) === baseRevision
    : Number(page.updated_at) === baseUpdatedAt;
  return match ? page : null;
}
