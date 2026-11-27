import { activeGoldenGift } from 'lib/golden-gifts';
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import {
  editorEntitlementEvents,
  editorGiftEntitlements,
  editorSubscriptions,
  legacyStates,
  richDonateBridge,
} from 'schema';
import { isDeveloper } from 'lib/developer-access';
import { resolveEditorEntitlement, planBenefit, safePlanLimit } from 'lib/subscription-policy';

export const RICH_DONATE_USERNAME = 'richdonatebot';
export const RICH_DONATE_PLAN_DAYS = 30;
const MINIAPP_BRIDGE_CHAT_ID = -1003993506865;
const EDITOR_BOT_USERNAME = 'richcustomizebot';
const RICH_DONATE_TAG = '#مزامنة_ريتش_دونيت';
const EVENT_FIELDS = Object.freeze([
  'protocol',
  'event_id',
  'kind',
  'order_id',
  'user_id',
  'plan',
  'permanent_branding',
  'amount',
  'currency',
  'charge_id',
  'paid_at',
]);
const BRIDGE_KEY = 'richdonate-b2b-v1';
const LAST_RICH_DONATE_REQUEST_NAMESPACE = 'richdonate-b2b-v1:last-request';
const MAX_EVENT_BYTES = 4096;
const MAX_CHARGE_ID_LENGTH = 256;
const MAX_EVENT_AGE_SECONDS = 10 * 365 * 86400;
const PLAN_PERIOD_SECONDS = RICH_DONATE_PLAN_DAYS * 86400;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function hasForwardMetadata(message) {
  return Boolean(
    message?.forward_origin
    || message?.forward_from
    || message?.forward_from_chat
    || message?.forward_sender_name
    || message?.forward_date
    || message?.via_bot
    || message?.sender_chat
    || message?.external_reply
  );
}

function isRichDonateBridgeBot(message) {
  const senderId = Number(message?.from?.id);
  const chatId = Number(message?.chat?.id);
  const groupChat = message?.chat?.type === 'group'
    || message?.chat?.type === 'supergroup';
  return message?.from?.is_bot === true
    && String(message?.from?.username || '').toLowerCase() === RICH_DONATE_USERNAME
    && groupChat
    && chatId === MINIAPP_BRIDGE_CHAT_ID
    && Number.isSafeInteger(senderId)
    && senderId > 0
    && !hasForwardMetadata(message);
}

function parseRichDonateEvent(text, now) {
  const match = String(text || '').match(/^\/rdb_event_v1@richcustomizebot\s+([\s\S]+)$/i);
  if (!match || match[1].length > MAX_EVENT_BYTES) return null;
  if (new TextEncoder().encode(match[1]).byteLength > MAX_EVENT_BYTES) return null;

  let value;
  try {
    value = JSON.parse(match[1]);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value).sort();
  const expectedKeys = [...EVENT_FIELDS].sort();
  if (keys.length !== expectedKeys.length
      || keys.some((key, index) => key !== expectedKeys[index])) return null;
  if (value.protocol !== 'rich-donate/1'
      || !['purchase', 'refund'].includes(value.kind)
      || !['free', 'plus', 'golden'].includes(value.plan)
      || value.currency !== 'XTR'
      || typeof value.permanent_branding !== 'boolean') return null;

  const orderMatch = String(value.order_id || '').match(/^rd_[a-f0-9]{32}$/);
  const eventMatch = String(value.event_id || '').match(/^(purchase|refund):(rd_[a-f0-9]{32})$/);
  const userId = value.user_id;
  const paidAt = value.paid_at;
  const amount = value.amount;
  const chargeId = typeof value.charge_id === 'string' ? value.charge_id : '';
  if (!orderMatch || !eventMatch
      || eventMatch[1] !== value.kind
      || eventMatch[2] !== value.order_id
      || (value.plan === 'free' && !value.permanent_branding)
      || !Number.isSafeInteger(userId) || userId <= 0
      || !Number.isSafeInteger(paidAt) || paidAt <= 0
      || paidAt > now + 300 || paidAt < now - MAX_EVENT_AGE_SECONDS
      || !Number.isSafeInteger(amount) || amount <= 0
      || chargeId.length === 0 || chargeId.length > MAX_CHARGE_ID_LENGTH
      || chargeId !== chargeId.trim()
      || /[\u0000-\u001f\u007f]/.test(chargeId)) return null;

  return {
    eventId: value.event_id,
    kind: value.kind,
    orderId: value.order_id,
    userId,
    plan: value.plan,
    permanentBranding: value.permanent_branding ? 1 : 0,
    amount,
    currency: value.currency,
    chargeId,
    paidAt,
  };
}

function sameFinancialDetails(row, event) {
  const chargeId = row.kind === 'purchase'
    ? row.purchaseChargeId
    : row.referenceChargeId;
  return row.orderId === event.orderId
    && Number(row.userId) === event.userId
    && row.plan === event.plan
    && Number(row.permanentBranding) === event.permanentBranding
    && Number(row.amount) === event.amount
    && row.currency === event.currency
    && chargeId === event.chargeId
    && Number(row.paidAt) === event.paidAt;
}

function asEventRow(event, receivedAt) {
  return {
    eventId: event.eventId,
    kind: event.kind,
    orderId: event.orderId,
    purchaseOrderId: event.kind === 'purchase' ? event.orderId : null,
    refundOrderId: event.kind === 'refund' ? event.orderId : null,
    userId: event.userId,
    plan: event.plan,
    permanentBranding: event.permanentBranding,
    amount: event.amount,
    currency: event.currency,
    purchaseChargeId: event.kind === 'purchase' ? event.chargeId : null,
    referenceChargeId: event.kind === 'refund' ? event.chargeId : null,
    paidAt: event.paidAt,
    receivedAt,
  };
}

async function findPurchaseConflict(event) {
  const byOrder = await db.select().from(editorEntitlementEvents)
    .where(eq(editorEntitlementEvents.purchaseOrderId, event.orderId)).get();
  if (byOrder) return byOrder;
  return db.select().from(editorEntitlementEvents)
    .where(eq(editorEntitlementEvents.purchaseChargeId, event.chargeId)).get();
}

async function validateOrderPair(event) {
  const rows = await db.select().from(editorEntitlementEvents)
    .where(eq(editorEntitlementEvents.orderId, event.orderId)).all();
  for (const row of rows) {
    if (row.kind !== event.kind && !sameFinancialDetails(row, event)) {
      throw new Error('RDB_ORDER_EVENT_MISMATCH');
    }
  }
}

async function persistRichDonateEvent(event, now) {
  const existing = await db.select().from(editorEntitlementEvents)
    .where(eq(editorEntitlementEvents.eventId, event.eventId)).get();
  if (existing) {
    if (existing.kind !== event.kind || !sameFinancialDetails(existing, event)) {
      throw new Error('RDB_EVENT_ID_CONFLICT');
    }
    return 'duplicate';
  }

  await validateOrderPair(event);
  if (event.kind === 'purchase') {
    const conflict = await findPurchaseConflict(event);
    if (conflict) throw new Error('RDB_PURCHASE_IDENTITY_CONFLICT');
  }

  const row = asEventRow(event, now);
  let inserted;
  try {
    inserted = await db.insert(editorEntitlementEvents).values(row)
      .onConflictDoNothing({ target: editorEntitlementEvents.eventId })
      .returning({ eventId: editorEntitlementEvents.eventId }).run();
  } catch (error) {
    const sameId = await db.select().from(editorEntitlementEvents)
      .where(eq(editorEntitlementEvents.eventId, event.eventId)).get();
    if (sameId && sameId.kind === event.kind && sameFinancialDetails(sameId, event)) {
      return 'duplicate';
    }
    throw error;
  }
  if (Array.isArray(inserted) && inserted.length === 1) return 'applied';

  const duplicate = await db.select().from(editorEntitlementEvents)
    .where(eq(editorEntitlementEvents.eventId, event.eventId)).get();
  if (duplicate && duplicate.kind === event.kind && sameFinancialDetails(duplicate, event)) {
    return 'duplicate';
  }
  throw new Error('RDB_EVENT_INSERT_NOT_CONFIRMED');
}

async function pinDonationBot(message, now) {
  const match = String(message?.text || '').trim()
    .match(/^\/rdb_hello_ack_v1@richcustomizebot\s+(\d{1,20})\s+v1(?:\s+#مزامنة_ريتش_دونيت)?$/i);
  const senderId = Number(message?.from?.id);
  if (!match || !Number.isSafeInteger(senderId) || senderId <= 0
      || Number(match[1]) !== senderId) return;

  await db.insert(richDonateBridge).values({
    key: BRIDGE_KEY,
    botId: senderId,
    pinnedAt: now,
  }).onConflictDoNothing({ target: richDonateBridge.key }).run();
  const pinned = await db.select().from(richDonateBridge)
    .where(eq(richDonateBridge.key, BRIDGE_KEY)).get();
  if (Number(pinned?.botId) !== senderId) {
    console.warn('Rich Donate B2B hello rejected: sender differs from pinned identity');
  } else {
    await deleteLastRichDonateRequest();
  }
}

async function deleteLastRichDonateRequest() {
  const row = await db.select().from(legacyStates)
    .where(eq(legacyStates.namespace, LAST_RICH_DONATE_REQUEST_NAMESPACE)).get();
  const messageId = Number(row?.payload?.messageId);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return;
  try {
    await api.deleteMessage({
      chat_id: MINIAPP_BRIDGE_CHAT_ID,
      message_id: messageId,
    });
    await db.delete(legacyStates)
      .where(eq(legacyStates.namespace, LAST_RICH_DONATE_REQUEST_NAMESPACE)).run();
  } catch (error) {
    console.warn('Could not delete previous Rich Donate B2B request', error?.code || error?.name || 'Error');
  }
}

export async function handleRichDonateB2BMessage(message, { now = nowSeconds() } = {}) {
  const text = String(message?.text || '').trim();
  const commandMatch = text.match(/^\/(rdb_[a-z0-9_]+)(?:@([a-z0-9_]+))?(?:\s|$)/i);
  if (!commandMatch) return false;
  if (String(commandMatch[2] || '').toLowerCase() !== EDITOR_BOT_USERNAME) return true;

  if (!isRichDonateBridgeBot(message)) return true;
  const command = text.split(/\s+/, 1)[0]
    .replace(/@richcustomizebot$/i, '')
    .toLowerCase();
  if (command === '/rdb_hello_ack_v1') {
    await pinDonationBot(message, now);
    return true;
  }

  const pinned = await db.select().from(richDonateBridge)
    .where(eq(richDonateBridge.key, BRIDGE_KEY)).get();
  if (!pinned || Number(pinned.botId) !== Number(message.from.id)) return true;

  if (command !== '/rdb_event_v1') return true;
  const event = parseRichDonateEvent(text, now);
  if (!event) {
    console.warn('Rich Donate B2B event rejected: invalid event shape');
    return true;
  }

  const status = await persistRichDonateEvent(event, now);
  await api.sendMessage({
    chat_id: message.chat.id,
    text: `/rdb_ack_v1@RichDonateBot ${event.eventId} ${status} ${RICH_DONATE_TAG}`,
    disable_notification: true,
  });
  return true;
}

export async function getRichDonateSubscriptionState(userId, {
  now = nowSeconds(),
  legacy = null,
} = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { plan: 'free', expiresAt: 0, active: false };
  }
  const rows = await db.select().from(editorEntitlementEvents)
    .where(eq(editorEntitlementEvents.userId, id)).all();
  const gifts = await db.select().from(editorGiftEntitlements)
    .where(eq(editorGiftEntitlements.userId, id)).all();
  const refundedOrders = new Set(rows
    .filter((row) => row.kind === 'refund')
    .map((row) => row.orderId));
  const purchases = rows
    .filter((row) => row.kind === 'purchase'
      && row.plan !== 'free'
      && !refundedOrders.has(row.orderId))
    .map((row) => ({
      eventId: row.eventId,
      plan: row.plan,
      paidAt: Number(row.paidAt),
      duration: PLAN_PERIOD_SECONDS,
      legacy: false,
    }));
  for (const gift of gifts) {
    const startedAt = Number(gift.startedAt);
    const expiresAt = Number(gift.expiresAt);
    if (!['plus', 'golden'].includes(String(gift.plan))
        || !Number.isSafeInteger(startedAt) || startedAt <= 0
        || !Number.isSafeInteger(expiresAt) || expiresAt <= startedAt) continue;
    purchases.push({
      eventId: 'gift:' + String(gift.requestId),
      plan: String(gift.plan),
      paidAt: startedAt,
      duration: expiresAt - startedAt,
      legacy: false,
    });
  }

  if (legacy && ['plus', 'golden'].includes(legacy.plan)
      && Number.isSafeInteger(Number(legacy.startedAt))
      && Number.isSafeInteger(Number(legacy.expiresAt))
      && Number(legacy.expiresAt) > Number(legacy.startedAt)) {
    purchases.push({
      eventId: 'legacy',
      plan: legacy.plan,
      paidAt: Number(legacy.startedAt) || Number(legacy.expiresAt) - PLAN_PERIOD_SECONDS,
      duration: Number(legacy.expiresAt)
        - (Number(legacy.startedAt) || Number(legacy.expiresAt) - PLAN_PERIOD_SECONDS),
      legacy: true,
    });
  }

  purchases.sort((a, b) => a.paidAt - b.paidAt
    || Number(a.legacy) - Number(b.legacy)
    || a.eventId.localeCompare(b.eventId));

  let cursor = 0;
  const intervals = [];
  for (const purchase of purchases) {
    if (!Number.isSafeInteger(purchase.paidAt) || purchase.paidAt <= 0
        || !Number.isSafeInteger(purchase.duration) || purchase.duration <= 0) continue;
    const expiresAt = purchase.paidAt > cursor
      ? purchase.paidAt + purchase.duration
      : cursor + purchase.duration;
    intervals.push({
      plan: purchase.plan,
      startsAt: purchase.paidAt,
      expiresAt,
      eventId: purchase.eventId,
    });
    cursor = expiresAt;
  }

  const active = intervals.filter((item) => item.startsAt <= now && item.expiresAt > now)
    .at(-1);
  return {
    plan: active?.plan || 'free',
    expiresAt: active?.expiresAt || 0,
    active: Boolean(active),
  };
}

export async function hasPermanentRichDonateBranding(userId) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return false;
  const rows = await db.select().from(editorEntitlementEvents)
    .where(eq(editorEntitlementEvents.userId, id)).all();
  const refundedOrders = new Set(rows
    .filter((row) => row.kind === 'refund')
    .map((row) => row.orderId));
  return rows.some((row) => row.kind === 'purchase'
    && Number(row.permanentBranding) === 1
    && !refundedOrders.has(row.orderId));
}

// This is a read-only trusted entitlement resolver. No HTTP/browser parameter
// may create or activate a paid subscription.
export const VERIFIED_EDITOR_SOURCES = Object.freeze(['richdonate:verified']);
export function verifiedSubscriptionRow(row, now = Math.floor(Date.now()/1000)) {
  if (!row || row.status !== 'active') return null;
  if (!VERIFIED_EDITOR_SOURCES.includes(String(row.source || ''))) return null;
  if (!['plus','golden'].includes(String(row.plan || ''))) return null;
  if (!Number.isSafeInteger(Number(row.expiresAt)) || Number(row.expiresAt) <= now) return null;
  return String(row.plan);
}

export async function getEditorSubscriptionState(userId, {
  now = Math.floor(Date.now()/1000),
} = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { plan: 'free', expiresAt: 0, active: false };
  }
  const row = await db.select().from(editorSubscriptions)
    .where(eq(editorSubscriptions.userId, id)).get();
  const validLegacy = row?.status === 'active'
    && VERIFIED_EDITOR_SOURCES.includes(String(row.source || ''))
    && ['plus', 'golden'].includes(String(row.plan || ''))
    && Number.isSafeInteger(Number(row.expiresAt))
    && Number(row.expiresAt) > 0;
  let state;
  try {
    state = await getRichDonateSubscriptionState(id, {
      now,
      legacy: validLegacy ? {
        plan: String(row.plan),
        startedAt: Number(row.startedAt) || 0,
        expiresAt: Number(row.expiresAt),
      } : null,
    });
  } catch (error) {
    console.warn('Rich Donate B2B entitlement lookup failed; using trusted legacy subscription only', error);
    const plan = verifiedSubscriptionRow(row, now);
    return plan
      ? { plan, expiresAt: Number(row.expiresAt), active: true }
      : { plan: 'free', expiresAt: 0, active: false };
  }
  if (state.active) return state;
  const plan = verifiedSubscriptionRow(row, now);
  return plan
    ? { plan, expiresAt: Number(row.expiresAt), active: true }
    : { plan: 'free', expiresAt: 0, active: false };
}

export async function getEditorEntitlement(userId, { now = Math.floor(Date.now()/1000) } = {}) {
  const id = Number(userId);
  if (!Number.isSafeInteger(id) || id <= 0) return resolveEditorEntitlement();
  if (isDeveloper(id)) return resolveEditorEntitlement({ developer:true });
  try {
    if (await activeGoldenGift(id, now)) return resolveEditorEntitlement({plan:'golden',active:true});
  } catch { console.warn('Golden gift lookup unavailable; using paid entitlement'); }
  try {
    const state = await getEditorSubscriptionState(id, { now });
    return state.active
      ? resolveEditorEntitlement({plan:state.plan,active:true})
      : resolveEditorEntitlement();
  } catch (error) {
    // During a schema rollout, never break editor operations or grant access.
    // Missing/misconfigured storage fails closed to Free.
    console.warn('Editor subscription lookup failed; falling back to Free', error);
    return resolveEditorEntitlement();
  }
}

export async function getEditorPlanLimits(userId) {
  const entitlement = await getEditorEntitlement(userId);
  return {
    plan: entitlement.plan,
    limits: entitlement.limits,
    brandingIncluded: planBenefit(entitlement,'brandingIncluded'),
    earlyAccess: planBenefit(entitlement,'earlyAccess'),
  };
}

export async function hasGoldenEarlyAccess(userId) {
  return (await getEditorPlanLimits(userId)).earlyAccess;
}
