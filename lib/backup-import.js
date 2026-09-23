import { db } from 'sdk';
import { richPages } from 'schema';
import { decodeUtf8, readZip } from 'lib/zip';

export const MAX_IMPORT_ARCHIVE_BYTES = 20 * 1024 * 1024;

function baseName(path) {
  return String(path || '').replaceAll('\\', '/').split('/').at(-1) || '';
}

function parseObject(bytes, label) {
  let value;
  try {
    value = JSON.parse(decodeUtf8(bytes));
  } catch (error) {
    throw new Error(`${label} لا يحتوي JSON صالحًا.`);
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    throw new Error(`${label} يجب أن يبدأ بكائن JSON.`);
  }
  return value;
}

function unixFromManifest(manifest) {
  const raw = manifest && typeof manifest.created_at === 'string'
    ? Date.parse(manifest.created_at)
    : NaN;
  return Number.isFinite(raw) ? Math.floor(raw / 1000) : Math.floor(Date.now() / 1000);
}

function positiveInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePage(pageId, page, fallbackTime) {
  if (!page || Array.isArray(page) || typeof page !== 'object') {
    throw new Error(`الصفحة ${pageId} غير صالحة.`);
  }

  const ownerId = positiveInteger(page.owner_id);
  if (!ownerId) throw new Error(`الصفحة ${pageId} لا تحتوي owner_id صالحًا.`);
  if (!Array.isArray(page.blocks)) throw new Error(`الصفحة ${pageId}: blocks غير صالحة.`);
  if (!Array.isArray(page.buttons)) throw new Error(`الصفحة ${pageId}: buttons غير صالحة.`);

  const rawPerRow = Number(page.buttons_per_row ?? 1);
  const buttonsPerRow = Number.isSafeInteger(rawPerRow) && rawPerRow >= 1 && rawPerRow <= 8
    ? rawPerRow
    : 1;
  const align = ['left', 'center', 'right'].includes(String(page.buttons_align || 'center'))
    ? String(page.buttons_align || 'center')
    : 'center';

  let createdAt = positiveInteger(page.created_at);
  let updatedAt = positiveInteger(page.updated_at);
  if (!createdAt) createdAt = updatedAt || fallbackTime;
  if (!updatedAt) updatedAt = createdAt || fallbackTime;

  return {
    pageId,
    ownerId,
    title: String(page.title || 'صفحة بلا اسم').trim().slice(0, 64) || 'صفحة بلا اسم',
    blocks: page.blocks,
    buttons: page.buttons,
    buttonsPerRow,
    buttonsAlign: align,
    createdAt,
    updatedAt,
  };
}

function parsePagesObject(pagesObject, fallbackTime) {
  const rows = [];
  const owners = new Set();
  for (const [rawPageId, page] of Object.entries(pagesObject)) {
    const pageId = String(rawPageId || '').trim();
    if (!pageId || pageId.length > 64) throw new Error('يوجد page_id غير صالح في النسخة.');
    const row = normalizePage(pageId, page, fallbackTime);
    rows.push(row);
    owners.add(row.ownerId);
  }
  return { rows, ownerCount: owners.size };
}

export function prepareBackupImport(fileName, bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (!bytes.length) throw new Error('الملف فارغ.');
  if (bytes.length > MAX_IMPORT_ARCHIVE_BYTES) {
    throw new Error('حجم الملف أكبر من الحد المسموح وهو 20MB.');
  }

  const lowered = String(fileName || '').toLowerCase();
  let pagesObject;
  let manifest = null;
  let files = [];

  if (lowered.endsWith('.json')) {
    if (baseName(fileName) !== 'rich_pages.json') {
      throw new Error('ملف JSON المدعوم حاليًا هو rich_pages.json فقط.');
    }
    pagesObject = parseObject(bytes, 'rich_pages.json');
    files = ['rich_pages.json'];
  } else if (lowered.endsWith('.zip')) {
    const archive = readZip(bytes);
    files = [...archive.keys()];
    const manifestBytes = archive.get('manifest.json');
    if (manifestBytes) manifest = parseObject(manifestBytes, 'manifest.json');
    const pagesBytes = archive.get('data/rich_pages.json') || archive.get('rich_pages.json');
    if (!pagesBytes) throw new Error('الأرشيف لا يحتوي rich_pages.json.');
    pagesObject = parseObject(pagesBytes, 'rich_pages.json');
  } else {
    throw new Error('أرسل ملف ZIP أو rich_pages.json.');
  }

  const fallbackTime = unixFromManifest(manifest);
  const parsed = parsePagesObject(pagesObject, fallbackTime);
  return {
    rows: parsed.rows,
    pageCount: parsed.rows.length,
    ownerCount: parsed.ownerCount,
    sourceCreatedAt: fallbackTime,
    files,
    otherFiles: files.filter((name) => !name.endsWith('rich_pages.json') && name !== 'manifest.json'),
  };
}

export async function importPreparedPages(prepared) {
  let imported = 0;
  for (const row of prepared.rows) {
    await db.insert(richPages)
      .values(row)
      .onConflictDoUpdate({
        target: richPages.pageId,
        set: {
          ownerId: row.ownerId,
          title: row.title,
          blocks: row.blocks,
          buttons: row.buttons,
          buttonsPerRow: row.buttonsPerRow,
          buttonsAlign: row.buttonsAlign,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        },
      })
      .run();
    imported += 1;
  }
  return imported;
}
