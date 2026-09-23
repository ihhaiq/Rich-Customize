import { db } from 'sdk';
import { and, eq } from 'sdk/db';
import { richPages } from 'schema';
import { isDeveloper } from 'lib/config';
import { MAX_SAVED_PAGES, validateEditorLimits } from 'lib/editor/limits';
import { PageLimitError } from 'lib/errors';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function randomPageId() {
  const alphabet = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 8; i += 1) out += alphabet[Math.floor(Math.random() * 16)];
  return out;
}

function pagePayload({
  ownerId,
  title,
  blocks,
  buttons,
  buttonsPerRow,
  buttonsAlign,
  createdAt,
  updatedAt,
  quotaSlot = null,
}) {
  return {
    ownerId: Number(ownerId),
    title: String(title ?? '').trim().slice(0, 64) || 'صفحة بلا اسم',
    blocks: clone(blocks ?? []),
    buttons: clone(buttons ?? []),
    buttonsPerRow: Math.max(1, Number.parseInt(buttonsPerRow ?? 1, 10) || 1),
    buttonsAlign: String(buttonsAlign ?? 'center'),
    quotaSlot,
    createdAt: Number(createdAt),
    updatedAt: Number(updatedAt),
  };
}

function externalPage(row) {
  if (!row) return null;
  return {
    owner_id: Number(row.ownerId),
    title: row.title,
    blocks: clone(row.blocks ?? []),
    buttons: clone(row.buttons ?? []),
    buttons_per_row: Number(row.buttonsPerRow ?? 1),
    buttons_align: String(row.buttonsAlign ?? 'center'),
    created_at: Number(row.createdAt),
    updated_at: Number(row.updatedAt),
  };
}

async function usedQuotaSlots(ownerId) {
  const rows = await db.select({ quotaSlot: richPages.quotaSlot })
    .from(richPages)
    .where(eq(richPages.ownerId, Number(ownerId)))
    .all();
  return new Set(rows.map((row) => Number(row.quotaSlot)).filter((slot) => Number.isInteger(slot)));
}

async function insertNewPage(pageId, payload, developer) {
  if (developer) {
    await db.insert(richPages).values({ pageId, ...payload, quotaSlot: null }).run();
    return;
  }

  for (let retry = 0; retry < MAX_SAVED_PAGES; retry += 1) {
    const used = await usedQuotaSlots(payload.ownerId);
    let slot = null;
    for (let candidate = 1; candidate <= MAX_SAVED_PAGES; candidate += 1) {
      if (!used.has(candidate)) {
        slot = candidate;
        break;
      }
    }
    if (slot == null) throw new PageLimitError(MAX_SAVED_PAGES);

    try {
      await db.insert(richPages).values({ pageId, ...payload, quotaSlot: slot }).run();
      return;
    } catch (error) {
      const existing = await db.select().from(richPages).where(eq(richPages.pageId, pageId)).get();
      if (existing) throw error;
      const slotsAfterRace = await usedQuotaSlots(payload.ownerId);
      if (!slotsAfterRace.has(slot)) throw error;
    }
  }
  throw new PageLimitError(MAX_SAVED_PAGES);
}

export async function getPage(pageId) {
  const row = await db.select().from(richPages).where(eq(richPages.pageId, String(pageId))).get();
  return externalPage(row);
}

export async function savePage({
  ownerId,
  title,
  blocks = [],
  buttons = [],
  buttonsPerRow = 1,
  buttonsAlign = 'center',
  pageId = null,
}) {
  validateEditorLimits(blocks);
  const owner = Number(ownerId);
  const developer = await isDeveloper(owner);
  const now = nowSeconds();

  if (pageId) {
    const existing = await db.select().from(richPages).where(eq(richPages.pageId, String(pageId))).get();
    if (existing) {
      if (Number(existing.ownerId) !== owner) throw new Error('page id belongs to another user');
      const payload = pagePayload({
        ownerId: owner,
        title,
        blocks,
        buttons,
        buttonsPerRow,
        buttonsAlign,
        createdAt: existing.createdAt,
        updatedAt: now,
        quotaSlot: existing.quotaSlot,
      });
      await db.update(richPages)
        .set(payload)
        .where(and(eq(richPages.pageId, String(pageId)), eq(richPages.ownerId, owner)))
        .run();
      return String(pageId);
    }
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomPageId();
    const payload = pagePayload({
      ownerId: owner,
      title,
      blocks,
      buttons,
      buttonsPerRow,
      buttonsAlign,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await insertNewPage(code, payload, developer);
      return code;
    } catch (error) {
      if (error instanceof PageLimitError) throw error;
      const collision = await db.select().from(richPages).where(eq(richPages.pageId, code)).get();
      if (!collision) throw error;
    }
  }
  throw new Error('could not allocate a unique page id');
}

export async function listPagesForUser(ownerId) {
  const rows = await db.select().from(richPages).where(eq(richPages.ownerId, Number(ownerId))).all();
  return rows
    .map((row) => ({ page_id: row.pageId, ...externalPage(row) }))
    .sort((a, b) => String(a.title ?? a.page_id).localeCompare(String(b.title ?? b.page_id)));
}

export async function queryPagesForUser(ownerId, {
  query = '',
  sortMode = 'updated',
  pageIndex = null,
  pageSize = null,
} = {}) {
  let pages = await listPagesForUser(ownerId);
  const ownedTotal = pages.length;
  const needle = String(query).trim().toLocaleLowerCase();
  if (needle) {
    pages = pages.filter((page) =>
      String(page.title ?? '').toLocaleLowerCase().includes(needle)
      || String(page.page_id ?? '').toLocaleLowerCase().includes(needle));
  }

  if (sortMode === 'oldest') {
    pages.sort((a, b) => a.created_at - b.created_at);
  } else if (sortMode === 'newest') {
    pages.sort((a, b) => b.created_at - a.created_at);
  } else if (sortMode === 'title') {
    pages.sort((a, b) => String(a.title ?? a.page_id).localeCompare(String(b.title ?? b.page_id)));
  } else {
    pages.sort((a, b) => b.updated_at - a.updated_at);
  }

  const filteredTotal = pages.length;
  if (pageIndex != null && pageSize != null) {
    const size = Math.max(1, Number.parseInt(pageSize, 10) || 1);
    const index = Math.max(0, Number.parseInt(pageIndex, 10) || 0);
    pages = pages.slice(index * size, (index + 1) * size);
  }
  return { pages, filteredTotal, ownedTotal };
}

export async function deletePage(pageId, ownerId) {
  const rows = await db.delete(richPages)
    .where(and(eq(richPages.pageId, String(pageId)), eq(richPages.ownerId, Number(ownerId))))
    .returning({ pageId: richPages.pageId })
    .run();
  return rows.length > 0;
}

export async function renamePage(pageId, ownerId, title) {
  const cleaned = String(title ?? '').trim().slice(0, 64) || 'صفحة بلا اسم';
  const rows = await db.update(richPages)
    .set({ title: cleaned, updatedAt: nowSeconds() })
    .where(and(eq(richPages.pageId, String(pageId)), eq(richPages.ownerId, Number(ownerId))))
    .returning({ pageId: richPages.pageId })
    .run();
  return rows.length > 0;
}

export async function restorePage(pageId, ownerId, snapshot) {
  if (Number(snapshot?.owner_id ?? 0) !== Number(ownerId)) return false;
  if (await getPage(pageId)) return false;

  const blocks = clone(snapshot.blocks ?? []);
  validateEditorLimits(blocks);
  const developer = await isDeveloper(ownerId);
  const now = nowSeconds();
  const payload = pagePayload({
    ownerId,
    title: snapshot.title,
    blocks,
    buttons: snapshot.buttons ?? [],
    buttonsPerRow: snapshot.buttons_per_row ?? 1,
    buttonsAlign: snapshot.buttons_align ?? 'center',
    createdAt: Number(snapshot.created_at ?? now),
    updatedAt: Number(snapshot.updated_at ?? now),
  });

  try {
    await insertNewPage(String(pageId), payload, developer);
    return true;
  } catch (error) {
    if (error instanceof PageLimitError) return false;
    throw error;
  }
}

export async function countPagesForUser(ownerId) {
  return db.$count(richPages, eq(richPages.ownerId, Number(ownerId)));
}

export async function pageUsageHistory() {
  const rows = await db.select().from(richPages).all();
  const result = {};
  for (const row of rows) {
    const key = String(row.ownerId);
    if (!result[key]) {
      result[key] = { first_seen: Number(row.createdAt), last_seen: Number(row.updatedAt) };
    } else {
      result[key].first_seen = Math.min(result[key].first_seen, Number(row.createdAt));
      result[key].last_seen = Math.max(result[key].last_seen, Number(row.updatedAt));
    }
  }
  return result;
}

export async function pageStatistics() {
  const rows = await db.select().from(richPages).all();
  const owners = new Set(rows.map((row) => Number(row.ownerId)));
  return {
    pages: rows.length,
    page_owners: owners.size,
    oldest_page: rows.length ? Math.min(...rows.map((row) => Number(row.createdAt))) : null,
    latest_page_update: rows.length ? Math.max(...rows.map((row) => Number(row.updatedAt))) : null,
  };
}
