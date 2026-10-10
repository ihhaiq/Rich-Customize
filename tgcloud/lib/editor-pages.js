import { assertUniquePageTitle, acquireOwnerPageLock, releaseOwnerPageLock } from 'lib/page-names';
import { api, db } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import { maintenanceLocks, richPages } from 'schema';
import { isDeveloper } from 'lib/developer-access';
import {
  MAX_SAVED_PAGES,
  validateEditorLimits,
} from 'lib/editor-blocks';
import {
  buildEditorKeyboard,
  editorDashboardRichMessage,
} from 'lib/editor-block-ui';
import {
  acquireEditorMutationLock,
  deleteEditorSession,
  loadEditorSession,
  releaseEditorMutationLock,
  rememberEditorState,
  syncSavedEditorPage,
  updateEditorSession,
} from 'lib/editor-session';
import {
  buildPageDeleteConfirmationKeyboard,
  buildPageRestoreKeyboard,
  buildPageSortKeyboard,
  emptyPagesText,
  pagesCopy,
  renderPagesScreen,
} from 'lib/pages';
import { resolveLanguage, resolveUserLanguage, t, tr } from 'lib/i18n';
import {
  enqueuePageDeleteSync,
  enqueuePageUpsertSync,
  flushMiniAppSyncOutbox,
  nextPageSyncVersion,
} from 'lib/miniapp-sync';
import { logError } from 'lib/error-log';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { safePlanLimit } from 'lib/subscription-policy';
import { assertWritableSavedPage, isLegacySavedPage, isSavedPageUnchanged } from 'lib/saved-page-policy';

function languageCode(source) {
  return source?.from?.language_code || 'en';
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function messageNotModified(error) {
  return String(error?.description || error?.message || error)
    .toLowerCase()
    .includes('message is not modified');
}

async function editCallbackMessage(query, payload) {
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  if (!chatId || !messageId) return false;
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      ...payload,
    });
    return true;
  } catch (error) {
    if (messageNotModified(error)) return true;
    throw error;
  }
}

function pageCode() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return String(uuid).replaceAll('-', '').slice(0, 8).toLowerCase();
  return (
    Math.random().toString(16).slice(2)
    + Date.now().toString(16)
  ).replace(/[^0-9a-f]/gi, '').slice(0, 8).toLowerCase().padEnd(8, '0');
}

function copy(code) {
  const locale = resolveLanguage(code);
  return {
    locale,
    noBlocks: locale === 'ar'
      ? 'ماكو محتوى لمزامنته.'
      : tr(locale, 'There is no content to sync.'),
    sendName: tr(locale, 'Send a page name to save it; maximum 64 characters.'),
    originalMissing: tr(locale, 'The original page no longer exists.'),
    originalMissingPrompt: tr(locale, 'The original page no longer exists. Send a name to save it as a new page.'),
    badName: tr(locale, 'The page name must be text.'),
    longName: tr(locale, 'The page name is too long; maximum 64 characters.'),
    limit: t(locale, 'pages.limit_reached', { limit: MAX_SAVED_PAGES }),
    updatedNotice: (title) => tr(locale, '✅ Updated saved page “{title}”.', { title }),
    updatedToast: tr(locale, '✅ Saved changes with the same code'),
    syncedToast: tr(locale, '✅ Page synced'),
    alreadySyncedToast: locale === 'ar'
      ? 'ماكو تغييرات ازامنها.'
      : tr(locale, 'There are no changes to sync.'),
    savedNotice: (title) => tr(locale, '✅ Saved page “{title}”.', { title }),
    savedMessage: (id, updated) => {
      const prefix = tr(locale, updated ? '✅ Saved page changes.\n\nCode: ' : '✅ Page saved.\n\nCode: ');
      return prefix + id
        + '\n\n' + tr(locale, 'You can use it inside text like this:') + '\n'
        + '{' + tr(locale, 'Next:cbd ') + id + '#b}'
        + '\n\n' + tr(locale, 'Or choose “CBD — Open page” from the buttons list.');
    },
    opened: tr(locale, 'Page opened'),
    missing: tr(locale, 'The page was deleted or does not belong to you.'),
    expired: t(locale, 'expired'),
    renamePrompt: (title) => t(locale, 'pages.rename_prompt', { title }),
    deleteConfirm: (title) => t(locale, 'pages.delete_confirm', { title }),
    deletedRecoverable: t(locale, 'ux.pages.deleted_recoverable'),
    deleted: t(locale, 'pages.deleted'),
    restored: t(locale, 'ux.pages.restored'),
    restoreUnavailable: t(locale, 'ux.pages.restore_unavailable'),
    invalid: t(locale, 'invalid'),
  };
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function draftSnapshot(session) {
  return {
    blocks: clone(session?.blocks || []),
    messageButtons: clone(session?.messageButtons || []),
    buttonsPerRow: Number(session?.buttonsPerRow || 1),
    buttonsAlign: String(session?.buttonsAlign || 'center'),
    currentPageId: session?.currentPageId ?? null,
    currentPageTitle: session?.currentPageTitle ?? null,
  };
}

function sameDraft(left, right) {
  return JSON.stringify(draftSnapshot(left)) === JSON.stringify(draftSnapshot(right));
}

function limitText(result, code) {
  const locale = resolveLanguage(code);
  if (result.code === 'blocks') return t(locale, 'limits.blocks', { limit: result.limit });
  if (result.code === 'characters') return t(locale, 'limits.characters', { limit: result.limit });
  if (result.code === 'table_rows') return t(locale, 'limits.table_rows', { limit: result.limit });
  if (result.code === 'table_columns') return t(locale, 'limits.table_columns', { limit: result.limit });
  return tr(locale, 'The content exceeds an editor limit.');
}

async function getPage(pageId) {
  return db.select().from(richPages)
    .where(eq(richPages.pageId, String(pageId || ''))).get();
}

async function ownerPageCount(ownerId) {
  return db.$count(richPages, eq(richPages.ownerId, Number(ownerId)));
}

async function allocatePageId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = pageCode();
    if (!await getPage(id)) return id;
  }
  throw new Error('could not allocate a unique page id');
}

async function persistPage(userId, title, session, existingId = null) {
  // Legacy allowance must use actual persisted blocks for this page owner.
  async function assertQuota(previousBlocks = null) {
    const entitlement = await getEditorEntitlement(userId);
    const limit = validateEditorLimits(session.blocks || [], userId, { previousBlocks, entitlement });
    if (!limit.ok) {
      const error = new Error('EDITOR_LIMIT');
      error.editorLimit = limit;
      throw error;
    }
  }

  const ownerLock = await acquireOwnerPageLock(userId);
  if (!ownerLock) {
    const error = new Error('PAGE_BUSY');
    error.pageBusy = true;
    throw error;
  }
  try {
  const cleanedTitle = String(title || '').trim().slice(0, 64) || 'Untitled page';
  await assertUniquePageTitle(userId, cleanedTitle, existingId);
  let stamp = nowSeconds();
  if (existingId) {
    const existing = await getPage(existingId);
    if (!existing || Number(existing.ownerId) !== Number(userId)) return null;
    const entitlement = await getEditorEntitlement(userId);
    if (isLegacySavedPage(existing, userId, entitlement)) {
      if (String(existing.title || '') === cleanedTitle
          && isSavedPageUnchanged(existing, session)) return String(existingId);
      const error = new Error('LEGACY_PAGE_READ_ONLY');
      error.code = 'LEGACY_PAGE_READ_ONLY';
      throw error;
    }
    await assertQuota();
    stamp = Math.max(stamp, Number(existing.updatedAt || 0) + 1);
    const version = await nextPageSyncVersion(existing.revision || 1);
    const changed = await db.update(richPages).set({
      title: cleanedTitle,
      blocks: clone(session.blocks || []),
      buttons: clone(session.messageButtons || []),
      buttonsPerRow: Math.max(1, Math.min(8, Number(session.buttonsPerRow || 1))),
      buttonsAlign: String(session.buttonsAlign || 'center'),
      updatedAt: stamp,
      revision: version.revision,
      syncSeq: version.syncSeq,
    }).where(and(
      eq(richPages.pageId, String(existingId)),
      eq(richPages.ownerId, Number(userId)),
      eq(richPages.revision, Number(existing.revision || 1)),
    )).returning({ pageId: richPages.pageId }).run();
    if (!Array.isArray(changed) || !changed.length) {
      const error = new Error('PAGE_CONFLICT');
      error.pageBusy = true;
      throw error;
    }
    const saved = await getPage(existingId);
    if (saved) {
      try {
        await enqueuePageUpsertSync(saved);
        await flushMiniAppSyncOutbox({ limit: 1 });
      } catch (error) {
        await logError('miniapp_sync.editor_save', error, { userId, extra: 'page=' + String(existingId) });
      }
    }
    return String(existingId);
  }

  await assertQuota();
    const pageLimit = safePlanLimit(await getEditorEntitlement(userId), 'pages');
    if (pageLimit != null && await ownerPageCount(userId) >= pageLimit) {
      const error = new Error('PAGE_LIMIT');
      error.pageLimit = true;
      throw error;
    }
    const id = await allocatePageId();
    const version = await nextPageSyncVersion(0);
    await db.insert(richPages).values({
      pageId: id,
      ownerId: Number(userId),
      title: cleanedTitle,
      blocks: clone(session.blocks || []),
      buttons: clone(session.messageButtons || []),
      buttonsPerRow: Math.max(1, Math.min(8, Number(session.buttonsPerRow || 1))),
      buttonsAlign: String(session.buttonsAlign || 'center'),
      createdAt: stamp,
      updatedAt: stamp,
      revision: version.revision,
      syncSeq: version.syncSeq,
    }).run();
    const saved = await getPage(id);
    if (saved) {
      try {
        await enqueuePageUpsertSync(saved);
        await flushMiniAppSyncOutbox({ limit: 1 });
      } catch (error) {
        await logError('miniapp_sync.editor_create', error, { userId, extra: 'page=' + String(id) });
      }
    }
    return id;
  } finally {
    await releaseOwnerPageLock(ownerLock);
  }
}

async function restorePage(userId, pageId, snapshot) {
  if (!snapshot || Number(snapshot.ownerId) !== Number(userId)) return false;
  const ownerLock = await acquireOwnerPageLock(userId);
  if (!ownerLock) return false;
  try {
    if (await getPage(pageId)) return false;
    try { await assertUniquePageTitle(userId, String(snapshot.title || pageId).trim().slice(0,64), pageId); }
    catch (error) { if (error.pageNameExists) return false; throw error; }
    const pageLimit = safePlanLimit(await getEditorEntitlement(userId), 'pages');
    if (pageLimit != null && await ownerPageCount(userId) >= pageLimit) return false;
    const blocks = clone(snapshot.blocks || []);
    // Restoring the exact server-held deleted snapshot does not edit its
    // content. Quotas apply only if the restored page is subsequently edited.
    // Telegram's transport limits still apply whenever it is published.
    const stamp = nowSeconds();
    const version = await nextPageSyncVersion(snapshot.revision || 1);
    await db.insert(richPages).values({
      pageId: String(pageId),
      ownerId: Number(userId),
      title: String(snapshot.title || pageId).trim().slice(0, 64),
      blocks,
      buttons: clone(snapshot.buttons || []),
      buttonsPerRow: Number(snapshot.buttonsPerRow || 1),
      buttonsAlign: String(snapshot.buttonsAlign || 'center'),
      createdAt: Number(snapshot.createdAt || stamp),
      updatedAt: stamp,
      revision: version.revision,
      syncSeq: version.syncSeq,
    }).run();
    const restored = await getPage(pageId);
    if (restored) {
      try {
        await enqueuePageUpsertSync(restored);
        await flushMiniAppSyncOutbox({ limit: 1 });
      } catch (error) {
        await logError('miniapp_sync.editor_restore', error, { userId, extra: 'page=' + String(pageId) });
      }
    }
    return true;
  } finally {
    await releaseOwnerPageLock(ownerLock);
  }
}

async function sendPrompt(userId, chatId, text) {
  const sent = await api.sendMessage({ chat_id: chatId, text });
  await updateEditorSession(userId, {
    addPromptChatId: sent.chat?.id || chatId,
    addPromptMessageId: sent.message_id,
  });
  return sent;
}

async function deleteQuietly(chatId, messageId) {
  if (!chatId || !messageId) return;
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch {}
}

async function clearPromptAndInput(session, message) {
  const seen = new Set();
  for (const [chatId, messageId] of [
    [message?.chat?.id, message?.message_id],
    [session?.addPromptChatId, session?.addPromptMessageId],
  ]) {
    if (!chatId || !messageId) continue;
    const key = String(chatId) + ':' + String(messageId);
    if (seen.has(key)) continue;
    seen.add(key);
    await deleteQuietly(chatId, messageId);
  }
}

async function editSavedPanel(userId, session, code, notice = null) {
  const chatId = session?.managementChatId || session?.chatId;
  const messageId = session?.managementMessageId;
  if (!chatId) return;

  const richMessage = editorDashboardRichMessage(session, code, notice);
  const replyMarkup = buildEditorKeyboard(session, code);
  if (messageId) {
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        rich_message: richMessage,
        reply_markup: replyMarkup,
      });
      return;
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toLowerCase();
      if (reason.includes('message is not modified')) return;
      const recoverableTarget = (
        reason.includes('message to edit not found')
        || reason.includes("message can't be edited")
        || reason.includes('message_id_invalid')
      );
      if (!recoverableTarget) throw error;
    }
  }

  const sent = await api.sendRichMessage({
    chat_id: chatId,
    rich_message: richMessage,
    reply_markup: replyMarkup,
  });
  await updateEditorSession(userId, {
    managementChatId: sent.chat?.id || chatId,
    managementMessageId: sent.message_id,
  });
}

function requestedPageIndex(data) {
  if (data === 'r:pages') return 0;
  const raw = Number.parseInt(String(data || '').split(':').at(-1), 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

export async function handleEditorPageCallback(query) {
  if (query?.from && !query.from.language_code) {
    query.from.language_code = await resolveUserLanguage(query.from);
  }
  const data = String(query?.data || '');
  if (!query?.from?.id) return false;
  const code = languageCode(query);
  const c = copy(code);

  if (data === 'r:pages' || data.startsWith('r:pages:') || data.startsWith('r:presults:')) {
    const rendered = await renderPagesScreen(
      query.from.id,
      code,
      requestedPageIndex(data),
      {
        resetSearch: data === 'r:pages',
        fallbackChatId: query.message?.chat?.id,
        fallbackMessageId: query.message?.message_id,
      },
    );
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      ...(rendered ? {} : { text: emptyPagesText(code), show_alert: true }),
    });
    return true;
  }

  if (data === 'r:psearch') {
    const session = await loadEditorSession(query.from.id);
    if (!session || !query.message?.chat?.id) return false;
    await updateEditorSession(query.from.id, {
      state: 'searching_page',
    });
    await sendPrompt(query.from.id, query.message.chat.id, pagesCopy(code).searchPrompt);
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data === 'r:psort') {
    const session = await loadEditorSession(query.from.id);
    if (!session || !query.message?.chat?.id || !query.message?.message_id) return false;
    await editCallbackMessage(query, {
      text: pagesCopy(code).sortText,
      reply_markup: buildPageSortKeyboard(String(session.pagesSortMode || 'updated'), code),
    });
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:psortset:')) {
    const mode = data.slice('r:psortset:'.length);
    if (!['updated', 'newest', 'oldest', 'title'].includes(mode)) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: c.invalid,
        show_alert: true,
      });
      return true;
    }
    await updateEditorSession(query.from.id, { pagesSortMode: mode });
    await renderPagesScreen(
      query.from.id,
      code,
      0,
      {
        fallbackChatId: query.message?.chat?.id,
        fallbackMessageId: query.message?.message_id,
      },
    );
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: pagesCopy(code).sortDone,
    });
    return true;
  }

  if (data === 'r:savepage' || data === 'r:syncpage') {
    const session = await loadEditorSession(query.from.id);
    if (!session) return false;
    if (!Array.isArray(session.blocks) || !session.blocks.length) {
      await api.answerCallbackQuery({
        callback_query_id:query.id,
        text:c.noBlocks,
        show_alert:true,
      });
      return true;
    }

    const existingId = String(session.currentPageId || '');
    if (!existingId) {
      await updateEditorSession(query.from.id, {
        state:'saving_page_name',
        blockScrollEnabled:0,
      });
      await sendPrompt(query.from.id, query.message.chat.id, c.sendName);
      await api.answerCallbackQuery({ callback_query_id:query.id });
      return true;
    }

    const result = await syncSavedEditorPage(query.from.id);
    if (result.status === 'missing') {
      await updateEditorSession(query.from.id, {
        currentPageId:null,
        currentPageTitle:null,
        state:'saving_page_name',
        blockScrollEnabled:0,
      });
      await sendPrompt(query.from.id, query.message.chat.id, c.originalMissingPrompt);
      await api.answerCallbackQuery({
        callback_query_id:query.id,
        text:c.originalMissing,
        show_alert:true,
      });
      return true;
    }

    if (result.status === 'expired' || result.status === 'invalid') {
      await api.answerCallbackQuery({
        callback_query_id:query.id,
        text:c.expired,
        show_alert:true,
      });
      return true;
    }

    await api.answerCallbackQuery({
      callback_query_id:query.id,
      text:result.changed ? c.syncedToast : c.alreadySyncedToast,
      ...(result.changed ? {} : { show_alert:true }),
    });
    return true;
  }

  if (data.startsWith('r:prename:')) {
    const parts = data.split(':');
    const pageId = parts[2] || '';
    const pageIndex = Math.max(0, Number.parseInt(parts[3] || '0', 10) || 0);
    const page = await getPage(pageId);
    if (!page || Number(page.ownerId) !== Number(query.from.id)) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: c.missing, show_alert: true });
      return true;
    }
    if (isLegacySavedPage(page, query.from.id, await getEditorEntitlement(query.from.id))) {
      await api.answerCallbackQuery({ callback_query_id:query.id,
        text:resolveLanguage(code)==='ar'
          ? 'هذه صفحة قديمة تتجاوز حدود باقتك؛ يمكن نشرها كما هي لكن لا يمكن تعديلها.'
          : 'This legacy page is publish-only. Editing is unavailable.',
        show_alert:true });
      return true;
    }
    await updateEditorSession(query.from.id, {
      state: 'renaming_page',
      renamePageId: pageId,
      pagesPageIndex: pageIndex,
    });
    await sendPrompt(query.from.id, query.message.chat.id, c.renamePrompt(page.title || pageId));
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:pdelete:')) {
    const parts = data.split(':');
    const pageId = parts[2] || '';
    const pageIndex = Math.max(0, Number.parseInt(parts[3] || '0', 10) || 0);
    const page = await getPage(pageId);
    if (!page || Number(page.ownerId) !== Number(query.from.id)) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: c.missing, show_alert: true });
      return true;
    }
    await editCallbackMessage(query, {
      text: c.deleteConfirm(page.title || pageId),
      reply_markup: buildPageDeleteConfirmationKeyboard(pageId, pageIndex, code),
    });
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:pdeleteok:')) {
    const parts = data.split(':');
    const pageId = parts[2] || '';
    const pageIndex = Math.max(0, Number.parseInt(parts[3] || '0', 10) || 0);
    const page = await getPage(pageId);
    if (!page || Number(page.ownerId) !== Number(query.from.id)) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: c.missing, show_alert: true });
      return true;
    }
    const session = await loadEditorSession(query.from.id);
    if (!session) return false;
    const wasCurrent = String(session.currentPageId || '') === pageId;
    const deleteVersion = await nextPageSyncVersion(page.revision || 1);
    await db.delete(richPages).where(eq(richPages.pageId, pageId)).run();
    try {
      await enqueuePageDeleteSync({
        ownerId: query.from.id,
        pageId,
        revision: deleteVersion.revision,
        syncSeq: deleteVersion.syncSeq,
        updatedAt: nowSeconds(),
      });
      await flushMiniAppSyncOutbox({ limit: 1 });
    } catch (error) {
      await logError('miniapp_sync.editor_delete', error, { userId: query.from.id, extra: 'page=' + pageId });
    }
    if (wasCurrent) await rememberEditorState(query.from.id, session);
    await updateEditorSession(query.from.id, {
      ...(wasCurrent ? { currentPageId: null, currentPageTitle: null } : {}),
      deletedPageId: pageId,
      deletedPageSnapshot: clone(page),
      deletedPageIndex: pageIndex,
      deletedPageWasCurrent: wasCurrent ? 1 : 0,
    });
    await editCallbackMessage(query, {
      text: c.deletedRecoverable,
      reply_markup: buildPageRestoreKeyboard(pageIndex, code),
    });
    await api.answerCallbackQuery({ callback_query_id: query.id, text: c.deleted });
    return true;
  }

  if (data === 'r:prestore') {
    const session = await loadEditorSession(query.from.id);
    if (!session) return false;
    const pageId = String(session.deletedPageId || '');
    const snapshot = session.deletedPageSnapshot;
    if (!pageId || !snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: c.restoreUnavailable,
        show_alert: true,
      });
      return true;
    }
    if (!await restorePage(query.from.id, pageId, snapshot)) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: c.restoreUnavailable,
        show_alert: true,
      });
      return true;
    }
    const wasCurrent = Boolean(session.deletedPageWasCurrent);
    if (wasCurrent) await rememberEditorState(query.from.id, session);
    const pageIndex = Math.max(0, Number(session.deletedPageIndex || 0));
    await updateEditorSession(query.from.id, {
      ...(wasCurrent ? {
        currentPageId: pageId,
        currentPageTitle: String(snapshot.title || pageId),
      } : {}),
      deletedPageId: null,
      deletedPageSnapshot: null,
      deletedPageIndex: null,
      deletedPageWasCurrent: null,
    });
    await renderPagesScreen(
      query.from.id,
      code,
      pageIndex,
      {
        fallbackChatId: query.message?.chat?.id,
        fallbackMessageId: query.message?.message_id,
        saved: true,
      },
    );
    await api.answerCallbackQuery({ callback_query_id: query.id, text: c.restored });
    return true;
  }

  if (data.startsWith('r:pageopen:')) {
    const session = await loadEditorSession(query.from.id);
    if (!session) return false;
    const pageId = data.slice('r:pageopen:'.length);
    const page = await getPage(pageId);
    if (!page || Number(page.ownerId) !== Number(query.from.id)) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: c.missing,
        show_alert: true,
      });
      return true;
    }

    const next = {
      blocks: clone(page.blocks || []),
      messageButtons: clone(page.buttons || []),
      buttonsPerRow: Number(page.buttonsPerRow || 1),
      buttonsAlign: String(page.buttonsAlign || 'center'),
      currentPageId: String(pageId),
      currentPageTitle: String(page.title || pageId),
    };
    if (!sameDraft(session, next)) await rememberEditorState(query.from.id, session);
    const pageChanged = String(session.currentPageId || '') !== String(pageId);
    const updated = await updateEditorSession(query.from.id, {
      ...next,
      state: 'managing',
      currentBlockId: null,
      currentButtonId: null,
      blockScrollEnabled: 1,
      ...(pageChanged ? { blockScrollOffset: 0 } : {}),
      managementChatId: query.message?.chat?.id || session.managementChatId,
      managementMessageId: query.message?.message_id || session.managementMessageId,
    });

    if (query.message?.chat?.id && query.message?.message_id) {
      await editCallbackMessage(query, {
        rich_message: editorDashboardRichMessage(updated, code),
        reply_markup: buildEditorKeyboard(updated, code),
      });
    }
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: c.opened,
    });
    return true;
  }

  return false;
}

async function receiveSaveName(message, session, code) {
  const userId = message.from.id;
  const c = copy(code);
  const title = typeof message.text === 'string' ? message.text.trim() : '';
  if (!title) {
    await api.sendMessage({ chat_id: message.chat.id, text: c.badName });
    return true;
  }
  if (title.length > 64) {
    await api.sendMessage({ chat_id: message.chat.id, text: c.longName });
    return true;
  }
  if (!Array.isArray(session.blocks) || !session.blocks.length) {
    await deleteEditorSession(userId);
    await api.sendMessage({ chat_id: message.chat.id, text: c.expired });
    return true;
  }

  const mutationLock = await acquireEditorMutationLock(userId);
  if (!mutationLock) return true;
  try {
    const latest = await loadEditorSession(userId);
    if (!latest || latest.state !== 'saving_page_name') return true;
    const existingId = latest.currentPageId || null;
    let id;
    try {
      id = await persistPage(userId, title, latest, existingId);
      if (!id) {
        id = await persistPage(userId, title, { ...latest, currentPageId: null }, null);
      }
    } catch (error) {
      if (error?.pageNameExists) {
        await api.sendMessage({chat_id:message.chat.id,text:resolveLanguage(code)==='ar'
          ? 'عندك صفحة ثانية بنفس الاسم. اختار اسم مختلف.'
          : 'You already have another page with this name. Choose a different name.'});
        return true;
      }
      if (error?.editorLimit) {
        await api.sendMessage({ chat_id: message.chat.id, text: limitText(error.editorLimit, code) });
        return true;
      }
      if (error?.code === 'LEGACY_PAGE_READ_ONLY') {
        await api.sendMessage({chat_id:message.chat.id,text:resolveLanguage(code)==='ar'
          ? 'الصفحة القديمة متاحة للنشر كما هي، لكن تعديلها أو حفظ نسخة معدّلة منها غير مسموح.'
          : 'This legacy page can be republished unchanged, but cannot be edited.'});
        return true;
      }

      if (error?.pageLimit || error?.pageBusy) {
        await clearPromptAndInput(latest, message);
        const restored = await updateEditorSession(userId, {
          state: 'managing',
          blockScrollEnabled: 1,
          addPromptChatId: null,
          addPromptMessageId: null,
        });
        const quota=error?.pageBusy
          ? (resolveLanguage(code)==='ar'?'الصفحة مشغولة حالياً، جرّب مرة ثانية.':'The page is busy. Try again.')
          : t(resolveLanguage(code),'pages.limit_reached',{
              limit:safePlanLimit(await getEditorEntitlement(userId),'pages')??MAX_SAVED_PAGES,
            });
        await api.sendMessage({ chat_id: message.chat.id, text: quota });
        await editSavedPanel(userId, restored, code, quota);
        return true;
      }
      throw error;
    }

    await rememberEditorState(userId, latest);
    await clearPromptAndInput(latest, message);
    const updated = await updateEditorSession(userId, {
      state: 'managing',
      currentPageId: String(id),
      currentPageTitle: title,
      blockScrollEnabled: 1,
      addPromptChatId: null,
      addPromptMessageId: null,
    });

    await api.sendMessage({
      chat_id: message.chat.id,
      text: c.savedMessage(id, existingId === id),
    });
    await editSavedPanel(userId, updated, code, c.savedNotice(title));
    return true;
  } finally {
    await releaseEditorMutationLock(mutationLock);
  }
}

async function receiveRename(message, session, code) {
  const userId = message.from.id;
  const c = copy(code);
  const title = typeof message.text === 'string' ? message.text.trim() : '';
  if (!title) {
    await api.sendMessage({ chat_id: message.chat.id, text: c.badName });
    return true;
  }
  if (title.length > 64) {
    await api.sendMessage({ chat_id: message.chat.id, text: c.longName });
    return true;
  }
  const pageId = String(session.renamePageId || '');
  const page = await getPage(pageId);
  if (!page || Number(page.ownerId) !== Number(userId)) {
    await updateEditorSession(userId, { state: 'managing', renamePageId: null });
    await api.sendMessage({ chat_id: message.chat.id, text: c.missing });
    return true;
  }

  if (isLegacySavedPage(page, userId, await getEditorEntitlement(userId))) {
    await updateEditorSession(userId, { state:'managing', renamePageId:null });
    await api.sendMessage({chat_id:message.chat.id,text:resolveLanguage(code)==='ar'
      ? 'هذه الصفحة القديمة للنشر فقط؛ لا يمكن تغيير اسمها أو محتواها.'
      : 'This legacy page is publish-only and cannot be renamed.'});
    return true;
  }
  const ownerLock = await acquireOwnerPageLock(userId);
  if (!ownerLock) {
    await api.sendMessage({chat_id:message.chat.id,text:code==='ar'?'الصفحات مشغولة حالياً، جرّب مرة ثانية.':'Pages are busy. Try again.'});
    return true;
  }
  try {
    await assertUniquePageTitle(userId, title, pageId);
  const renameVersion = await nextPageSyncVersion(page.revision || 1);
  const renamedAt = Math.max(nowSeconds(), Number(page.updatedAt || 0) + 1);
  const renamedRows=await db.update(richPages).set({
    title,
    updatedAt: renamedAt,
    revision: renameVersion.revision,
    syncSeq: renameVersion.syncSeq,
  }).where(and(eq(richPages.pageId,pageId),
    eq(richPages.ownerId,Number(userId)),
    eq(richPages.revision,Number(page.revision||1))))
    .returning({pageId:richPages.pageId}).run();
  if(!Array.isArray(renamedRows)||!renamedRows.length){
    await api.sendMessage({chat_id:message.chat.id,
      text:code==='ar'?'الصفحة تغيرت بوقت ثاني. افتحها من جديد قبل تعديل الاسم.':'Page changed. Reopen it before renaming.'});
    return true;
  }
  try {
    const renamed = await getPage(pageId);
    if (renamed) {
      await enqueuePageUpsertSync(renamed);
      await flushMiniAppSyncOutbox({ limit: 1 });
    }
  } catch (error) {
    await logError('miniapp_sync.editor_rename', error, { userId, extra: 'page=' + pageId });
  }

  const draftChanged = String(session.currentPageId || '') === pageId
    && String(session.currentPageTitle || '') !== title;
  if (draftChanged) await rememberEditorState(userId, session);
  await clearPromptAndInput(session, message);
  await updateEditorSession(userId, {
    state: 'managing',
    renamePageId: null,
    ...(draftChanged ? { currentPageTitle: title } : {}),
  });
  await renderPagesScreen(
    userId,
    code,
    Number(session.pagesPageIndex || 0),
    {
      fallbackChatId: message.chat.id,
      saved: true,
    },
  );
  return true;
  } catch (error) {
    if (!error.pageNameExists) throw error;
    await api.sendMessage({chat_id:message.chat.id,text:code==='ar'
      ? 'عندك صفحة ثانية بنفس الاسم. اختار اسم مختلف.'
      : 'You already have another page with this name. Choose a different name.'});
    return true;
  } finally { await releaseOwnerPageLock(ownerLock); }
}

async function receiveSearch(message, session, code) {
  const query = typeof message.text === 'string' ? message.text.trim() : '';
  if (!query) {
    await api.sendMessage({ chat_id: message.chat.id, text: pagesCopy(code).searchInvalid });
    return true;
  }
  const value = query.toLocaleLowerCase() === '/all' ? '' : query.slice(0, 64);
  await clearPromptAndInput(session, message);
  await updateEditorSession(message.from.id, {
    state: 'managing',
    pagesSearchQuery: value,
  });
  await renderPagesScreen(
    message.from.id,
    code,
    0,
    { fallbackChatId: message.chat.id, saved: true },
  );
  return true;
}

export async function handleEditorPageMessage(message) {
  if (message?.from && !message.from.language_code) {
    message.from.language_code = await resolveUserLanguage(message.from);
  }
  const userId = message?.from?.id;
  if (!userId) return false;
  const session = await loadEditorSession(userId);
  if (!session) return false;
  const code = languageCode(message);

  if (session.state === 'saving_page_name') {
    return receiveSaveName(message, session, code);
  }
  if (session.state === 'renaming_page') {
    return receiveRename(message, session, code);
  }
  if (session.state === 'searching_page') {
    return receiveSearch(message, session, code);
  }
  return false;
}
