const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const MINIAPP_SESSION_COOKIE = 'rich_miniapp_session';
const SESSION_DOMAIN = 'rich-miniapp-session-v1';

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

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(secret || '')),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return bytesToHex(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

function base64UrlEncode(text) {
  const bytes = encoder.encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return decoder.decode(bytes);
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

export async function createMiniAppSession(userId, botToken, ttlSeconds = 1800) {
  if (!botToken) throw new Error('BOT_TOKEN is not configured');
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    v: 1,
    uid: Number(userId),
    iat: now,
    exp: now + Math.max(60, Number(ttlSeconds) || 1800),
  }));
  const signature = await hmacHex(botToken, SESSION_DOMAIN + '.' + payload);
  return payload + '.' + signature;
}

export async function verifyMiniAppSession(token, botToken) {
  if (!botToken || !token) return null;
  const [payload, signature, ...extra] = String(token).split('.');
  if (!payload || !signature || extra.length) return null;

  const expected = await hmacHex(botToken, SESSION_DOMAIN + '.' + payload);
  if (!constantTimeEqual(expected, signature)) return null;

  let data;
  try {
    data = JSON.parse(base64UrlDecode(payload));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const uid = Number(data?.uid);
  const exp = Number(data?.exp);
  if (
    data?.v !== 1
    || !Number.isSafeInteger(uid)
    || uid <= 0
    || !Number.isSafeInteger(exp)
    || exp <= now
  ) return null;

  return { userId: uid, expiresAt: exp };
}

export async function requestMiniAppSession(request, botToken) {
  return verifyMiniAppSession(readCookie(request, MINIAPP_SESSION_COOKIE), botToken);
}

export function miniAppSessionCookie(token, ttlSeconds = 1800) {
  const maxAge = Math.max(60, Number(ttlSeconds) || 1800);
  return [
    MINIAPP_SESSION_COOKIE + '=' + token,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=' + maxAge,
  ].join('; ');
}
