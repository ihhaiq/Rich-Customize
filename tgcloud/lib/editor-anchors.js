import { normalizeBlock, normalizeBlocks } from 'lib/editor-blocks';

export function anchorName(block) {
  if (block?.type !== 'anchor') return '';
  const data = block?.data && typeof block.data === 'object' ? block.data : {};
  return String(data.text || data.name || '').trim();
}

export function anchorDisplayName(block) {
  if (block?.type !== 'anchor') return '';
  const data = block?.data && typeof block.data === 'object' ? block.data : {};
  return String(data.display_name || anchorName(block)).trim();
}

export function newAnchorData(displayName, targetBlockId, existingNames = []) {
  const label = String(displayName || '').split(/\s+/).filter(Boolean).join(' ').trim().slice(0, 64);
  const used = new Set((Array.isArray(existingNames) ? existingNames : []).map((value) => String(value)));
  let name = '';
  while (!name || used.has(name)) {
    const uuid = globalThis.crypto?.randomUUID?.();
    const token = uuid
      ? String(uuid).replaceAll('-', '').slice(0, 10)
      : (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 10);
    name = 'anchor_' + token;
  }
  return {
    text: name,
    display_name: label,
    target_block_id: String(targetBlockId),
    html: '<a name="' + name.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;') + '"></a>',
  };
}

export function setAnchorDisplayName(block, displayName) {
  if (block?.type !== 'anchor') return false;
  const label = String(displayName || '').split(/\s+/).filter(Boolean).join(' ').trim().slice(0, 64);
  if (!label) return false;
  if (!block.data || typeof block.data !== 'object' || Array.isArray(block.data)) block.data = {};
  block.data.display_name = label;
  return true;
}

export function anchorTargetId(block) {
  if (block?.type !== 'anchor') return null;
  const value = block?.data?.target_block_id;
  return value ? String(value) : null;
}

export function anchorTargets(blocks, excludeIds = []) {
  const excluded = new Set((excludeIds || []).map((value) => String(value)));
  return (Array.isArray(blocks) ? blocks : []).filter(
    (block) => block?.type !== 'anchor' && !excluded.has(String(block?.id)),
  );
}

export function linkedAnchors(blocks, targetBlockId) {
  const target = String(targetBlockId);
  return (Array.isArray(blocks) ? blocks : []).filter(
    (block) => anchorTargetId(block) === target,
  );
}

export function alignLinkedAnchors(blocks) {
  if (!Array.isArray(blocks)) return [];
  normalizeBlocks(blocks);

  const targetIds = new Set(
    blocks
      .filter((block) => block?.type !== 'anchor')
      .map((block) => String(block?.id)),
  );
  const grouped = new Map();
  const linkedIds = new Set();

  for (const block of blocks) {
    const targetId = anchorTargetId(block);
    if (!targetId || !targetIds.has(targetId)) continue;
    if (!grouped.has(targetId)) grouped.set(targetId, []);
    grouped.get(targetId).push(block);
    linkedIds.add(String(block.id));
  }

  const ordered = [];
  for (const block of blocks) {
    if (linkedIds.has(String(block?.id))) continue;
    const blockId = String(block?.id);
    if (grouped.has(blockId)) ordered.push(...grouped.get(blockId));
    ordered.push(block);
  }

  blocks.splice(0, blocks.length, ...ordered);
  for (let index = 0; index < blocks.length; index += 1) {
    normalizeBlock(blocks[index], index);
  }
  return blocks;
}

export function retargetLinkedAnchors(blocks, oldTargetId, newTargetId) {
  const target = (Array.isArray(blocks) ? blocks : []).find(
    (block) => String(block?.id) === String(newTargetId) && block?.type !== 'anchor',
  );
  const anchors = linkedAnchors(blocks, oldTargetId);
  if (!target || !anchors.length) return false;
  for (const anchor of anchors) {
    if (!anchor.data || typeof anchor.data !== 'object' || Array.isArray(anchor.data)) {
      anchor.data = {};
    }
    anchor.data.target_block_id = String(target.id);
  }
  alignLinkedAnchors(blocks);
  return true;
}

export function setAnchorTarget(blocks, anchorId, targetBlockId) {
  const target = (Array.isArray(blocks) ? blocks : []).find(
    (block) => String(block?.id) === String(targetBlockId) && block?.type !== 'anchor',
  );
  const anchor = (Array.isArray(blocks) ? blocks : []).find(
    (block) => String(block?.id) === String(anchorId) && block?.type === 'anchor',
  );
  if (!anchor || !target) return false;
  if (!anchor.data || typeof anchor.data !== 'object' || Array.isArray(anchor.data)) {
    anchor.data = {};
  }
  anchor.data.target_block_id = String(target.id);
  alignLinkedAnchors(blocks);
  return true;
}

export function anchorNavigationRichText(blocks) {
  const links = [];
  const ordered = [...(Array.isArray(blocks) ? blocks : [])].sort(
    (a, b) => Number(a?.position || 0) - Number(b?.position || 0),
  );
  for (const block of ordered) {
    if (block?.type !== 'anchor') continue;
    const data = block?.data && typeof block.data === 'object' ? block.data : {};
    const label = String(data.display_name || '').split(/\s+/).filter(Boolean).join(' ').trim();
    const name = anchorName(block);
    if (!label || !name) continue;
    if (links.length) links.push(' · ');
    links.push({
      type: 'anchor_link',
      text: label,
      anchor_name: name,
    });
  }
  if (!links.length) return null;
  return links.length === 1 ? links[0] : links;
}
