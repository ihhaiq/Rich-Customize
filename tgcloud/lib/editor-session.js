import { db } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import { editorSessions, maintenanceLocks, richPages } from 'schema';
import { validateEditorLimits } from 'lib/editor-blocks';
import { isLegacySavedPage, isSavedPageUnchanged } from 'lib/saved-page-policy';
import {
  EDITOR_SESSION_TTL_SECONDS,
  normalizeBlockScrollOffset,
  normalizeBlocks,
} from 'lib/editor-blocks';
import {
  enqueuePageUpsertSync,
  flushMiniAppSyncOutbox,
  nextPageSyncVersion,
} from 'lib/miniapp-sync';
import { logError } from 'lib/error-log';
import { getEditorEntitlement } from 'lib/editor-subscriptions';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

const SAVED_DRAFT_FIELDS = Object.freeze([
  'blocks',
  'messageButtons',
  'buttonsPerRow',
  'buttonsAlign',
]);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stable(value) {
  return JSON.stringify(value);
}

function normalizedButtonsPerRow(value) {
  return Math.max(1, Math.min(8, Number(value || 1)));
}

function normalizedButtonsAlign(value) {
  return ['left', 'center', 'right'].includes(String(value || 'center'))
    ? String(value || 'center')
    : 'center';
}

function hasRealSavedDraftMutation(current, payload) {
  if (!current?.currentPageId) return false;
  if (
    Object.hasOwn(payload, 'currentPageId')
    && String(payload.currentPageId || '') !== String(current.currentPageId || '')
  ) return false;

  for (const field of SAVED_DRAFT_FIELDS) {
    if (!Object.hasOwn(payload, field)) continue;
    if (field === 'blocks') {
      const next = clone(payload.blocks || []);
      normalizeBlocks(next);
      if (stable(next) !== stable(current.blocks || [])) return true;
      continue;
    }
    if (field === 'messageButtons') {
      if (stable(payload.messageButtons || []) !== stable(current.messageButtons || [])) return true;
      continue;
    }
    if (field === 'buttonsPerRow') {
      if (normalizedButtonsPerRow(payload.buttonsPerRow) !== normalizedButtonsPerRow(current.buttonsPerRow)) return true;
      continue;
    }
    if (field === 'buttonsAlign') {
      if (normalizedButtonsAlign(payload.buttonsAlign) !== normalizedButtonsAlign(current.buttonsAlign)) return true;
    }
  }
  return false;
}

function savedPageMatchesSession(page, session) {
  return isSavedPageUnchanged(page, session);
}

async function syncSavedPageSession(userId, session) {
  const pageId = String(session?.currentPageId || '');
  if (!pageId) return { status:'unsaved', changed:false };

  const page = await db.select().from(richPages)
    .where(eq(richPages.pageId, pageId)).get();
  if (!page || Number(page.ownerId) !== Number(userId)) {
    return { status:'missing', changed:false };
  }
  if (savedPageMatchesSession(page, session)) {
    try {
      await flushMiniAppSyncOutbox({ limit:1 });
    } catch (error) {
      await logError('miniapp_sync.editor_manual_retry', error, {
        userId,
        extra:'page=' + pageId,
      });
    }
    return { status:'unchanged', changed:false, page };
  }

  const entitlement = await getEditorEntitlement(userId);
  if (isLegacySavedPage(page, userId, entitlement)) {
    return { status:'legacy_read_only', changed:false, page };
  }
  const quota = validateEditorLimits(session.blocks || [], userId, {
    entitlement,
  });
  if (!quota.ok) return { status:'quota_exceeded', changed:false, limit:quota };
  const stamp = Math.max(nowSeconds(), Number(page.updatedAt || 0) + 1);
  const version = await nextPageSyncVersion(page.revision || 1);

  const changed = await db.update(richPages).set({
    blocks: clone(session.blocks || []),
    buttons: clone(session.messageButtons || []),
    buttonsPerRow: normalizedButtonsPerRow(session.buttonsPerRow),
    buttonsAlign: normalizedButtonsAlign(session.buttonsAlign),
    updatedAt: stamp,
    revision: version.revision,
    syncSeq: version.syncSeq,
  }).where(and(
    eq(richPages.pageId, pageId),
    eq(richPages.ownerId, Number(userId)),
    eq(richPages.revision, Number(page.revision || 1)),
  )).returning({ pageId: richPages.pageId }).run();
  if (!Array.isArray(changed) || !changed.length) {
    return { status:'conflict', changed:false };
  }

  const saved = await db.select().from(richPages)
    .where(eq(richPages.pageId, pageId)).get();
  if (saved) {
    try {
      await enqueuePageUpsertSync(saved);
      await flushMiniAppSyncOutbox({ limit:1 });
    } catch (error) {
      await logError('miniapp_sync.editor_auto', error, {
        userId,
        extra:'page=' + pageId,
      });
    }
  }
  return { status:'synced', changed:true, page:saved || page };
}

export async function trustedEditorQuotaBaseline(userId, session) {
  const id = String(session?.currentPageId || '').trim();
  const owner = Number(userId);
  if (!id || !Number.isSafeInteger(owner) || owner <= 0) return null;
  const page = await db.select().from(richPages)
    .where(and(eq(richPages.pageId, id), eq(richPages.ownerId, owner))).get();
  return page && Array.isArray(page.blocks) ? page.blocks : null;
}

export async function syncSavedEditorPage(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id)) return { status:'invalid', changed:false };
  const session = await loadEditorSession(id, { touch:false });
  if (!session) return { status:'expired', changed:false };
  return syncSavedPageSession(id, session);
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
    .where(lt(editorSessions.lastActivityAt, stamp - EDITOR_SESSION_TTL_SECONDS + 1))
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
    premiumEmojiPack: null,
    expectedType: null,
    editField: null,
    headingSize: null,
    addPromptChatId: null,
    addPromptMessageId: null,
    managementChatId: Number(chatId),
    managementMessageId: Number(managementMessageId),
    blockScrollOffset: 0,
    blockScrollEnabled: 1,
    currentButtonId: null,
    pendingButtonAction: null,
    pendingButtonText: null,
    pendingButtonType: null,
    pendingChildType: null,
    nestedDetailsId: null,
    nestedChildId: null,
    nestedAction: null,
    pagesSearchQuery: '',
    pagesSortMode: 'updated',
    renamePageId: null,
    pagesPageIndex: 0,
    deletedPageId: null,
    deletedPageSnapshot: null,
    deletedPageIndex: null,
    deletedPageWasCurrent: null,
    undoStack: [],
    redoStack: [],
    previewMessageIds: [],
    blockPreviewMessageIds: {},
    blockPeekMessageId: null,
    pendingUserState: null,
    resumingUserButtons: 0,
    buttonPreviewMessageId: null,
    postSelectedChatIds: [],
    postSilent: 0,
    postProtected: 0,
    postSchedulePending: 0,
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
      premiumEmojiPack: null,
      expectedType: null,
      editField: null,
      headingSize: null,
      addPromptChatId: null,
      addPromptMessageId: null,
      managementChatId: record.managementChatId,
      managementMessageId: record.managementMessageId,
      blockScrollOffset: 0,
      blockScrollEnabled: 1,
      currentButtonId: null,
      pendingButtonAction: null,
      pendingButtonText: null,
      pendingButtonType: null,
      pendingChildType: null,
      nestedDetailsId: null,
      nestedChildId: null,
      nestedAction: null,
      pagesSearchQuery: '',
      pagesSortMode: 'updated',
      renamePageId: null,
      pagesPageIndex: 0,
      deletedPageId: null,
      deletedPageSnapshot: null,
      deletedPageIndex: null,
      deletedPageWasCurrent: null,
      undoStack: [],
      redoStack: [],
      previewMessageIds: [],
      blockPreviewMessageIds: {},
      blockPeekMessageId: null,
      pendingUserState: null,
      resumingUserButtons: 0,
      buttonPreviewMessageId: null,
      postSelectedChatIds: [],
      postSilent: 0,
      postProtected: 0,
      postSchedulePending: 0,
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
  if (Number(row.lastActivityAt || 0) <= stamp - EDITOR_SESSION_TTL_SECONDS) {
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
  const currentForMutation = SAVED_DRAFT_FIELDS.some((field) => Object.hasOwn(payload, field))
    ? await loadEditorSession(id, { touch:false })
    : null;
  const shouldAutoSync = hasRealSavedDraftMutation(currentForMutation, payload);

  // Every session write that carries block or button content passes through
  // the same server-side quota gate. This covers edits that skip the explicit
  // per-handler checks (undo/redo, reorder, media, details, imported messages).
  // Hydrating an identical persisted legacy page is allowed; editing it is not.
  if (SAVED_DRAFT_FIELDS.some(field => Object.hasOwn(payload, field))) {
    const entitlement = await getEditorEntitlement(id);
    const targetId = Object.hasOwn(payload, 'currentPageId')
      ? String(payload.currentPageId || '') : String(currentForMutation?.currentPageId || '');
    const stored = targetId
      ? await db.select().from(richPages).where(eq(richPages.pageId, targetId)).get()
      : null;
    const page = stored && Number(stored.ownerId) === id ? stored : null;
    const prospective = {
      blocks: payload.blocks ?? currentForMutation?.blocks ?? [],
      messageButtons: payload.messageButtons ?? currentForMutation?.messageButtons ?? [],
      buttonsPerRow: payload.buttonsPerRow ?? currentForMutation?.buttonsPerRow ?? 1,
      buttonsAlign: payload.buttonsAlign ?? currentForMutation?.buttonsAlign ?? 'center',
    };
    const identicalLegacy = page && isLegacySavedPage(page, id, entitlement)
      && isSavedPageUnchanged(page, prospective);
    if (page && isLegacySavedPage(page, id, entitlement) && !identicalLegacy) {
      const error = new Error('LEGACY_PAGE_READ_ONLY');
      error.code = 'LEGACY_PAGE_READ_ONLY';
      throw error;
    }
    if (!identicalLegacy) {
      const result = validateEditorLimits(prospective.blocks, id, { entitlement });
      if (!result.ok) {
        const error = new Error('EDITOR_LIMIT:' + result.code + ':' + result.actual + ':' + result.limit);
        error.code = 'EDITOR_LIMIT';
        error.editorLimit = result;
        throw error;
      }
    }
  }

  if (Array.isArray(payload.blocks)) {
    payload.blocks = JSON.parse(JSON.stringify(payload.blocks));
    normalizeBlocks(payload.blocks);
    if (!Object.hasOwn(payload, 'blockScrollOffset')) {
      const current = currentForMutation || await loadEditorSession(id, { touch: false });
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

  const updated = await loadEditorSession(id, { touch: false });
  if (shouldAutoSync && updated?.currentPageId) {
    try {
      await syncSavedPageSession(id, updated);
    } catch (error) {
      await logError('editor.auto_page_sync', error, {
        userId:id,
        extra:'page=' + String(updated.currentPageId || ''),
      });
    }
  }
  return updated;
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
    currentButtonId: null,
    pendingButtonAction: null,
    pendingButtonText: null,
    pendingButtonType: null,
    pendingChildType: null,
    nestedDetailsId: null,
    nestedChildId: null,
    nestedAction: null,
    blockScrollEnabled: 1,
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
    state: 'managing',
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
    currentButtonId: null,
    pendingButtonAction: null,
    pendingButtonText: null,
    pendingButtonType: null,
    pendingChildType: null,
    nestedDetailsId: null,
    nestedChildId: null,
    nestedAction: null,
    blockScrollEnabled: 1,
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
    state: 'managing',
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
    currentButtonId: null,
    pendingButtonAction: null,
    pendingButtonText: null,
    pendingButtonType: null,
    pendingChildType: null,
    nestedDetailsId: null,
    nestedChildId: null,
    nestedAction: null,
    blockScrollEnabled: 1,
    undoStack: undo.slice(-MAX_HISTORY),
    redoStack: redo,
  });
}


const EDITOR_MUTATION_LOCK_SECONDS = 60;
const EDITOR_MESSAGE_LOCK_SECONDS = 30;

function editorMessageLockName(chatId, messageId) {
  const safeChatId = Number(chatId);
  const safeMessageId = Number(messageId);
  if (!Number.isSafeInteger(safeChatId) || !Number.isSafeInteger(safeMessageId)) {
    return null;
  }
  return 'editor:message:' + safeChatId + ':' + safeMessageId;
}

export async function acquireEditorMessageLock(chatId, messageId) {
  const name = editorMessageLockName(chatId, messageId);
  if (!name) return null;

  const stamp = nowSeconds();
  await db.delete(maintenanceLocks)
    .where(lt(maintenanceLocks.expiresAt, stamp))
    .run();

  const expiresAt = stamp + EDITOR_MESSAGE_LOCK_SECONDS;
  const rows = await db.insert(maintenanceLocks)
    .values({ name, expiresAt })
    .onConflictDoNothing({ target: maintenanceLocks.name })
    .returning({ name: maintenanceLocks.name })
    .run();

  // Serverless V8 has no timer API. A concurrent callback is rejected here;
  // Telegram will keep the current panel usable and the user can tap again.
  return Array.isArray(rows) && rows.length > 0 ? { name, expiresAt } : null;
}

export async function releaseEditorMessageLock(lock) {
  if (!lock?.name || !Number.isSafeInteger(Number(lock.expiresAt))) return;
  await db.delete(maintenanceLocks)
    .where(and(
      eq(maintenanceLocks.name, String(lock.name)),
      eq(maintenanceLocks.expiresAt, Number(lock.expiresAt)),
    ))
    .run();
}

export async function withEditorMessageLock(chatId, messageId, callback) {
  const lock = await acquireEditorMessageLock(chatId, messageId);
  if (!lock) return { acquired: false, value: null };
  try {
    return { acquired: true, value: await callback() };
  } finally {
    await releaseEditorMessageLock(lock);
  }
}


export async function acquireEditorMutationLock(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id)) return null;
  const stamp = nowSeconds();
  await db.delete(maintenanceLocks)
    .where(lt(maintenanceLocks.expiresAt, stamp))
    .run();
  const name = 'editor:user:' + id;
  const expiresAt = stamp + EDITOR_MUTATION_LOCK_SECONDS;
  const rows = await db.insert(maintenanceLocks)
    .values({ name, expiresAt })
    .onConflictDoNothing({ target: maintenanceLocks.name })
    .returning({ name: maintenanceLocks.name })
    .run();
  return Array.isArray(rows) && rows.length > 0 ? { name, expiresAt } : null;
}

export async function releaseEditorMutationLock(lock) {
  if (!lock?.name || !Number.isSafeInteger(Number(lock.expiresAt))) return;
  await db.delete(maintenanceLocks)
    .where(and(
      eq(maintenanceLocks.name, String(lock.name)),
      eq(maintenanceLocks.expiresAt, Number(lock.expiresAt)),
    ))
    .run();
}
