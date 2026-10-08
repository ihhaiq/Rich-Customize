import { handleBrandingPreCheckout } from 'lib/branding';
import { handleManagedBotPreCheckout } from 'lib/managed-bot-billing';
import { logError } from 'lib/error-log';

export default async function (query, ctx = {}) {
  try {
    if (await handleBrandingPreCheckout(query)) return;
    if (await handleManagedBotPreCheckout(query)) return;
  } catch (error) {
    await logError('pre_checkout_query', error, {
      updateId: ctx?.update?.update_id,
      userId: query?.from?.id,
    });
    throw error;
  }
}
