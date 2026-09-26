import { HttpError } from './http.js';

const encoder = new TextEncoder();

function bytesToHex(bytes) {
  return [...new Uint8Array(bytes)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function constantTimeEqual(left, right) {
  const a = String(left || '').toLowerCase();
  const b = String(right || '').toLowerCase();
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let index = 0; index < a.length; index += 1) {
    mismatch |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return mismatch === 0;
}

async function hmac(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', key, encoder.encode(message));
}

export async function verifyTelegramInitData(initData, botToken, maxAgeSeconds = 86400) {
  if (!botToken) throw new HttpError(500, 'BOT_TOKEN is not configured');
  if (!initData) throw new HttpError(401, 'Missing Telegram initData');

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash') || '';
  if (!receivedHash) throw new HttpError(401, 'Missing initData hash');
  params.delete('hash');

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => key + '=' + value)
    .join('\n');

  const secret = await hmac(encoder.encode('WebAppData'), String(botToken));
  const expected = bytesToHex(await hmac(secret, dataCheckString));
  if (!constantTimeEqual(expected, receivedHash)) {
    throw new HttpError(401, 'Invalid Telegram initData');
  }

  const authDate = Number(params.get('auth_date') || 0);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(authDate) || !authDate || Math.abs(now - authDate) > maxAgeSeconds) {
    throw new HttpError(401, 'Expired Telegram initData');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') || '{}');
  } catch {
    throw new HttpError(401, 'Invalid Telegram user');
  }
  if (!user || typeof user !== 'object' || !Number.isSafeInteger(Number(user.id))) {
    throw new HttpError(401, 'Missing Telegram user');
  }
  user.id = Number(user.id);
  return user;
}

export async function miniAppUser(context) {
  const initData = context.request.headers.get('X-Telegram-Init-Data') || '';
  return verifyTelegramInitData(initData, context.env.BOT_TOKEN);
}
