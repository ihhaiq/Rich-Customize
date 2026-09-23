// Telegram Serverless handler for /start and the first editor entry point.
// The platform passes update.message directly as the first argument.

import { api } from 'sdk';
import {
  buildWelcomeFallbackText,
  buildWelcomeKeyboard,
  buildWelcomeRichMessage,
} from 'lib/welcome';
import { openEditor } from 'lib/editor-home';

function commandName(text) {
  if (typeof text !== 'string') return '';
  return text.trim().split(/\\s+/, 1)[0].toLowerCase();
}

function matchesCommand(command, name) {
  return command === `/${name}` || command.startsWith(`/${name}@`);
}

export default async function (message) {
  const command = commandName(message?.text);
  const languageCode = message.from?.language_code || 'en';

  if (matchesCommand(command, 'editor')) {
    await openEditor(message.chat.id, languageCode);
    return;
  }

  if (!matchesCommand(command, 'start')) return;

  const replyMarkup = buildWelcomeKeyboard(languageCode);

  try {
    await api.sendRichMessage({
      chat_id: message.chat.id,
      rich_message: buildWelcomeRichMessage(message.from, languageCode),
      reply_markup: replyMarkup,
    });
  } catch (error) {
    // Keep /start usable even if Telegram rejects a future Rich Message shape.
    console.error('sendRichMessage welcome failed; using plain fallback', error);
    await api.sendMessage({
      chat_id: message.chat.id,
      text: buildWelcomeFallbackText(message.from, languageCode),
      reply_markup: replyMarkup,
    });
  }
}
