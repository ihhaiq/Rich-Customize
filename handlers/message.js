// Telegram Serverless handler for the first converted feature: /start.
// The platform passes update.message directly as the first argument.

import { api } from 'sdk';
import {
  buildWelcomeFallbackText,
  buildWelcomeKeyboard,
  buildWelcomeRichMessage,
} from 'lib/welcome';

function isStartCommand(text) {
  if (typeof text !== 'string') return false;
  const command = text.trim().split(/\\s+/, 1)[0].toLowerCase();
  return command === '/start' || command.startsWith('/start@');
}

export default async function (message) {
  if (!isStartCommand(message?.text)) return;

  const languageCode = message.from?.language_code || 'en';
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
