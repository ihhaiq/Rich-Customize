import { api, db } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import {
  developerStates,
  editorSessions,
  processedUpdates,
  requestWindows,
} from 'schema';
import { recordOperation } from 'lib/usage-stats';
import { EDITOR_SESSION_TTL_SECONDS } from 'lib/editor-blocks';

const IDEMPOTENCY_TTL_SECONDS = 15 * 60;
const RATE_WINDOW_SECONDS = 10;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function nowMilliseconds() {
  return Date.now();
}

function updateIdValue(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

export async function claimUpdate(updateId) {
  const id = updateIdValue(updateId);
  if (id == null) return true;
  const stamp = nowSeconds();
  await db.delete(processedUpdates)
    .where(lt(processedUpdates.expiresAt, stamp))
    .run();
  const rows = await db.insert(processedUpdates).values({
    updateId: id,
    expiresAt: stamp + IDEMPOTENCY_TTL_SECONDS,
  }).onConflictDoNothing({
    target: processedUpdates.updateId,
  }).returning({
    updateId: processedUpdates.updateId,
  }).run();
  return Array.isArray(rows) && rows.length > 0;
}

export async function releaseUpdate(updateId) {
  const id = updateIdValue(updateId);
  if (id == null) return;
  await db.delete(processedUpdates)
    .where(eq(processedUpdates.updateId, id))
    .run();
}

async function allowSlidingWindow(key, limit, windowSeconds = RATE_WINDOW_SECONDS) {
  const safeLimit = Math.max(1, Number(limit) || 1);
  const windowMs = Math.max(1, Number(windowSeconds) * 1000);
  const now = nowMilliseconds();
  const cutoff = now - windowMs;
  const expiresAt = Math.floor((now + windowMs) / 1000) + 1;

  await db.delete(requestWindows)
    .where(lt(requestWindows.expiresAt, nowSeconds()))
    .run();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const row = await db.select().from(requestWindows)
      .where(eq(requestWindows.key, key)).get();

    if (!row) {
      const inserted = await db.insert(requestWindows).values({
        key,
        timestamps: [now],
        version: 1,
        expiresAt,
      }).onConflictDoNothing({
        target: requestWindows.key,
      }).returning({
        key: requestWindows.key,
      }).run();
      if (Array.isArray(inserted) && inserted.length) return true;
      continue;
    }

    const active = (Array.isArray(row.timestamps) ? row.timestamps : [])
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > cutoff)
      .sort((a, b) => a - b);

    if (active.length >= safeLimit) {
      if (
        active.length !== (Array.isArray(row.timestamps) ? row.timestamps.length : 0)
        || Number(row.expiresAt || 0) !== expiresAt
      ) {
        await db.update(requestWindows).set({
          timestamps: active,
          version: Number(row.version || 0) + 1,
          expiresAt,
        }).where(and(
          eq(requestWindows.key, key),
          eq(requestWindows.version, Number(row.version || 0)),
        )).run();
      }
      return false;
    }

    const version = Number(row.version || 0);
    const updated = await db.update(requestWindows).set({
      timestamps: [...active, now],
      version: version + 1,
      expiresAt,
    }).where(and(
      eq(requestWindows.key, key),
      eq(requestWindows.version, version),
    )).returning({
      key: requestWindows.key,
    }).run();
    if (Array.isArray(updated) && updated.length) return true;
  }

  return false;
}

function callbackRule(data) {
  const value = String(data || '');
  if (value.startsWith('dev:')) return ['developer', 5, 10];
  if (value === 'r:postsend') return ['publish', 2, 10];
  if (
    value === 'r:savepage'
    || value.startsWith('r:pdelete')
    || value.startsWith('r:prestore')
  ) {
    return ['save', 4, 10];
  }
  if (value.startsWith('r:')) return ['editor', 30, 10];
  return null;
}

async function messageRule(message) {
  const userId = Number(message?.from?.id);
  if (!Number.isSafeInteger(userId)) return null;
  const text = String(message?.text || '').trim().toLocaleLowerCase();

  const developerState = await db.select({
    state: developerStates.state,
  }).from(developerStates).where(eq(developerStates.userId, userId)).get();
  if (text.startsWith('/dev') || developerState?.state) {
    return ['developer', 3, 10];
  }

  const editorState = await db.select({
    state: editorSessions.state,
    lastActivityAt: editorSessions.lastActivityAt,
  }).from(editorSessions).where(eq(editorSessions.userId, userId)).get();

  const activeEditor = editorState
    && Number(editorState.lastActivityAt || 0) >= nowSeconds() - EDITOR_SESSION_TTL_SECONDS;
  const state = activeEditor ? String(editorState.state || '') : '';
  if (state === 'saving_page_name' || state === 'renaming_page') {
    return ['save', 4, 10];
  }
  if (text.startsWith('/editor')) return ['editor', 8, 10];
  if (state) return ['editor', 30, 10];
  return null;
}

async function enforceRule(userId, rule) {
  if (!rule || !Number.isSafeInteger(Number(userId))) return true;
  const [scope, limit, window] = rule;
  const allowed = await allowSlidingWindow(
    scope + ':' + Number(userId),
    limit,
    window,
  );
  if (!allowed) await recordOperation('rate_limit', true);
  return allowed;
}

export async function allowCallbackRequest(query) {
  const allowed = await enforceRule(query?.from?.id, callbackRule(query?.data));
  if (allowed) return true;
  await api.answerCallbackQuery({
    callback_query_id: query.id,
    text: 'طلبات كثيرة بسرعة، حاول بعد لحظات.',
    show_alert: false,
  });
  return false;
}

export async function allowMessageRequest(message) {
  const allowed = await enforceRule(message?.from?.id, await messageRule(message));
  if (allowed) return true;
  if (message?.chat?.id) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: 'طلبات كثيرة بسرعة، حاول بعد لحظات.',
    });
  }
  return false;
}
