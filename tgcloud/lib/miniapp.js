import { api } from 'sdk';
import { developerAccessConfigured, isDeveloper } from 'lib/developer-access';

export const MINI_APP_SHORT_NAME = 'editor';

function commandName(text) {
  if (typeof text !== 'string') return '';
  return text.trim().split(/\s+/, 1)[0].toLowerCase();
}

function matchesAppCommand(text) {
  const command = commandName(text);
  return command === '/app' || command.startsWith('/app@');
}

export function directMiniAppLink(botUsername, startParam = null) {
  const username = String(botUsername || '').trim().replace(/^@+/, '');
  if (!username) throw new Error('bot username is required');
  const base = 'https://t.me/' + username + '/' + MINI_APP_SHORT_NAME;
  if (!startParam) return base;
  return base + '?startapp=' + encodeURIComponent(String(startParam)).replaceAll('%5F', '_').replaceAll('%2D', '-');
}

export async function handleMiniAppShortcut(message) {
  if (!matchesAppCommand(message?.text)) return false;
  if (String(message?.chat?.type || '') !== 'private') return true;
  if (
    !message?.from?.id
    || !developerAccessConfigured()
    || !isDeveloper(message.from.id)
  ) {
    return true;
  }

  const me = await api.getMe();
  if (!me?.username) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: 'Bot username is unavailable.',
    });
    return true;
  }

  await api.sendMessage({
    chat_id: message.chat.id,
    text:
      '🧪 Rich Customize Mini App — Beta 0.3\n\n'
      + 'Rich Message Editor\n'
      + 'Short name: ' + MINI_APP_SHORT_NAME,
    reply_markup: {
      inline_keyboard: [[{
        text: '▶️ Start editor',
        url: directMiniAppLink(me.username),
      }]],
    },
  });
  return true;
}
