import { EditorLimitError } from 'lib/errors';

export const MAX_PAGE_BLOCKS = 30;
export const MAX_VISIBLE_CHARACTERS = 25000;
export const MAX_TABLE_COLUMNS = 25;
export const MAX_TABLE_ROWS = 50;
export const MAX_SAVED_PAGES = 12;
export const EDITOR_SESSION_TTL_SECONDS = 2 * 60 * 60;

const HTML_TAG_RE = /<[^>]+>/g;
const NAMED_ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['nbsp', '\u00a0'], ['copy', '©'], ['reg', '®'], ['trade', '™'],
]);

function decodeHtmlEntities(value) {
  return String(value ?? '').replace(
    /&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);?/gi,
    (match, token) => {
      const lower = token.toLowerCase();
      if (lower.startsWith('#x')) {
        const code = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      if (lower.startsWith('#')) {
        const code = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES.get(lower) ?? match;
    },
  );
}

function plainHtml(value) {
  if (typeof value !== 'string' || !value) return '';
  return decodeHtmlEntities(value.replace(HTML_TAG_RE, ''));
}

function plainRichText(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(plainRichText).join('');
  if (typeof value === 'object') {
    if (value.type === 'custom_emoji') return String(value.alternative_text ?? '');
    return plainRichText(value.text ?? value.children ?? value.alternative_text ?? '');
  }
  return String(value);
}

function blockChildren(block) {
  const out = [];
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  for (const key of ['children', 'media_children']) {
    if (Array.isArray(data[key])) out.push(...data[key].filter((item) => item && typeof item === 'object'));
  }
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item && typeof item === 'object' && Array.isArray(item.blocks)) {
        out.push(...item.blocks.filter((child) => child && typeof child === 'object'));
      }
    }
  }
  return out;
}

function quotaChildren(block) {
  const out = [];
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return out;
  if (String(block?.type ?? '') === 'details' && Array.isArray(data.children)) {
    out.push(...data.children.filter((child) => child && typeof child === 'object'));
  }
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item && typeof item === 'object' && Array.isArray(item.blocks)) {
        out.push(...item.blocks.filter((child) => child && typeof child === 'object'));
      }
    }
  }
  return out;
}

export function* iterEditorBlocks(blocks) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    yield block;
    yield* iterEditorBlocks(quotaChildren(block));
  }
}

export function blockCount(blocks) {
  let count = 0;
  for (const _block of iterEditorBlocks(blocks)) count += 1;
  return count;
}

function tableRows(block) {
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  if (Array.isArray(data.rows)) return data.rows.filter(Array.isArray);
  const nativeData = data.native_data;
  if (nativeData && typeof nativeData === 'object' && Array.isArray(nativeData.cells)) {
    return nativeData.cells.filter(Array.isArray);
  }
  return [];
}

function rowWidth(row) {
  return row.reduce((width, raw) => {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      const colspan = Number.parseInt(raw.colspan ?? 1, 10);
      return width + (Number.isFinite(colspan) ? Math.max(1, colspan) : 1);
    }
    return width + 1;
  }, 0);
}

export function validateTableRows(rows) {
  const rowCount = rows.length;
  if (rowCount > MAX_TABLE_ROWS) {
    throw new EditorLimitError('table_rows', MAX_TABLE_ROWS, rowCount);
  }
  const widest = rows.reduce((max, row) => Math.max(max, rowWidth(row)), 0);
  if (widest > MAX_TABLE_COLUMNS) {
    throw new EditorLimitError('table_columns', MAX_TABLE_COLUMNS, widest);
  }
}

function nativeVisibleText(value, key = null) {
  if (value == null) return '';
  if (typeof value === 'string') {
    return new Set(['text', 'summary', 'caption', 'credit', 'expression', 'alternative_text', 'name']).has(key)
      ? value
      : '';
  }
  if (Array.isArray(value)) return value.map((item) => nativeVisibleText(item, key)).join('');
  if (typeof value !== 'object') return '';
  return Object.entries(value).map(([childKey, item]) => nativeVisibleText(item, childKey)).join('');
}

function cellText(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.rich_text != null && raw.rich_text !== '' && !(Array.isArray(raw.rich_text) && raw.rich_text.length === 0)) {
      return plainRichText(raw.rich_text);
    }
    if (raw.text != null && raw.text !== '') return plainRichText(raw.text);
    return plainHtml(raw.html);
  }
  return raw == null ? '' : String(raw);
}

function generatedVisibleText(block) {
  const kind = String(block?.type ?? '');
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';

  const nativeData = data.native_data;
  if (data.native && nativeData && typeof nativeData === 'object') {
    return nativeVisibleText(nativeData);
  }

  if (kind === 'list') {
    if (!Array.isArray(data.items)) return '';
    return data.items.map((item) => {
      if (item && typeof item === 'object') {
        if (Array.isArray(item.blocks)) return visibleCharacterText(item.blocks);
        return plainRichText(item.rich_text) || plainRichText(item.text) || plainHtml(item.html);
      }
      return String(item ?? '');
    }).join('');
  }

  if (kind === 'table') return tableRows(block).flatMap((row) => row).map(cellText).join('');

  if (kind === 'details') {
    const summary = plainRichText(data.summary_rich_text)
      || plainRichText(data.summary_text)
      || plainHtml(data.summary_html);
    return summary + visibleCharacterText(blockChildren(block));
  }

  if (kind === 'collage' || kind === 'slideshow') {
    const caption = plainRichText(data.caption_rich_text)
      || plainRichText(data.caption_text)
      || plainHtml(data.caption_html);
    return caption + visibleCharacterText(blockChildren(block));
  }

  if (kind === 'blockquote' || kind === 'pullquote') {
    const quote = plainRichText(data.quote_rich_text)
      || plainRichText(data.quote_text)
      || plainHtml(data.quote_html)
      || plainHtml(data.html);
    const credit = plainRichText(data.credit_rich_text)
      || plainRichText(data.credit_text)
      || plainHtml(data.credit_html);
    return quote + credit + visibleCharacterText(blockChildren(block));
  }

  const caption = plainRichText(data.caption_rich_text)
    || plainRichText(data.caption_text)
    || plainHtml(data.caption_html);
  const credit = plainRichText(data.credit_rich_text)
    || plainRichText(data.credit_text)
    || plainHtml(data.credit_html);
  const text = plainRichText(data.rich_text)
    || plainRichText(data.text)
    || plainHtml(data.html);
  return text + caption + credit;
}

export function visibleCharacterText(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
    .map(generatedVisibleText)
    .join('');
}

export function visibleCharacterCount(blocks) {
  return [...visibleCharacterText(blocks)].length;
}

export function validateEditorLimits(blocks) {
  const actualBlocks = blockCount(blocks);
  if (actualBlocks > MAX_PAGE_BLOCKS) {
    throw new EditorLimitError('blocks', MAX_PAGE_BLOCKS, actualBlocks);
  }
  const characters = visibleCharacterCount(blocks);
  if (characters > MAX_VISIBLE_CHARACTERS) {
    throw new EditorLimitError('characters', MAX_VISIBLE_CHARACTERS, characters);
  }
  for (const block of iterEditorBlocks(blocks)) {
    if (String(block.type ?? '') === 'table') validateTableRows(tableRows(block));
  }
}
