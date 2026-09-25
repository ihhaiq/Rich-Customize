import { api } from 'sdk';
import { openEditor } from 'lib/editor-home';
import { handleDeveloperCallback } from 'lib/developer';
import { observeRequest } from 'lib/usage-stats';
import { resolveUserLanguage } from 'lib/i18n';
import { handleEditorBlockCallback } from 'lib/editor-block-flow';
import { handlePageNavigationCallback } from 'lib/page-navigation';
import { handleEditorPageCallback } from 'lib/editor-pages';
import { handleEditorButtonCallback } from 'lib/editor-buttons';
import { handlePublishCallback } from 'lib/publish';
import { guardEditorCallback } from 'lib/editor-guard';
import { handleShowcaseCallback } from 'lib/showcase';
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
    if (query?.from && !query.from.language_code) {
      query.from.language_code = await resolveUserLanguage(query.from);
    }
    if (await handleDeveloperCallback(query)) return;
    if (await handlePageNavigationCallback(query)) return;
    if (await handleShowcaseCallback(query)) return;
    if (await guardEditorCallback(query)) return;
    if (await handleEditorPageCallback(query)) return;
    if (await handleEditorButtonCallback(query)) return;
    if (await handlePublishCallback(query)) return;
    if (await handleEditorBlockCallback(query)) return;

    const data = String(query.data || '');

    if (data === 'r:starteditor') {
      await api.answerCallbackQuery({ callback_query_id: query.id });
      const chatId = query.message?.chat?.id;
      if (!chatId) return;

      await openEditor(chatId, query.from?.language_code || await resolveUserLanguage(query.from), query.from?.id);
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
