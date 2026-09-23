import { api } from 'sdk';
import db, { asc, desc, eq } from 'sdk/db';
import { richPages } from 'schema';

const PAGES_PER_SCREEN = 4;

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
  },
};

function language(languageCode) {
  return String(languageCode || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

function copyFor(languageCode) {
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

export async function queryPages(ownerId, requestedIndex = 0) {
  const where = eq(richPages.ownerId, Number(ownerId));
  const total = await db.$count(richPages, where);
  const totalPages = Math.max(1, Math.ceil(total / PAGES_PER_SCREEN));
  const pageIndex = Math.max(0, Math.min(Number(requestedIndex) || 0, totalPages - 1));

  if (!total) {
    return { pages: [], total: 0, pageIndex: 0, totalPages: 1 };
  }

  const pages = await db
    .select()
    .from(richPages)
    .where(where)
    .orderBy(desc(richPages.updatedAt), asc(richPages.pageId))
    .limit(PAGES_PER_SCREEN)
    .offset(pageIndex * PAGES_PER_SCREEN)
    .all();

  return { pages, total, pageIndex, totalPages };
}

export function buildPagesRichMessage(pages, languageCode, pageIndex = 0) {
  const copy = copyFor(languageCode);
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

  return {
    blocks: [
      {
        type: 'paragraph',
        text: copy.title + '\n\n' + copy.prompt,
      },
      { type: 'divider' },
      {
        type: 'table',
        cells: rows,
        is_bordered: true,
        is_compact: true,
      },
      { type: 'divider' },
    ],
    ...(language(languageCode) === 'ar' ? { is_rtl: true } : {}),
  };
}

export function buildPagesKeyboard(pageIndex, totalPages, languageCode) {
  const copy = copyFor(languageCode);
  const rows = [];

  if (totalPages > 1) {
    const safeTotal = Math.max(1, totalPages);
    const safeIndex = Math.max(0, Math.min(pageIndex, safeTotal - 1));
    const previous = Math.max(safeIndex - 1, 0);
    const next = Math.min(safeIndex + 1, safeTotal - 1);

    rows.push([
      { text: '⬅️', callback_data: 'r:pages:' + previous },
      { text: (safeIndex + 1) + '/' + safeTotal, callback_data: 'r:pages:' + safeIndex },
      { text: '➡️', callback_data: 'r:pages:' + next },
    ]);
  }

  rows.push([
    { text: copy.search, callback_data: 'r:psearch' },
    { text: copy.sort, callback_data: 'r:psort' },
  ]);
  rows.push([{ text: copy.back, callback_data: 'r:back' }]);

  return { inline_keyboard: rows };
}

export async function showPages(query, requestedIndex = 0) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) return false;

  const languageCode = query.from?.language_code || 'en';
  const result = await queryPages(query.from.id, requestedIndex);
  if (!result.total) return false;

  const richMessage = buildPagesRichMessage(
    result.pages,
    languageCode,
    result.pageIndex,
  );
  const replyMarkup = buildPagesKeyboard(
    result.pageIndex,
    result.totalPages,
    languageCode,
  );

  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      rich_message: richMessage,
      reply_markup: replyMarkup,
    });
  } catch (error) {
    console.warn('Could not edit editor message into pages view', error);
    await api.sendRichMessage({
      chat_id: chatId,
      rich_message: richMessage,
      reply_markup: replyMarkup,
    });
  }
  return true;
}

export function emptyPagesText(languageCode) {
  return copyFor(languageCode).empty;
}
