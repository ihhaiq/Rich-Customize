import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { brandingEntitlements } from 'schema';

export const BRANDING_PRICE_STARS = 99;
export const BRANDING_INVOICE_PAYLOAD = 'remove_branding:v1';

const BRANDING_TEXT = [
  'تريد نفس التصميم لقناتك؟',
  'افتح @RichCustomizebot ← وابدأ المحرر',
].join('\n');

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function brandingFooterBlock() {
  return {
    type: 'footer',
    text: BRANDING_TEXT,
  };
}

export async function isBrandingRemoved(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id)) return false;
  const row = await db.select({
    rightsRemoved: brandingEntitlements.rightsRemoved,
  }).from(brandingEntitlements)
    .where(eq(brandingEntitlements.userId, id))
    .get();
  return Boolean(Number(row?.rightsRemoved || 0));
}

export async function shouldIncludeBranding(userId) {
  return !(await isBrandingRemoved(userId));
}

export async function createBrandingRemovalInvoiceLink() {
  return api.createInvoiceLink({
    title: 'إزالة حقوق Rich Customize',
    description: 'إزالة تذييل Rich Customize من المعاينات والصفحات والمنشورات الخاصة بحسابك بشكل دائم.',
    payload: BRANDING_INVOICE_PAYLOAD,
    currency: 'XTR',
    prices: [{
      label: 'إزالة الحقوق',
      amount: BRANDING_PRICE_STARS,
    }],
  });
}

function validPaymentShape(payment) {
  return Boolean(
    payment
    && String(payment.currency || '') === 'XTR'
    && Number(payment.total_amount) === BRANDING_PRICE_STARS
    && String(payment.invoice_payload || '') === BRANDING_INVOICE_PAYLOAD
    && String(payment.telegram_payment_charge_id || '').trim()
  );
}

export async function handleBrandingPreCheckout(query) {
  if (!query?.id) return false;
  if (String(query.invoice_payload || '') !== BRANDING_INVOICE_PAYLOAD) return false;

  const userId = Number(query.from?.id);
  let ok = (
    Number.isSafeInteger(userId)
    && String(query.currency || '') === 'XTR'
    && Number(query.total_amount) === BRANDING_PRICE_STARS
  );
  let errorMessage = 'تعذر التحقق من عملية الدفع. حاول إنشاء رابط دفع جديد.';

  if (ok && await isBrandingRemoved(userId)) {
    ok = false;
    errorMessage = 'الحقوق مزالة من حسابك بالفعل ولا تحتاج إلى الدفع مرة ثانية.';
  }

  await api.answerPreCheckoutQuery({
    pre_checkout_query_id: query.id,
    ok,
    ...(ok ? {} : { error_message: errorMessage }),
  });
  return true;
}

export async function handleBrandingSuccessfulPayment(message) {
  const payment = message?.successful_payment;
  if (!payment || String(payment.invoice_payload || '') !== BRANDING_INVOICE_PAYLOAD) {
    return false;
  }

  const userId = Number(message?.from?.id);
  if (!Number.isSafeInteger(userId) || !validPaymentShape(payment)) {
    return true;
  }

  const stamp = nowSeconds();
  await db.insert(brandingEntitlements).values({
    userId,
    rightsRemoved: 1,
    source: 'telegram_stars',
    currency: 'XTR',
    amount: BRANDING_PRICE_STARS,
    telegramPaymentChargeId: String(payment.telegram_payment_charge_id),
    paidAt: stamp,
    updatedAt: stamp,
  }).onConflictDoUpdate({
    target: brandingEntitlements.userId,
    set: {
      rightsRemoved: 1,
      source: 'telegram_stars',
      currency: 'XTR',
      amount: BRANDING_PRICE_STARS,
      telegramPaymentChargeId: String(payment.telegram_payment_charge_id),
      paidAt: stamp,
      updatedAt: stamp,
    },
  }).run();

  await api.sendMessage({
    chat_id: message.chat.id,
    text: '✅ تم الدفع بنجاح. تمت إزالة حقوق Rich Customize من المعاينات والصفحات والمنشورات الجديدة في حسابك.',
  });
  return true;
}

export async function handleBrandingCallback(query) {
  if (String(query?.data || '') !== 'r:branding') return false;

  const userId = Number(query.from?.id);
  if (!Number.isSafeInteger(userId)) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (await isBrandingRemoved(userId)) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: '✅ الحقوق مزالة من حسابك بالفعل.',
      show_alert: true,
    });
    return true;
  }

  const invoiceLink = await createBrandingRemovalInvoiceLink();
  await api.sendMessage({
    chat_id: userId,
    text: [
      'إزالة حقوق Rich Customize',
      '',
      'دفعة واحدة: 99 ⭐️',
      'بعد نجاح الدفع يختفي تذييل Rich Customize من المعاينات والصفحات والمنشورات الجديدة في حسابك.',
    ].join('\n'),
    reply_markup: {
      inline_keyboard: [[{
        text: 'إزالة الحقوق — 99 ⭐️',
        url: String(invoiceLink),
        style: 'success',
      }]],
    },
  });
  await api.answerCallbackQuery({ callback_query_id: query.id });
  return true;
}
