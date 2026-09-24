import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { richPages } from 'schema';
import {
  loadEditorSession,
  updateEditorSession,
} from 'lib/editor-session';

export const PAGES_PER_SCREEN = 4;

const COPY = {
  en: {
    title: '📚 Your saved pages',
    prompt: 'Choose a page to open and edit:',
    empty: "You don't have any saved pages yet.",
    sortTitle: '🔤 By name',
    copyCode: 'Copy code',
    search: '🔎 Search',
    sort: '⚙️ Sort',
    back: '🔙 Back',
    searchResults: (query) => 'Search results for: ' + query,
    searchNone: (query) => 'No saved pages matched “' + query + '”.',
    searchPrompt: 'Send the page name or code to search for. Send /all to show everything.',
    searchInvalid: 'Send a page name or code.',
    sortText: 'Choose how to sort your saved pages:',
    sortUpdated: 'Recently updated',
    sortNewest: 'Newest',
    sortOldest: 'Oldest',
    sortByTitle: 'By name',
    sortDone: 'Sort updated.',
  },
  ar: {
    title: '📚 صفحاتك المحفوظة',
    prompt: 'اختر صفحة لفتحها وتعديلها:',
    empty: 'ما عندك صفحات محفوظة بعد.',
    sortTitle: '🔤 حسب الاسم',
    copyCode: 'نسخ الكود',
    search: '🔎 بحث',
    sort: '⚙️ فرز',
    back: '🔙 رجوع',
    searchResults: (query) => 'نتائج البحث عن: ' + query,
    searchNone: (query) => 'ماكو صفحات محفوظة تطابق «' + query + '».',
    searchPrompt: 'أرسل اسم الصفحة أو الكود للبحث. أرسل /all لعرض الكل.',
    searchInvalid: 'أرسل اسم الصفحة أو الكود.',
    sortText: 'اختر طريقة فرز صفحاتك المحفوظة:',
    sortUpdated: 'آخر تحديث',
    sortNewest: 'الأحدث',
    sortOldest: 'الأقدم',
    sortByTitle: 'حسب الاسم',
    sortDone: 'تم تغيير الفرز.',
  },
};

function language(languageCode) {
  return String(languageCode || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function pagesCopy(languageCode) {
  return COPY[language(languageCode)];
}

function textCell(text, { header = false, align = 'center' } = {}) {
  return {
    text,
    align,
    valign: 'middle',
    ...(header ? { is_header: true } : {}),
  };
}

function buttonCell(button, align = 'center') {
  return {
    text: {
      type: 'button',
      button,
    },
    align,
    valign: 'middle',
  };
}

function pageTitle(page) {
  return String(page?.title || page?.pageId || '');
}

function sortedPages(rows, sortMode) {
  const pages = [...rows];
  if (sortMode === 'title') {
    pages.sort((a, b) => (
      pageTitle(a).toLocaleLowerCase().localeCompare(pageTitle(b).toLocaleLowerCase())
      || String(a.pageId).localeCompare(String(b.pageId))
    ));
  } else if (sortMode === 'oldest') {
    pages.sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0)
      || String(a.pageId).localeCompare(String(b.pageId)));
  } else if (sortMode === 'newest') {
    pages.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)
      || String(a.pageId).localeCompare(String(b.pageId)));
  } else {
    pages.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
      || String(a.pageId).localeCompare(String(b.pageId)));
  }
  return pages;
}

export async function queryPages(
  ownerId,
  requestedIndex = 0,
  query = '',
  sortMode = 'updated',
) {
  const owned = await db.select().from(richPages)
    .where(eq(richPages.ownerId, Number(ownerId))).all();
  const totalCount = owned.length;
  const normalized = String(query || '').trim().toLocaleLowerCase();
  const filtered = normalized
    ? owned.filter((page) => (
        pageTitle(page).toLocaleLowerCase().includes(normalized)
        || String(page.pageId || '').toLocaleLowerCase().includes(normalized)
      ))
    : owned;
  const ordered = sortedPages(
    filtered,
    ['updated', 'newest', 'oldest', 'title'].includes(sortMode) ? sortMode : 'updated',
  );
  const filteredTotal = ordered.length;
  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGES_PER_SCREEN));
  const pageIndex = Math.max(
    0,
    Math.min(Number.parseInt(String(requestedIndex), 10) || 0, totalPages - 1),
  );
  const start = pageIndex * PAGES_PER_SCREEN;
  return {
    pages: ordered.slice(start, start + PAGES_PER_SCREEN),
    filteredTotal,
    totalCount,
    pageIndex,
    totalPages,
  };
}

export function buildPagesRichMessage(
  pages,
  languageCode,
  pageIndex = 0,
  headingText = null,
) {
  const copy = pagesCopy(languageCode);
  const blocks = [{
    type: 'paragraph',
    text: headingText || (copy.title + '\n\n' + copy.prompt),
  }];

  if (pages.length) {
    const rows = [[
      textCell('🗑️', { header: true }),
      textCell('✏️', { header: true }),
      textCell(copy.copyCode, { header: true }),
      textCell(copy.sortTitle, { header: true, align: 'right' }),
    ]];

    for (const page of pages) {
      const pageId = String(page.pageId);
      rows.push([
        buttonCell({
          text: '🗑️',
          callback_data: 'r:pdelete:' + pageId + ':' + pageIndex,
          style: 'danger',
        }),
        buttonCell({
          text: '✏️',
          callback_data: 'r:prename:' + pageId + ':' + pageIndex,
        }),
        buttonCell({
          text: copy.copyCode,
          copy_text: { text: pageId },
        }),
        buttonCell({
          text: String(page.title || pageId),
          callback_data: 'r:pageopen:' + pageId,
          style: 'primary',
        }, 'right'),
      ]);
    }

    blocks.push(
      { type: 'divider' },
      {
        type: 'table',
        cells: rows,
        is_bordered: true,
        is_compact: true,
      },
      { type: 'divider' },
    );
  }

  return { blocks };
}

export function buildPagesKeyboard({
  showControls = false,
  showPager = false,
  pageIndex = 0,
  totalPages = 1,
  paginationPrefix = 'r:pages',
  languageCode = 'en',
} = {}) {
  const copy = pagesCopy(languageCode);
  const rows = [];

  if (showPager) {
    const safeTotal = Math.max(1, totalPages);
    const safeIndex = Math.max(0, Math.min(pageIndex, safeTotal - 1));
    rows.push([
      { text: '⬅️', callback_data: paginationPrefix + ':' + Math.max(0, safeIndex - 1) },
      { text: (safeIndex + 1) + '/' + safeTotal, callback_data: paginationPrefix + ':' + safeIndex },
      { text: '➡️', callback_data: paginationPrefix + ':' + Math.min(safeTotal - 1, safeIndex + 1) },
    ]);
  }

  if (showControls) {
    rows.push([
      { text: copy.search, callback_data: 'r:psearch' },
      { text: copy.sort, callback_data: 'r:psort' },
    ]);
  }
  rows.push([{ text: copy.back, callback_data: 'r:back' }]);
  return { inline_keyboard: rows };
}

export function buildPageSortKeyboard(currentSort, languageCode) {
  const copy = pagesCopy(languageCode);
  const choices = [
    [copy.sortUpdated, 'updated'],
    [copy.sortNewest, 'newest'],
    [copy.sortOldest, 'oldest'],
    [copy.sortByTitle, 'title'],
  ];
  return {
    inline_keyboard: [
      ...choices.map(([label, value]) => [{
        text: (currentSort === value ? '✅ ' : '') + label,
        callback_data: 'r:psortset:' + value,
        ...(currentSort === value ? { style: 'primary' } : {}),
      }]),
      [{ text: copy.back, callback_data: 'r:pages:0' }],
    ],
  };
}

export function buildPageDeleteConfirmationKeyboard(pageId, pageIndex, languageCode) {
  return {
    inline_keyboard: [[
      {
        text: language(languageCode) === 'ar' ? 'حذف' : 'Delete',
        callback_data: 'r:pdeleteok:' + pageId + ':' + pageIndex,
        style: 'danger',
      },
      {
        text: language(languageCode) === 'ar' ? 'إلغاء' : 'Cancel',
        callback_data: 'r:pages:' + pageIndex,
      },
    ]],
  };
}

export function buildPageRestoreKeyboard(pageIndex, languageCode) {
  return {
    inline_keyboard: [
      [{
        text: language(languageCode) === 'ar' ? 'استعادة' : 'Restore',
        callback_data: 'r:prestore',
        style: 'success',
      }],
      [{
        text: pagesCopy(languageCode).back,
        callback_data: 'r:pages:' + Math.max(0, Number(pageIndex) || 0),
      }],
    ],
  };
}

async function editPagesTarget(
  userId,
  session,
  richMessage,
  replyMarkup,
  fallbackChatId = null,
  fallbackMessageId = null,
  saved = false,
) {
  const chatId = saved
    ? (session?.managementChatId || fallbackChatId || session?.chatId)
    : (fallbackChatId || session?.chatId);
  const messageId = saved
    ? session?.managementMessageId
    : fallbackMessageId;
  if (!chatId) return false;

  if (messageId) {
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        rich_message: richMessage,
        reply_markup: replyMarkup,
      });
      return true;
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toLowerCase();
      if (reason.includes('message is not modified')) return true;
      const recoverableSavedTarget = saved && (
        reason.includes('message to edit not found')
        || reason.includes("message can't be edited")
        || reason.includes('message_id_invalid')
      );
      if (!recoverableSavedTarget) throw error;
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
  return true;
}

export async function renderPagesScreen(
  userId,
  languageCode,
  requestedIndex = 0,
  {
    resetSearch = false,
    fallbackChatId = null,
    fallbackMessageId = null,
    saved = false,
  } = {},
) {
  let session = await loadEditorSession(userId, { touch: false });
  if (!session) return false;
  if (resetSearch && session.pagesSearchQuery) {
    session = await updateEditorSession(userId, { pagesSearchQuery: '' });
  }

  const query = String(session.pagesSearchQuery || '');
  const sortMode = String(session.pagesSortMode || 'updated');
  const result = await queryPages(userId, requestedIndex, query, sortMode);
  const copy = pagesCopy(languageCode);

  if (!result.totalCount && !query) return false;

  let heading;
  if (result.filteredTotal) {
    heading = copy.title + '\n\n' + copy.prompt;
    if (query) heading += '\n\n' + copy.searchResults(query);
  } else {
    heading = copy.searchNone(query);
  }

  const richMessage = buildPagesRichMessage(
    result.pages,
    languageCode,
    result.pageIndex,
    heading,
  );
  const replyMarkup = buildPagesKeyboard({
    showControls: result.totalCount > 1,
    showPager: result.filteredTotal > 0,
    pageIndex: result.pageIndex,
    totalPages: result.totalPages,
    paginationPrefix: query ? 'r:presults' : 'r:pages',
    languageCode,
  });
  await editPagesTarget(
    userId,
    session,
    richMessage,
    replyMarkup,
    fallbackChatId,
    fallbackMessageId,
    saved,
  );
  return true;
}

export async function showPages(query, requestedIndex = 0) {
  const userId = query?.from?.id;
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  if (!userId || !chatId || !messageId) return false;
  return renderPagesScreen(
    userId,
    query.from?.language_code || 'en',
    requestedIndex,
    {
      resetSearch: String(query.data || '') === 'r:pages',
      fallbackChatId: chatId,
      fallbackMessageId: messageId,
    },
  );
}

export function emptyPagesText(languageCode) {
  return pagesCopy(languageCode).empty;
}
