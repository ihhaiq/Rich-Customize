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
    text: '📝 Text',
    paragraph: '📝 Paragraph',
    heading: '🔠 Section heading',
    preformatted: '💻 Preformatted',
    footer: '🔻 Footer',
    divider: '➖ Divider',
    anchor: '⚓ Anchor',
    content: '📦 Content',
  },
  ar: {
    text: '📝 نص',
    paragraph: '📝 فقرة',
    heading: '🔠 عنوان قسم',
    preformatted: '💻 نص برمجي',
    footer: '🔻 تذييل',
    divider: '➖ فاصل',
    anchor: '⚓ مرساة',
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

function visibleText(block) {
  if (!block || typeof block !== 'object') return '';
  const data = block.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';

  if (
    data.native
    && data.native_data
    && typeof data.native_data === 'object'
    && !Array.isArray(data.native_data)
  ) {
    return plainRichText(data.native_data.text);
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

export function textData(message, blockType, headingSize = 2, _richText = null, richHtml = null) {
  const plain = String(message?.text || '');
  if (blockType === 'paragraph' || blockType === 'text') {
    const inner = richHtml ?? plain;
    return { text: plain, html: '<p>' + inner + '</p>' };
  }
  if (blockType === 'heading') {
    const size = Math.max(1, Math.min(6, Number.parseInt(String(headingSize), 10) || 2));
    const inner = richHtml ?? plain;
    return { text: plain, html: '<h' + size + '>' + inner + '</h' + size + '>', size };
  }
  if (blockType === 'preformatted') {
    return preformattedData(plain);
  }
  if (blockType === 'footer') {
    const inner = richHtml ?? plain;
    return { text: plain, html: '<footer>' + inner + '</footer>' };
  }
  return { text: plain, html: richHtml ?? plain };
}

export function normalizeBlockScrollOffset(blockCount, value) {
  if (blockCount <= 0) return 0;
  const raw = Math.max(0, Number.parseInt(String(value || 0), 10) || 0);
  const last = Math.floor((blockCount - 1) / BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE;
  const clamped = Math.min(raw, last);
  return Math.floor(clamped / BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE;
}
