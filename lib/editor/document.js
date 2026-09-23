import { cloneBlocks, makeBlock, normalizeBlock, normalizeBlocks } from 'lib/editor/models';

export function normalizeBlockPositions(blocks) {
  return normalizeBlocks(blocks);
}

function reindexCurrentOrder(blocks) {
  blocks.forEach((block, index) => normalizeBlock(block, { position: index }));
  return blocks;
}

export function getBlockById(blocks, blockId) {
  if (!blockId) return null;
  return (Array.isArray(blocks) ? blocks : []).find((block) => block?.id === blockId) ?? null;
}

export function addBlock(blocks, block, { index = null } = {}) {
  normalizeBlock(block);
  const target = index == null
    ? blocks.length
    : Math.max(0, Math.min(Number.parseInt(index, 10) || 0, blocks.length));
  blocks.splice(target, 0, block);
  reindexCurrentOrder(blocks);
  return block;
}

export function deleteBlock(blocks, blockId) {
  const index = blocks.findIndex((block) => block?.id === blockId);
  if (index < 0) return false;
  blocks.splice(index, 1);
  reindexCurrentOrder(blocks);
  return true;
}

export function moveBlock(blocks, blockId, newIndex) {
  normalizeBlocks(blocks);
  const oldIndex = blocks.findIndex((block) => block?.id === blockId);
  const target = Number.parseInt(newIndex, 10);
  if (oldIndex < 0 || !Number.isInteger(target) || target < 0 || target >= blocks.length) return false;
  if (oldIndex !== target) {
    blocks.splice(target, 0, blocks.splice(oldIndex, 1)[0]);
    reindexCurrentOrder(blocks);
  }
  return true;
}

export function replaceBlock(blocks, blockId, replacement, { preserveId = true } = {}) {
  const index = blocks.findIndex((block) => block?.id === blockId);
  if (index < 0) return null;
  const current = blocks[index];
  const next = JSON.parse(JSON.stringify(replacement));
  normalizeBlock(next, { position: index });
  if (preserveId) next.id = current.id;
  blocks[index] = next;
  normalizeBlocks(blocks);
  return next;
}

export function replaceBlockData(blocks, blockId, data, { source = null } = {}) {
  const current = getBlockById(blocks, blockId);
  if (!current) return null;
  const resolved = source ?? ((data?.native || (data?.native_data && typeof data.native_data === 'object')) ? 'native' : 'generated');
  const replacement = makeBlock(String(current.type ?? 'content'), data, {
    position: Number(current.position ?? 0),
    source: resolved,
    blockId: String(current.id),
  });
  return replaceBlock(blocks, blockId, replacement);
}

export function duplicateBlock(blocks, blockId, { after = true } = {}) {
  const current = getBlockById(blocks, blockId);
  if (!current) return null;
  const index = blocks.indexOf(current) + (after ? 1 : 0);
  const duplicate = makeBlock(
    String(current.type ?? 'content'),
    JSON.parse(JSON.stringify(current.data ?? {})),
    { source: current.source },
  );
  addBlock(blocks, duplicate, { index });
  return duplicate;
}

export function childBlocks(container) {
  if (!container.data || typeof container.data !== 'object' || Array.isArray(container.data)) container.data = {};
  if (!Array.isArray(container.data.children)) container.data.children = [];
  return normalizeBlocks(container.data.children);
}

export function addChild(container, child, { index = null } = {}) {
  return addBlock(childBlocks(container), child, { index });
}

export function deleteChild(container, childId) {
  return deleteBlock(childBlocks(container), childId);
}

export function moveChild(container, childId, newIndex) {
  return moveBlock(childBlocks(container), childId, newIndex);
}

export function replaceChild(container, childId, replacement) {
  return replaceBlock(childBlocks(container), childId, replacement);
}

export function snapshotBlocks(blocks) {
  return cloneBlocks(blocks);
}
