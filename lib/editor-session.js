import { db } from 'sdk';
import { eq, lt } from 'sdk/db';
import { editorSessions, maintenanceLocks } from 'schema';
import {
  EDITOR_SESSION_TTL_SECONDS,
  normalizeBlockScrollOffset,
  normalizeBlocks,
} from 'lib/editor-blocks';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function safeDraft(row) {
  const blocks = Array.isArray(row?.blocks) ? JSON.parse(JSON.stringify(row.blocks)) : [];
  normalizeBlocks(blocks);
  const messageButtons = Array.isArray(row?.messageButtons)
    ? JSON.parse(JSON.stringify(row.messageButtons))
    : [];
  return {
    blocks,
    messageButtons,
    buttonsPerRow: Math.max(1, Math.min(8, Number(row?.buttonsPerRow || 1))),
    buttonsAlign: ['left', 'center', 'right'].includes(String(row?.buttonsAlign || 'center'))
      ? String(row.buttonsAlign || 'center')
      : 'center',
    currentPageId: row?.currentPageId ?? null,
    currentPageTitle: row?.currentPageTitle ?? null,
  };
}

export async function clearExpiredEditorSessions(stamp = nowSeconds()) {
  return db.delete(editorSessions)
    .where(lt(editorSessions.lastActivityAt, stamp - EDITOR_SESSION_TTL_SECONDS))
    .run();
}

export async function createEditorSession(userId, chatId, managementMessageId) {
  const stamp = nowSeconds();
  const record = {
    userId: Number(userId),
    chatId: Number(chatId),
    state: 'managing',
    blocks: [],
    messageButtons: [],
    buttonsPerRow: 1,
    buttonsAlign: 'center',
    currentPageId: null,
    currentPageTitle: null,
    currentBlockId: null,
    pendingAddType: null,
    addStep: null,
    addPayload: {},
    expectedType: null,
    editField: null,
    headingSize: null,
    addPromptChatId: null,
    addPromptMessageId: null,
    managementChatId: Number(chatId),
    managementMessageId: Number(managementMessageId),
    blockScrollOffset: 0,
    undoStack: [],
    redoStack: [],
    previewMessageIds: [],
    blockPreviewMessageIds: {},
    pendingUserState: null,
    resumingUserButtons: 0,
    lastActivityAt: stamp,
  };
  await db.insert(editorSessions).values(record).onConflictDoUpdate({
    target: editorSessions.userId,
    set: {
      chatId: record.chatId,
      state: record.state,
      blocks: record.blocks,
      messageButtons: record.messageButtons,
      buttonsPerRow: record.buttonsPerRow,
      buttonsAlign: record.buttonsAlign,
      currentPageId: null,
      currentPageTitle: null,
      currentBlockId: null,
      pendingAddType: null,
      addStep: null,
      addPayload: {},
      expectedType: null,
      editField: null,
      headingSize: null,
      addPromptChatId: null,
      addPromptMessageId: null,
      managementChatId: record.managementChatId,
      managementMessageId: record.managementMessageId,
      blockScrollOffset: 0,
      undoStack: [],
      redoStack: [],
      previewMessageIds: [],
      blockPreviewMessageIds: {},
      pendingUserState: null,
      resumingUserButtons: 0,
      lastActivityAt: stamp,
    },
  }).run();
  await clearExpiredEditorSessions(stamp);
  return loadEditorSession(userId, { touch: false });
}

export async function loadEditorSession(userId, { touch = true } = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id)) return null;
  const row = await db.select().from(editorSessions)
    .where(eq(editorSessions.userId, id)).get();
  if (!row) return null;

  const stamp = nowSeconds();
  if (Number(row.lastActivityAt || 0) < stamp - EDITOR_SESSION_TTL_SECONDS) {
    await db.delete(editorSessions).where(eq(editorSessions.userId, id)).run();
    return null;
  }

  if (touch) {
    await db.update(editorSessions)
      .set({ lastActivityAt: stamp })
      .where(eq(editorSessions.userId, id))
      .run();
    row.lastActivityAt = stamp;
  }

  row.blocks = safeDraft(row).blocks;
  row.messageButtons = safeDraft(row).messageButtons;
  row.blockScrollOffset = normalizeBlockScrollOffset(
    row.blocks.length,
    row.blockScrollOffset,
  );
  return row;
}

export async function updateEditorSession(userId, changes, { touch = true } = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id)) return null;
  const payload = { ...changes };
  if (Array.isArray(payload.blocks)) {
    payload.blocks = JSON.parse(JSON.stringify(payload.blocks));
    normalizeBlocks(payload.blocks);
    if (!Object.hasOwn(payload, 'blockScrollOffset')) {
      const current = await loadEditorSession(id, { touch: false });
      payload.blockScrollOffset = normalizeBlockScrollOffset(
        payload.blocks.length,
        current?.blockScrollOffset,
      );
    }
  }
  if (touch) payload.lastActivityAt = nowSeconds();
  await db.update(editorSessions)
    .set(payload)
    .where(eq(editorSessions.userId, id))
    .run();
  return loadEditorSession(id, { touch: false });
}

export async function deleteEditorSession(userId) {
  return db.delete(editorSessions)
    .where(eq(editorSessions.userId, Number(userId)))
    .run();
}

export function editorDraft(session) {
  return safeDraft(session);
}

export async function setEditorState(userId, state, changes = {}) {
  return updateEditorSession(userId, { state, ...changes });
}

export async function clearEditorPrompt(userId) {
  return updateEditorSession(userId, {
    addPromptChatId: null,
    addPromptMessageId: null,
  });
}

export async function resetEditorTransientState(userId, state = 'managing') {
  return updateEditorSession(userId, {
    state,
    currentBlockId: null,
    pendingAddType: null,
    addStep: null,
    addPayload: {},
    expectedType: null,
    editField: null,
    headingSize: null,
    addPromptChatId: null,
    addPromptMessageId: null,
    pendingUserState: null,
    resumingUserButtons: 0,
  });
}


const MAX_HISTORY = 50;

function historySnapshot(session) {
  return {
    blocks: JSON.parse(JSON.stringify(session?.blocks || [])),
    messageButtons: JSON.parse(JSON.stringify(session?.messageButtons || [])),
    buttonsPerRow: Number(session?.buttonsPerRow || 1),
    buttonsAlign: String(session?.buttonsAlign || 'center'),
    currentPageId: session?.currentPageId ?? null,
    currentPageTitle: session?.currentPageTitle ?? null,
  };
}

export async function rememberEditorState(userId, session = null) {
  const current = session || await loadEditorSession(userId, { touch: false });
  if (!current) return false;
  const undo = Array.isArray(current.undoStack)
    ? JSON.parse(JSON.stringify(current.undoStack))
    : [];
  undo.push(historySnapshot(current));
  await updateEditorSession(userId, {
    undoStack: undo.slice(-MAX_HISTORY),
    redoStack: [],
  });
  return true;
}

export async function undoEditorState(userId) {
  const current = await loadEditorSession(userId, { touch: false });
  const undo = Array.isArray(current?.undoStack)
    ? JSON.parse(JSON.stringify(current.undoStack))
    : [];
  if (!current || !undo.length) return null;
  const target = undo.pop();
  const redo = Array.isArray(current.redoStack)
    ? JSON.parse(JSON.stringify(current.redoStack))
    : [];
  redo.push(historySnapshot(current));
  return updateEditorSession(userId, {
    ...target,
    undoStack: undo,
    redoStack: redo.slice(-MAX_HISTORY),
  });
}

export async function redoEditorState(userId) {
  const current = await loadEditorSession(userId, { touch: false });
  const redo = Array.isArray(current?.redoStack)
    ? JSON.parse(JSON.stringify(current.redoStack))
    : [];
  if (!current || !redo.length) return null;
  const target = redo.pop();
  const undo = Array.isArray(current.undoStack)
    ? JSON.parse(JSON.stringify(current.undoStack))
    : [];
  undo.push(historySnapshot(current));
  return updateEditorSession(userId, {
    ...target,
    undoStack: undo.slice(-MAX_HISTORY),
    redoStack: redo,
  });
}


const EDITOR_MUTATION_LOCK_SECONDS = 15;

export async function acquireEditorMutationLock(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id)) return false;
  const stamp = nowSeconds();
  await db.delete(maintenanceLocks)
    .where(lt(maintenanceLocks.expiresAt, stamp))
    .run();
  const name = 'editor:user:' + id;
  const rows = await db.insert(maintenanceLocks)
    .values({ name, expiresAt: stamp + EDITOR_MUTATION_LOCK_SECONDS })
    .onConflictDoNothing({ target: maintenanceLocks.name })
    .returning({ name: maintenanceLocks.name })
    .run();
  return Array.isArray(rows) && rows.length > 0;
}

export async function releaseEditorMutationLock(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id)) return;
  await db.delete(maintenanceLocks)
    .where(eq(maintenanceLocks.name, 'editor:user:' + id))
    .run();
}
