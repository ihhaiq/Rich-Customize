import { api } from 'sdk';
import { isRtlLocale, resolveLanguage } from 'lib/i18n';
import {
  legalCopy,
  SUPPORT_DIRECT_URL,
  SUPPORT_GROUP_URL,
  UPDATES_URL,
} from 'lib/legal-locales';

function richButton(text, payload = {}) {
  return { type: 'button', button: { text, ...payload } };
}

function tableButtonCell(button) {
  return {
    text: richButton(button.text, button),
    align: 'center',
    valign: 'middle',
  };
}

export function buildHelpDetailsBlock(languageCode) {
  const locale = resolveLanguage(languageCode);
  const copy = legalCopy(locale);
  return {
    type: 'details',
    summary: copy.helpTitle,
    blocks: [
      {
        type: 'table',
        cells: [[
          tableButtonCell({
            text: copy.privacyButton,
            callback_data: 'legal:privacy',
            style: 'primary',
          }),
          tableButtonCell({
            text: copy.termsButton,
            callback_data: 'legal:terms',
          }),
          tableButtonCell({
            text: copy.supportButton,
            url: SUPPORT_DIRECT_URL,
            style: 'success',
          }),
        ]],
        is_bordered: true,
        is_compact: false,
      },
      {
        type: 'footer',
        text: [
          copy.checkMore + ' ',
          richButton(copy.updates, { url: UPDATES_URL }),
          ' · ',
          richButton(copy.supportGroup, { url: SUPPORT_GROUP_URL }),
        ],
      },
    ],
  };
}

export function buildPrivacyRichMessage(languageCode) {
  const locale = resolveLanguage(languageCode);
  const copy = legalCopy(locale);
  return {
    blocks: [
      { type: 'heading', text: copy.privacyTitle, size: 2 },
      { type: 'paragraph', text: copy.privacyBody },
      {
        type: 'footer',
        text: richButton(copy.deleteData, {
          url: SUPPORT_DIRECT_URL,
          style: 'danger',
        }),
      },
    ],
    ...(isRtlLocale(locale) ? { is_rtl: true } : {}),
  };
}

export function buildTermsRichMessage(languageCode) {
  const locale = resolveLanguage(languageCode);
  const copy = legalCopy(locale);
  return {
    blocks: [
      { type: 'heading', text: copy.termsTitle, size: 2 },
      { type: 'paragraph', text: copy.termsBody },
    ],
    ...(isRtlLocale(locale) ? { is_rtl: true } : {}),
  };
}

export function buildSupportRichMessage(languageCode) {
  const locale = resolveLanguage(languageCode);
  const copy = legalCopy(locale);
  return {
    blocks: [
      { type: 'heading', text: copy.supportTitle, size: 2 },
      { type: 'paragraph', text: copy.supportBody },
      {
        type: 'footer',
        text: richButton(copy.openSupport, {
          url: SUPPORT_DIRECT_URL,
          style: 'primary',
        }),
      },
    ],
    ...(isRtlLocale(locale) ? { is_rtl: true } : {}),
  };
}

async function sendRichOrFallback(chatId, richMessage, fallbackText, replyMarkup = undefined) {
  try {
    await api.sendRichMessage({
      chat_id: chatId,
      rich_message: richMessage,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  } catch (error) {
    console.error('legal rich message failed; using plain fallback', error);
    await api.sendMessage({
      chat_id: chatId,
      text: fallbackText,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }
}

export async function sendPrivacyMessage(chatId, languageCode) {
  const locale = resolveLanguage(languageCode);
  const copy = legalCopy(locale);
  await sendRichOrFallback(
    chatId,
    buildPrivacyRichMessage(locale),
    copy.privacyTitle + '\n\n' + copy.privacyBody,
    {
      inline_keyboard: [[{
        text: copy.deleteData,
        url: SUPPORT_DIRECT_URL,
        style: 'danger',
      }]],
    },
  );
}

export async function sendTermsMessage(chatId, languageCode) {
  const locale = resolveLanguage(languageCode);
  const copy = legalCopy(locale);
  await sendRichOrFallback(
    chatId,
    buildTermsRichMessage(locale),
    copy.termsTitle + '\n\n' + copy.termsBody,
  );
}

export async function sendSupportMessage(chatId, languageCode) {
  const locale = resolveLanguage(languageCode);
  const copy = legalCopy(locale);
  await sendRichOrFallback(
    chatId,
    buildSupportRichMessage(locale),
    copy.supportTitle + '\n\n' + copy.supportBody + '\n' + SUPPORT_DIRECT_URL,
    {
      inline_keyboard: [[{
        text: copy.openSupport,
        url: SUPPORT_DIRECT_URL,
        style: 'primary',
      }]],
    },
  );
}

export async function handleLegalCallback(query) {
  const data = String(query?.data || '');
  if (data !== 'legal:privacy' && data !== 'legal:terms') return false;

  await api.answerCallbackQuery({ callback_query_id: query.id });
  const chatId = query?.message?.chat?.id;
  if (!chatId) return true;

  const locale = resolveLanguage(query?.from?.language_code);
  if (data === 'legal:privacy') {
    await sendPrivacyMessage(chatId, locale);
  } else {
    await sendTermsMessage(chatId, locale);
  }
  return true;
}
