import { api } from 'sdk';
import { guestPageCode, savedPageQueryResult } from 'lib/page-delivery';
import { rememberGuestMessage } from 'lib/guest-messages';
import {
  allowMessageRequest,
  claimUpdate,
} from 'lib/request-guard';
import { observeRequest } from 'lib/usage-stats';

export default async function (message, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;
  const started = Date.now();
  let failed = false;
  try {
    if (!await allowMessageRequest(message)) return;
    if (!message?.guest_query_id) return;

    const pageId = guestPageCode(message);
    if (!pageId) return;

    const result = await savedPageQueryResult(
      pageId,
      message?.from?.language_code || 'en',
    );
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
    console.error('Failed to answer guest query with a saved Rich Message', error);
  } finally {
    try {
      await observeRequest(message?.from, Date.now() - started, failed);
    } catch (error) {
      console.warn('Could not record guest-message usage stats', error);
    }
  }
}
