import { db } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import { maintenanceLocks, richPages } from 'schema';

export function normalizePageTitle(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
}
export async function assertUniquePageTitle(ownerId, title, excludedPageId = null) {
  const normalized = normalizePageTitle(title);
  const rows = await db.select().from(richPages).where(eq(richPages.ownerId, Number(ownerId))).all();
  if (rows.some(row => String(row.pageId) !== String(excludedPageId || '')
    && normalizePageTitle(row.title) === normalized)) {
    const error = new Error('عندك صفحة ثانية بنفس الاسم. اختار اسم مختلف. / You already have another page with this name. Choose a different name.');
    error.code = 'PAGE_NAME_EXISTS';
    error.pageNameExists = true;
    throw error;
  }
}
export async function acquireOwnerPageLock(ownerId) {
  const stamp = Math.floor(Date.now()/1000);
  await db.delete(maintenanceLocks).where(lt(maintenanceLocks.expiresAt, stamp)).run();
  const name = 'pages:owner:' + Number(ownerId), expiresAt = stamp + 30;
  const rows = await db.insert(maintenanceLocks).values({name, expiresAt})
    .onConflictDoNothing({target:maintenanceLocks.name}).returning({name:maintenanceLocks.name}).run();
  return Array.isArray(rows) && rows.length ? {name,expiresAt} : null;
}
export async function releaseOwnerPageLock(lock) {
  if (!lock?.name) return;
  await db.delete(maintenanceLocks).where(and(
    eq(maintenanceLocks.name,lock.name),eq(maintenanceLocks.expiresAt,lock.expiresAt),
  )).run();
}
