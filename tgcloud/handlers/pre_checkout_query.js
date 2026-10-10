import { api } from 'sdk';
import { handleBrandingPreCheckout } from 'lib/branding';
import { handleManagedBotPreCheckout } from 'lib/managed-bot-billing';
import { logError } from 'lib/error-log';

// Payment queries have an acceptance deadline. Never approve an unverified
// invoice, and never leave a known failed check without a denial attempt.
export default async function (query, ctx = {}) {
  if (!query?.id) return;
  const arabic = String(query?.from?.language_code || 'ar').startsWith('ar');
  const denial = arabic
    ? 'تعذر التحقق من الدفع حالياً. أنشئ رابط دفع جديداً وحاول مرة ثانية؛ لا تدفع إذا سبق وانخصمت النجوم.'
    : 'Payment validation is unavailable. Generate a fresh invoice and try again; do not pay twice.';
  try {
    if (await handleBrandingPreCheckout(query)) return;
    if (await handleManagedBotPreCheckout(query)) return;
    // Unknown payloads must not time out without an answer or be accepted.
    console.warn('Rejected unrecognized invoice payload');
    await api.answerPreCheckoutQuery({
      pre_checkout_query_id: query.id,
      ok: false,
      error_message: arabic ? 'رابط الدفع غير معروف. أنشئ رابط دفع جديداً.' : 'Unknown invoice. Generate a fresh payment link.',
    });
  } catch (error) {
    await logError('payment.pre_checkout', error, {
      updateId: ctx?.update?.update_id,
      userId: query?.from?.id,
    });
    try {
      await api.answerPreCheckoutQuery({
        pre_checkout_query_id: query.id,
        ok: false,
        error_message: denial,
      });
      return;
    } catch (denialError) {
      // Keep the original error visible when Telegram itself cannot be reached.
      console.warn('Could not deny failed pre-checkout request', denialError);
      throw error;
    }
  }
}
