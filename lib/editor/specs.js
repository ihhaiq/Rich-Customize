import { blockRegistry } from 'lib/editor/registry';

export const FINAL_RICH_BLOCK_TYPES = Object.freeze(blockRegistry.supportedTypes());
export const MEDIA_CAPTION_TYPES = Object.freeze(
  FINAL_RICH_BLOCK_TYPES.filter((type) => blockRegistry.get(type)?.supportsCaption),
);
export const QUOTE_TYPES = Object.freeze(['blockquote', 'pullquote']);

export function compatibleChildBlockTypes(containerType) {
  return blockRegistry.compatibleChildren(containerType);
}

export function inputKindFor(blockType) {
  return blockRegistry.get(blockType)?.inputKind ?? null;
}
