export const SOURCE_GENERATED = 'generated';
export const SOURCE_IMPORTED = 'imported';
export const SOURCE_NATIVE = 'native';
export const VALID_SOURCES = new Set([SOURCE_GENERATED, SOURCE_IMPORTED, SOURCE_NATIVE]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeId() {
  const seed = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(16);
  return (Date.now().toString(16) + seed).slice(-12);
}

function safePosition(value) {
  const parsed = Number.parseInt(value ?? 0, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function inferSource(data = null, source = null) {
  if (VALID_SOURCES.has(source)) return source;
  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  if (payload.native || (payload.native_data && typeof payload.native_data === 'object' && !Array.isArray(payload.native_data))) {
    return SOURCE_NATIVE;
  }
  return SOURCE_GENERATED;
}

export function makeBlock(blockType, data = null, {
  position = 0,
  source = null,
  blockId = null,
} = {}) {
  const payload = clone(data ?? {});
  const resolvedSource = inferSource(payload, source);
  if (resolvedSource === SOURCE_NATIVE) payload.native = true;
  else if (payload.native === false) delete payload.native;
  return {
    id: blockId || makeId(),
    type: String(blockType),
    position: Number.parseInt(position, 10) || 0,
    source: resolvedSource,
    data: payload,
  };
}

function emptyDetailsChild() {
  return makeBlock('paragraph', { text: '…', html: '<p>…</p>' }, { position: 0 });
}

export function normalizeBlock(block, { position = null } = {}) {
  if (!block || typeof block !== 'object' || Array.isArray(block)) return block;
  if (!block.id) block.id = makeId();
  block.type = String(block.type ?? 'content');
  block.position = position == null ? safePosition(block.position) : Number(position);

  if (!block.data || typeof block.data !== 'object' || Array.isArray(block.data)) block.data = {};
  const data = block.data;
  const source = inferSource(data, block.source);
  block.source = source;
  if (source === SOURCE_NATIVE) data.native = true;

  if (block.type === 'details' && !Array.isArray(data.children)) data.children = [];
  if (Array.isArray(data.children)) normalizeBlocks(data.children);
  if (block.type === 'details' && Array.isArray(data.children) && data.children.length === 0) {
    data.children.push(emptyDetailsChild());
    if (source === SOURCE_NATIVE) {
      block.source = SOURCE_GENERATED;
      delete data.native;
      delete data.native_data;
      delete data.native_type;
    }
  }

  if (Array.isArray(data.items)) {
    for (const item of data.items) {
      if (item && typeof item === 'object' && Array.isArray(item.blocks)) normalizeBlocks(item.blocks);
    }
  }
  return block;
}

export function normalizeBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  const valid = blocks.filter((block) => block && typeof block === 'object' && !Array.isArray(block));
  valid.sort((a, b) => safePosition(a.position) - safePosition(b.position));
  blocks.splice(0, blocks.length, ...valid);
  blocks.forEach((block, index) => normalizeBlock(block, { position: index }));
  return blocks;
}

export function cloneBlocks(blocks) {
  const cloned = clone(Array.isArray(blocks) ? blocks : []);
  return normalizeBlocks(cloned);
}
