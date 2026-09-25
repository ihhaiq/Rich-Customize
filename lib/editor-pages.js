import { api, db } from 'sdk';
import { eq, lt } from 'sdk/db';
import { maintenanceLocks, richPages } from 'schema';
import { isDeveloper } from 'lib/developer-access';
import {
  MAX_SAVED_PAGES,
  validateEditorLimits,
} from 'lib/editor-blocks';
import {
  buildEditorKeyboard,
  editorDashboardText,
} from 'lib/editor-block-ui';
import {
  acquireEditorMutationLock,
  deleteEditorSession,
  loadEditorSession,
  releaseEditorMutationLock,
  rememberEditorState,
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

function languageCode(source) {
  return source?.from?.language_code || 'en';
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
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
    noBlocks: tr(locale, 'There are no blocks to save.'),
    sendName: tr(locale, 'Send a page name to save it; maximum 64 characters.'),
    originalMissing: tr(locale, 'The original page no longer exists.'),
    originalMissingPrompt: tr(locale, 'The original page no longer exists. Send a name to save it as a new page.'),
    badName: tr(locale, 'The page name must be text.'),
    longName: tr(locale, 'The page name is too long; maximum 64 characters.'),
    limit: t(locale, 'pages.limit_reached', { limit: MAX_SAVED_PAGES }),
    updatedNotice: (title) => tr(locale, '✅ Updated saved page “{title}”.', { title }),
    updatedToast: tr(locale, '✅ Saved changes with the same code'),
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

async function acquireOwnerPageLock(ownerId) {
  const stamp = nowSeconds();
  await db.delete(maintenanceLocks).where(lt(maintenanceLocks.expiresAt, stamp)).run();
  const name = 'pages:owner:' + Number(ownerId);
  const rows = await db.insert(maintenanceLocks)
    .values({ name, expiresAt: stamp + 15 })
    .onConflictDoNothing({ target: maintenanceLocks.name })
    .returning({ name: maintenanceLocks.name })
    .run();
  return Array.isArray(rows) && rows.length > 0;
}

async function releaseOwnerPageLock(ownerId) {
  await db.delete(maintenanceLocks)
    .where(eq(maintenanceLocks.name, 'pages:owner:' + Number(ownerId)))
    .run();
}

async function allocatePageId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = pageCode();
    if (!await getPage(id)) return id;
  }
  throw new Error('could not allocate a unique page id');
}

async function persistPage(userId, title, session, existingId = null) {
  const limit = validateEditorLimits(session.blocks || []);
  if (!limit.ok) {
    const error = new Error('EDITOR_LIMIT');
    error.editorLimit = limit;
    throw error;
  }

  const cleanedTitle = String(title || '').trim().slice(0, 64) || 'Untitled page';
  const stamp = nowSeconds();
  if (existingId) {
    const existing = await getPage(existingId);
    if (!existing || Number(existing.ownerId) !== Number(userId)) return null;
    await db.update(richPages).set({
      title: cleanedTitle,
      blocks: clone(session.blocks || []),
      buttons: clone(session.messageButtons || []),
      buttonsPerRow: Math.max(1, Math.min(8, Number(session.buttonsPerRow || 1))),
      buttonsAlign: String(session.buttonsAlign || 'center'),
      updatedAt: stamp,
    }).where(eq(richPages.pageId, String(existingId))).run();
    return String(existingId);
  }

  if (!await acquireOwnerPageLock(userId)) {
    const error = new Error('PAGE_BUSY');
    error.pageBusy = true;
    throw error;
  }
  try {
    if (!isDeveloper(userId) && await ownerPageCount(userId) >= MAX_SAVED_PAGES) {
      const error = new Error('PAGE_LIMIT');
      error.pageLimit = true;
      throw error;
    }
    const id = await allocatePageId();
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
    }).run();
    return id;
  } finally {
    await releaseOwnerPageLock(userId);
  }
}

async function restorePage(userId, pageId, snapshot) {
  if (!snapshot || Number(snapshot.ownerId) !== Number(userId)) return false;
  if (!await acquireOwnerPageLock(userId)) return false;
  try {
    if (await getPage(pageId)) return false;
    if (!isDeveloper(userId) && await ownerPageCount(userId) >= MAX_SAVED_PAGES) return false;
    const blocks = clone(snapshot.blocks || []);
    if (!validateEditorLimits(blocks).ok) return false;
    const stamp = nowSeconds();
    await db.insert(richPages).values({
      pageId: String(pageId),
      ownerId: Number(userId),
      title: String(snapshot.title || pageId).trim().slice(0, 64),
      blocks,
      buttons: clone(snapshot.buttons || []),
      buttonsPerRow: Number(snapshot.buttonsPerRow || 1),
      buttonsAlign: String(snapshot.buttonsAlign || 'center'),
      createdAt: Number(snapshot.createdAt || stamp),
      updatedAt: Number(snapshot.updatedAt || stamp),
    }).run();
    return true;
  } finally {
    await releaseOwnerPageLock(userId);
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

  const text = editorDashboardText(session, code, notice);
  const replyMarkup = buildEditorKeyboard(session, code);
  if (messageId) {
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
      });
      return;
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toLowerCase();
      if (reason.includes('message is not modified')) return;
    }
  }

  const sent = await api.sendMessage({
    chat_id: chatId,
    text,
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
    await api.editMessageText({
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
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

  if (data === 'r:savepage') {
    const session = await loadEditorSession(query.from.id);
    if (!session) return false;
    if (!Array.isArray(session.blocks) || !session.blocks.length) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: c.noBlocks,
        show_alert: true,
      });
      return true;
    }

    const existingId = session.currentPageId;
    if (!existingId) {
      await updateEditorSession(query.from.id, {
        state: 'saving_page_name',
        blockScrollEnabled: 0,
      });
      await sendPrompt(query.from.id, query.message.chat.id, c.sendName);
      await api.answerCallbackQuery({ callback_query_id: query.id });
      return true;
    }

    const existing = await getPage(existingId);
    if (!existing || Number(existing.ownerId) !== Number(query.from.id)) {
      await updateEditorSession(query.from.id, {
        currentPageId: null,
        currentPageTitle: null,
        state: 'saving_page_name',
        blockScrollEnabled: 0,
      });
      await sendPrompt(query.from.id, query.message.chat.id, c.originalMissingPrompt);
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: c.originalMissing,
        show_alert: true,
      });
      return true;
    }

    const title = String(
      session.currentPageTitle || existing.title || existingId,
    ).slice(0, 64);
    try {
      const id = await persistPage(query.from.id, title, session, existingId);
      if (!id) throw new Error('page missing');
    } catch (error) {
      if (error?.editorLimit) {
        await api.answerCallbackQuery({
          callback_query_id: query.id,
          text: limitText(error.editorLimit, code),
          show_alert: true,
        });
        return true;
      }
      throw error;
    }

    const updated = await updateEditorSession(query.from.id, {
      state: 'managing',
      blockScrollEnabled: 1,
      currentPageId: String(existingId),
      currentPageTitle: title,
    });
    await editSavedPanel(query.from.id, updated, code, c.updatedNotice(title));
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: c.updatedToast,
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
    await api.editMessageText({
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
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
    await db.delete(richPages).where(eq(richPages.pageId, pageId)).run();
    if (wasCurrent) await rememberEditorState(query.from.id, session);
    await updateEditorSession(query.from.id, {
      ...(wasCurrent ? { currentPageId: null, currentPageTitle: null } : {}),
      deletedPageId: pageId,
      deletedPageSnapshot: clone(page),
      deletedPageIndex: pageIndex,
      deletedPageWasCurrent: wasCurrent ? 1 : 0,
    });
    await api.editMessageText({
      chat_id: query.message.chat.id,
      message_id: query.message.message_id,
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
      await api.editMessageText({
        chat_id: query.message.chat.id,
        message_id: query.message.message_id,
        text: editorDashboardText(updated, code),
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

  if (!await acquireEditorMutationLock(userId)) return true;
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
      if (error?.editorLimit) {
        await api.sendMessage({ chat_id: message.chat.id, text: limitText(error.editorLimit, code) });
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
        await api.sendMessage({ chat_id: message.chat.id, text: c.limit });
        await editSavedPanel(userId, restored, code, c.limit);
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
    await releaseEditorMutationLock(userId);
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

  await db.update(richPages).set({
    title,
    updatedAt: nowSeconds(),
  }).where(eq(richPages.pageId, pageId)).run();

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
