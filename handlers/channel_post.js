import { rememberShowcaseChannelPost } from 'lib/showcase';
import { claimUpdate, releaseUpdate } from 'lib/request-guard';
import { observeRequest } from 'lib/usage-stats';
import { logError } from 'lib/error-log';

export default async function (message, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;
  const started = Date.now();
  let failed = false;
  try {
    await rememberShowcaseChannelPost(message);
  } catch (error) {
    failed = true;
    await logError('channel_post', error, {
      updateId,
      chatId: message?.chat?.id,
    });
    await releaseUpdate(updateId);
    throw error;
  } finally {
    try {
      await observeRequest(message?.from, Date.now() - started, failed);
    } catch {}
  }
}
