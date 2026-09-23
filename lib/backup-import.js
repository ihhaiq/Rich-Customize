import { db } from 'sdk';
import { asc, eq, inArray } from 'sdk/db';
import { legacyStates, pageSnapshots, richPages } from 'schema';
import { exportUsageStats, importUsageStats } from 'lib/usage-stats';
import { decodeUtf8, encodeUtf8, readZip, writeZip } from 'lib/zip';

export const MAX_IMPORT_ARCHIVE_BYTES = 20 * 1024 * 1024;

const KNOWN = Object.freeze({
  'rich_media.json': 'rich_media',
  'managed_chats.json': 'managed_chats',
  'guest_messages.json': 'guest_messages',
  'button_popups.json': 'button_popups',
  'showcase_media.json': 'showcase_media',
  'showcase_channel.json': 'showcase_channel',
  'usage_stats.json': 'usage_stats',
});

function now() {
  return Math.floor(Date.now() / 1000);
}

function basename(path) {
  return String(path || '').replaceAll('\\', '/').split('/').at(-1) || '';
}

function parseJson(bytes, label) {
  let value;
  try {
    value = JSON.parse(decodeUtf8(bytes));
  } catch {
    throw new Error('ملف ' + label + ' لا يحتوي JSON صالحًا.');
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error('ملف ' + label + ' يجب أن يبدأ بكائن JSON.');
  }
  return value;
}

function manifestTime(manifest) {
  const parsed = typeof manifest?.created_at === 'string' ? Date.parse(manifest.created_at) : NaN;
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : now();
}

function positiveInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePage(pageId, page, fallbackTime) {
  if (!page || Array.isArray(page) || typeof page !== 'object') {
    throw new Error('الصفحة ' + pageId + ' غير صالحة.');
  }
  const ownerId = positiveInt(page.owner_id);
  if (!ownerId) throw new Error('الصفحة ' + pageId + ' لا تحتوي owner_id صالحًا.');
  if (!Array.isArray(page.blocks)) throw new Error('الصفحة ' + pageId + ': blocks غير صالحة.');
  const buttons = page.buttons == null ? [] : page.buttons;
  if (!Array.isArray(buttons)) throw new Error('الصفحة ' + pageId + ': buttons غير صالحة.');

  const perRowRaw = Number(page.buttons_per_row ?? 1);
  const buttonsPerRow = Number.isSafeInteger(perRowRaw) && perRowRaw >= 1 && perRowRaw <= 8 ? perRowRaw : 1;
  const rawAlign = String(page.buttons_align || 'center');
  const buttonsAlign = ['left', 'center', 'right'].includes(rawAlign) ? rawAlign : 'center';

  let createdAt = positiveInt(page.created_at);
  let updatedAt = positiveInt(page.updated_at);
  if (!createdAt) createdAt = updatedAt || fallbackTime;
  if (!updatedAt) updatedAt = createdAt || fallbackTime;

  return {
    pageId,
    ownerId,
    title: String(page.title || 'صفحة بلا اسم').trim().slice(0, 64) || 'صفحة بلا اسم',
    blocks: page.blocks,
    buttons,
    buttonsPerRow,
    buttonsAlign,
    createdAt,
    updatedAt,
  };
}

function pagesFromObject(value, fallbackTime) {
  const rows = [];
  const owners = new Set();
  for (const [rawId, page] of Object.entries(value)) {
    const pageId = String(rawId || '').trim();
    if (!pageId || pageId.length > 64) throw new Error('يوجد page_id غير صالح في النسخة.');
    const row = normalizePage(pageId, page, fallbackTime);
    rows.push(row);
    owners.add(row.ownerId);
  }
  return { rows, ownerCount: owners.size };
}

function selectedFiles(fileName, bytes) {
  const lowered = String(fileName || '').toLowerCase();
  if (lowered.endsWith('.json')) {
    const name = basename(fileName);
    if (name !== 'rich_pages.json' && !Object.hasOwn(KNOWN, name)) {
      throw new Error('اسم ملف البيانات غير معروف: ' + name);
    }
    return { selected: new Map([[name, parseJson(bytes, name)]]), manifest: null };
  }
  if (!lowered.endsWith('.zip')) throw new Error('أرسل ملف ZIP أو أحد ملفات JSON المعروفة.');

  const archive = readZip(bytes);
  const selected = new Map();
  let manifest = null;
  for (const [path, payload] of archive.entries()) {
    const clean = String(path).replaceAll('\\', '/');
    const parts = clean.split('/');
    if (parts.length > 2 || (parts.length === 2 && parts[0] !== 'data')) {
      throw new Error('مسار غير مسموح داخل الأرشيف: ' + path);
    }
    const name = basename(clean);
    if (name === 'manifest.json') {
      manifest = parseJson(payload, name);
      continue;
    }
    if (name !== 'rich_pages.json' && !Object.hasOwn(KNOWN, name)) {
      throw new Error('ملف بيانات غير معروف داخل الأرشيف: ' + name);
    }
    if (selected.has(name)) throw new Error('ملف مكرر داخل الأرشيف: ' + name);
    selected.set(name, parseJson(payload, name));
  }
  if (!selected.size) throw new Error('الأرشيف لا يحتوي أي ملف بيانات معروف.');
  return { selected, manifest };
}

export function prepareBackupImport(fileName, inputBytes) {
  const bytes = inputBytes instanceof Uint8Array ? inputBytes : new Uint8Array(inputBytes);
  if (!bytes.length) throw new Error('الملف فارغ.');
  if (bytes.length > MAX_IMPORT_ARCHIVE_BYTES) throw new Error('حجم الملف أكبر من الحد المسموح وهو 20MB.');

  const { selected, manifest } = selectedFiles(fileName, bytes);
  const fallbackTime = manifestTime(manifest);
  const parsedPages = pagesFromObject(selected.get('rich_pages.json') || {}, fallbackTime);
  const statePayloads = {};
  for (const [name, namespace] of Object.entries(KNOWN)) {
    if (selected.has(name)) statePayloads[namespace] = selected.get(name);
  }

  return {
    pageRows: parsedPages.rows,
    pageCount: parsedPages.rows.length,
    ownerCount: parsedPages.ownerCount,
    statePayloads,
    stateNames: Object.keys(statePayloads),
    fileNames: [...selected.keys()],
    sourceCreatedAt: fallbackTime,
  };
}

async function validatePageOwners(rows) {
  if (!rows.length) return;
  const ids = rows.map((row) => row.pageId);
  const existing = await db.select({ pageId: richPages.pageId, ownerId: richPages.ownerId })
    .from(richPages)
    .where(inArray(richPages.pageId, ids))
    .all();
  const incoming = new Map(rows.map((row) => [String(row.pageId), Number(row.ownerId)]));
  for (const row of existing) {
    if (Number(row.ownerId) !== incoming.get(String(row.pageId))) {
      throw new Error('تعارض في ملكية page_id: ' + row.pageId);
    }
  }
}

async function importPages(rows) {
  await validatePageOwners(rows);
  let imported = 0;
  for (const row of rows) {
    await db.insert(richPages).values(row).onConflictDoUpdate({
      target: richPages.pageId,
      set: {
        title: row.title,
        blocks: row.blocks,
        buttons: row.buttons,
        buttonsPerRow: row.buttonsPerRow,
        buttonsAlign: row.buttonsAlign,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      },
    }).run();
    imported += 1;
  }
  return imported;
}

export async function setLegacyState(namespace, payload, stamp = now()) {
  await db.insert(legacyStates).values({ namespace, payload, updatedAt: stamp })
    .onConflictDoUpdate({
      target: legacyStates.namespace,
      set: { payload, updatedAt: stamp },
    })
    .run();
}

export async function getLegacyState(namespace) {
  const row = await db.select().from(legacyStates)
    .where(eq(legacyStates.namespace, namespace)).get();
  return row?.payload ?? null;
}

export async function applyPreparedBackup(prepared) {
  const importedPages = await importPages(prepared.pageRows || []);
  let importedStates = 0;
  let importedUsageUsers = 0;
  for (const [namespace, payload] of Object.entries(prepared.statePayloads || {})) {
    await setLegacyState(namespace, payload);
    importedStates += 1;
    if (namespace === 'usage_stats') {
      const result = await importUsageStats(payload);
      importedUsageUsers = Number(result.users || 0);
    }
  }
  return { importedPages, importedStates, importedUsageUsers };
}

export async function pagesObjectFromDatabase() {
  const rows = await db.select().from(richPages).orderBy(asc(richPages.pageId)).all();
  const pages = {};
  for (const row of rows) {
    pages[String(row.pageId)] = {
      owner_id: Number(row.ownerId),
      title: String(row.title),
      blocks: row.blocks || [],
      buttons: row.buttons || [],
      buttons_per_row: Number(row.buttonsPerRow || 1),
      buttons_align: String(row.buttonsAlign || 'center'),
      created_at: Number(row.createdAt),
      updated_at: Number(row.updatedAt),
    };
  }
  return pages;
}

export async function buildDataExport(date = new Date()) {
  const pages = await pagesObjectFromDatabase();
  const stateRows = await db.select().from(legacyStates).orderBy(asc(legacyStates.namespace)).all();
  const byNamespace = new Map(stateRows.map((row) => [String(row.namespace), row.payload]));
  byNamespace.set('usage_stats', await exportUsageStats());

  const files = [{ name: 'data/rich_pages.json', bytes: encodeUtf8(JSON.stringify(pages, null, 2)) }];
  for (const [name, namespace] of Object.entries(KNOWN)) {
    const payload = byNamespace.get(namespace);
    if (payload == null) continue;
    files.push({ name: 'data/' + name, bytes: encodeUtf8(JSON.stringify(payload, null, 2)) });
  }

  const manifest = {
    created_at: date.toISOString(),
    format: 'rich-customize-json-backup-v1',
    file_count: files.length,
    files: files.map((item) => ({ name: basename(item.name), size: item.bytes.length })),
  };
  files.push({ name: 'manifest.json', bytes: encodeUtf8(JSON.stringify(manifest, null, 2)) });

  return {
    filename: 'rich_customize_backup_' + date.toISOString().replaceAll('-', '').replaceAll(':', '').replace('T', '_').slice(0, 15) + '_UTC.zip',
    bytes: writeZip(files, { date }),
    fileCount: manifest.file_count,
  };
}

export async function createPageSnapshot() {
  const payload = await pagesObjectFromDatabase();
  const createdAt = now();
  const snapshotId = String(createdAt) + '-' + Math.floor(Math.random() * 1000000).toString(16);
  await db.insert(pageSnapshots).values({
    snapshotId,
    payload,
    createdAt,
    pageCount: Object.keys(payload).length,
  }).run();

  const snapshots = await db.select({ snapshotId: pageSnapshots.snapshotId })
    .from(pageSnapshots).orderBy(asc(pageSnapshots.createdAt)).all();
  while (snapshots.length > 5) {
    const oldest = snapshots.shift();
    await db.delete(pageSnapshots).where(eq(pageSnapshots.snapshotId, oldest.snapshotId)).run();
  }
  return { snapshotId, createdAt, pageCount: Object.keys(payload).length };
}

export async function pageSnapshotRestoreDrill() {
  const row = await db.select().from(pageSnapshots).orderBy(asc(pageSnapshots.createdAt)).all();
  const latest = row.at(-1);
  if (!latest) return { ok: false, pages: 0 };
  const payload = latest.payload && typeof latest.payload === 'object' && !Array.isArray(latest.payload)
    ? latest.payload
    : {};
  const parsed = pagesFromObject(payload, Number(latest.createdAt) || now());
  return { ok: parsed.rows.length === Number(latest.pageCount || 0), pages: parsed.rows.length };
}
