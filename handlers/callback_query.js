import { api } from 'sdk';
import { openEditor } from 'lib/editor-home';
import { handleDeveloperCallback } from 'lib/developer';
import { observeRequest } from 'lib/usage-stats';
import { handleEditorBlockCallback } from 'lib/editor-block-flow';
import { handlePageNavigationCallback } from 'lib/page-navigation';
import { handleEditorPageCallback } from 'lib/editor-pages';
import { guardEditorCallback } from 'lib/editor-guard';
import {
  allowCallbackRequest,
  claimUpdate,
  releaseUpdate,
} from 'lib/request-guard';


export default async function (query, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;
  const started = Date.now();
  let failed = false;
  try {
    if (!query?.id) return;
    if (!await allowCallbackRequest(query)) return;
    if (await handleDeveloperCallback(query)) return;
    if (await handlePageNavigationCallback(query)) return;
    if (await guardEditorCallback(query)) return;
    if (await handleEditorPageCallback(query)) return;
    if (await handleEditorBlockCallback(query)) return;

    const data = String(query.data || '');

    if (data === 'r:starteditor') {
      await api.answerCallbackQuery({ callback_query_id: query.id });
      const chatId = query.message?.chat?.id;
      if (!chatId) return;

      await openEditor(chatId, query.from?.language_code || 'en', query.from?.id);
      const messageId = query.message?.message_id;
      if (messageId) {
        try {
          await api.deleteMessage({ chat_id: chatId, message_id: messageId });
        } catch (error) {
          console.warn('Could not delete welcome message after opening editor', error);
        }
      }
      return;
    }

    await api.answerCallbackQuery({ callback_query_id: query.id });
  } catch (error) {
    failed = true;
    await releaseUpdate(updateId);
    throw error;
  } finally {
    try {
      await observeRequest(query?.from, Date.now() - started, failed);
    } catch (error) {
      console.warn('Could not record callback usage stats', error);
    }
  }
}
