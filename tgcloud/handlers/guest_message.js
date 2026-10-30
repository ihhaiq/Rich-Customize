import { api } from 'sdk';
import { guestPageRequest, resolveSavedPageReference, ambiguousPageQueryResult, savedPageQueryResult } from 'lib/page-delivery';
import { rememberGuestMessage } from 'lib/guest-messages';
import {
  allowMessageRequest,
  claimUpdate,
} from 'lib/request-guard';
import { observeRequest } from 'lib/usage-stats';
import { resolveUserLanguage, t } from 'lib/i18n';
import { logError } from 'lib/error-log';
import {
  infoCommandArgument,
  isProfilePhotoSendingForbidden,
  prepareUserInfoMessage,
} from 'lib/user-info';
import { buildUserInfoMessage, userInfoText } from 'lib/user-info-copy';
import { isDatabaseFailure } from 'lib/operational-errors';

function guestTextResult(language, id, text) {
  return {
    type: 'article',
    id,
    title: userInfoText(language, 'details'),
    description: text,
    input_message_content: { message_text: text },
  };
}

function guestInfoResult(result, language) {
  if (!result) {
    const text = userInfoText(language, 'unknown');
    return guestTextResult(language, 'guest-info-unknown', text);
  }
  return {
    type: 'article',
    id: 'guest-user-info',
    title: userInfoText(language, 'details'),
    description: userInfoText(language, 'subscription'),
    input_message_content: { rich_message: result.rich_message },
  };
}

function guestInfoErrorText(language, error, updateId) {
  let key = 'guestInternalError';
  if (isDatabaseFailure(error)) key = 'guestDatabaseError';
  else if (Number(error?.code) >= 400 && Number(error?.code) < 500) {
    key = 'guestTelegramError';
  }
  const reference = Number.isSafeInteger(Number(updateId))
    ? String(Number(updateId))
    : '—';
  return userInfoText(language, key)
    + '\n' + userInfoText(language, 'guestErrorReference') + ': ' + reference;
}

async function logGuestError(error, message, updateId, request) {
  console.error('Failed to handle guest bot request', error);
  try {
    await logError('guest_message', error, {
      updateId,
      userId: message?.from?.id,
      chatId: message?.chat?.id,
      request,
    });
  } catch (loggingError) {
    console.warn('Could not persist guest request error', loggingError?.name || 'Error');
  }
}

async function answerGuestInfo(message, argument, updateId) {
  let language = String(message?.from?.language_code || 'en');
  let result;
  let prepared = null;
  let failed = false;

  try {
    language = await resolveUserLanguage(message?.from);
    if (!await allowMessageRequest(message, { respond: false })) {
      result = guestTextResult(
        language,
        'guest-info-rate-limit',
        t(language, 'system.rate_limit'),
      );
    } else {
      prepared = await prepareUserInfoMessage(message, argument, language);
      result = guestInfoResult(
        prepared?.message || null,
        language,
      );
    }
  } catch (error) {
    failed = true;
    await logGuestError(error, message, updateId, 'info');
    result = guestTextResult(
      language,
      'guest-info-error',
      guestInfoErrorText(language, error, updateId),
    );
  }

  try {
    await api.answerGuestQuery({
      guest_query_id: message.guest_query_id,
      result,
    });
  } catch (error) {
    if (prepared?.photoFileId && isProfilePhotoSendingForbidden(error)) {
      console.warn('Telegram rejected guest user-info photo; retrying guest result without media');
      const withoutPhoto = buildUserInfoMessage(prepared.user, language, {
        subscription: prepared.subscription,
      });
      try {
        await api.answerGuestQuery({
          guest_query_id: message.guest_query_id,
          result: guestInfoResult(withoutPhoto, language),
        });
      } catch (retryError) {
        failed = true;
        await logGuestError(retryError, message, updateId, 'info_response_without_photo');
      }
    } else {
      failed = true;
      await logGuestError(error, message, updateId, 'info_response');
    }
  }
  return failed;
}

export default async function (message, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  const infoArgument = infoCommandArgument(message?.text || message?.caption || '');
  const started = Date.now();
  let failed = false;
  let claimed = false;
  let infoReplyStarted = false;
  try {
    claimed = await claimUpdate(updateId);
    if (!claimed) return;
    if (!message?.guest_query_id) return;

    if (infoArgument !== null) {
      infoReplyStarted = true;
      failed = await answerGuestInfo(message, infoArgument, updateId);
      return;
    }
    const language = await resolveUserLanguage(message?.from);
    if (!await allowMessageRequest(message, { respond: false })) {
      await api.answerGuestQuery({
        guest_query_id: message.guest_query_id,
        result: guestTextResult(
          language,
          'guest-rate-limit',
          t(language, 'system.rate_limit'),
        ),
      });
      return;
    }

    const pageRequest = guestPageRequest(message);
    const resolved = await resolveSavedPageReference(
      pageRequest.reference,
      message?.from?.id,
      pageRequest.codeCandidates,
      {
        preferName: pageRequest.preferName,
        preferCode: pageRequest.preferCode,
      },
    );
    if (resolved.status === 'missing') return;
    const result = resolved.status === 'ambiguous'
      ? ambiguousPageQueryResult(language)
      : await savedPageQueryResult(resolved.pageId, language);
    if (!result) return;

    const sent = await api.answerGuestQuery({
      guest_query_id: message.guest_query_id,
      result,
    });
    if (sent?.inline_message_id && message?.chat?.id) {
      await rememberGuestMessage(
        sent.inline_message_id,
        message.chat.id,
        message.chat.type || '',
      );
    }
  } catch (error) {
    failed = true;
    await logGuestError(error, message, updateId, infoArgument === null ? 'saved_page' : 'info');
    if (infoArgument !== null && message?.guest_query_id && !infoReplyStarted) {
      infoReplyStarted = true;
      const language = String(message?.from?.language_code || 'en');
      try {
        await api.answerGuestQuery({
          guest_query_id: message.guest_query_id,
          result: guestTextResult(
            language,
            'guest-info-error',
            guestInfoErrorText(language, error, updateId),
          ),
        });
      } catch (replyError) {
        failed = true;
        await logGuestError(replyError, message, updateId, 'info_error_reply');
      }
    }
  } finally {
    if (claimed) {
      try {
        await observeRequest(message?.from, Date.now() - started, failed);
      } catch (error) {
        console.warn('Could not record guest-message usage stats', error);
      }
    }
  }
}
