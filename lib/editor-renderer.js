import {
  anchorName,
  anchorNavigationRichText,
} from 'lib/editor-anchors';
import { dataRichText } from 'lib/rich-text';
import { validateEditorLimits } from 'lib/editor-blocks';

function renderBlock(block) {
  const kind = String(block?.type || '');
  const data = block?.data && typeof block.data === 'object' && !Array.isArray(block.data)
    ? block.data
    : {};

  if (data.native && data.native_data && typeof data.native_data === 'object' && !Array.isArray(data.native_data)) {
    return JSON.parse(JSON.stringify(data.native_data));
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
