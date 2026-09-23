import { api } from 'sdk';
import db, { asc, desc, eq } from 'sdk/db';
import { richPages } from 'schema';

const PAGES_PER_SCREEN = 4;

const COPY = {
  en: {
    title: '📚 My Pages',
    prompt: 'Choose a saved page:',
    empty: 'You do not have any saved pages yet.',
    page: 'Page',
    copyCode: 'Copy code',
    back: '🔙 Back',
  },
  ar: {
    title: '📚 صفحاتي',
    prompt: 'اختر صفحة محفوظة:',
    empty: 'ما عندك صفحات محفوظة بعد.',
    page: 'الصفحة',
    copyCode: 'نسخ الكود',
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

export function buildPagesRichMessage(pages, languageCode) {
  const copy = copyFor(languageCode);
  const rows = [[
    textCell(copy.copyCode, { header: true }),
    textCell(copy.page, { header: true, align: 'right' }),
  ]];

  for (const page of pages) {
    rows.push([
      buttonCell({
        text: copy.copyCode,
        copy_text: { text: String(page.pageId) },
      }),
      textCell(String(page.title || page.pageId), { align: 'right' }),
    ]);
  }

  return {
    blocks: [
      {
        type: 'paragraph',
        text: `${copy.title}\n\n${copy.prompt}`,
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
    const previous = Math.max(0, pageIndex - 1);
    const next = Math.min(totalPages - 1, pageIndex + 1);
    rows.push([
      { text: '⬅️', callback_data: `r:pages:${previous}` },
      { text: `${pageIndex + 1}/${totalPages}`, callback_data: `r:pages:${pageIndex}` },
      { text: '➡️', callback_data: `r:pages:${next}` },
    ]);
  }

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

  const richMessage = buildPagesRichMessage(result.pages, languageCode);
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
