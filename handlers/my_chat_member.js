import { handleMyChatMember } from 'lib/publish';
import { observeRequest } from 'lib/usage-stats';

export default async function (update) {
  const started=Date.now();
  let failed=false;
  try {
    await handleMyChatMember(update);
  } catch (error) {
    failed=true;
    throw error;
  } finally {
    try { await observeRequest(update?.from,Date.now()-started,failed); } catch {}
  }
}
