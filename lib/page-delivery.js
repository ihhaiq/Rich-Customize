import { db } from 'sdk';
import { eq } from 'sdk/db';
import { richPages } from 'schema';
import { buildInputRichMessage } from 'lib/editor-renderer';
import {
  buildMessageButtonsKeyboard,
  prepareMessageButtons,
} from 'lib/page-buttons';

const PAGE_CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizePageCode(value) {
  const code = String(value || '').trim();
  return PAGE_CODE_RE.test(code) ? code : null;
}

async function getPage(pageId) {
  return db.select().from(richPages)
    .where(eq(richPages.pageId, String(pageId || ''))).get();
}

export async function savedPageQueryResult(pageId, languageCode = 'en') {
  const page = await getPage(pageId);
  if (!page) return null;
  const preparedButtons = await prepareMessageButtons(page.buttons || []);
  const richMessage = buildInputRichMessage(
    page.blocks || [],
    { sourcePageId: String(page.pageId) },
  );
  const replyMarkup = preparedButtons.length
    ? buildMessageButtonsKeyboard(preparedButtons, {
        buttonsPerRow: Number(page.buttonsPerRow || 1),
        sourcePageId: String(page.pageId),
      })
    : undefined;
  const isArabic = String(languageCode || '').toLowerCase().startsWith('ar');
  return {
    type: 'article',
    id: 'page-' + String(page.pageId),
    title: String(page.title || page.pageId),
    description: (isArabic ? 'رسالة غنية محفوظة · ' : 'Saved Rich Message · ') + String(page.pageId),
    input_message_content: {
      rich_message: richMessage,
    },
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
}

export function guestPageCodes(message) {
  const raw = String(message?.text || message?.caption || '');
  const result = [];
  for (const token of raw.split(/\s+/)) {
    if (!token || token.startsWith('@')) continue;
    const candidate = normalizePageCode(token.replace(/^[.,،؛:!?؟]+|[.,،؛:!?؟]+$/g, ''));
    if (candidate) result.push(candidate);
  }
  return result;
}

export function guestPageCode(message) {
  return guestPageCodes(message)[0] || null;
}
