import { api } from 'sdk';
import { isRtlLocale, resolveLanguage, t } from 'lib/i18n';
import { PRIVACY_POLICY } from 'lib/privacy';

const UPDATES_URL = 'https://t.me/RichCustomize';
const SUPPORT_GROUP_URL = 'https://t.me/+D4cEzE0V7IIwYTcx';
const SUPPORT_DIRECT_URL = 'https://t.me/RichCustomize?direct';

function legalCopy(locale) {
  return {
    helpTitle: t(locale, 'legal.help_title'),
    privacyButton: t(locale, 'legal.privacy_button'),
    termsButton: t(locale, 'legal.terms_button'),
    supportButton: t(locale, 'legal.support_button'),
    checkMore: t(locale, 'legal.check_more'),
    updates: t(locale, 'legal.updates'),
    supportGroup: t(locale, 'legal.support_group'),
    privacyTitle: t(locale, 'legal.privacy_title'),
    privacyBody: t(locale, 'legal.privacy_body'),
    deleteData: t(locale, 'legal.delete_data'),
    termsTitle: t(locale, 'legal.terms_title'),
    termsBody: t(locale, 'legal.terms_body'),
    supportTitle: t(locale, 'legal.support_title'),
    supportBody: t(locale, 'legal.support_body'),
    openSupport: t(locale, 'legal.open_support'),
  };
}

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
    summary: isRtlLocale(locale) ? '\u202B' + copy.helpTitle + '\u202C' : copy.helpTitle,
    blocks: [
      {
        type: 'table',
        cells: [[
          tableButtonCell({
            text: copy.privacyButton,
            callback_data: 'legal:privacy',
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
  const blocks = [
    { type: 'heading', text: copy.privacyTitle, size: 1 },
    {
      type: 'footer',
      text: 'Rich Customize · ' + PRIVACY_POLICY.updated,
    },
    { type: 'divider' },
  ];

  for (const section of PRIVACY_POLICY.sections) {
    blocks.push({ type: 'heading', text: section.heading, size: 3 });
    if (section.body) {
      blocks.push({ type: 'paragraph', text: section.body });
    }
    if (Array.isArray(section.actions) && section.actions.length) {
      const actionButtons = section.actions.map((action) => {
        if (action === 'support') {
          return {
            text: copy.supportButton,
            url: SUPPORT_DIRECT_URL,
          };
        }
        if (action === 'updates') {
          return {
            text: copy.updates,
            url: UPDATES_URL,
          };
        }
        return null;
      }).filter(Boolean);

      if (actionButtons.length) {
        blocks.push({
          type: 'table',
          cells: [[
            ...actionButtons.map((button) => tableButtonCell(button)),
          ]],
          is_bordered: true,
          is_compact: false,
        });
      }
    }
  }

  blocks.push({ type: 'divider' });
  blocks.push({
    type: 'footer',
    text: [
      '\u200F',
      richButton(copy.deleteData, {
        url: SUPPORT_DIRECT_URL,
        style: 'danger',
      }),
    ],
  });

  return { blocks, is_rtl: true };
}

export function buildTermsRichMessage(languageCode) {
  const locale = resolveLanguage(languageCode);
  const copy = legalCopy(locale);
  const sections = String(copy.termsBody || '')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  return {
    blocks: [
      { type: 'heading', text: copy.termsTitle, size: 2 },
      ...sections.map((text) => ({ type: 'paragraph', text })),
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
  const fallback = [
    copy.privacyTitle,
    PRIVACY_POLICY.updated,
    '',
    ...PRIVACY_POLICY.sections.flatMap((section) => [
      section.heading,
      ...(section.body ? [section.body] : []),
      ...(Array.isArray(section.actions)
        ? section.actions.map((action) => {
            if (action === 'support') return copy.supportButton + ': ' + SUPPORT_DIRECT_URL;
            if (action === 'updates') return copy.updates + ': ' + UPDATES_URL;
            return '';
          }).filter(Boolean)
        : []),
      '',
    ]),
  ].join('\n').trim();

  await sendRichOrFallback(
    chatId,
    buildPrivacyRichMessage(locale),
    fallback,
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
