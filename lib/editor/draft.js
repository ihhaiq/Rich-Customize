import { normalizeBlocks } from 'lib/editor/models';
import { normalizeBlockScrollOffset } from 'lib/editor/view_state';
import { readFsm, updateFsmData } from 'lib/storage/fsm';

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function editorDraftFromState(data = {}) {
  const blocks = clone(data.blocks ?? []);
  normalizeBlocks(blocks);
  return {
    blocks,
    message_buttons: clone(data.message_buttons ?? []),
    buttons_per_row: Math.max(1, Math.min(8, Number.parseInt(data.buttons_per_row ?? 1,10) || 1)),
    buttons_align: String(data.buttons_align ?? 'center') || 'center',
    current_page_id: data.current_page_id ?? null,
    current_page_title: data.current_page_title ?? null,
  };
}

export function draftAsState(draft) {
  return {
    blocks: clone(draft.blocks ?? []),
    message_buttons: clone(draft.message_buttons ?? []),
    buttons_per_row: draft.buttons_per_row ?? 1,
    buttons_align: draft.buttons_align ?? 'center',
    current_page_id: draft.current_page_id ?? null,
    current_page_title: draft.current_page_title ?? null,
  };
}

export async function loadDraft(storageKey) {
  const current = await readFsm(storageKey);
  const draft = editorDraftFromState(current.data);
  const blockScrollOffset = normalizeBlockScrollOffset(draft.blocks.length, current.data.block_scroll_offset);
  if (current.data.block_scroll_offset !== blockScrollOffset) {
    await updateFsmData(storageKey,{block_scroll_offset:blockScrollOffset});
  }
  return draft;
}

export async function saveDraft(storageKey, draft = null, changes = {}) {
  const current = await readFsm(storageKey);
  const base = draft ? draftAsState(draft) : draftAsState(editorDraftFromState(current.data));
  const normalized = editorDraftFromState({ ...base, ...changes });
  const blockScrollOffset = normalizeBlockScrollOffset(
    normalized.blocks.length,
    current.data.block_scroll_offset,
  );
  await updateFsmData(storageKey, {
    ...draftAsState(normalized),
    block_scroll_offset:blockScrollOffset,
  });
  return normalized;
}
