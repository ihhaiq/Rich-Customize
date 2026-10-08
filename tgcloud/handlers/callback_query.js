import { api } from 'sdk';
import { handlePremiumEmojiCallback } from 'lib/editor-premium-emoji';
import { handleEditorImportCallback } from 'lib/editor-core';
import { openEditor } from 'lib/editor-home';
import { handleDeveloperCallback } from 'lib/developer';
import { observeRequest } from 'lib/usage-stats';
import { resolveUserLanguage } from 'lib/i18n';
import { logError } from 'lib/error-log';
import { handleBrandingCallback } from 'lib/branding';
import { handleManagedBotCallback } from 'lib/managed-bot-billing';
import { handleEditorBlockCallback } from 'lib/editor-block-flow';
import { handlePageNavigationCallback } from 'lib/page-navigation';
import { handleEditorPageCallback } from 'lib/editor-pages';
import { handleEditorButtonCallback } from 'lib/editor-buttons';
import { handlePublishCallback } from 'lib/publish';
import { guardEditorCallback, isEditorSessionCallback } from 'lib/editor-guard';
import { handleShowcaseCallback } from 'lib/showcase';
import { handleLegalCallback } from 'lib/legal';
import {
  allowCallbackRequest,
  claimUpdate,
  releaseUpdate,
} from 'lib/request-guard';
import { withEditorMessageLock } from 'lib/editor-session';


function isPublishEditorCallback(data) {
  const value = String(data || '');
  return value.startsWith('r:post') || value.startsWith('r:pt:');
}

async function routeNonPublishEditorCallback(query) {
  if (await handleEditorImportCallback(query)) return true;
  if (await handlePremiumEmojiCallback(query)) return true;
  if (await handleEditorPageCallback(query)) return true;
  if (await handleEditorButtonCallback(query)) return true;
  if (await handleEditorBlockCallback(query)) return true;
  return false;
}

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
    if (await handleLegalCallback(query)) return;
    if (await handleBrandingCallback(query)) return;
    if (await handleManagedBotCallback(query)) return;
    if (await guardEditorCallback(query)) return;

    const data = String(query.data || '');
    if (data === 'r:channels_soon') {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'قريبا',
        show_alert: true,
      });
      return;
    }
    const chatId = query.message?.chat?.id;
    const messageId = query.message?.message_id;
    if (
      isEditorSessionCallback(data)
      && !isPublishEditorCallback(data)
      && chatId
      && messageId
    ) {
      const locked = await withEditorMessageLock(
        chatId,
        messageId,
        () => routeNonPublishEditorCallback(query),
      );
      if (!locked.acquired) {
        try {
          await api.answerCallbackQuery({ callback_query_id: query.id });
        } catch {}
        return;
      }
      if (locked.value) return;
    } else {
      if (await handleEditorImportCallback(query)) return;
      if (await handlePremiumEmojiCallback(query)) return;
      if (await handleEditorPageCallback(query)) return;
      if (await handleEditorButtonCallback(query)) return;
      if (await handlePublishCallback(query)) return;
      if (await handleEditorBlockCallback(query)) return;
    }


    if (data === 'r:starteditor') {
      await api.answerCallbackQuery({ callback_query_id: query.id });
      const chatId = query.message?.chat?.id;
      const messageId = query.message?.message_id;
      if (!chatId || !messageId) return;

      await openEditor(
        chatId,
        query.from?.language_code || await resolveUserLanguage(query.from),
        query.from?.id,
        { reuseMessageId: messageId },
      );
      return;
    }

    await api.answerCallbackQuery({ callback_query_id: query.id });
  } catch (error) {
    failed = true;
    await logError('callback_query', error, {
      updateId,
      userId: query?.from?.id,
      chatId: query?.message?.chat?.id,
      callbackData: query?.data,
    });
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
