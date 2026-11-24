import { handleTutorialMessage, pauseTutorialForCommand } from 'lib/editor-core';
// Telegram Serverless message handler.
// The platform passes update.message directly as the first argument.

import { api, BotApiError } from 'sdk';
import { sendSubscriptionStatus } from 'lib/subscription-status';
import { sendSubscriptionExpiryTest } from 'lib/subscription-reminders';
import { handleDonateConsoleMessage } from 'lib/donate-console';
import { handleRichDonateB2BMessage } from 'lib/editor-subscriptions';
import {
  buildWelcomeFallbackText,
  buildWelcomeKeyboard,
  buildWelcomeRichMessage,
} from 'lib/welcome';
import {
  buildAnonymousGroupEditorPrompt,
  buildStartEditorKeyboard,
  editorClosedHint,
  groupEditorAccessText,
  isGroupEditorChat,
  openEditor,
  resolveGroupEditorActor,
  verifyGroupEditorAdmin,
} from 'lib/editor-home';
import {
  excludeDeveloperBroadcastBot,
  handleDeveloperPendingMessage,
  openDeveloperPanel,
} from 'lib/developer';
import { handleMiniAppShortcut } from 'lib/miniapp';
import { sendPrivacyMessage, sendSupportMessage } from 'lib/legal';
import { handleShowcaseMessage } from 'lib/showcase';
import { observeRequest } from 'lib/usage-stats';
import { resolveLanguage, resolveUserLanguage } from 'lib/i18n';
import { logError } from 'lib/error-log';
import {
  explainOperationalError,
  isDatabaseFailure,
  userOperationalError,
} from 'lib/operational-errors';
import { handleBrandingSuccessfulPayment } from 'lib/branding';
import { handleManagedBotSuccessfulPayment, sendManagedBotPlans } from 'lib/managed-bot-billing';
import { sendMarketingCampaignSummary, sendMarketingLanding } from 'lib/marketing-campaign';
import { handleMiniAppBridgeMessage } from 'lib/miniapp-bridge';
import { handleMiniAppUserPickerShared } from 'lib/miniapp-user-picker';
import { handleEditorBlockMessage } from 'lib/editor-block-flow';
import { handleDefaultTopicCommand } from 'lib/forum-topics';
import { guardLegacyEditorMessage } from 'lib/editor-guard';
import { handlePremiumEmojiMessage } from 'lib/editor-premium-emoji';
import { handleEditorCoreMessage, isForwardedRichMessage } from 'lib/editor-core';
import { handleEditorPageMessage } from 'lib/editor-pages';
import { handleEditorButtonMessage } from 'lib/editor-buttons';
import { loadEditorSession } from 'lib/editor-session';
import { handleScheduledTimeMessage, showScheduledPosts } from 'lib/scheduled-publish';
import { handleInfoCommand, infoCommandArgument } from 'lib/user-info';
import { userInfoText } from 'lib/user-info-copy';
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

function commandArgument(text, name) {
  if (typeof text !== 'string') return '';
  const parts = text.trim().split(/\s+/);
  if (!parts.length || !matchesCommand(String(parts[0] || '').toLowerCase(), name)) return '';
  return String(parts.slice(1).join(' ') || '').trim();
}

function messageThreadOptions(message) {
  const threadId = Number(message?.message_thread_id);
  return Number.isSafeInteger(threadId) && threadId > 0
    ? { message_thread_id: threadId }
    : {};
}

function isTopicClosedError(error) {
  return /TOPIC_CLOSED|topic is closed|forum topic is closed/i.test(
    String(error?.description || error?.message || error),
  );
}

async function logErrorSafely(scope, error, context) {
  try {
    await logError(scope, error, context);
  } catch (loggingError) {
    console.warn('Could not persist message error log', loggingError?.name || 'Error');
  }
}

function infoRequestFailureText(languageCode, error, updateId) {
  const locale = languageCode || 'ar';
  let reasonKey;
  if (isDatabaseFailure(error)) {
    reasonKey = 'guestDatabaseError';
  } else if (error instanceof BotApiError) {
    reasonKey = 'guestTelegramError';
  } else {
    reasonKey = 'guestInternalError';
  }
  const reference = Number.isSafeInteger(Number(updateId))
    ? String(Number(updateId))
    : '—';
  return userInfoText(locale, reasonKey)
    + '\n' + userInfoText(locale, 'guestErrorReference') + ': ' + reference;
}

async function reportInfoRequestFailure(message, error, updateId) {
  await logErrorSafely('info.guest', error, {
    updateId,
    userId: message?.from?.id,
    chatId: message?.chat?.id,
    request: 'info',
  });
  if (!message?.chat?.id || message?.from?.is_bot) return;
  const languageCode = String(message?.from?.language_code || 'ar');
  try {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: infoRequestFailureText(languageCode, error, updateId),
    });
  } catch (feedbackError) {
    console.warn('Could not send /info failure notice', feedbackError?.name || 'Error');
  }
}

async function reportDatabaseFailure(message, error) {
  console.error('Telegram Serverless database unavailable while handling a message');
  if (message?.chat?.type !== 'private' || message?.from?.is_bot) return;
  const locale = String(message?.from?.language_code || 'ar');
  const notice = message?.successful_payment
    ? (locale.startsWith('ar')
      ? 'قاعدة البيانات غير متاحة مؤقتاً. إذا انخصمت النجوم لا تعيد الدفع؛ تحقق من الترخيص أو تواصل مع الدعم.'
      : 'The database is temporarily unavailable. If Stars were charged, do not pay again; check your entitlement or contact support.')
    : userOperationalError(error, locale, { scope: errorScope });
  try {
    await api.sendMessage({ chat_id: message.chat.id, text: notice });
  } catch (feedbackError) {
    console.warn('Could not send database outage notice', feedbackError?.name || 'Error');
  }
}

async function handleGroupEditorEntry(message, updateId, languageCode) {
  const access = await resolveGroupEditorActor(message);
  if (access.status === 'admin') {
    const actor = access.matchedByTitle
      ? { id: access.userId }
      : message.from;
    const actorLanguage = await resolveUserLanguage(actor);
    await openEditor(
      message.chat.id,
      actorLanguage,
      access.userId,
      { messageThreadId: message.message_thread_id },
    );
    return true;
  }

  const locale = resolveLanguage(languageCode);
  let text;
  let replyMarkup;
  if (access.status === 'anonymous') {
    ({ text, reply_markup: replyMarkup } = buildAnonymousGroupEditorPrompt(locale));
  } else {
    text = groupEditorAccessText(locale, access.status);
  }
  if (access.status === 'unavailable') {
    await logErrorSafely('editor.group_access', access.error, {
      updateId,
      chatId: message?.chat?.id,
      request: 'editor_entry',
    });
  }
  await api.sendMessage({
    chat_id: message.chat.id,
    ...messageThreadOptions(message),
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  return true;
}

async function handleGroupEditorInput(message) {
  let session;
  let access;
  if (message?.sender_chat) {
    access = await resolveGroupEditorActor(message);
    if (access.status !== 'admin') return false;
    session = await loadEditorSession(access.userId, { touch: false });
  } else {
    const userId = Number(message?.from?.id);
    if (!Number.isSafeInteger(userId) || userId <= 0 || message?.from?.is_bot) return false;
    session = await loadEditorSession(userId, { touch: false });
    if (!session) return false;
    access = await verifyGroupEditorAdmin(message.chat.id, userId);
  }
  if (access.status === 'unavailable') {
    await logErrorSafely('editor.group_input_access', access.error, {
      userId: access.userId,
      chatId: message?.chat?.id,
    });
    await api.sendMessage({
      chat_id: message.chat.id,
      ...messageThreadOptions(message),
      text: groupEditorAccessText(
        await resolveUserLanguage(message?.from),
        access.status,
      ),
    });
    return true;
  }
  if (access.status !== 'admin' || !session) return false;

  let editorMessage = message;
  if (access.matchedByTitle) {
    editorMessage = {
      ...message,
      from: {
        ...(message.from || {}),
        id: access.userId,
        is_bot: false,
        language_code: await resolveUserLanguage({ id: access.userId }),
      },
    };
  }

  if (
    isForwardedRichMessage(editorMessage)
    && await handleEditorCoreMessage(editorMessage, { confirmReplace: true })
  ) return true;
  if (await handleScheduledTimeMessage(editorMessage)) return true;
  if (await guardLegacyEditorMessage(editorMessage)) return true;
  if (await handlePremiumEmojiMessage(editorMessage)) return true;
  if (await handleEditorBlockMessage(editorMessage)) return true;
  if (await handleEditorButtonMessage(editorMessage)) return true;
  if (await handleEditorPageMessage(editorMessage)) return true;
  return handleEditorCoreMessage(editorMessage);
}

export default async function (message, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  const infoArgument = infoCommandArgument(message?.text);
  try {
    if (!await claimUpdate(updateId)) return;
  } catch (error) {
    if (!isDatabaseFailure(error)) throw error;
    if (infoArgument !== null) {
      await reportInfoRequestFailure(message, error, updateId);
      return;
    }
    await reportDatabaseFailure(message, error);
    return;
  }
  const started = Date.now();
  let failed = false;
  let bridgeHandled = false;
  try {
    if (await handleRichDonateB2BMessage(message)) return;
    if (await handleDonateConsoleMessage(message)) return;
    bridgeHandled = await handleMiniAppBridgeMessage(message, { updateId });
    if (bridgeHandled) return;
    if (await handleBrandingSuccessfulPayment(message)) return;
    if (await handleManagedBotSuccessfulPayment(message)) return;
    if (await handleMiniAppUserPickerShared(message)) return;
    if (!await allowMessageRequest(message)) return;
    // The only /default entry point is an actual group topic message;
    // never interpret a forwarded /default in a private editor as an admin action.
    if (await handleDefaultTopicCommand(message)) return;
    const command = commandName(message?.text);
    const languageCode = await resolveUserLanguage(message?.from);
    if (command.startsWith('/')) await pauseTutorialForCommand(message);
    if (message?.from && !message.from.language_code) {
      message.from.language_code = languageCode;
    }

    if (infoArgument !== null) {
      await handleInfoCommand(message, infoArgument, languageCode);
      return;
    }

    if (message?.chat?.type === 'private' && (matchesCommand(command, 'mybots') || message?.text?.trim() === 'بوتاتي')) {
      await api.sendMessage({chat_id:message.chat.id,text:'بوتاتي — إدارة بوتاتك وربط صفحاتك الغنية.',reply_markup:{inline_keyboard:[[{text:'فتح بوتاتي',url:'https://t.me/RichCustomizebot/editor?startapp=managed_bots'}]]}});
      return;
    }

    if (message?.chat?.type === 'private' && (matchesCommand(command, 'managedbots') || matchesCommand(command, 'managedbot'))) {
      await sendManagedBotPlans(message);
      return;
    }

    if (matchesCommand(command, 'dev')) {
      await openDeveloperPanel(message);
      return;
    }

    if (matchesCommand(command, 'campaigns') || matchesCommand(command, 'ads')) {
      if (await sendMarketingCampaignSummary(message)) return;
    }

    if (matchesCommand(command, 'privacy')) {
      await sendPrivacyMessage(message.chat.id, languageCode);
      return;
    }

    if (matchesCommand(command, 'support')) {
      await sendSupportMessage(message.chat.id, languageCode);
      return;
    }

    const marketingSource = commandArgument(message?.text, 'start');
    if (
      matchesCommand(command, 'start')
      && message?.chat?.type === 'private'
      && marketingSource === 'group_editor'
    ) {
      await openEditor(message.chat.id, languageCode, message.from?.id);
      return;
    }

    if (
      (matchesCommand(command, 'start') || matchesCommand(command, 'editor'))
      && isGroupEditorChat(message?.chat)
    ) {
      await handleGroupEditorEntry(message, updateId, languageCode);
      return;
    }

    if (await handleDeveloperPendingMessage(message)) return;
    if (await handleMiniAppShortcut(message)) return;
    if (await handleShowcaseMessage(message)) return;

    if (matchesCommand(command,'testsubexpiry')) {
      if (message?.chat?.type==='private') {
        const sent=await sendSubscriptionExpiryTest(message,languageCode);
        if(!sent)await api.sendMessage({
          chat_id:message.chat.id,
          text:languageCode.startsWith('ar')
            ?'هذا الأمر متاح للمطور فقط.'
            :'This command is available to developers only.',
        });
      }
      return;
    }

    if (matchesCommand(command,'sup')) {
      if (await sendSubscriptionStatus(message,languageCode)) return;
      return;
    }

    if (message?.chat?.type==='private' && matchesCommand(command,'scheduled')){
      await showScheduledPosts(message);return;
    }
    if (matchesCommand(command, 'editor')) {
      await openEditor(message.chat.id, languageCode, message.from?.id);
      return;
    }

    if (!matchesCommand(command, 'start')) {
      // Group input is limited to a verified administrator with an active session.
      if (isGroupEditorChat(message?.chat)) {
        await handleGroupEditorInput(message);
        return;
      }
      if (String(message?.chat?.type || '') !== 'private') return;

      if (await handleTutorialMessage(message)) return;

      if (
        isForwardedRichMessage(message)
        && await handleEditorCoreMessage(message, {autoOpen:true, confirmReplace:true})
      ) return;

      if (await handleScheduledTimeMessage(message)) return;
      if (await guardLegacyEditorMessage(message)) return;
      if (await handlePremiumEmojiMessage(message)) return;
      if (await handleEditorBlockMessage(message)) return;
      if (await handleEditorButtonMessage(message)) return;
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
          await logErrorSafely('welcome.idle_rich_fallback', error, {
            updateId,
            userId: message?.from?.id,
            chatId: message?.chat?.id,
          });
          await api.sendMessage({
            chat_id: message.chat.id,
            text: buildWelcomeFallbackText(message.from, languageCode),
            reply_markup: replyMarkup,
          });
        }
      }
      return;
    }

    if (await sendMarketingLanding(message, marketingSource)) return;

    const replyMarkup = buildWelcomeKeyboard(languageCode);
    const threadOptions = messageThreadOptions(message);
    try {
      await api.sendRichMessage({
        chat_id: message.chat.id,
        ...threadOptions,
        rich_message: buildWelcomeRichMessage(message.from, languageCode),
        reply_markup: replyMarkup,
      });
    } catch (error) {
      const errorContext = {
        updateId,
        userId: message?.from?.id,
        chatId: message?.chat?.id,
        threadId: message?.message_thread_id,
      };
      if (isTopicClosedError(error)) {
        await logErrorSafely('welcome.start_topic_closed', error, errorContext);
        return;
      }
      console.error('sendRichMessage welcome failed; using plain fallback', error);
      try {
        await api.sendMessage({
          chat_id: message.chat.id,
          ...threadOptions,
          text: buildWelcomeFallbackText(message.from, languageCode),
          reply_markup: replyMarkup,
        });
      } catch (fallbackError) {
        if (!isTopicClosedError(fallbackError)) {
          await logErrorSafely('welcome.start_rich_fallback', error, errorContext);
          throw fallbackError;
        }
        await logErrorSafely('welcome.start_topic_closed', fallbackError, errorContext);
        return;
      }
      await logErrorSafely('welcome.start_rich_fallback', error, errorContext);
    }
  } catch (error) {
    failed = true;
    if (infoArgument !== null) {
      await reportInfoRequestFailure(message, error, updateId);
      return;
    }
    if (isDatabaseFailure(error)) {
      await reportDatabaseFailure(message, error);
      return;
    }
    const isBroadcastTick = /^\/rcb_broadcast_tick@richcustomizebot(?:\s|$)/i
      .test(String(message?.text || ''));
    const errorScope = isBroadcastTick ? 'developer.broadcast.tick' : 'message';
    const guide = explainOperationalError(error, { scope: errorScope });
    // Normal plan quota rejections and old-page editing attempts are
    // expected user actions, not production incident alerts.
    if (!['EDITOR_LIMIT_REACHED','LEGACY_PAGE_READ_ONLY'].includes(guide.code)) {
      await logErrorSafely(errorScope, error, {
        updateId,
        userId: message?.from?.id,
        chatId: message?.chat?.id,
        threadId: message?.message_thread_id,
        ...(isBroadcastTick ? { extra: 'command=rcb_broadcast_tick' } : {}),
      });
    }
    // Avoid leaking exception text, tokens or technical details to users.
    // Keep the bot silent in groups and in bridge-bot conversations.
    if (message?.chat?.type === 'private' && !message?.from?.is_bot && !guide.silent) {
      try {
        const locale = String(message?.from?.language_code || 'ar');
        const notice = message?.successful_payment
          ? (locale.startsWith('ar')
            ? 'واجهنا مشكلة أثناء معالجة إشعار الدفع. إذا انخصمت النجوم لا تعيد الدفع؛ تحقق من الترخيص أو تواصل مع الدعم.'
            : 'There was a problem processing the payment notification. Do not pay twice; check your entitlement or contact support.')
          : userOperationalError(error, locale);
        await api.sendMessage({ chat_id: message.chat.id, text: notice });
      } catch (feedbackError) {
        console.warn('Could not send safe error notice to user', feedbackError);
      }
    }
    // A deterministic user-actionable failure should not replay an editor
    // mutation or send the same warning repeatedly. Payment notifications are
    // different: they must remain retryable until fulfillment is persisted.
    if (guide.expected && !message?.successful_payment) return;
    await releaseUpdate(updateId);
    throw error;
  } finally {
    if (!bridgeHandled) {
      if (message?.from?.is_bot) {
        try {
          await excludeDeveloperBroadcastBot(message.from.id);
        } catch (error) {
          console.warn('Could not exclude bot account from developer broadcasts', error?.name || 'Error');
        }
      }
      try {
        await observeRequest(
          message?.from,
          Date.now() - started,
          failed,
          undefined,
          message?.chat?.type === 'private',
        );
      } catch (error) {
        console.warn('Could not record message usage stats', error);
      }
    }
  }
}
