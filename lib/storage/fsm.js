import { db } from 'sdk';
import { eq } from 'sdk/db';
import { richFsm } from 'schema';
import { EDITOR_SESSION_TTL_SECONDS } from 'lib/editor/limits';

export function makeStorageKey({
  chatId = null,
  userId = null,
  threadId = null,
  businessConnectionId = null,
  destiny = 'default',
} = {}) {
  return JSON.stringify([chatId, userId, threadId, businessConnectionId, destiny]);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function isEditorExpired(data, now = nowSeconds()) {
  const raw = data?.editor_last_activity_at;
  if (raw == null) return false;
  const last = Number(raw);
  if (!Number.isFinite(last) || last <= 0) return true;
  return now - last >= EDITOR_SESSION_TTL_SECONDS;
}

export async function readFsm(storageKey, { touch = false } = {}) {
  const row = await db.select().from(richFsm).where(eq(richFsm.storageKey, storageKey)).get();
  if (!row) return { state: null, data: {} };

  const data = row.data && typeof row.data === 'object' && !Array.isArray(row.data)
    ? { ...row.data }
    : {};
  if (isEditorExpired(data)) {
    await db.delete(richFsm).where(eq(richFsm.storageKey, storageKey)).run();
    return { state: null, data: {} };
  }
  if (touch && Object.hasOwn(data, 'editor_last_activity_at')) {
    data.editor_last_activity_at = nowSeconds();
    await writeFsm(storageKey, row.state, data);
  }
  return { state: row.state ?? null, data };
}

export async function writeFsm(storageKey, state, data = {}) {
  const clean = data && typeof data === 'object' && !Array.isArray(data) ? { ...data } : {};
  if (Object.hasOwn(clean, 'editor_last_activity_at')) {
    clean.editor_last_activity_at = nowSeconds();
  }

  if (state == null && Object.keys(clean).length === 0) {
    await db.delete(richFsm).where(eq(richFsm.storageKey, storageKey)).run();
    return;
  }

  const updatedAt = nowSeconds();
  await db.insert(richFsm)
    .values({ storageKey, state, data: clean, updatedAt })
    .onConflictDoUpdate({
      target: richFsm.storageKey,
      set: { state, data: clean, updatedAt },
    })
    .run();
}

export async function updateFsmData(storageKey, changes, { state = undefined } = {}) {
  const current = await readFsm(storageKey);
  const nextData = { ...current.data, ...(changes ?? {}) };
  const nextState = state === undefined ? current.state : state;
  await writeFsm(storageKey, nextState, nextData);
  return nextData;
}

export async function clearFsm(storageKey) {
  await db.delete(richFsm).where(eq(richFsm.storageKey, storageKey)).run();
}

export async function cleanupExpiredEditorFsm(cutoffEpoch = nowSeconds() - EDITOR_SESSION_TTL_SECONDS) {
  const rows = await db.select().from(richFsm).all();
  const expired = rows.filter((row) => {
    const value = Number(row?.data?.editor_last_activity_at);
    return Number.isFinite(value) && value < cutoffEpoch;
  });
  for (const row of expired) {
    await db.delete(richFsm).where(eq(richFsm.storageKey, row.storageKey)).run();
  }
  return expired.length;
}
