import { HttpError } from './http.js';

export const MAX_PAGE_BLOCKS = 30;
export const MAX_VISIBLE_CHARACTERS = 25000;
export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 25;
export const MAX_SAVED_PAGES = 12;
export const MAX_BUTTONS = 100;

function now() {
  return Math.floor(Date.now() / 1000);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function jsonArray(value, fallback = []) {
  if (Array.isArray(value)) return clone(value);
  if (typeof value !== 'string') return clone(fallback);
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : clone(fallback);
  } catch {
    return clone(fallback);
  }
}

export function rowToPage(row) {
  if (!row) return null;
  return {
    page_id: String(row.page_id),
    owner_id: Number(row.owner_id),
    title: String(row.title || row.page_id),
    blocks: jsonArray(row.blocks),
    buttons: jsonArray(row.buttons),
    buttons_per_row: Number(row.buttons_per_row || 1),
    buttons_align: String(row.buttons_align || 'center'),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
  };
}

function nestedBlocks(block) {
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const result = [];
  if (Array.isArray(data.children)) result.push(...data.children);
  if (Array.isArray(data.media_children)) result.push(...data.media_children);
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item && typeof item === 'object' && Array.isArray(item.blocks)) {
        result.push(...item.blocks);
      }
    }
  }
  return result;
}

function countBlocks(blocks) {
  let count = 0;
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    count += 1 + countBlocks(nestedBlocks(block));
  }
  return count;
}

function visibleText(value, key = '') {
  if (value == null) return '';
  if (typeof value === 'string') {
    if (['file_id', 'file_unique_id', 'url', 'html', 'callback_data'].includes(key)) return '';
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => visibleText(item, key)).join('');
  if (typeof value !== 'object') return '';
  return Object.entries(value)
    .map(([childKey, childValue]) => visibleText(childValue, childKey))
    .join('');
}

function tableRows(block) {
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const native = data.native_data;
  if (native && typeof native === 'object' && Array.isArray(native.cells)) return native.cells;
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.cells)) return data.cells;
  return [];
}

function rowWidth(row) {
  if (!Array.isArray(row)) return 0;
  return row.reduce((sum, cell) => {
    const span = cell && typeof cell === 'object' ? Number(cell.colspan || 1) : 1;
    return sum + Math.max(1, Number.isFinite(span) ? span : 1);
  }, 0);
}

export function validatePagePayload(payload, current = null) {
  const fallback = current || {};
  const blocks = payload.blocks;
  const buttons = payload.buttons ?? fallback.buttons ?? [];
  if (!Array.isArray(blocks) || blocks.some((block) => !block || typeof block !== 'object' || Array.isArray(block))) {
    throw new HttpError(400, 'blocks must be a list of objects');
  }

  const blockCount = countBlocks(blocks);
  if (blockCount > MAX_PAGE_BLOCKS) {
    throw new HttpError(400, 'editor limit exceeded: blocks (' + blockCount + '/' + MAX_PAGE_BLOCKS + ')');
  }

  const characterCount = visibleText(blocks).length;
  if (characterCount > MAX_VISIBLE_CHARACTERS) {
    throw new HttpError(400, 'editor limit exceeded: characters (' + characterCount + '/' + MAX_VISIBLE_CHARACTERS + ')');
  }

  for (const block of blocks) {
    const stack = [block];
    while (stack.length) {
      const item = stack.pop();
      if (String(item?.type || '') === 'table') {
        const rows = tableRows(item);
        if (rows.length > MAX_TABLE_ROWS) {
          throw new HttpError(400, 'editor limit exceeded: table_rows (' + rows.length + '/' + MAX_TABLE_ROWS + ')');
        }
        const widest = Math.max(0, ...rows.map(rowWidth));
        if (widest > MAX_TABLE_COLUMNS) {
          throw new HttpError(400, 'editor limit exceeded: table_columns (' + widest + '/' + MAX_TABLE_COLUMNS + ')');
        }
      }
      stack.push(...nestedBlocks(item));
    }
  }

  if (!Array.isArray(buttons) || buttons.length > MAX_BUTTONS || buttons.some((button) => !button || typeof button !== 'object' || Array.isArray(button))) {
    throw new HttpError(400, 'buttons must contain at most ' + MAX_BUTTONS + ' objects');
  }

  const buttonsPerRow = Number.parseInt(String(payload.buttons_per_row ?? fallback.buttons_per_row ?? 1), 10);
  if (!Number.isInteger(buttonsPerRow) || buttonsPerRow < 1 || buttonsPerRow > 8) {
    throw new HttpError(400, 'buttons_per_row must be between 1 and 8');
  }

  const buttonsAlign = String(payload.buttons_align ?? fallback.buttons_align ?? 'center');
  if (!['left', 'center', 'right'].includes(buttonsAlign)) {
    throw new HttpError(400, 'buttons_align must be left, center, or right');
  }

  return { blocks: clone(blocks), buttons: clone(buttons), buttonsPerRow, buttonsAlign };
}

export function makePageId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function isDeveloper(env, userId) {
  const ids = String(env.DEVELOPER_IDS || '')
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isSafeInteger);
  return ids.includes(Number(userId));
}

export async function listOwnerPages(db, ownerId) {
  const result = await db.prepare(
    'SELECT * FROM rich_pages WHERE owner_id = ? ORDER BY updated_at DESC, page_id ASC'
  ).bind(Number(ownerId)).all();
  return (result.results || []).map(rowToPage);
}

export async function getPage(db, pageId) {
  const row = await db.prepare('SELECT * FROM rich_pages WHERE page_id = ?')
    .bind(String(pageId || '')).first();
  return rowToPage(row);
}

export async function createPage(db, env, ownerId, title, content) {
  const pageId = makePageId();
  const stamp = now();
  const unlimited = isDeveloper(env, ownerId) ? 1 : 0;
  const result = await db.prepare(
    `INSERT INTO rich_pages
      (page_id, owner_id, title, blocks, buttons, buttons_per_row, buttons_align, created_at, updated_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
     WHERE ? = 1 OR (SELECT COUNT(*) FROM rich_pages WHERE owner_id = ?) < ?`
  ).bind(
    pageId,
    Number(ownerId),
    String(title || 'Untitled').slice(0, 64),
    JSON.stringify(content.blocks),
    JSON.stringify(content.buttons),
    content.buttonsPerRow,
    content.buttonsAlign,
    stamp,
    stamp,
    unlimited,
    Number(ownerId),
    MAX_SAVED_PAGES,
  ).run();

  if (!result.success || Number(result.meta?.changes || 0) < 1) {
    throw new HttpError(409, 'saved page limit reached: ' + MAX_SAVED_PAGES);
  }
  return pageId;
}

export async function updatePage(db, ownerId, pageId, title, content) {
  const stamp = now();
  const result = await db.prepare(
    `UPDATE rich_pages
     SET title = ?, blocks = ?, buttons = ?, buttons_per_row = ?, buttons_align = ?, updated_at = ?
     WHERE page_id = ? AND owner_id = ?`
  ).bind(
    String(title || pageId).slice(0, 64),
    JSON.stringify(content.blocks),
    JSON.stringify(content.buttons),
    content.buttonsPerRow,
    content.buttonsAlign,
    stamp,
    String(pageId),
    Number(ownerId),
  ).run();
  if (!result.success || Number(result.meta?.changes || 0) < 1) {
    throw new HttpError(404, 'Page not found');
  }
  return String(pageId);
}

export async function deletePage(db, ownerId, pageId) {
  const result = await db.prepare(
    'DELETE FROM rich_pages WHERE page_id = ? AND owner_id = ?'
  ).bind(String(pageId), Number(ownerId)).run();
  return Number(result.meta?.changes || 0) > 0;
}
