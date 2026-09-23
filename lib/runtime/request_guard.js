import { db } from 'sdk';
import { and, eq, lt, gte } from 'sdk/db';
import { rateLimitEvents, requestClaims } from 'schema';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export function scopeForCallback(data = '') {
  const value = String(data ?? '');
  if (value.startsWith('dev:')) return { scope: 'developer', limit: 5, windowSeconds: 10 };
  if (value === 'r:postsend') return { scope: 'publish', limit: 2, windowSeconds: 10 };
  if (value === 'r:savepage' || value.startsWith('r:pdelete') || value.startsWith('r:prestore')) {
    return { scope: 'save', limit: 4, windowSeconds: 10 };
  }
  if (value.startsWith('r:')) return { scope: 'editor', limit: 30, windowSeconds: 10 };
  return null;
}

export function scopeForMessage(text = '', rawState = '') {
  const normalized = String(text ?? '').trim().toLocaleLowerCase();
  const state = String(rawState ?? '');
  if (normalized.startsWith('/dev') || state.startsWith('DeveloperStates:')) {
    return { scope: 'developer', limit: 3, windowSeconds: 10 };
  }
  if (state.endsWith(':saving_page_name') || state.endsWith(':renaming_page')) {
    return { scope: 'save', limit: 4, windowSeconds: 10 };
  }
  if (normalized.startsWith('/editor')) return { scope: 'editor', limit: 8, windowSeconds: 10 };
  if (state.startsWith('RichEditorStates:')) return { scope: 'editor', limit: 30, windowSeconds: 10 };
  return null;
}

export async function claimUpdate(updateId, ttlSeconds = 900) {
  const key = `telegram-update:${updateId}`;
  const now = nowSeconds();
  await db.delete(requestClaims).where(lt(requestClaims.expiresAt, now)).run();
  const rows = await db.insert(requestClaims)
    .values({ key, expiresAt: now + ttlSeconds })
    .onConflictDoNothing({ target: requestClaims.key })
    .returning({ key: requestClaims.key })
    .run();
  return rows.length > 0;
}

export async function releaseUpdate(updateId) {
  await db.delete(requestClaims)
    .where(eq(requestClaims.key, `telegram-update:${updateId}`))
    .run();
}

export async function withIdempotency(updateId, handler) {
  if (!Number.isInteger(Number(updateId))) return handler();
  if (!await claimUpdate(Number(updateId))) return null;
  try {
    return await handler();
  } catch (error) {
    await releaseUpdate(Number(updateId));
    throw error;
  }
}

export async function slidingWindowAllow({
  scope,
  userId,
  limit,
  windowSeconds,
  member,
}) {
  const now = nowSeconds();
  const cutoff = now - Number(windowSeconds);
  await db.delete(rateLimitEvents).where(and(
    eq(rateLimitEvents.scope, String(scope)),
    eq(rateLimitEvents.userId, Number(userId)),
    lt(rateLimitEvents.createdAt, cutoff),
  )).run();

  const id = `${scope}:${userId}:${member}`;
  await db.insert(rateLimitEvents)
    .values({ id, scope: String(scope), userId: Number(userId), createdAt: now })
    .onConflictDoNothing({ target: rateLimitEvents.id })
    .run();

  const count = await db.$count(rateLimitEvents, and(
    eq(rateLimitEvents.scope, String(scope)),
    eq(rateLimitEvents.userId, Number(userId)),
    gte(rateLimitEvents.createdAt, cutoff),
  ));
  if (count <= Number(limit)) return true;

  await db.delete(rateLimitEvents).where(eq(rateLimitEvents.id, id)).run();
  return false;
}
