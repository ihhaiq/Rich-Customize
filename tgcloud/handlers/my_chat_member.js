import { handleMyChatMember } from 'lib/publish';
import { claimUpdate, releaseUpdate } from 'lib/request-guard';
import { observeRequest } from 'lib/usage-stats';
import { logError } from 'lib/error-log';

export default async function (update, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;
  const started = Date.now();
  let failed = false;
  try {
    await handleMyChatMember(update);
  } catch (error) {
    failed = true;
    await logError('my_chat_member', error, {
      updateId,
      userId: update?.from?.id,
      chatId: update?.chat?.id,
    });
    await releaseUpdate(updateId);
    throw error;
  } finally {
    try { await observeRequest(update?.from, Date.now() - started, failed); } catch {}
  }
}
