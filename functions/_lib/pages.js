import { isDeveloper } from '../../tgcloud/lib/developer-access.js';
import { PLAN_LIMITS, resolveEditorEntitlement, checkEditorTextQuota } from '../../tgcloud/lib/subscription-policy.js';
import { plainRichText } from '../../tgcloud/lib/rich-text.js';
import { validateStoredButtons } from '../../tgcloud/lib/button-validation.js';
import { HttpError } from './http.js';

export const MAX_PAGE_BLOCKS = 30;
export const MAX_VISIBLE_CHARACTERS = PLAN_LIMITS.free.text;
export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLUMNS = 25;
export const MAX_BUTTONS = 100;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
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

function blockChildren(block) {
  const data = block?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const result = [];
  for (const key of ['children', 'media_children']) {
    if (!Array.isArray(data[key])) continue;
    for (const child of data[key]) {
      if (child && typeof child === 'object' && !Array.isArray(child)) result.push(child);
    }
  }
  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !Array.isArray(item.blocks)) continue;
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
      if (!item || typeof item !== 'object' || Array.isArray(item) || !Array.isArray(item.blocks)) continue;
      for (const child of item.blocks) {
        if (child && typeof child === 'object' && !Array.isArray(child)) result.push(child);
      }
    }
  }
  return result;
}

function countBlocks(blocks) {
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
  if (Array.isArray(value)) return value.map((item) => nativeVisibleText(item, key)).join('');
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

function normalizeNativeTableFlags(blocks) {
  const copied = clone(blocks);

  const visit = (items) => {
    for (const block of Array.isArray(items) ? items : []) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      const data = block.data;
      if (
        String(block.type || '') === 'table'
        && data
        && typeof data === 'object'
        && !Array.isArray(data)
        && data.native
        && data.native_data
        && typeof data.native_data === 'object'
        && !Array.isArray(data.native_data)
      ) {
        const own = (key) => Object.prototype.hasOwnProperty.call(data, key);
        if (own('is_bordered')) data.native_data.is_bordered = data.is_bordered !== false;
        if (own('is_striped')) data.native_data.is_striped = Boolean(data.is_striped);
        if (own('is_compact')) data.native_data.is_compact = Boolean(data.is_compact);
      }
      visit(blockChildren(block));
    }
  };

  visit(copied);
  return copied;
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

function visibleCharacterText(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block && typeof block === 'object' && !Array.isArray(block))
    .map(generatedVisibleText)
    .join('');
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
        return plainRichText(item.rich_text) || plainRichText(item.text) || stripHtml(item.html);
      }
      return item == null ? '' : String(item);
    }).join('');
  }
  if (kind === 'table') return tableRows(block).map((row) => row.map(cellText).join('')).join('');
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

export function validatePagePayload(payload, current = null, userId = null) {
  const developer = isDeveloper(userId);
  const fallback = current || {};
  const blocks = payload.blocks;
  const buttons = payload.buttons ?? fallback.buttons ?? [];

  if (!Array.isArray(blocks) || blocks.some(
    (block) => !block || typeof block !== 'object' || Array.isArray(block),
  )) {
    throw new HttpError(400, 'blocks must be a list of objects');
  }

  const blockCount = countBlocks(blocks);
  if (!developer && blockCount > MAX_PAGE_BLOCKS) {
    throw new HttpError(400, 'editor limit exceeded: blocks (' + blockCount + '/' + MAX_PAGE_BLOCKS + ')');
  }

  const characterCount = visibleCharacterText(blocks).length;
  const previousCount = Array.isArray(current?.blocks) ? visibleCharacterText(current.blocks).length : 0;
  const quota = checkEditorTextQuota(
    resolveEditorEntitlement({ developer }), characterCount, { previousCount },
  );
  // Never forward over-quota content using an unverified gateway fallback.
  // During phased deployment, Serverless may still run the former 25k policy.
  if (!quota.allowed) {
    throw new HttpError(400,
      'editor limit exceeded: characters (' + characterCount + '/' + quota.limit + ')');
  }

  for (const block of blocks) {
    const stack = [block];
    while (stack.length) {
      const item = stack.pop();
      if (String(item?.type || '') === 'table') {
        const rows = tableRows(item);
        if (!developer && rows.length > MAX_TABLE_ROWS) {
          throw new HttpError(
            400,
            'editor limit exceeded: table_rows (' + rows.length + '/' + MAX_TABLE_ROWS + ')',
          );
        }
        const widest = Math.max(0, ...rows.map(rowWidth));
        if (!developer && widest > MAX_TABLE_COLUMNS) {
          throw new HttpError(
            400,
            'editor limit exceeded: table_columns (' + widest + '/' + MAX_TABLE_COLUMNS + ')',
          );
        }
      }
      stack.push(...quotaChildren(item));
    }
  }

  const buttonValidation = validateStoredButtons(buttons, MAX_BUTTONS);
  if (!buttonValidation.ok) {
    throw new HttpError(
      400,
      'invalid button at index '
        + String(buttonValidation.index ?? 'n/a')
        + ': '
        + String(buttonValidation.code || 'unknown'),
    );
  }

  const buttonsPerRow = Number.parseInt(
    String(payload.buttons_per_row ?? fallback.buttons_per_row ?? 1),
    10,
  );
  if (!Number.isInteger(buttonsPerRow) || buttonsPerRow < 1 || buttonsPerRow > 8) {
    throw new HttpError(400, 'buttons_per_row must be between 1 and 8');
  }

  const buttonsAlign = String(payload.buttons_align ?? fallback.buttons_align ?? 'center');
  if (!['left', 'center', 'right'].includes(buttonsAlign)) {
    throw new HttpError(400, 'buttons_align must be left, center, or right');
  }

  return {
    blocks: normalizeNativeTableFlags(blocks),
    buttons: clone(buttons),
    buttonsPerRow,
    buttonsAlign,
  };
}
