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
import { handleMiniAppShortcut } from 'lib/miniapp';
import { sendPrivacyMessage, sendSupportMessage } from 'lib/legal';
import { handleShowcaseMessage } from 'lib/showcase';
import { observeRequest } from 'lib/usage-stats';
import { resolveUserLanguage } from 'lib/i18n';
import { logError } from 'lib/error-log';
import { explainOperationalError, userOperationalError } from 'lib/operational-errors';
import { handleBrandingSuccessfulPayment } from 'lib/branding';
import { handleManagedBotSuccessfulPayment, sendManagedBotPlans } from 'lib/managed-bot-billing';
import { sendMarketingCampaignSummary, sendMarketingLanding } from 'lib/marketing-campaign';
import { handleMiniAppBridgeMessage } from 'lib/miniapp-bridge';
import { handleMiniAppUserPickerShared } from 'lib/miniapp-user-picker';
import { handleEditorBlockMessage } from 'lib/editor-block-flow';
import { handlePremiumEmojiMessage } from 'lib/editor-premium-emoji';
import { handleEditorCoreMessage, isForwardedRichMessage } from 'lib/editor-core';
import { handleEditorPageMessage } from 'lib/editor-pages';
import { handleEditorButtonMessage } from 'lib/editor-buttons';
import { loadEditorSession } from 'lib/editor-session';
import { handleScheduledTimeMessage, showScheduledPosts } from 'lib/scheduled-publish';
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

export default async function (message, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;
  const started = Date.now();
  let failed = false;
  let bridgeHandled = false;
  try {
    bridgeHandled = await handleMiniAppBridgeMessage(message, { updateId });
    if (bridgeHandled) return;
    if (await handleBrandingSuccessfulPayment(message)) return;
    if (await handleManagedBotSuccessfulPayment(message)) return;
    if (await handleMiniAppUserPickerShared(message)) return;
    if (!await allowMessageRequest(message)) return;
    const command = commandName(message?.text);
    const languageCode = await resolveUserLanguage(message?.from);
    if (message?.from && !message.from.language_code) {
      message.from.language_code = languageCode;
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

    if (await handleDeveloperPendingMessage(message)) return;
    if (await handleMiniAppShortcut(message)) return;
    if (await handleShowcaseMessage(message)) return;

    if (message?.chat?.type==='private' && matchesCommand(command,'scheduled')){
      await showScheduledPosts(message);return;
    }
    if (matchesCommand(command, 'editor')) {
      await openEditor(message.chat.id, languageCode, message.from?.id);
      return;
    }

    if (!matchesCommand(command, 'start')) {
      // Ordinary editor/input messages are private-chat only.
      // In groups/supergroups the bot must stay silent unless a supported command
      // was handled above.
      if (String(message?.chat?.type || '') !== 'private') return;

      if (
        isForwardedRichMessage(message)
        && await handleEditorCoreMessage(message, {autoOpen:true, confirmReplace:true})
      ) return;

      if (await handleScheduledTimeMessage(message)) return;
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
          await logError('welcome.idle_rich_fallback', error, {
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

    const marketingSource = commandArgument(message?.text, 'start');
    if (await sendMarketingLanding(message, marketingSource)) return;

    const replyMarkup = buildWelcomeKeyboard(languageCode);
    try {
      await api.sendRichMessage({
        chat_id: message.chat.id,
        rich_message: buildWelcomeRichMessage(message.from, languageCode),
        reply_markup: replyMarkup,
      });
    } catch (error) {
      console.error('sendRichMessage welcome failed; using plain fallback', error);
      await logError('welcome.start_rich_fallback', error, {
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
  } catch (error) {
    failed = true;
    const guide = explainOperationalError(error);
    await logError('message', error, {
      updateId,
      userId: message?.from?.id,
      chatId: message?.chat?.id,
      threadId: message?.message_thread_id,
    });
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
    await releaseUpdate(updateId);
    throw error;
  } finally {
    if (!bridgeHandled) {
      try {
        await observeRequest(message?.from, Date.now() - started, failed);
      } catch (error) {
        console.warn('Could not record message usage stats', error);
      }
    }
  }
}
