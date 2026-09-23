export const BLOCK_SCROLL_SIZE = 8;

export function normalizeBlockScrollOffset(blockCount, value) {
  if (Number(blockCount) <= 0) return 0;
  const parsed = Number.parseInt(value ?? 0, 10);
  const raw = Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  const last = Math.floor((Number(blockCount) - 1) / BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE;
  const clamped = Math.min(raw, last);
  return Math.floor(clamped / BLOCK_SCROLL_SIZE) * BLOCK_SCROLL_SIZE;
}

export function currentBlockScrollOffset(data = {}) {
  return normalizeBlockScrollOffset(Array.isArray(data.blocks) ? data.blocks.length : 0, data.block_scroll_offset);
}

export function setBlockScrollOffset(data, value) {
  const normalized = normalizeBlockScrollOffset(Array.isArray(data?.blocks) ? data.blocks.length : 0, value);
  if (data && typeof data === 'object') data.block_scroll_offset = normalized;
  return normalized;
}
