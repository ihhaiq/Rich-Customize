import {
  handleEditorChannelPostCallback,
  handleTutorialCallback,
  pauseTutorialForCommand,
} from 'lib/editor-core';
import { handleGoldenGiftCallback } from 'lib/golden-gifts';
import { api } from 'sdk';
import { handlePremiumEmojiCallback } from 'lib/editor-premium-emoji';
import { handleEditorImportCallback } from 'lib/editor-core';
import {
  groupEditorAccessText,
  groupEditorTitleHelp,
  isGroupEditorChat,
  openEditor,
  verifyGroupEditorAdmin,
} from 'lib/editor-home';
import { handleDeveloperCallback } from 'lib/developer';
import { observeRequest } from 'lib/usage-stats';
import { resolveUserLanguage } from 'lib/i18n';
import { logError } from 'lib/error-log';
import {
  explainOperationalError,
  isDatabaseFailure,
  userOperationalError,
} from 'lib/operational-errors';
import { handleBrandingCallback } from 'lib/branding';
import { handleManagedBotCallback } from 'lib/managed-bot-billing';
import { handleEditorBlockCallback } from 'lib/editor-block-flow';
import { handleEditorLimitConfirmation } from 'lib/editor-limit-confirmation';
import { handlePageNavigationCallback } from 'lib/page-navigation';
import { handleEditorPageCallback } from 'lib/editor-pages';
import { handleEditorButtonCallback } from 'lib/editor-buttons';
import { handlePublishCallback } from 'lib/publish';
import { handleScheduleCancelCallback } from 'lib/scheduled-publish';
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
  if (await handleEditorChannelPostCallback(query)) return true;
  if (await handleEditorImportCallback(query)) return true;
  if (await handlePremiumEmojiCallback(query)) return true;
  if (await handleEditorPageCallback(query)) return true;
  if (await handleEditorButtonCallback(query)) return true;
  if (await handleEditorLimitConfirmation(query)) return true;
  if (await handleEditorBlockCallback(query)) return true;
  return false;
}

async function logErrorSafely(scope, error, context) {
  try {
    await logError(scope, error, context);
  } catch (loggingError) {
    console.warn('Could not persist callback error log', loggingError?.name || 'Error');
  }
}

async function reportDatabaseFailure(query, error) {
  console.error('Telegram Serverless database unavailable while handling a callback');
  if (!query?.id) return;
  const notice = userOperationalError(error, query?.from?.language_code || 'ar', {
    scope: errorScope,
    callbackData: query?.data,
  });
  try {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: notice.slice(0, 200),
      show_alert: true,
    });
  } catch (feedbackError) {
    console.warn('Could not answer callback during database outage', feedbackError?.name || 'Error');
  }
}

export default async function (query, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  try {
    if (!await claimUpdate(updateId)) return;
  } catch (error) {
    if (!isDatabaseFailure(error)) throw error;
    await reportDatabaseFailure(query, error);
    return;
  }
  const started = Date.now();
  let failed = false;
  try {
    if (!query?.id) return;
    if (!await allowCallbackRequest(query)) return;
    if (query?.from && !query.from.language_code) {
      query.from.language_code = await resolveUserLanguage(query.from);
    }
    const data = String(query.data || '');
    if (data === 'r:group_editor:title_help') {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: groupEditorTitleHelp(query.from?.language_code).slice(0, 200),
        show_alert: true,
      });
      return;
    }
    if (await handleTutorialCallback(query)) return;
    await pauseTutorialForCommand({ ...query.message, from: query.from, data: query.data });
    if (await handleDeveloperCallback(query)) return;
    if (await handleGoldenGiftCallback(query)) return;
    if (await handlePageNavigationCallback(query)) return;
    if (await handleShowcaseCallback(query)) return;
    if (await handleLegalCallback(query)) return;
    if (await handleBrandingCallback(query)) return;
    if (await handleManagedBotCallback(query)) return;
    if (await handleScheduleCancelCallback(query)) return;
    if (
      isGroupEditorChat(query?.message?.chat)
      && (data === 'r:starteditor' || isEditorSessionCallback(data))
    ) {
      const access = await verifyGroupEditorAdmin(
        query.message.chat.id,
        query.from?.id,
      );
      if (access.status !== 'admin') {
        if (access.status === 'unavailable') {
          await logErrorSafely('editor.group_callback_access', access.error, {
            updateId,
            userId: query?.from?.id,
            chatId: query?.message?.chat?.id,
            callbackData: data,
          });
        }
        await api.answerCallbackQuery({
          callback_query_id: query.id,
          text: groupEditorAccessText(query.from?.language_code, access.status),
          show_alert: true,
        });
        return;
      }
    }
    if (await guardEditorCallback(query)) return;

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
      if (await handleEditorChannelPostCallback(query)) return;
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
    if (isDatabaseFailure(error)) {
      await reportDatabaseFailure(query, error);
      return;
    }
    const isBroadcastCallback = String(query?.data || '').startsWith('dev:broadcast');
    const errorScope = isBroadcastCallback ? 'developer.broadcast.callback' : 'callback_query';
    const guide = explainOperationalError(error, {
      scope: errorScope,
      callbackData: query?.data,
    });
    if (guide.silent) {
      console.warn('Harmless callback response rejected by Telegram', guide.code);
      return;
    }
    try {
      if (query?.id) {
        const notice = userOperationalError(error, query?.from?.language_code || 'ar');
        await api.answerCallbackQuery({
          callback_query_id: query.id,
          text: notice.slice(0, 200),
          show_alert: true,
        });
      }
    } catch (alertError) {
      console.warn('Could not report failed callback to user', alertError);
    }
    if (!['EDITOR_LIMIT_REACHED','LEGACY_PAGE_READ_ONLY'].includes(guide.code)) {
      await logErrorSafely(errorScope, error, {
        updateId, userId: query?.from?.id,
        chatId: query?.message?.chat?.id,
        threadId: query?.message?.message_thread_id,
        callbackData: query?.data,
      });
    }
    // An expected Telegram rejection should not replay the callback. Unknown
    // failures still propagate so we do not conceal application defects.
    if (guide.expected) return;
    await releaseUpdate(updateId);
    throw error;
  } finally {
    try {
      await observeRequest(
        query?.from,
        Date.now() - started,
        failed,
        undefined,
        query?.message?.chat?.type === 'private',
      );
    } catch (error) {
      console.warn('Could not record callback usage stats', error);
    }
  }
}
