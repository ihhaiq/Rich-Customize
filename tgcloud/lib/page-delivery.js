import { db } from 'sdk';
import { eq } from 'sdk/db';
import { richPages } from 'schema';
import { buildInputRichMessage } from 'lib/editor-renderer';
import {
  buildMessageButtonsKeyboard,
  prepareMessageButtons,
} from 'lib/page-buttons';
import { resolveLanguage, tr } from 'lib/i18n';
import { shouldIncludeBranding } from 'lib/branding';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { legacyPagePublishOptions } from 'lib/saved-page-policy';

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
  const includeBranding = await shouldIncludeBranding(page.ownerId);
  const richMessage = buildInputRichMessage(
    page.blocks || [],
    {
      userId: page.ownerId,
      sourcePageId: String(page.pageId),
      includeBranding,
      entitlement:await getEditorEntitlement(page.ownerId),
      ...legacyPagePublishOptions(page, page.ownerId, await getEditorEntitlement(page.ownerId)),
    },
  );
  const replyMarkup = preparedButtons.length
    ? buildMessageButtonsKeyboard(preparedButtons, {
        buttonsPerRow: Number(page.buttonsPerRow || 1),
        sourcePageId: String(page.pageId),
      })
    : undefined;
  const locale = resolveLanguage(languageCode);
  return {
    type: 'article',
    id: 'page-' + String(page.pageId),
    title: String(page.title || page.pageId),
    description: tr(locale, 'Saved Rich Message · ') + String(page.pageId),
    input_message_content: {
      rich_message: richMessage,
    },
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  };
}

export function guestPageRequest(message) {
  let raw = String(message?.text || message?.caption || '');
  raw = raw.replace(/@RichCustomizebot\b/gi, '').trim();
  const pageCommand = raw.match(/^\/page(?:@richcustomizebot)?(?:\s+|$)/i);
  const preferName = Boolean(pageCommand);
  if (pageCommand) raw = raw.slice(pageCommand[0].length).trim();
  const reference = normalizePageTitle(raw);
  const code = normalizePageCode(reference);
  return {
    reference,
    preferName,
    preferCode: !preferName && Boolean(code),
    codeCandidates: !preferName && code ? [code] : [],
  };
}

export function guestPageCodes(message) {
  return guestPageRequest(message).codeCandidates;
}

export function guestPageCode(message) {
  return guestPageCodes(message)[0] || null;
}

export function normalizePageTitle(value) {
  return String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function guestPageReference(message) {
  return guestPageRequest(message).reference;
}

export async function resolveSavedPageReference(
  reference,
  userId,
  codeCandidates = null,
  { preferName = false, preferCode = false } = {},
) {
  const title = normalizePageTitle(reference);
  if (!title) return { status: 'missing' };
  const exactCode = normalizePageCode(title);
  if (preferCode && exactCode && await getPage(exactCode)) {
    return { status: 'found', pageId: exactCode };
  }
  const id = Number(userId);
  if (Number.isSafeInteger(id) && id > 0) {
    const pages = await db.select().from(richPages).where(eq(richPages.ownerId, id)).all();
    const matches = pages.filter(page => normalizePageTitle(page.title) === title);
    if (matches.length > 1) return { status: 'ambiguous' };
    if (matches.length === 1) return { status: 'found', pageId: String(matches[0].pageId) };
  }
  if (!preferName && exactCode && await getPage(exactCode)) {
    return { status: 'found', pageId: exactCode };
  }
  for (const candidate of codeCandidates || []) {
    const code = normalizePageCode(candidate);
    if (code && await getPage(code)) return { status: 'found', pageId: code };
  }
  return { status: 'missing' };
}

export function ambiguousPageQueryResult(languageCode) {
  const ar = resolveLanguage(languageCode).startsWith('ar');
  const text = ar
    ? 'عندك أكثر من صفحة بنفس الاسم. استعمل كود الصفحة حتى تحدد المطلوبة.'
    : 'More than one of your pages has this name. Use the page code to choose the right one.';
  return {
    type: 'article',
    id: 'ambiguous-page-name',
    title: ar ? 'اسم الصفحة مكرر' : 'Duplicate page name',
    description: text,
    input_message_content: { message_text: text },
  };
}
