import {
  anchorName,
  anchorNavigationRichText,
} from 'lib/editor-anchors';
import { dataRichText } from 'lib/rich-text';
import { validateEditorLimits } from 'lib/editor-blocks';

const INPUT_NATIVE_TYPE_ALIASES = Object.freeze({
  text: 'paragraph',
  paragraph: 'paragraph',
  caption: 'paragraph',
  section_heading: 'heading',
  heading: 'heading',
  preformatted: 'pre',
  pre: 'pre',
  footer: 'footer',
  divider: 'divider',
  mathematical_expression: 'mathematical_expression',
  anchor: 'anchor',
  list: 'list',
  block_quotation: 'blockquote',
  blockquote: 'blockquote',
  expandable_block_quotation: 'expandable_blockquote',
  expandable_blockquote: 'expandable_blockquote',
  pull_quotation: 'pullquote',
  pullquote: 'pullquote',
  collage: 'collage',
  slideshow: 'slideshow',
  table: 'table',
  details: 'details',
  map: 'map',
  buttons: 'buttons',
  animation: 'animation',
  audio: 'audio',
  document: 'document',
  photo: 'photo',
  video: 'video',
  voice: 'voice_note',
  voice_note: 'voice_note',
  thinking: 'thinking',
});

function canonicalInputNativeType(value) {
  const type = String(value || '').trim();
  if (!type) return '';
  return INPUT_NATIVE_TYPE_ALIASES[type] || type;
}

function legacyNativeType(blockType, nativeType) {
  return canonicalInputNativeType(nativeType)
    || canonicalInputNativeType(blockType);
}

function normalizeNativeInputBlock(raw, fallbackType = '') {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('invalid native rich block payload');
  }
  const payload = JSON.parse(JSON.stringify(raw));
  const resolvedType = canonicalInputNativeType(payload.type)
    || canonicalInputNativeType(fallbackType);
  if (!resolvedType) throw new Error('legacy native rich block is missing type');
  payload.type = resolvedType;

  if (Array.isArray(payload.blocks)) {
    payload.blocks = payload.blocks.map((child) => normalizeNativeInputBlock(child));
  }
  if (payload.type === 'list' && Array.isArray(payload.items)) {
    payload.items = payload.items.map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
      const normalized = { ...item };
      if (Array.isArray(normalized.blocks)) {
        normalized.blocks = normalized.blocks.map((child) => normalizeNativeInputBlock(child));
      }
      return normalized;
    });
  }
  return payload;
}

function renderBlock(block) {
  const kind = String(block?.type || '');
  const data = block?.data && typeof block.data === 'object' && !Array.isArray(block.data)
    ? block.data
    : {};

  if (data.native && data.native_data && typeof data.native_data === 'object' && !Array.isArray(data.native_data)) {
    return normalizeNativeInputBlock(
      data.native_data,
      legacyNativeType(kind, data.native_type),
    );
  }

  const text = dataRichText(data, 'rich_text', 'html', 'text');
  if (kind === 'text' || kind === 'paragraph' || kind === 'caption') {
    return { type: 'paragraph', text: text || '' };
  }
  if (kind === 'heading') {
    return {
      type: 'heading',
      text: text || '',
      size: Math.max(1, Math.min(6, Number.parseInt(String(data.size ?? 2), 10) || 2)),
    };
  }
  if (kind === 'preformatted') {
    const payload = {
      type: 'pre',
      text: String(data.text || ''),
    };
    if (data.language) payload.language = String(data.language);
    return payload;
  }
  if (kind === 'footer') {
    return { type: 'footer', text: text || '' };
  }
  if (kind === 'divider') {
    return { type: 'divider' };
  }
  if (kind === 'anchor') {
    return { type: 'anchor', name: anchorName(block) };
  }
  throw new Error('unsupported rich block type: ' + kind);
}

function resolveInlinePageCallbacks(value, sourcePageId = null, navigationToken = null) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveInlinePageCallbacks(item, sourcePageId, navigationToken));
  }
  if (!value || typeof value !== 'object') return value;

  const payload = {};
  for (const [key, item] of Object.entries(value)) {
    payload[key] = resolveInlinePageCallbacks(item, sourcePageId, navigationToken);
  }

  const callback = payload.callback_data;
  if (typeof callback === 'string' && callback.startsWith('r:cbd:')) {
    const parts = ['r:page', callback.slice('r:cbd:'.length)];
    if (sourcePageId) {
      parts.push(String(sourcePageId));
      if (navigationToken) parts.push(String(navigationToken));
    }
    payload.callback_data = parts.join(':');
  } else if (typeof callback === 'string' && callback.startsWith('r:cbds:')) {
    const parts = ['r:spage', callback.slice('r:cbds:'.length)];
    if (sourcePageId) {
      parts.push(String(sourcePageId));
      if (navigationToken) parts.push(String(navigationToken));
    }
    payload.callback_data = parts.join(':');
  }
  return payload;
}

function navigationButtonBlock(buttons) {
  if (!Array.isArray(buttons) || !buttons.length) return [];
  return [{
    type: 'buttons',
    buttons: buttons.map((button) => ({ ...button })),
    align: 'center',
  }];
}

export function buildInputRichMessage(
  blocks,
  {
    sourcePageId = null,
    navigationToken = null,
    navigationButtons = null,
  } = {},
) {
  if (!Array.isArray(blocks) || !blocks.length) {
    throw new Error('The rich message has no blocks');
  }
  const limit = validateEditorLimits(blocks);
  if (!limit.ok) {
    throw new Error('EDITOR_LIMIT:' + limit.code + ':' + limit.actual + ':' + limit.limit);
  }
  const ordered = [...blocks].sort(
    (a, b) => Number(a?.position || 0) - Number(b?.position || 0),
  );
  const payloads = [];
  const anchorNavigation = anchorNavigationRichText(ordered);
  if (anchorNavigation != null) {
    payloads.push({ type: 'paragraph', text: anchorNavigation });
  }
  payloads.push(...ordered.map(renderBlock));
  payloads.push(...navigationButtonBlock(navigationButtons));
  return {
    blocks: resolveInlinePageCallbacks(
      payloads,
      sourcePageId,
      navigationToken,
    ),
  };
}

export function buildSingleBlockRichMessage(block, options = {}) {
  return buildInputRichMessage([{ ...block, position: 0 }], options);
}
