import { messageHtmlText } from 'lib/rich-text';
import { resolveLanguage, t } from 'lib/i18n';
// Serverless port of app/editor/models.py, app/editor/document.py,
// app/editor/builders.py, app/editor/limits.py and the first five adapters.

export const FIRST_BLOCK_TYPES = Object.freeze([
  'paragraph',
  'heading',
  'preformatted',
  'footer',
  'divider',
]);

export const FINAL_RICH_BLOCK_TYPES = Object.freeze([
  'paragraph',
  'heading',
  'preformatted',
  'footer',
  'divider',
  'mathematical_expression',
  'anchor',
  'list',
  'blockquote',
  'pullquote',
  'collage',
  'slideshow',
  'table',
  'details',
  'map',
  'animation',
  'audio',
  'document',
  'photo',
  'video',
  'voice',
]);

export const MEDIA_CAPTION_TYPES = Object.freeze([
  'collage',
  'slideshow',
  'map',
  'animation',
  'audio',
  'document',
  'photo',
  'video',
  'voice',
]);

export const QUOTE_TYPES = Object.freeze(['blockquote', 'pullquote']);

export const DETAILS_CHILD_TYPES = Object.freeze([
  'paragraph', 'heading', 'preformatted', 'footer', 'divider',
  'mathematical_expression', 'anchor', 'list', 'blockquote', 'pullquote',
  'table', 'collage', 'slideshow', 'map', 'animation', 'audio',
  'document', 'photo', 'video', 'voice',
]);

export const EDITOR_SESSION_TTL_SECONDS = 2 * 60 * 60;
export const MAX_PAGE_BLOCKS = 30;
export const MAX_VISIBLE_CHARACTERS = 25000;
export const MAX_TABLE_COLUMNS = 25;
export const MAX_TABLE_ROWS = 50;
export const MAX_SAVED_PAGES = 12;
export const BLOCK_SCROLL_SIZE = 8;

const CODE_LANGUAGE_RE = /^[A-Za-z0-9_+.#-]{1,32}$/;

export function blockLabel(blockType, languageCode) {
  const locale = resolveLanguage(languageCode);
  const kind = String(blockType || 'content');
  try {
    return t(locale, 'block.' + kind);
  } catch {
    return t(locale, 'block.content');
  }
}


export function blockButtonText(block, index, languageCode) {
  return blockLabel(block?.type, languageCode) + ' #' + (Number(index) + 1);
}

export function blockId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return String(uuid).replaceAll('-', '').slice(0, 12);
  // Preserve the old 12-character random-id intent without relying on Node APIs.
  return (
    Math.random().toString(16).slice(2)
    + Date.now().toString(16)
    + Math.random().toString(16).slice(2)
  ).slice(0, 12);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function sourceFor(data, source) {
  if (source === 'generated' || source === 'imported' || source === 'native') return source;
  if (data?.native || (data?.native_data && typeof data.native_data === 'object' && !Array.isArray(data.native_data))) {
    return 'native';
  }
  return 'generated';
}

export function makeBlock(blockType, data = {}, position = 0, source = null, id = null) {
  const payload = clone(data || {});
  const resolvedSource = sourceFor(payload, source);
  if (resolvedSource === 'native') payload.native = true;
  else if (payload.native === false) delete payload.native;
  return {
    id: id || blockId(),
    type: String(blockType),
    position: Number.parseInt(String(position), 10) || 0,
    source: resolvedSource,
    data: payload,
  };
}

function safePosition(value) {
  const parsed = Number.parseInt(String(value ?? 0), 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyDetailsChild() {
  return makeBlock(
    'paragraph',
    { text: '…', html: '<p>…</p>' },
    0,
  );
}

export function normalizeBlock(block, position = null) {
  if (!block.id) block.id = blockId();
  block.type = String(block.type || 'content');
  block.position = position == null ? safePosition(block.position) : Number(position);

  let data = block.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    data = {};
    block.data = data;
  }

  const source = sourceFor(data, block.source);
  block.source = source;
  if (source === 'native') data.native = true;

  let children = data.children;
  if (block.type === 'details' && !Array.isArray(children)) {
    children = [];
    data.children = children;
  }
  if (Array.isArray(children)) normalizeBlocks(children);
  if (block.type === 'details' && Array.isArray(children) && !children.length) {
    children.push(emptyDetailsChild());
    if (source === 'native') {
      block.source = 'generated';
      delete data.native;
      delete data.native_data;
      delete data.native_type;
    }
  }

  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item && typeof item === 'object' && !Array.isArray(item) && Array.isArray(item.blocks)) {
        normalizeBlocks(item.blocks);
      }
    }
  }
  return block;
}

export function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const valid = blocks.filter(
    (block) => block && typeof block === 'object' && !Array.isArray(block),
  );
  valid.sort((a, b) => safePosition(a.position) - safePosition(b.position));
  blocks.splice(0, blocks.length, ...valid);
  for (let index = 0; index < blocks.length; index += 1) {
    normalizeBlock(blocks[index], index);
  }
  return blocks;
}

export function getBlockById(blocks, id) {
  if (!id) return null;
  return (Array.isArray(blocks) ? blocks : []).find(
    (block) => block && typeof block === 'object' && String(block.id) === String(id),
  ) || null;
}

function reindexCurrentOrder(blocks) {
  for (let index = 0; index < blocks.length; index += 1) {
    normalizeBlock(blocks[index], index);
  }
  return blocks;
}

export function addBlock(blocks, block, index = null) {
  const list = Array.isArray(blocks) ? blocks : [];
  normalizeBlock(block);
  const target = index == null
    ? list.length
    : Math.max(0, Math.min(Number.parseInt(String(index), 10) || 0, list.length));
  list.splice(target, 0, block);
  reindexCurrentOrder(list);
  return block;
}

export function deleteBlock(blocks, id) {
  const list = Array.isArray(blocks) ? blocks : [];
  const current = getBlockById(list, id);
  if (!current) return false;
  const index = list.indexOf(current);
  list.splice(index, 1);
  reindexCurrentOrder(list);
  return true;
}

export function duplicateBlock(blocks, id, { after = true } = {}) {
  const list = Array.isArray(blocks) ? blocks : [];
  const current = getBlockById(list, id);
  if (!current) return null;
  const index = list.indexOf(current) + (after ? 1 : 0);
  const duplicate = makeBlock(
    String(current.type || 'content'),
    clone(current.data || {}),
    0,
    current.source,
  );
  addBlock(list, duplicate, index);
  return duplicate;
}

export function moveBlock(blocks, id, newIndex) {
  const list = normalizeBlocks(blocks);
  const current = getBlockById(list, id);
  const target = Number.parseInt(String(newIndex), 10);
  if (!current || !Number.isInteger(target) || target < 0 || target >= list.length) return false;
  const oldIndex = list.indexOf(current);
  if (oldIndex !== target) {
    list.splice(target, 0, list.splice(oldIndex, 1)[0]);
    reindexCurrentOrder(list);
  }
  return true;
}

export function replaceBlockData(blocks, id, data, source = null) {
  const list = Array.isArray(blocks) ? blocks : [];
  const current = getBlockById(list, id);
  if (!current) return null;
  const index = list.indexOf(current);
  let resolvedSource = source;
  if (resolvedSource == null) {
    resolvedSource = data?.native || (
      data?.native_data && typeof data.native_data === 'object' && !Array.isArray(data.native_data)
    )
      ? 'native'
      : 'generated';
  }
  const replacement = makeBlock(
    String(current.type || 'content'),
    data,
    Number(current.position || 0),
    resolvedSource,
    String(current.id),
  );
  list[index] = replacement;
  normalizeBlocks(list);
  return replacement;
}

function stripHtml(value) {
  if (typeof value !== 'string' || !value) return '';
  return value
    .replace(/<[^>]+>/g, '')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&');
}

export function plainRichText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainRichText).join('');
  if (typeof value === 'object') {
    if (value.type === 'custom_emoji') return String(value.alternative_text || '');
    return plainRichText(value.text ?? value.children ?? value.alternative_text ?? '');
  }
  return String(value);
}

function blockChildren(block) {
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const result = [];
  for (const key of ['children', 'media_children']) {
    if (Array.isArray(data[key])) {
      for (const child of data[key]) {
        if (child && typeof child === 'object' && !Array.isArray(child)) result.push(child);
      }
    }
  }
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      if (!Array.isArray(item.blocks)) continue;
      for (const child of item.blocks) {
        if (child && typeof child === 'object' && !Array.isArray(child)) result.push(child);
      }
    }
  }
  return result;
}

function quotaChildren(block) {
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const result = [];
  if (String(block?.type || '') === 'details' && Array.isArray(data.children)) {
    for (const child of data.children) {
      if (child && typeof child === 'object' && !Array.isArray(child)) result.push(child);
    }
  }
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      if (!Array.isArray(item.blocks)) continue;
      for (const child of item.blocks) {
        if (child && typeof child === 'object' && !Array.isArray(child)) result.push(child);
      }
    }
  }
  return result;
}

export function editorBlockCount(blocks) {
  let count = 0;
  const visit = (items) => {
    for (const block of Array.isArray(items) ? items : []) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      count += 1;
      visit(quotaChildren(block));
    }
  };
  visit(blocks);
  return count;
}

function nativeVisibleText(value, key = null) {
  if (value == null) return '';
  if (typeof value === 'string') {
    return new Set([
      'text', 'summary', 'caption', 'credit',
      'expression', 'alternative_text', 'name',
    ]).has(key) ? value : '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => nativeVisibleText(item, key)).join('');
  }
  if (typeof value !== 'object') return '';
  return Object.entries(value)
    .map(([childKey, item]) => nativeVisibleText(item, childKey))
    .join('');
}

function tableRows(block) {
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  if (Array.isArray(data.rows)) return data.rows.filter((row) => Array.isArray(row));
  const native = data.native_data;
  if (native && typeof native === 'object' && !Array.isArray(native) && Array.isArray(native.cells)) {
    return native.cells.filter((row) => Array.isArray(row));
  }
  return [];
}

function rowWidth(row) {
  let width = 0;
  for (const raw of Array.isArray(row) ? row : []) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const parsed = Number.parseInt(String(raw.colspan || 1), 10);
      width += Math.max(1, Number.isFinite(parsed) ? parsed : 1);
    } else {
      width += 1;
    }
  }
  return width;
}

function cellText(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.rich_text != null && raw.rich_text !== '') return plainRichText(raw.rich_text);
    if (raw.text != null && raw.text !== '') return plainRichText(raw.text);
    return stripHtml(raw.html);
  }
  return raw == null ? '' : String(raw);
}

function generatedVisibleText(block) {
  const kind = String(block?.type || '');
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';

  const native = data.native_data;
  if (data.native && native && typeof native === 'object' && !Array.isArray(native)) {
    return nativeVisibleText(native);
  }

  if (kind === 'list') {
    const items = Array.isArray(data.items) ? data.items : [];
    return items.map((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        if (Array.isArray(item.blocks)) return visibleCharacterText(item.blocks);
        return plainRichText(item.rich_text)
          || plainRichText(item.text)
          || stripHtml(item.html);
      }
      return item == null ? '' : String(item);
    }).join('');
  }

  if (kind === 'table') {
    return tableRows(block)
      .map((row) => row.map(cellText).join(''))
      .join('');
  }

  if (kind === 'details') {
    const summary = plainRichText(data.summary_rich_text)
      || plainRichText(data.summary_text)
      || stripHtml(data.summary_html);
    return summary + visibleCharacterText(blockChildren(block));
  }

  if (kind === 'collage' || kind === 'slideshow') {
    const caption = plainRichText(data.caption_rich_text)
      || plainRichText(data.caption_text)
      || stripHtml(data.caption_html);
    return caption + visibleCharacterText(blockChildren(block));
  }

  if (kind === 'blockquote' || kind === 'pullquote') {
    const quote = plainRichText(data.quote_rich_text)
      || plainRichText(data.quote_text)
      || stripHtml(data.quote_html)
      || stripHtml(data.html);
    const credit = plainRichText(data.credit_rich_text)
      || plainRichText(data.credit_text)
      || stripHtml(data.credit_html);
    return quote + credit + visibleCharacterText(blockChildren(block));
  }

  const caption = plainRichText(data.caption_rich_text)
    || plainRichText(data.caption_text)
    || stripHtml(data.caption_html);
  const credit = plainRichText(data.credit_rich_text)
    || plainRichText(data.credit_text)
    || stripHtml(data.credit_html);
  const text = plainRichText(data.rich_text)
    || plainRichText(data.text)
    || stripHtml(data.html);
  return text + caption + credit;
}

export function visibleCharacterText(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
    .map(generatedVisibleText)
    .join('');
}

export function visibleCharacterCount(blocks) {
  return visibleCharacterText(blocks).length;
}

export function validateTableRows(rows) {
  const list = Array.isArray(rows) ? rows.filter((row) => Array.isArray(row)) : [];
  if (list.length > MAX_TABLE_ROWS) {
    return {
      ok: false,
      code: 'table_rows',
      limit: MAX_TABLE_ROWS,
      actual: list.length,
    };
  }
  const widest = Math.max(0, ...list.map(rowWidth));
  if (widest > MAX_TABLE_COLUMNS) {
    return {
      ok: false,
      code: 'table_columns',
      limit: MAX_TABLE_COLUMNS,
      actual: widest,
    };
  }
  return { ok: true };
}

export function validateEditorLimits(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  const actualBlocks = editorBlockCount(list);
  if (actualBlocks > MAX_PAGE_BLOCKS) {
    return { ok: false, code: 'blocks', limit: MAX_PAGE_BLOCKS, actual: actualBlocks };
  }

  const characters = visibleCharacterCount(list);
  if (characters > MAX_VISIBLE_CHARACTERS) {
    return { ok: false, code: 'characters', limit: MAX_VISIBLE_CHARACTERS, actual: characters };
  }

  const visit = (items) => {
    for (const block of Array.isArray(items) ? items : []) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      if (String(block.type || '') === 'table') {
        const result = validateTableRows(tableRows(block));
        if (!result.ok) return result;
      }
      const nested = visit(quotaChildren(block));
      if (nested && !nested.ok) return nested;
    }
    return { ok: true };
  };
  return visit(list);
}

export function preformattedData(plain) {
  let code = String(plain || '');
  let language = null;
  const lines = code.split(/\r\n|\r|\n/);
  if ((code.endsWith('\n') || code.endsWith('\r')) && lines.length) lines.pop();
  if (lines.length && lines[0].startsWith('\`\`\`')) {
    const candidate = lines[0].slice(3).trim();
    if (candidate && CODE_LANGUAGE_RE.test(candidate)) language = candidate;
    const body = lines.slice(1);
    if (body.length && body.at(-1).trim() === '\`\`\`') body.pop();
    code = body.join('\n');
  } else if (lines.length && lines[0].toLowerCase().startsWith('/lang ')) {
    const candidate = lines[0].slice(6).trim();
    if (CODE_LANGUAGE_RE.test(candidate)) {
      language = candidate;
      code = lines.slice(1).join('\n');
    }
  }
  const escaped = code
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#x27;');
  const html = language
    ? '<pre><code class="language-' + language + '">' + escaped + '</code></pre>'
    : '<pre>' + escaped + '</pre>';
  return { text: code, html, language };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function lineBounds(plain) {
  const text = String(plain || '');
  const bounds = [];
  let start = 0;
  for (let index = 0; index <= text.length; index += 1) {
    if (index !== text.length && text[index] !== '\n' && text[index] !== '\r') continue;
    let end = index;
    bounds.push([start, end]);
    if (index < text.length && text[index] === '\r' && text[index + 1] === '\n') index += 1;
    start = index + 1;
  }
  return bounds;
}

function trimBounds(plain, start, end) {
  while (start < end && /\s/u.test(plain[start])) start += 1;
  while (end > start && /\s/u.test(plain[end - 1])) end -= 1;
  return [start, end];
}

function clippedEntities(message, start, end) {
  const entities = Array.isArray(message?.entities) ? message.entities : [];
  const result = [];
  for (const raw of entities) {
    const offset = Number(raw?.offset);
    const length = Number(raw?.length);
    if (!Number.isInteger(offset) || !Number.isInteger(length) || length <= 0) continue;
    const entityEnd = offset + length;
    const overlapStart = Math.max(offset, start);
    const overlapEnd = Math.min(entityEnd, end);
    if (overlapStart >= overlapEnd) continue;
    result.push({
      ...raw,
      offset: overlapStart - start,
      length: overlapEnd - overlapStart,
    });
  }
  return result;
}

function formattedPayload(message, plain, start, end) {
  const text = plain.slice(start, end);
  const entities = clippedEntities(message, start, end);
  if (!entities.length) return text;
  const html = messageHtmlText({ text, entities });
  if (html === escapeHtml(text)) return text;
  return { text, html };
}

export function listData(plain, kind = 'bullet', message = null) {
  const source = String(plain || '');
  const safeKind = ['bullet', 'numbered', 'checklist'].includes(String(kind))
    ? String(kind)
    : 'bullet';
  const items = [];
  for (const [lineStart, lineEnd] of lineBounds(source)) {
    let [start, end] = trimBounds(source, lineStart, lineEnd);
    if (start >= end) continue;
    const line = source.slice(start, end);
    let contentStart = start;
    let checked = false;
    if (safeKind === 'checklist') {
      const done = line.match(/^(?:\[\s*[xX]\s*\]|✅|☑️?)\s*/u);
      const pending = line.match(/^(?:\[\s*\]|⬜|☐)\s*/u);
      const marker = done || pending;
      if (marker) {
        checked = Boolean(done);
        contentStart += marker[0].length;
      }
    } else if (safeKind === 'numbered') {
      const marker = line.match(/^\d+\s*[.)-]\s*/u);
      if (marker) contentStart += marker[0].length;
    } else {
      let relative = 0;
      while (relative < line.length && '-• '.includes(line[relative])) relative += 1;
      contentStart += relative;
    }
    [contentStart, end] = trimBounds(source, contentStart, end);
    if (contentStart >= end) continue;
    const payload = formattedPayload(message, source, contentStart, end);
    const item = typeof payload === 'string' ? { text: payload } : payload;
    if (safeKind === 'checklist') {
      item.has_checkbox = true;
      item.is_checked = checked;
    } else if (safeKind === 'numbered') {
      item.value = items.length + 1;
      item.type = '1';
    }
    items.push(item);
  }

  const tag = safeKind === 'numbered' ? 'ol' : 'ul';
  const html = '<' + tag + '>' + items.map((item) => {
    const prefix = safeKind === 'checklist'
      ? '<input type="checkbox"' + (item.is_checked ? ' checked' : '') + '>'
      : '';
    return '<li>' + prefix + (item.html || escapeHtml(item.text)) + '</li>';
  }).join('') + '</' + tag + '>';
  return { items, kind: safeKind, text: source, html };
}

export function tableData(plain, message = null) {
  const source = String(plain || '');
  const rows = [];
  for (const [lineStart, lineEnd] of lineBounds(source)) {
    if (!source.slice(lineStart, lineEnd).trim()) continue;
    const row = [];
    let cellStart = lineStart;
    for (let position = lineStart; position <= lineEnd; position += 1) {
      if (position !== lineEnd && source[position] !== '|') continue;
      const [start, end] = trimBounds(source, cellStart, position);
      row.push(formattedPayload(message, source, start, end));
      cellStart = position + 1;
    }
    rows.push(row);
  }

  const widest = Math.max(1, ...rows.map((row) => row.length));
  const normalized = rows.map((row) => {
    if (row.length !== 1 || widest <= 1) return row;
    const raw = row[0];
    return [raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...raw, colspan: widest }
      : { text: String(raw ?? ''), colspan: widest }];
  });
  const html = '<table bordered>' + normalized.map((row) => (
    '<tr>' + row.map((raw) => {
      const cell = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? raw
        : { text: String(raw ?? '') };
      const span = cell.colspan ? ' colspan="' + Number(cell.colspan) + '"' : '';
      return '<td' + span + '>' + (cell.html || escapeHtml(cell.text || '')) + '</td>';
    }).join('') + '</tr>'
  )).join('') + '</table>';
  return { rows: normalized, text: source, html };
}

export function mapData(latitude, longitude) {
  return {
    latitude: Number(latitude),
    longitude: Number(longitude),
    zoom: 15,
    width: 600,
    height: 400,
    caption_html: null,
    credit_html: null,
  };
}

export function textData(message, blockType, headingSize = 2, _richText = null, richHtml = null, listKind = 'bullet') {
  const plain = String(message?.text || '');
  if (blockType === 'paragraph' || blockType === 'text') {
    const inner = richHtml ?? escapeHtml(plain);
    return { text: plain, html: '<p>' + inner + '</p>' };
  }
  if (blockType === 'heading') {
    const size = Math.max(1, Math.min(6, Number.parseInt(String(headingSize), 10) || 2));
    const inner = richHtml ?? escapeHtml(plain);
    return { text: plain, html: '<h' + size + '>' + inner + '</h' + size + '>', size };
  }
  if (blockType === 'preformatted') return preformattedData(plain);
  if (blockType === 'footer') {
    const inner = richHtml ?? escapeHtml(plain);
    return { text: plain, html: '<footer>' + inner + '</footer>' };
  }
  if (blockType === 'mathematical_expression') {
    return { text: plain, html: '<tg-math-block>' + escapeHtml(plain) + '</tg-math-block>' };
  }
  if (blockType === 'anchor') {
    const name = plain.trim().replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 64);
    return { text: name, html: '<a name="' + escapeHtml(name) + '"></a>' };
  }
  if (blockType === 'list') return listData(plain, listKind, message);
  if (blockType === 'table') return tableData(plain, message);
  return { text: plain, html: richHtml ?? escapeHtml(plain) };
}

export function tableRows(block) {
  if (String(block?.type || '') !== 'table') return [];
  const data = block?.data && typeof block.data === 'object' ? block.data : {};
  if (Array.isArray(data.rows)) return data.rows;
  const native = data.native_data;
  return native && typeof native === 'object' && Array.isArray(native.cells)
    ? native.cells
    : [];
}

function editableCell(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { text: String(raw ?? '') };
  const cell = JSON.parse(JSON.stringify(raw));
  if (cell.text && typeof cell.text === 'object') {
    cell.rich_text = cell.text;
    cell.text = plainRichText(cell.text);
  }
  return cell;
}

export function editableTableData(block) {
  if (String(block?.type || '') !== 'table') return null;
  const rows = tableRows(block).map((row) => Array.isArray(row) ? row.map(editableCell) : []);
  if (!rows.length) return null;
  const old = block.data && typeof block.data === 'object' ? block.data : {};
  const native = old.native_data && typeof old.native_data === 'object' ? old.native_data : {};
  return {
    rows,
    is_bordered: old.is_bordered ?? native.is_bordered ?? true,
    is_striped: old.is_striped ?? native.is_striped ?? false,
    is_compact: old.is_compact ?? native.is_compact ?? false,
    caption_rich_text: old.caption_rich_text ?? native.caption ?? null,
    caption_html: old.caption_html ?? null,
    caption_text: old.caption_text ?? null,
  };
}

export function tableFlag(block, field) {
  const data = block?.data && typeof block.data === 'object' ? block.data : {};
  const native = data.native_data && typeof data.native_data === 'object' ? data.native_data : {};
  const fallback = field === 'is_bordered';
  return Boolean(data[field] ?? native[field] ?? fallback);
}

export function setTableCellStyle(data, rowIndex, columnIndex, { shaded = null, centered = null } = {}) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  if (!Number.isInteger(rowIndex) || !Number.isInteger(columnIndex)
      || rowIndex < 0 || columnIndex < 0
      || rowIndex >= rows.length || columnIndex >= rows[rowIndex].length) return false;
  const raw = rows[rowIndex][columnIndex];
  const cell = editableCell(raw);
  if (shaded !== null) cell.is_header = Boolean(shaded);
  if (centered !== null) {
    if (centered) {
      if (cell.align !== 'center') cell._previous_align = cell.align || 'left';
      cell.align = 'center';
    } else {
      cell.align = cell._previous_align || 'left';
      delete cell._previous_align;
    }
  }
  if (!cell.valign) cell.valign = 'middle';
  rows[rowIndex][columnIndex] = cell;
  return true;
}

export function setAllTableCellsStyle(data, options = {}) {
  if (!data || !Array.isArray(data.rows)) return false;
  let changed = false;
  for (let row = 0; row < data.rows.length; row += 1) {
    for (let col = 0; col < data.rows[row].length; col += 1) {
      changed = setTableCellStyle(data, row, col, options) || changed;
    }
  }
  return changed;
}

export function normalizeBlockScrollOffset(blockCount, value) {
  if (blockCount <= 0) return 0;
  const raw = Math.max(0, Number.parseInt(String(value || 0), 10) || 0);
  const last = Math.floor((blockCount - 1) / BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE;
  const clamped = Math.min(raw, last);
  return Math.floor(clamped / BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE;
}
