import { readFsm, updateFsmData } from 'lib/storage/fsm';

export const UNDO_KEY = 'editor_history_undo';
export const REDO_KEY = 'editor_history_redo';
export const MAX_HISTORY = 50;
export const SNAPSHOT_KEYS = Object.freeze([
  'blocks','message_buttons','buttons_per_row','buttons_align','current_page_id','current_page_title',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

export function snapshot(data = {}) {
  const out = {};
  for (const key of SNAPSHOT_KEYS) if (Object.hasOwn(data,key)) out[key] = clone(data[key]);
  return out;
}

export async function remember(storageKey, data = null) {
  const current = data ?? (await readFsm(storageKey)).data;
  const undo = [...(current[UNDO_KEY] ?? [])];
  undo.push(snapshot(current));
  await updateFsmData(storageKey, {
    [UNDO_KEY]: undo.slice(-MAX_HISTORY),
    [REDO_KEY]: [],
  });
}

export async function undo(storageKey) {
  const current = (await readFsm(storageKey)).data;
  const undoStack = [...(current[UNDO_KEY] ?? [])];
  if (!undoStack.length) return null;
  const target = undoStack.pop();
  const redoStack = [...(current[REDO_KEY] ?? []), snapshot(current)].slice(-MAX_HISTORY);
  await updateFsmData(storageKey, {
    ...target,
    [UNDO_KEY]: undoStack,
    [REDO_KEY]: redoStack,
  });
  return target;
}

export async function redo(storageKey) {
  const current = (await readFsm(storageKey)).data;
  const redoStack = [...(current[REDO_KEY] ?? [])];
  if (!redoStack.length) return null;
  const target = redoStack.pop();
  const undoStack = [...(current[UNDO_KEY] ?? []), snapshot(current)].slice(-MAX_HISTORY);
  await updateFsmData(storageKey, {
    ...target,
    [UNDO_KEY]: undoStack,
    [REDO_KEY]: redoStack,
  });
  return target;
}

export async function clearHistory(storageKey) {
  await updateFsmData(storageKey, { [UNDO_KEY]: [], [REDO_KEY]: [] });
}
