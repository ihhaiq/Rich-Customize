import { isRtlLocale, resolveLanguage, t } from 'lib/i18n';

export const SHOWCASE_URL = 'https://t.me/durov/531';
export const UPDATES_URL = 'https://t.me/RichCustomize';
export const SUPPORT_URL = 'https://t.me/+D4cEzE0V7IIwYTcx';
export const ADD_GROUP_URL = 'https://t.me/RichCustomizebot?startgroup=true';
export const BOT_USERNAME = '@RichCustomizebot';

function urlButton(text, url) {
  return {
    type: 'button',
    button: { text, url },
  };
}

function userDisplayName(user) {
  if (!user) return '';
  const name = [user.first_name, user.last_name].filter(Boolean).join(' ').trim();
  return name || String(user.id || '');
}

export function buildWelcomeRichMessage(user, languageCode) {
  const locale = resolveLanguage(languageCode);
  const mentionText = userDisplayName(user);
  const greeting = [t(locale, 'welcome.greeting') + ' '];

  if (user?.id && mentionText) {
    greeting.push({
      type: 'text_mention',
      text: mentionText,
      user,
    });
  } else if (mentionText) {
    greeting.push(mentionText);
  }
  greeting.push('!');

  const richMessage = {
    blocks: [
      { type: 'heading', text: greeting, size: 3 },
      { type: 'footer', text: '- ' + BOT_USERNAME },
      {
        type: 'paragraph',
        text: [
          t(locale, 'welcome.product_description'),
          ' ',
          urlButton(t(locale, 'welcome.view_button'), SHOWCASE_URL),
        ],
      },
      { type: 'divider' },
      {
        type: 'footer',
        text: [
          t(locale, 'welcome.help_title'),
          '\n',
          t(locale, 'welcome.help_check') + ' ',
          urlButton(t(locale, 'welcome.updates_button'), UPDATES_URL),
          ' ' + t(locale, 'welcome.and') + ' ',
          urlButton(t(locale, 'welcome.support_button'), SUPPORT_URL),
        ],
      },
    ],
  };

  if (isRtlLocale(locale)) richMessage.is_rtl = true;
  return richMessage;
}

export function buildWelcomeKeyboard(languageCode) {
  const locale = resolveLanguage(languageCode);
  return {
    inline_keyboard: [
      [{ text: t(locale, 'welcome.add_group_button'), url: ADD_GROUP_URL }],
      [
        {
          text: t(locale, 'welcome.showcase_button'),
          callback_data: 'r:showcase',
        },
        {
          text: t(locale, 'editor.new_button'),
          callback_data: 'r:starteditor',
          style: 'primary',
        },
      ],
    ],
  };
}

export function buildWelcomeFallbackText(user, languageCode) {
  const locale = resolveLanguage(languageCode);
  const name = userDisplayName(user);
  return [
    t(locale, 'welcome.greeting') + (name ? ' ' + name : '') + '!',
    '',
    t(locale, 'welcome.product_description'),
    '',
    t(locale, 'welcome.help_title'),
    t(locale, 'welcome.help_check') + ' ' + UPDATES_URL + ' ' + t(locale, 'welcome.and') + ' ' + SUPPORT_URL,
  ].join('\n');
}
