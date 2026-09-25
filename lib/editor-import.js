import { blockId, makeBlock, normalizeBlocks } from 'lib/editor-blocks';
import { messageHtmlText, messageRichText, plainRichText, richTextToHtml } from 'lib/rich-text';

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

  const mediaField = {
    photo: 'photo',
    video: 'video',
    animation: 'animation',
    audio: 'audio',
    document: 'document',
    voice: 'voice_note',
  }[blockType];
  if (mediaField) {
    const rawMedia = source[mediaField];
    const reusable = Array.isArray(rawMedia) ? rawMedia.at(-1) : rawMedia;
    if (reusable && typeof reusable === 'object' && !Array.isArray(reusable) && reusable.file_id) {
      data.file = JSON.parse(JSON.stringify(reusable));
      data.has_spoiler = Boolean(source.has_spoiler);
    }
  }

  if (blockType === 'details') {
    data.summary_html = richTextToHtml(source.summary ?? source.title) || '…';
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


function cloneObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? JSON.parse(JSON.stringify(value))
    : {};
}

function clippedTextEntities(message, start, end, excludedTypes = new Set()) {
  const entities = Array.isArray(message?.entities) ? message.entities : [];
  const result = [];
  for (const raw of entities) {
    const type = String(raw?.type || '');
    if (excludedTypes.has(type)) continue;
    const offset = Number(raw?.offset);
    const length = Number(raw?.length);
    if (!Number.isInteger(offset) || !Number.isInteger(length) || length <= 0) continue;
    const finish = offset + length;
    const overlapStart = Math.max(offset, start);
    const overlapEnd = Math.min(finish, end);
    if (overlapStart >= overlapEnd) continue;
    result.push({
      ...raw,
      offset: overlapStart - start,
      length: overlapEnd - overlapStart,
    });
  }
  return result;
}

function trimNewlineRange(text, start, end) {
  let left = start;
  let right = end;
  while (left < right && (text[left] === '\n' || text[left] === '\r')) left += 1;
  while (right > left && (text[right - 1] === '\n' || text[right - 1] === '\r')) right -= 1;
  return [left, right];
}

function importedTextBlock(message, start, end, position) {
  const source = String(message?.text || '');
  const [left, right] = trimNewlineRange(source, start, end);
  if (left >= right || !source.slice(left, right).trim()) return null;
  const pseudo = {
    text: source.slice(left, right),
    entities: clippedTextEntities(message, left, right),
  };
  return makeBlock('text', {
    text: pseudo.text,
    rich_text: messageRichText(pseudo),
    html: messageHtmlText(pseudo),
    entities: pseudo.entities,
  }, position, 'imported');
}

function formattedTextBlocks(message, startPosition = 0) {
  const text = String(message?.text || '');
  const entities = Array.isArray(message?.entities) ? message.entities : [];
  const quoteTypes = new Set(['blockquote', 'expandable_blockquote']);
  const quotes = entities
    .filter((entity) => quoteTypes.has(String(entity?.type || '')))
    .filter((entity) => Number.isInteger(Number(entity?.offset)) && Number(entity?.length) > 0)
    .sort((a, b) => Number(a.offset) - Number(b.offset) || Number(b.length) - Number(a.length));

  const topQuotes = [];
  for (const quote of quotes) {
    const start = Number(quote.offset);
    const end = start + Number(quote.length);
    if (topQuotes.some((parent) => {
      const parentStart = Number(parent.offset);
      const parentEnd = parentStart + Number(parent.length);
      return start >= parentStart && end <= parentEnd;
    })) continue;
    topQuotes.push(quote);
  }

  if (!topQuotes.length) {
    const only = importedTextBlock(message, 0, text.length, startPosition);
    return only ? [only] : [];
  }

  const blocks = [];
  const appendText = (start, end) => {
    const block = importedTextBlock(message, start, end, startPosition + blocks.length);
    if (block) blocks.push(block);
  };

  let cursor = 0;
  for (const quote of topQuotes) {
    const start = Math.max(0, Number(quote.offset));
    const end = Math.min(text.length, start + Number(quote.length));
    if (start > cursor) appendText(cursor, start);
    const [left, right] = trimNewlineRange(text, start, end);
    if (left < right && text.slice(left, right).trim()) {
      const pseudo = {
        text: text.slice(left, right),
        entities: clippedTextEntities(message, left, right, quoteTypes),
      };
      blocks.push(makeBlock('blockquote', {
        quote_text: pseudo.text,
        quote_html: messageHtmlText(pseudo),
        quote_rich_text: messageRichText(pseudo),
        credit_html: null,
      }, startPosition + blocks.length, 'imported'));
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < text.length) appendText(cursor, text.length);
  return blocks;
}

function captionBlock(message, position) {
  const text = String(message?.caption || '');
  if (!text) return null;
  const pseudo = {
    text,
    entities: Array.isArray(message?.caption_entities) ? message.caption_entities : [],
  };
  return makeBlock('caption', {
    text,
    rich_text: messageRichText(pseudo),
    html: messageHtmlText(pseudo),
    entities: pseudo.entities,
  }, position, 'imported');
}

function mediaData(value) {
  if (Array.isArray(value)) {
    const item = value.at(-1);
    return cloneObject(item);
  }
  return cloneObject(value);
}

export function messageToBlocks(message, startPosition = 0) {
  if (message?.rich_message) {
    const blocks = parseRichMessage(message);
    for (let index = 0; index < blocks.length; index += 1) {
      blocks[index].position = startPosition + index;
    }
    return normalizeBlocks(blocks);
  }

  if (typeof message?.text === 'string') {
    return formattedTextBlocks(message, startPosition);
  }

  const candidates = [
    ['photo', message?.photo],
    ['video', message?.video],
    ['animation', message?.animation],
    ['audio', message?.audio],
    ['voice', message?.voice],
    ['document', message?.document],
    ['sticker', message?.sticker],
    ['video_note', message?.video_note],
  ];
  const selected = candidates.find(([, value]) => value != null);
  const blocks = [];
  if (selected) {
    const [type, value] = selected;
    const file = mediaData(value);
    if (file.file_id) {
      blocks.push(makeBlock(type, {
        file,
        has_spoiler: Boolean(message?.has_media_spoiler),
      }, startPosition, 'imported'));
    }
  }
  const caption = captionBlock(message, startPosition + blocks.length);
  if (caption) blocks.push(caption);
  normalizeBlocks(blocks);
  return blocks;
}

export function messagesToBlocks(messages) {
  const blocks = [];
  const ordered = [...(Array.isArray(messages) ? messages : [])]
    .sort((a, b) => Number(a?.message_id || 0) - Number(b?.message_id || 0));
  for (const message of ordered) {
    blocks.push(...messageToBlocks(message, blocks.length));
  }
  return normalizeBlocks(blocks);
}

export function replacementData(message, expectedType) {
  const wanted = String(expectedType || '');
  const parsed = messageToBlocks(message);
  const match = parsed.find((item) => {
    const type = String(item?.type || '');
    return type === wanted || (wanted === 'caption' && type === 'text');
  });
  return match ? JSON.parse(JSON.stringify(match.data || {})) : null;
}

export function quoteMediaPayload(parsed) {
  const allowed = new Set(['photo', 'video', 'animation', 'audio', 'voice', 'document']);
  const media = (Array.isArray(parsed) ? parsed : [])
    .filter((item) => allowed.has(String(item?.type || '')))
    .map((item, index) => ({ ...item, position: index }));
  const caption = (Array.isArray(parsed) ? parsed : [])
    .find((item) => String(item?.type || '') === 'caption') || null;
  return [media, caption];
}

const IMPORTABLE_BUTTON_STYLES = new Set(['primary', 'success', 'danger']);

function importedInlineButton(raw, position) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const text = String(raw.text || '').trim();
  if (!text) return null;

  const button = {
    id: blockId().slice(0, 10),
    text,
    style: IMPORTABLE_BUTTON_STYLES.has(String(raw.style || ''))
      ? String(raw.style)
      : 'default',
    position,
  };

  if (typeof raw.url === 'string' && raw.url) {
    return { ...button, type: 'url', value: raw.url, url: raw.url };
  }
  if (typeof raw.callback_data === 'string' && raw.callback_data) {
    return { ...button, type: 'callback_data', value: raw.callback_data };
  }
  if (typeof raw.copy_text?.text === 'string') {
    return { ...button, type: 'copy', value: raw.copy_text.text };
  }
  if (typeof raw.web_app?.url === 'string' && raw.web_app.url) {
    return { ...button, type: 'web_app', value: raw.web_app.url, url: raw.web_app.url };
  }
  if (typeof raw.login_url?.url === 'string' && raw.login_url.url) {
    return { ...button, type: 'login_url', value: raw.login_url.url, url: raw.login_url.url };
  }
  if (Object.hasOwn(raw, 'switch_inline_query')) {
    return { ...button, type: 'switch_inline', value: String(raw.switch_inline_query || '') };
  }
  if (Object.hasOwn(raw, 'switch_inline_query_current_chat')) {
    return {
      ...button,
      type: 'switch_inline_current',
      value: String(raw.switch_inline_query_current_chat || ''),
    };
  }
  if (raw.disabled != null) {
    return { ...button, type: 'disabled', value: '' };
  }
  return null;
}

export function parseMessageButtons(message) {
  const rows = Array.isArray(message?.reply_markup?.inline_keyboard)
    ? message.reply_markup.inline_keyboard
    : [];
  const buttons = [];
  let widest = 1;

  for (const rawRow of rows) {
    if (!Array.isArray(rawRow) || !rawRow.length || buttons.length >= 100) continue;
    const imported = [];
    for (const raw of rawRow) {
      if (buttons.length + imported.length >= 100) break;
      const button = importedInlineButton(raw, buttons.length + imported.length);
      if (button) imported.push(button);
    }
    if (!imported.length) continue;
    imported.at(-1).row_end = true;
    widest = Math.max(widest, imported.length);
    buttons.push(...imported);
  }

  buttons.forEach((button, index) => {
    button.position = index;
  });
  return {
    buttons,
    buttonsPerRow: Math.max(1, Math.min(8, widest)),
    buttonsAlign: 'center',
  };
}

export function importedBlockPlainText(block) {
  const native = block?.data?.native_data;
  if (!native || typeof native !== 'object' || Array.isArray(native)) return '';
  return plainRichText(native.text);
}
