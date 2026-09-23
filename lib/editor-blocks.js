// Serverless port of app/editor/models.py, app/editor/document.py,
// app/editor/builders.py, app/editor/limits.py and the first five adapters.

export const FIRST_BLOCK_TYPES = Object.freeze([
  'paragraph',
  'heading',
  'preformatted',
  'footer',
  'divider',
]);

export const EDITOR_SESSION_TTL_SECONDS = 2 * 60 * 60;
export const MAX_PAGE_BLOCKS = 30;
export const MAX_VISIBLE_CHARACTERS = 25000;
export const BLOCK_SCROLL_SIZE = 8;

const CODE_LANGUAGE_RE = /^[A-Za-z0-9_+.#-]{1,32}$/;

const LABELS = {
  en: {
    paragraph: '📝 Paragraph',
    heading: '🔠 Section heading',
    preformatted: '💻 Preformatted',
    footer: '🔻 Footer',
    divider: '➖ Divider',
    content: '📦 Content',
  },
  ar: {
    paragraph: '📝 فقرة',
    heading: '🔠 عنوان قسم',
    preformatted: '💻 نص برمجي',
    footer: '🔻 تذييل',
    divider: '➖ فاصل',
    content: '📦 محتوى',
  },
};

function locale(languageCode) {
  return String(languageCode || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function blockLabel(blockType, languageCode) {
  const labels = LABELS[locale(languageCode)];
  return labels[String(blockType || '')] || labels.content;
}

export function blockButtonText(block, index, languageCode) {
  return blockLabel(block?.type, languageCode) + ' #' + (Number(index) + 1);
}

export function blockId() {
  const value = globalThis.crypto?.randomUUID?.() || (String(Date.now()) + String(Math.random()));
  return String(value).replaceAll('-', '').replace('.', '').slice(0, 12);
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

export function normalizeBlocks(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  list.sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  for (let index = 0; index < list.length; index += 1) {
    const block = list[index];
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    if (!block.id) block.id = blockId();
    block.type = String(block.type || 'content');
    block.position = index;
    block.source = sourceFor(block.data || {}, block.source);
    if (!block.data || typeof block.data !== 'object' || Array.isArray(block.data)) block.data = {};
  }
  return list;
}

export function getBlockById(blocks, id) {
  if (!id) return null;
  return (Array.isArray(blocks) ? blocks : []).find((block) => String(block?.id) === String(id)) || null;
}

export function addBlock(blocks, block, index = null) {
  const list = normalizeBlocks(blocks);
  const target = index == null
    ? list.length
    : Math.max(0, Math.min(Number.parseInt(String(index), 10) || 0, list.length));
  list.splice(target, 0, block);
  normalizeBlocks(list);
  return block;
}

export function deleteBlock(blocks, id) {
  const list = normalizeBlocks(blocks);
  const index = list.findIndex((block) => String(block?.id) === String(id));
  if (index < 0) return false;
  list.splice(index, 1);
  normalizeBlocks(list);
  return true;
}

export function duplicateBlock(blocks, id, { after = true } = {}) {
  const list = normalizeBlocks(blocks);
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
  const oldIndex = list.findIndex((block) => String(block?.id) === String(id));
  const target = Number.parseInt(String(newIndex), 10);
  if (oldIndex < 0 || !Number.isInteger(target) || target < 0 || target >= list.length) return false;
  if (oldIndex !== target) list.splice(target, 0, list.splice(oldIndex, 1)[0]);
  normalizeBlocks(list);
  return true;
}

export function replaceBlockData(blocks, id, data, source = 'generated') {
  const list = normalizeBlocks(blocks);
  const index = list.findIndex((block) => String(block?.id) === String(id));
  if (index < 0) return null;
  const current = list[index];
  list[index] = makeBlock(current.type, data, index, source, current.id);
  normalizeBlocks(list);
  return list[index];
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

function visibleText(block) {
  if (!block || typeof block !== 'object') return '';
  const data = block.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  if (data.native && data.native_data && typeof data.native_data === 'object') {
    return '';
  }
  return (
    plainRichText(data.rich_text)
    || plainRichText(data.text)
    || stripHtml(data.html)
  );
}

export function visibleCharacterCount(blocks) {
  return (Array.isArray(blocks) ? blocks : []).map(visibleText).join('').length;
}

export function validateEditorLimits(blocks) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (list.length > MAX_PAGE_BLOCKS) {
    return { ok: false, code: 'blocks', limit: MAX_PAGE_BLOCKS, actual: list.length };
  }
  const characters = visibleCharacterCount(list);
  if (characters > MAX_VISIBLE_CHARACTERS) {
    return { ok: false, code: 'characters', limit: MAX_VISIBLE_CHARACTERS, actual: characters };
  }
  return { ok: true };
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

export function textData(message, blockType, headingSize = 2, richText = null, richHtml = null) {
  const plain = String(message?.text || '');
  if (blockType === 'paragraph' || blockType === 'text') {
    const inner = richHtml ?? plain;
    return { text: plain, html: '<p>' + inner + '</p>', rich_text: richText ?? plain };
  }
  if (blockType === 'heading') {
    const size = Math.max(1, Math.min(6, Number.parseInt(String(headingSize), 10) || 2));
    const inner = richHtml ?? plain;
    return { text: plain, html: '<h' + size + '>' + inner + '</h' + size + '>', rich_text: richText ?? plain, size };
  }
  if (blockType === 'preformatted') {
    return preformattedData(plain);
  }
  if (blockType === 'footer') {
    const inner = richHtml ?? plain;
    return { text: plain, html: '<footer>' + inner + '</footer>', rich_text: richText ?? plain };
  }
  return { text: plain, rich_text: richText ?? plain };
}

export function normalizeBlockScrollOffset(blockCount, value) {
  if (blockCount <= 0) return 0;
  const raw = Math.max(0, Number.parseInt(String(value || 0), 10) || 0);
  const last = Math.floor((blockCount - 1) / BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE;
  const clamped = Math.min(raw, last);
  return Math.floor(clamped / BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE;
}
