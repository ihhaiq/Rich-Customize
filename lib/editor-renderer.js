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
  throw new Error('unsupported rich block type: ' + kind);
}

export function buildInputRichMessage(blocks) {
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
  return { blocks: ordered.map(renderBlock) };
}

export function buildSingleBlockRichMessage(block) {
  return buildInputRichMessage([{ ...block, position: 0 }]);
}
