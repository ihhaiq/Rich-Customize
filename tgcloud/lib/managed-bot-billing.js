import { api, db } from 'sdk';
import { and, eq, gt } from 'sdk/db';
import {
  managedBotLicenses,
  managedBotOrders,
  managedBotPayments,
} from 'schema';
import {
  MANAGED_BOT_PLANS,
  MANAGED_BOT_CURRENCY,
  MANAGED_BOT_PERMANENT_EXPIRES_AT,
  MANAGED_BOT_PAYLOAD_PREFIX,
  managedBotPlanFor,
  parseManagedBotPayload,
} from 'lib/managed-bot-billing-policy';
export { MANAGED_BOT_PLANS, MANAGED_BOT_CURRENCY, MANAGED_BOT_PERMANENT_EXPIRES_AT, parseManagedBotPayload };

function stamp() {
  return Date.now();
}

function randomId(prefix) {
  const value = crypto.randomUUID?.() || [...crypto.getRandomValues(new Uint8Array(16))]
    .map((item) => item.toString(16).padStart(2, '0')).join('');
  return prefix + value.replaceAll('-', '').slice(0, 24);
}

function planFor(id) {
  return managedBotPlanFor(id);
}

function payloadFor(orderId, planId) {
  return MANAGED_BOT_PAYLOAD_PREFIX + planId + ':' + orderId;
}

function validPaymentShape(payment, plan, payload) {
  return Boolean(
    payment
    && String(payment.currency || '') === MANAGED_BOT_CURRENCY
    && Number(payment.total_amount) === plan.amount
    && String(payment.invoice_payload || '') === payload
    && String(payment.telegram_payment_charge_id || '').trim(),
  );
}

export function managedBotPlansText() {
  return [
    'Managed Bots — اختر الترخيص',
    '',
    '• 50 ⭐️ — ترخيص شهري لبوت واحد.',
    '• 999 ⭐️ — ترخيص دائم لبوت واحد.',
    '',
    'بعد الدفع يظهر الترخيص داخل «بوتاتي»، ومنه تربط بوتك الذي أنشأته عبر BotFather.',
    'الترخيص لا ينقل المحرر ولا ينشئ نسخة Serverless مستقلة.',
  ].join('\n');
}

export async function createManagedBotInvoiceLink(userId, planId) {
  const plan = planFor(planId);
  if (!Number.isSafeInteger(Number(userId)) || !plan) throw new Error('invalid_managed_bot_plan');
  const orderId = randomId('mbo_');
  const payload = payloadFor(orderId, plan.id);
  await db.insert(managedBotOrders).values({
    orderId,
    userId: Number(userId),
    planId: plan.id,
    amount: plan.amount,
    currency: MANAGED_BOT_CURRENCY,
    invoicePayload: payload,
    status: 'pending',
    createdAt: stamp(),
  }).run();
  return api.createInvoiceLink({
    title: plan.title,
    description: plan.description,
    payload,
    currency: MANAGED_BOT_CURRENCY,
    prices: [{ label: plan.title, amount: plan.amount }],
  });
}

export async function sendManagedBotPlans(message) {
  const userId = Number(message?.from?.id || message?.chat?.id);
  if (!Number.isSafeInteger(userId)) return true;
  await api.sendMessage({
    chat_id: message.chat.id,
    text: managedBotPlansText(),
    reply_markup: {
      inline_keyboard: [[
        { text: 'شهري — 50 ⭐️', callback_data: 'r:managed_buy:monthly' },
        { text: 'دائم — 999 ⭐️', callback_data: 'r:managed_buy:permanent' },
      ]],
    },
  });
  return true;
}

export async function handleManagedBotCallback(query) {
  const data = String(query?.data || '');
  const match = data.match(/^r:managed_buy:(monthly|permanent)$/);
  if (!match) return false;
  const userId = Number(query?.from?.id);
  if (!Number.isSafeInteger(userId)) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }
  const invoiceLink = await createManagedBotInvoiceLink(userId, match[1]);
  await api.sendMessage({
    chat_id: userId,
    text: 'هذا رابط الدفع. بعد اكتمال الدفع يصلك الترخيص وتكدر تفتحه من «بوتاتي».',
    reply_markup: { inline_keyboard: [[{ text: 'الدفع بـ Telegram Stars ⭐️', url: String(invoiceLink) }]] },
  });
  await api.answerCallbackQuery({ callback_query_id: query.id });
  return true;
}

export async function handleManagedBotPreCheckout(query) {
  const parsed = parseManagedBotPayload(query?.invoice_payload);
  if (!parsed) return false;
  const order = await db.select().from(managedBotOrders)
    .where(eq(managedBotOrders.orderId, parsed.orderId)).get();
  const ok = Boolean(
    order
    && order.status === 'pending'
    && Number(order.userId) === Number(query?.from?.id)
    && Number(query?.total_amount) === parsed.plan.amount
    && String(query?.currency || '') === MANAGED_BOT_CURRENCY
    && String(query?.invoice_payload || '') === order.invoicePayload,
  );
  await api.answerPreCheckoutQuery({
    pre_checkout_query_id: query.id,
    ok,
    ...(ok ? {} : { error_message: 'تعذّر التحقق من الترخيص. أنشئ رابط دفع جديداً وجرب مرة ثانية.' }),
  });
  return true;
}

export async function handleManagedBotSuccessfulPayment(message) {
  const payment = message?.successful_payment;
  const parsed = parseManagedBotPayload(payment?.invoice_payload);
  if (!parsed) return false;
  if (!validPaymentShape(payment, parsed.plan, payment.invoice_payload)) return true;

  const userId = Number(message?.from?.id);
  if (!Number.isSafeInteger(userId)) return true;
  const existingPayment = await db.select().from(managedBotPayments)
    .where(eq(managedBotPayments.chargeId, String(payment.telegram_payment_charge_id))).get();
  if (existingPayment) return true;

  const order = await db.select().from(managedBotOrders)
    .where(and(eq(managedBotOrders.orderId, parsed.orderId), eq(managedBotOrders.userId, userId))).get();
  if (!order || order.status !== 'pending' || order.invoicePayload !== payment.invoice_payload) return true;

  const paidAt = stamp();
  // Derive the license identity from the order so concurrent delivery of the
  // same invoice cannot create two licenses for one purchase.
  const licenseId = 'mbl_' + order.orderId;
  const expiresAt = parsed.plan.durationMs == null
    ? MANAGED_BOT_PERMANENT_EXPIRES_AT
    : paidAt + parsed.plan.durationMs;

  const paymentRows = await db.insert(managedBotPayments).values({
    chargeId: String(payment.telegram_payment_charge_id),
    orderId: order.orderId,
    userId,
    amount: parsed.plan.amount,
    currency: MANAGED_BOT_CURRENCY,
    paidAt,
  }).onConflictDoNothing({ target: managedBotPayments.chargeId }).returning({
    chargeId: managedBotPayments.chargeId,
  }).run();
  if (!Array.isArray(paymentRows) || !paymentRows.length) return true;

  await db.insert(managedBotLicenses).values({
    licenseId,
    ownerId: userId,
    planId: parsed.plan.id,
    status: 'active',
    expiresAt,
    version: 1,
    sourcePaymentId: String(payment.telegram_payment_charge_id),
    createdAt: paidAt,
    updatedAt: paidAt,
  }).onConflictDoNothing({ target: managedBotLicenses.licenseId }).run();
  await db.update(managedBotOrders).set({
    status: 'paid',
    licenseId,
    paidAt,
  }).where(eq(managedBotOrders.orderId, order.orderId)).run();

  await api.sendMessage({
    chat_id: message.chat.id,
    text: [
      '✅ تم الدفع وإصدار الترخيص.',
      '',
      'رقم الترخيص: ' + licenseId,
      parsed.plan.durationMs == null ? 'المدة: دائم' : 'المدة: شهر واحد',
      '',
      'افتح «بوتاتي» واربط البوت الذي أنشأته عبر BotFather.',
    ].join('\n'),
    reply_markup: { inline_keyboard: [[{ text: 'فتح بوتاتي', url: 'https://t.me/RichCustomizebot/editor?startapp=managed_bots' }]] },
  });
  return true;
}

export async function listManagedBotLicensesForBridge(ownerId) {
  const rows = await db.select({
    id: managedBotLicenses.licenseId,
    plan_id: managedBotLicenses.planId,
    status: managedBotLicenses.status,
    expires_at: managedBotLicenses.expiresAt,
    version: managedBotLicenses.version,
  }).from(managedBotLicenses).where(and(
    eq(managedBotLicenses.ownerId, Number(ownerId)),
    eq(managedBotLicenses.status, 'active'),
    gt(managedBotLicenses.expiresAt, stamp()),
  )).all();
  return rows;
}
