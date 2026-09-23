import { addBlock, deleteBlock, duplicateBlock, moveBlock, replaceBlock } from 'lib/editor/document';
import { cloneBlocks } from 'lib/editor/models';
import { blockRegistry } from 'lib/editor/registry';
import { alignLinkedAnchors, linkedAnchors } from 'lib/editor/anchors';

function result(blocks, changed, block = null) {
  return { blocks, changed:Boolean(changed), block };
}

export function add(blocks, block, { index = null } = {}) {
  const working = cloneBlocks(blocks);
  const added = addBlock(working, block, { index });
  alignLinkedAnchors(working);
  return result(working, true, added);
}

export function remove(blocks, blockId) {
  const working = cloneBlocks(blocks);
  for (const anchor of linkedAnchors(working, blockId)) deleteBlock(working, String(anchor.id));
  const changed = deleteBlock(working, blockId);
  return result(working, changed);
}

export function move(blocks, blockId, newIndex) {
  const working = cloneBlocks(blocks);
  const changed = moveBlock(working, blockId, newIndex);
  alignLinkedAnchors(working);
  const moved = working.find((item)=>item?.id===blockId) ?? null;
  return result(working, changed, moved);
}

export function replace(blocks, blockId, replacement) {
  const working = cloneBlocks(blocks);
  const updated = replaceBlock(working, blockId, replacement);
  return result(working, updated != null, updated);
}

export function duplicate(blocks, blockId, { after = true } = {}) {
  const working = cloneBlocks(blocks);
  const copied = duplicateBlock(working, blockId, { after });
  if (copied?.type === 'anchor') {
    copied.data ??= {};
    copied.data.text = `anchor_${String(copied.id).slice(0,10)}`;
    copied.data.html = `<a name="${copied.data.text}"></a>`;
  }
  alignLinkedAnchors(working);
  return result(working, copied != null, copied);
}

export function importBlocks(blocks) {
  const imported = cloneBlocks(blocks);
  return result(imported, imported.length > 0);
}

export function validate(blocks) {
  const errors = [];
  const normalized = cloneBlocks(blocks);
  normalized.forEach((block,index)=>{
    const adapter = blockRegistry.get(String(block?.type ?? ''));
    if (!adapter) {
      errors.push(`blocks[${index}]: unsupported type ${block?.type}`);
      return;
    }
    for (const error of adapter.validate(block)) errors.push(`blocks[${index}]: ${error}`);
  });
  return errors;
}

export const editorWorkflow = Object.freeze({ add, delete:remove, move, replace, duplicate, importBlocks, validate });
