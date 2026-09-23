import { makeBlock, normalizeBlocks } from 'lib/editor-blocks';
import { plainRichText, richTextToHtml } from 'lib/rich-text';

const TEXT_NATIVE_TYPES = new Set(['paragraph']);

function nativeType(kind) {
  const value = String(kind || 'content');
  if (TEXT_NATIVE_TYPES.has(value)) return 'text';
  return {
    voice_note: 'voice',
    section_heading: 'heading',
    block_quotation: 'blockquote',
    pull_quotation: 'pullquote',
  }[value] || value;
}

function captionParts(raw) {
  const caption = raw?.caption;
  if (!caption || typeof caption !== 'object' || Array.isArray(caption)) {
    return [null, null];
  }
  return [
    richTextToHtml(caption.text) || null,
    richTextToHtml(caption.credit) || null,
  ];
}

function nativeHtml(raw) {
  const kind = String(raw?.type || '');
  const text = richTextToHtml(raw?.text);

  if (kind === 'paragraph') return '<p>' + text + '</p>';
  if (kind === 'heading' || kind === 'section_heading') {
    const size = Math.max(
      1,
      Math.min(6, Number.parseInt(String(raw?.size ?? raw?.level ?? 2), 10) || 2),
    );
    return '<h' + size + '>' + text + '</h' + size + '>';
  }
  if (kind === 'preformatted') return '<pre>' + text + '</pre>';
  if (kind === 'footer') return '<footer>' + text + '</footer>';
  if (kind === 'divider') return '<hr/>';

  if (kind === 'blockquote' || kind === 'block_quotation') {
    const nested = (Array.isArray(raw?.blocks) ? raw.blocks : [])
      .map(nativeHtml)
      .join('');
    const credit = richTextToHtml(raw?.credit);
    return '<blockquote>' + nested
      + (credit ? '<cite>' + credit + '</cite>' : '')
      + '</blockquote>';
  }

  if (kind === 'pullquote' || kind === 'pull_quotation') {
    const credit = richTextToHtml(raw?.credit);
    return '<aside>' + text
      + (credit ? '<cite>' + credit + '</cite>' : '')
      + '</aside>';
  }

  if (kind === 'mathematical_expression') {
    const expression = String(raw?.expression || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    return '<tg-math-block>' + expression + '</tg-math-block>';
  }

  if (kind === 'anchor') {
    const name = String(raw?.name || '')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
    return '<a name="' + name + '"></a>';
  }

  if (kind === 'details') {
    const summary = richTextToHtml(raw?.summary ?? raw?.title);
    const nested = (Array.isArray(raw?.blocks) ? raw.blocks : [])
      .map(nativeHtml)
      .join('');
    return '<details><summary>' + summary + '</summary>' + nested + '</details>';
  }

  return text;
}

function rawToBlock(raw, position) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw)
    ? JSON.parse(JSON.stringify(raw))
    : {};
  const rawType = String(source.type || 'content');
  const blockType = nativeType(rawType);
  const [captionHtml, creditHtml] = captionParts(source);

  const data = {
    native_type: rawType,
    native_data: source,
    html: nativeHtml(source),
    caption_html: captionHtml,
    credit_html: creditHtml,
  };

  if (blockType === 'details') {
    data.summary_html = richTextToHtml(source.summary ?? source.title) || 'Details';
    data.children = (Array.isArray(source.blocks) ? source.blocks : [])
      .map((item, index) => rawToBlock(item, index));
  } else if (blockType === 'collage' || blockType === 'slideshow') {
    data.children = (Array.isArray(source.blocks) ? source.blocks : [])
      .map((item, index) => rawToBlock(item, index));
  } else if (blockType === 'blockquote') {
    data.quote_html = (Array.isArray(source.blocks) ? source.blocks : [])
      .map(nativeHtml)
      .join('');
    data.credit_html = richTextToHtml(source.credit) || null;
  } else if (blockType === 'pullquote') {
    data.quote_html = richTextToHtml(source.text);
    data.credit_html = richTextToHtml(source.credit) || null;
  } else if (blockType === 'map') {
    const location = source.location && typeof source.location === 'object'
      ? source.location
      : {};
    data.latitude = location.latitude ?? null;
    data.longitude = location.longitude ?? null;
    data.zoom = source.zoom ?? 15;
    data.width = source.width ?? 600;
    data.height = source.height ?? 400;
  }

  return makeBlock(blockType, data, position, 'native');
}

export function parseRichMessage(message) {
  const rich = message?.rich_message;
  const rawBlocks = Array.isArray(rich?.blocks) ? rich.blocks : [];
  const blocks = rawBlocks.map((raw, index) => rawToBlock(raw, index));
  normalizeBlocks(blocks);
  return blocks;
}

export function importedBlockPlainText(block) {
  const native = block?.data?.native_data;
  if (!native || typeof native !== 'object' || Array.isArray(native)) return '';
  return plainRichText(native.text);
}
