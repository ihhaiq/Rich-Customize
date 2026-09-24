import { handleMyChatMember } from 'lib/publish';
import { claimUpdate, releaseUpdate } from 'lib/request-guard';
import { observeRequest } from 'lib/usage-stats';

export default async function (update, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;
  const started = Date.now();
  let failed = false;
  try {
    await handleMyChatMember(update);
  } catch (error) {
    failed = true;
    await releaseUpdate(updateId);
    throw error;
  } finally {
    try { await observeRequest(update?.from, Date.now() - started, failed); } catch {}
  }
}
