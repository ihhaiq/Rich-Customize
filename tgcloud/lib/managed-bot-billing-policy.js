export const MANAGED_BOT_PLANS = Object.freeze({
  monthly: Object.freeze({
    id: 'monthly',
    title: 'Managed Bot — شهر',
    description: 'ترخيص بوت مُدار لمدة شهر واحد.',
    amount: 50,
    durationMs: 30 * 24 * 60 * 60 * 1000,
  }),
  permanent: Object.freeze({
    id: 'permanent',
    title: 'Managed Bot — دائم',
    description: 'ترخيص دائم لبوت مُدار واحد.',
    amount: 999,
    durationMs: null,
  }),
});

export const MANAGED_BOT_CURRENCY = 'XTR';
export const MANAGED_BOT_PERMANENT_EXPIRES_AT = 253402300799000;
export const MANAGED_BOT_PAYLOAD_PREFIX = 'managed_bot:v1:';

export function managedBotPlanFor(id) {
  return MANAGED_BOT_PLANS[String(id || '')] || null;
}

export function parseManagedBotPayload(payload) {
  const parts = String(payload || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'managed_bot' || parts[1] !== 'v1') return null;
  const plan = managedBotPlanFor(parts[2]);
  const orderId = parts[3];
  if (!plan || !/^[A-Za-z0-9_-]{16,80}$/.test(orderId)) return null;
  return { plan, orderId };
}
