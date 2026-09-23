import { normalizeBlock, normalizeBlocks } from 'lib/editor/models';

export function anchorName(block) {
  if (block?.type !== 'anchor') return '';
  return String(block?.data?.text ?? block?.data?.name ?? '').trim();
}

export function anchorDisplayName(block) {
  if (block?.type !== 'anchor') return '';
  return String(block?.data?.display_name ?? anchorName(block)).trim();
}

export function anchorNavigationRichText(blocks) {
  const links = [];
  const ordered = [...(blocks ?? [])].sort((a,b) => Number(a?.position ?? 0) - Number(b?.position ?? 0));
  for (const block of ordered) {
    if (block?.type !== 'anchor') continue;
    const label = String(block?.data?.display_name ?? '').trim().replace(/\s+/g,' ');
    const name = anchorName(block);
    if (!label || !name) continue;
    if (links.length) links.push(' · ');
    links.push({ type:'anchor_link', text:label, anchor_name:name });
  }
  if (!links.length) return null;
  return links.length === 1 ? links[0] : links;
}

export function anchorTargetId(block) {
  if (block?.type !== 'anchor') return null;
  const value = block?.data?.target_block_id;
  return value ? String(value) : null;
}

export function anchorTargets(blocks, { excludeIds = [] } = {}) {
  const excluded = new Set([...excludeIds].map(String));
  return (blocks ?? []).filter((block) => block?.type !== 'anchor' && !excluded.has(String(block?.id)));
}

export function linkedAnchors(blocks, targetBlockId) {
  const target = String(targetBlockId);
  return (blocks ?? []).filter((block) => anchorTargetId(block) === target);
}

function randomAnchorName() {
  return `anchor_${(Date.now().toString(16) + Math.floor(Math.random()*1e9).toString(16)).slice(-10)}`;
}

export function newAnchorData(displayName, targetBlockId, { existingNames = [] } = {}) {
  const label = String(displayName).trim().replace(/\s+/g,' ').slice(0,64);
  const used = new Set([...existingNames].map(String));
  let name = '';
  do { name = randomAnchorName(); } while (!name || used.has(name));
  return {
    text:name,
    display_name:label,
    target_block_id:String(targetBlockId),
    html:`<a name="${name.replaceAll('"','&quot;')}"></a>`,
  };
}

export function setAnchorDisplayName(block, displayName) {
  if (block?.type !== 'anchor') return false;
  const label = String(displayName).trim().replace(/\s+/g,' ').slice(0,64);
  if (!label) return false;
  block.data ??= {};
  block.data.display_name = label;
  return true;
}

export function setAnchorTarget(blocks, anchorId, targetBlockId) {
  const target = (blocks ?? []).find((block) => String(block?.id) === String(targetBlockId) && block?.type !== 'anchor');
  const anchor = (blocks ?? []).find((block) => String(block?.id) === String(anchorId) && block?.type === 'anchor');
  if (!target || !anchor) return false;
  anchor.data ??= {};
  anchor.data.target_block_id = String(target.id);
  alignLinkedAnchors(blocks);
  return true;
}

export function retargetLinkedAnchors(blocks, oldTargetId, newTargetId) {
  const target = (blocks ?? []).find((block) => String(block?.id) === String(newTargetId) && block?.type !== 'anchor');
  const anchors = linkedAnchors(blocks, oldTargetId);
  if (!target || !anchors.length) return false;
  for (const anchor of anchors) {
    anchor.data ??= {};
    anchor.data.target_block_id = String(target.id);
  }
  alignLinkedAnchors(blocks);
  return true;
}

export function alignLinkedAnchors(blocks) {
  normalizeBlocks(blocks);
  const targetIds = new Set(blocks.filter((b)=>b?.type!=='anchor').map((b)=>String(b.id)));
  const grouped = new Map();
  const linkedIds = new Set();
  for (const block of blocks) {
    const targetId = anchorTargetId(block);
    if (targetId && targetIds.has(targetId)) {
      if (!grouped.has(targetId)) grouped.set(targetId,[]);
      grouped.get(targetId).push(block);
      linkedIds.add(String(block.id));
    }
  }
  const ordered = [];
  for (const block of blocks) {
    if (linkedIds.has(String(block.id))) continue;
    const blockId = String(block.id);
    ordered.push(...(grouped.get(blockId) ?? []), block);
  }
  blocks.splice(0,blocks.length,...ordered);
  blocks.forEach((block,index)=>normalizeBlock(block,{position:index}));
  return blocks;
}
