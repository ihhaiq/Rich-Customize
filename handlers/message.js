// Telegram Serverless message handler.
// The platform passes update.message directly as the first argument.

import { api } from 'sdk';
import {
  buildWelcomeFallbackText,
  buildWelcomeKeyboard,
  buildWelcomeRichMessage,
} from 'lib/welcome';
import {
  buildStartEditorKeyboard,
  editorClosedHint,
  openEditor,
} from 'lib/editor-home';
import { handleDeveloperPendingMessage, openDeveloperPanel } from 'lib/developer';
import { observeRequest } from 'lib/usage-stats';
import { handleEditorBlockMessage } from 'lib/editor-block-flow';
import { handleEditorCoreMessage } from 'lib/editor-core';
import { handleEditorPageMessage } from 'lib/editor-pages';
import { loadEditorSession } from 'lib/editor-session';
import {
  allowMessageRequest,
  claimUpdate,
  releaseUpdate,
} from 'lib/request-guard';

function commandName(text) {
  if (typeof text !== 'string') return '';
  return text.trim().split(/\s+/, 1)[0].toLowerCase();
}

function matchesCommand(command, name) {
  return command === '/' + name || command.startsWith('/' + name + '@');
}

export default async function (message, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;
  const started = Date.now();
  let failed = false;
  try {
    if (!await allowMessageRequest(message)) return;
    const command = commandName(message?.text);
    const languageCode = message.from?.language_code || 'en';

    if (matchesCommand(command, 'dev')) {
      await openDeveloperPanel(message);
      return;
    }

    if (await handleDeveloperPendingMessage(message)) return;

    if (matchesCommand(command, 'editor')) {
      await openEditor(message.chat.id, languageCode, message.from?.id);
      return;
    }

    if (!matchesCommand(command, 'start')) {
      if (await handleEditorBlockMessage(message)) return;
      if (await handleEditorPageMessage(message)) return;
      if (await handleEditorCoreMessage(message)) return;

      const session = message?.from?.id
        ? await loadEditorSession(message.from.id)
        : null;
      if (session?.state === 'managing') {
        await api.sendMessage({
          chat_id: message.chat.id,
          text: editorClosedHint(languageCode),
          reply_markup: buildStartEditorKeyboard(languageCode),
        });
        return;
      }

      if (!session && String(message?.chat?.type || '') === 'private') {
        const replyMarkup = buildWelcomeKeyboard(languageCode);
        try {
          await api.sendRichMessage({
            chat_id: message.chat.id,
            rich_message: buildWelcomeRichMessage(message.from, languageCode),
            reply_markup: replyMarkup,
          });
        } catch (error) {
          console.error('idle welcome rich message failed; using plain fallback', error);
          await api.sendMessage({
            chat_id: message.chat.id,
            text: buildWelcomeFallbackText(message.from, languageCode),
            reply_markup: replyMarkup,
          });
        }
      }
      return;
    }

    const replyMarkup = buildWelcomeKeyboard(languageCode);
    try {
      await api.sendRichMessage({
        chat_id: message.chat.id,
        rich_message: buildWelcomeRichMessage(message.from, languageCode),
        reply_markup: replyMarkup,
      });
    } catch (error) {
      console.error('sendRichMessage welcome failed; using plain fallback', error);
      await api.sendMessage({
        chat_id: message.chat.id,
        text: buildWelcomeFallbackText(message.from, languageCode),
        reply_markup: replyMarkup,
      });
    }
  } catch (error) {
    failed = true;
    await releaseUpdate(updateId);
    throw error;
  } finally {
    try {
      await observeRequest(message?.from, Date.now() - started, failed);
    } catch (error) {
      console.warn('Could not record message usage stats', error);
    }
  }
}
