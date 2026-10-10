import { isDeveloper } from '../../tgcloud/lib/developer-access.js';
import { HttpError } from './http.js';

export const B2B_PROTOCOL = 'RCB1';
export const B2B_BRIDGE_CHAT_ID = -1003993506865;
export const B2B_TARGET_BOT_USERNAME = 'RichCustomizebot';
export const B2B_RELAY_BOT_USERNAME = 'Richminiappsbot';
const SYNC_OK_CUSTOM_EMOJI_ID = '5800644828383415728';

const REQUEST_TTL_SECONDS = 5 * 60;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;
const DEFAULT_MIN_SEND_INTERVAL_MS = 3500;
const DEFAULT_MAX_QUEUE_WAIT_MS = 12000;
const DEFAULT_CIRCUIT_SECONDS = 15;
const DEDUPE_WINDOW_SECONDS = 12;
const PAGE_OPEN_BURST_SECONDS = 10;
const PAGE_OPEN_BURST_LIMIT = 4;
const RETRY_LIMIT = 2;

function now() {
  return Math.floor(Date.now() / 1000);
}

export function requireBridgeDb(env) {
  const db = env?.DB;
  if (!db || typeof db.prepare !== 'function') {
    throw new HttpError(500, 'Cloudflare D1 binding "DB" is not configured');
  }
  return db;
}

let schemaReadyPromise = null;

export async function ensureBridgeSchema(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new HttpError(500, 'Cloudflare D1 binding "DB" is not configured');
  }
  if (schemaReadyPromise) return schemaReadyPromise;

  schemaReadyPromise = (async () => {
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_bridge_pending ('
      + 'request_id TEXT PRIMARY KEY, '
      + 'user_id INTEGER NOT NULL, '
      + 'action TEXT NOT NULL, '
      + 'page_id TEXT, '
      + "status TEXT NOT NULL DEFAULT 'pending', "
      + 'response_kind TEXT, '
      + 'response_file_id TEXT, '
      + 'response_json TEXT, '
      + 'error_code TEXT, '
      + 'error_message TEXT, '
      + 'created_at INTEGER NOT NULL, '
      + 'expires_at INTEGER NOT NULL, '
      + 'completed_at INTEGER'
      + ')'
    ).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_miniapp_bridge_pending_user '
      + 'ON miniapp_bridge_pending(user_id, created_at DESC)'
    ).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_miniapp_bridge_pending_expires '
      + 'ON miniapp_bridge_pending(expires_at)'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_bridge_identity ('
      + 'key TEXT PRIMARY KEY, '
      + 'value TEXT NOT NULL, '
      + 'updated_at INTEGER NOT NULL'
      + ')'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_bridge_gate ('
      + 'key TEXT PRIMARY KEY, '
      + 'next_send_at_ms INTEGER NOT NULL DEFAULT 0, '
      + 'open_until_ms INTEGER NOT NULL DEFAULT 0, '
      + 'consecutive_failures INTEGER NOT NULL DEFAULT 0, '
      + 'minute_bucket INTEGER NOT NULL DEFAULT 0, '
      + 'minute_count INTEGER NOT NULL DEFAULT 0, '
      + 'updated_at_ms INTEGER NOT NULL DEFAULT 0'
      + ')'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_bridge_metrics ('
      + 'minute INTEGER PRIMARY KEY, '
      + 'queued INTEGER NOT NULL DEFAULT 0, '
      + 'sent INTEGER NOT NULL DEFAULT 0, '
      + 'deduped INTEGER NOT NULL DEFAULT 0, '
      + 'rate_limited INTEGER NOT NULL DEFAULT 0, '
      + 'rejected INTEGER NOT NULL DEFAULT 0, '
      + 'failed INTEGER NOT NULL DEFAULT 0'
      + ')'
    ).run();
    return true;
  })().catch((error) => {
    schemaReadyPromise = null;
    throw bridgeDbError(error);
  });

  return schemaReadyPromise;
}

function bridgeDbError(error) {
  const detail = String(error?.message || error || '');
  if (/no such table:\s*miniapp_bridge_pending/i.test(detail)) {
    return new HttpError(
      500,
      'Cloudflare D1 schema is not initialized: miniapp_bridge_pending is missing',
    );
  }
  return error;
}

function bridgeToken(env) {
  const token = String(env.B2B_BOT_TOKEN || '').trim();
  if (!token) throw new HttpError(500, 'B2B_BOT_TOKEN is not configured');
  return token;
}

function bridgeChatId(env) {
  const configured = Number(env.B2B_BRIDGE_CHAT_ID || B2B_BRIDGE_CHAT_ID);
  if (!Number.isSafeInteger(configured)) throw new HttpError(500, 'B2B_BRIDGE_CHAT_ID is invalid');
  return configured;
}

function targetUsername(env) {
  const value = String(env.B2B_TARGET_BOT_USERNAME || B2B_TARGET_BOT_USERNAME)
    .trim().replace(/^@+/, '');
  if (!/^[A-Za-z0-9_]{5,32}$/.test(value)) {
    throw new HttpError(500, 'B2B_TARGET_BOT_USERNAME is invalid');
  }
  return value;
}

function requestId() {
  const uuid = crypto.randomUUID?.();
  if (uuid) return String(uuid).replaceAll('-', '').slice(0, 24);
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((v) => v.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

function safeRequestId(value) {
  const id = String(value || '').trim();
  if (!REQUEST_ID_RE.test(id)) throw new HttpError(400, 'Invalid bridge request_id');
  return id;
}

function safeUserId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(400, 'Invalid bridge user_id');
  return id;
}

function safePageId(value, required = false) {
  const id = String(value || '').trim();
  if (!id && !required) return null;
  if (!id || id.length > 64 || /\s/.test(id)) throw new HttpError(400, 'Invalid page_id');
  return id;
}

async function cleanup(db) {
  await db.prepare('DELETE FROM miniapp_bridge_pending WHERE expires_at < ?')
    .bind(now()).run();
}

async function insertPending(db, { requestId: id, userId, action, pageId = null }) {
  try {
    await ensureBridgeSchema(db);
    await cleanup(db);
    const stamp = now();
    await db.prepare(
      'INSERT INTO miniapp_bridge_pending '
      + '(request_id, user_id, action, page_id, status, created_at, expires_at) '
      + "VALUES (?, ?, ?, ?, 'pending', ?, ?)"
    ).bind(
      safeRequestId(id),
      safeUserId(userId),
      String(action),
      safePageId(pageId, false),
      stamp,
      stamp + REQUEST_TTL_SECONDS,
    ).run();
  } catch (error) {
    throw bridgeDbError(error);
  }
}

async function markQueueFailure(db, id, error) {
  try {
    await db.prepare(
      "UPDATE miniapp_bridge_pending "
      + "SET status = 'error', error_code = ?, error_message = ?, completed_at = ? "
      + 'WHERE request_id = ?'
    ).bind(
      'BRIDGE_SEND_FAILED',
      String(error?.message || error || 'Failed to send Telegram bridge request').slice(0, 800),
      now(),
      id,
    ).run();
  } catch {}
}

function transportOutcomeUncertain(error) {
  if (!(error instanceof HttpError)) return true;
  const status = Number(error.status || 0);
  return status >= 500 || status === 0;
}

function envInteger(env, name, fallback, min, max) {
  const raw = Number(env?.[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(raw)));
}

function minSendIntervalMs(env) {
  return envInteger(env, 'B2B_MIN_SEND_INTERVAL_MS', DEFAULT_MIN_SEND_INTERVAL_MS, 1000, 15000);
}

function maxQueueWaitMs(env) {
  return envInteger(env, 'B2B_MAX_QUEUE_WAIT_MS', DEFAULT_MAX_QUEUE_WAIT_MS, 1000, 60000);
}

function circuitSeconds(env) {
  return envInteger(env, 'B2B_CIRCUIT_SECONDS', DEFAULT_CIRCUIT_SECONDS, 5, 120);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

const METRIC_COLUMNS = new Set(['queued', 'sent', 'deduped', 'rate_limited', 'rejected', 'failed']);

async function bumpMetric(db, column, amount = 1) {
  if (!METRIC_COLUMNS.has(column)) return;
  const minute = Math.floor(Date.now() / 60000);
  try {
    await db.prepare(
      'INSERT INTO miniapp_bridge_metrics(minute, ' + column + ') VALUES(?, ?) '
      + 'ON CONFLICT(minute) DO UPDATE SET ' + column + ' = ' + column + ' + excluded.' + column
    ).bind(minute, Math.max(1, Number(amount) || 1)).run();
    if (minute % 60 === 0) {
      await db.prepare('DELETE FROM miniapp_bridge_metrics WHERE minute < ?')
        .bind(minute - (24 * 60)).run();
    }
  } catch (error) {
    console.warn('Could not update B2B metric', column, error);
  }
}

async function reusableBridgeRequest(db, { userId, action, pageId = null }) {
  const name = String(action || '');
  if (!new Set(['pages', 'destinations', 'page']).has(name)) return null;
  await ensureBridgeSchema(db);
  const owner = safeUserId(userId);
  const cutoff = now() - DEDUPE_WINDOW_SECONDS;

  let row;
  if (name === 'page') {
    const id = safePageId(pageId, true);
    row = await db.prepare(
      "SELECT request_id FROM miniapp_bridge_pending "
      + "WHERE user_id = ? AND action = 'page' AND page_id = ? "
      + "AND status IN ('pending','ready') AND created_at >= ? AND expires_at > ? "
      + "ORDER BY created_at DESC LIMIT 1"
    ).bind(owner, id, cutoff, now()).first();
  } else {
    row = await db.prepare(
      "SELECT request_id FROM miniapp_bridge_pending "
      + "WHERE user_id = ? AND action = ? AND status IN ('pending','ready') "
      + "AND created_at >= ? AND expires_at > ? "
      + "ORDER BY created_at DESC LIMIT 1"
    ).bind(owner, name, cutoff, now()).first();
  }
  if (!row?.request_id) return null;
  await bumpMetric(db, 'deduped');
  return String(row.request_id);
}

async function guardPageOpenBurst(db, userId, pageId) {
  if (isDeveloper(userId)) return;
  await ensureBridgeSchema(db);
  const owner = safeUserId(userId);
  const id = safePageId(pageId, true);
  const stamp = now();

  const active = await db.prepare(
    "SELECT page_id FROM miniapp_bridge_pending "
    + "WHERE user_id = ? AND action = 'page' AND status = 'pending' AND expires_at > ? "
    + "ORDER BY created_at DESC LIMIT 1"
  ).bind(owner, stamp).first();
  if (active?.page_id && String(active.page_id) !== id) {
    await bumpMetric(db, 'rejected');
    throw new HttpError(429, 'Another page-open request is already running.');
  }

  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM miniapp_bridge_pending "
    + "WHERE user_id = ? AND action = 'page' AND created_at >= ?"
  ).bind(owner, stamp - PAGE_OPEN_BURST_SECONDS).first();
  if (Number(row?.count || 0) >= PAGE_OPEN_BURST_LIMIT) {
    await bumpMetric(db, 'rejected');
    throw new HttpError(429, 'Too many page-open requests. Try again shortly.');
  }
}

export async function reserveBridgeSlot(db, env) {
  await ensureBridgeSchema(db);
  const currentMs = Date.now();
  const interval = minSendIntervalMs(env);
  const maxWait = maxQueueWaitMs(env);
  const minute = Math.floor(currentMs / 60000);
  const row = await db.prepare(
    "INSERT INTO miniapp_bridge_gate("
    + "key,next_send_at_ms,open_until_ms,consecutive_failures,minute_bucket,minute_count,updated_at_ms"
    + ") VALUES('global', ?, 0, 0, ?, 1, ?) "
    + "ON CONFLICT(key) DO UPDATE SET "
    + "next_send_at_ms = CASE "
    + "WHEN miniapp_bridge_gate.next_send_at_ms > excluded.updated_at_ms "
    + "THEN miniapp_bridge_gate.next_send_at_ms + ? "
    + "ELSE excluded.updated_at_ms + ? END, "
    + "minute_bucket = excluded.minute_bucket, "
    + "minute_count = CASE "
    + "WHEN miniapp_bridge_gate.minute_bucket = excluded.minute_bucket "
    + "THEN miniapp_bridge_gate.minute_count + 1 ELSE 1 END, "
    + "updated_at_ms = excluded.updated_at_ms "
    + "WHERE miniapp_bridge_gate.open_until_ms <= excluded.updated_at_ms "
    + "AND miniapp_bridge_gate.next_send_at_ms <= excluded.updated_at_ms + ? "
    + "RETURNING next_send_at_ms, open_until_ms, minute_bucket, minute_count"
  ).bind(
    currentMs + interval,
    minute,
    currentMs,
    interval,
    interval,
    maxWait,
  ).first();

  if (!row) {
    await bumpMetric(db, 'rejected');
    throw new HttpError(503, 'B2B bridge is busy; retry shortly');
  }

  await bumpMetric(db, 'queued');
  const sendAt = Number(row.next_send_at_ms || currentMs + interval) - interval;
  const waitMs = Math.max(0, sendAt - Date.now());
  if (waitMs > 0) await sleep(waitMs);
  return {
    waitMs,
    minuteCount: Number(row.minute_count || 0),
  };
}

async function openBridgeCircuit(db, env, seconds) {
  const currentMs = Date.now();
  const durationMs = Math.max(1000, Number(seconds || circuitSeconds(env)) * 1000);
  await ensureBridgeSchema(db);
  await db.prepare(
    "INSERT INTO miniapp_bridge_gate("
    + "key,next_send_at_ms,open_until_ms,consecutive_failures,minute_bucket,minute_count,updated_at_ms"
    + ") VALUES('global', 0, ?, 1, 0, 0, ?) "
    + "ON CONFLICT(key) DO UPDATE SET "
    + "open_until_ms = MAX(miniapp_bridge_gate.open_until_ms, excluded.open_until_ms), "
    + "consecutive_failures = miniapp_bridge_gate.consecutive_failures + 1, "
    + "updated_at_ms = excluded.updated_at_ms"
  ).bind(currentMs + durationMs, currentMs).run();
}

async function noteBridgeSuccess(db) {
  try {
    await db.prepare(
      "UPDATE miniapp_bridge_gate SET consecutive_failures = 0, open_until_ms = 0, updated_at_ms = ? WHERE key = 'global'"
    ).bind(Date.now()).run();
  } catch {}
}

async function noteBridgeFailure(db, env) {
  const currentMs = Date.now();
  const openMs = currentMs + (circuitSeconds(env) * 1000);
  try {
    await db.prepare(
      "UPDATE miniapp_bridge_gate SET "
      + "consecutive_failures = consecutive_failures + 1, "
      + "open_until_ms = CASE WHEN consecutive_failures + 1 >= 3 "
      + "THEN MAX(open_until_ms, ?) ELSE open_until_ms END, "
      + "updated_at_ms = ? WHERE key = 'global'"
    ).bind(openMs, currentMs).run();
  } catch {}
  await bumpMetric(db, 'failed');
}

function telegramError(response, data) {
  const error = new HttpError(
    Number(data?.error_code || response.status || 502),
    data?.description || ('Telegram bridge API HTTP ' + response.status),
  );
  const retryAfter = Number(data?.parameters?.retry_after || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) error.retryAfter = retryAfter;
  return error;
}

async function sendTelegramWithRetry(db, env, action, send) {
  let attempt = 0;
  while (true) {
    try {
      const result = await send();
      await noteBridgeSuccess(db);
      await bumpMetric(db, 'sent');
      return result;
    } catch (error) {
      const status = Number(error?.status || 0);
      const retryAfter = Math.max(0, Number(error?.retryAfter || 0));
      if (status === 429 && retryAfter > 0) {
        await bumpMetric(db, 'rate_limited');
        await openBridgeCircuit(db, env, retryAfter);
        if (attempt < RETRY_LIMIT) {
          attempt += 1;
          await sleep((retryAfter * 1000) + 150);
          await reserveBridgeSlot(db, env);
          continue;
        }
      }
      await noteBridgeFailure(db, env);
      throw error;
    }
  }
}

export async function bridgeHealthSnapshot(db, env) {
  await ensureBridgeSchema(db);
  const currentMs = Date.now();
  const minute = Math.floor(currentMs / 60000);
  const gate = await db.prepare(
    "SELECT next_send_at_ms, open_until_ms, consecutive_failures, minute_bucket, minute_count "
    + "FROM miniapp_bridge_gate WHERE key = 'global'"
  ).first();
  const metrics = await db.prepare(
    'SELECT queued, sent, deduped, rate_limited, rejected, failed '
    + 'FROM miniapp_bridge_metrics WHERE minute = ?'
  ).bind(minute).first();
  const interval = minSendIntervalMs(env);
  return {
    minute,
    configured_interval_ms: interval,
    configured_capacity_per_minute: Math.floor(60000 / interval),
    max_queue_wait_ms: maxQueueWaitMs(env),
    queue_delay_ms: Math.max(0, Number(gate?.next_send_at_ms || 0) - currentMs),
    circuit_open: Number(gate?.open_until_ms || 0) > currentMs,
    circuit_open_until_ms: Number(gate?.open_until_ms || 0),
    consecutive_failures: Number(gate?.consecutive_failures || 0),
    reserved_this_minute: Number(gate?.minute_bucket) === minute ? Number(gate?.minute_count || 0) : 0,
    metrics: {
      queued: Number(metrics?.queued || 0),
      sent: Number(metrics?.sent || 0),
      deduped: Number(metrics?.deduped || 0),
      rate_limited: Number(metrics?.rate_limited || 0),
      rejected: Number(metrics?.rejected || 0),
      failed: Number(metrics?.failed || 0),
    },
  };
}

async function telegramJson(env, method, payload = {}) {
  const response = await fetch(
    'https://api.telegram.org/bot' + bridgeToken(env) + '/' + method,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw telegramError(response, data);
  }
  return data.result;
}

async function telegramMultipart(env, method, form) {
  const response = await fetch(
    'https://api.telegram.org/bot' + bridgeToken(env) + '/' + method,
    { method: 'POST', body: form },
  );
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    throw telegramError(response, data);
  }
  return data.result;
}

function envelope({ id, userId, pageId = null, baseUpdatedAt = null, extra = null }) {
  const value = {
    protocol: B2B_PROTOCOL,
    request_id: safeRequestId(id),
    user_id: safeUserId(userId),
  };
  if (pageId != null) value.page_id = safePageId(pageId, true);
  if (baseUpdatedAt != null) {
    const revision = Number(baseUpdatedAt);
    if (!Number.isSafeInteger(revision) || revision <= 0) {
      throw new HttpError(400, 'Invalid base_updated_at');
    }
    value.base_updated_at = revision;
  }
  if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
    for (const [key, item] of Object.entries(extra)) {
      if (['protocol', 'request_id', 'user_id', 'page_id', 'base_updated_at'].includes(key)) continue;
      value[key] = item;
    }
  }
  return value;
}

function command(env, action) {
  const map = {
    ping: 'rcb_ping',
    pages: 'rcb_pages',
    licenses: 'rcb_licenses',
    page: 'rcb_page',
    managed_page: 'rcb_managed_page',
    create: 'rcb_create',
    save: 'rcb_save',
    delete: 'rcb_delete',
    publish: 'rcb_publish',
    user_picker: 'rcb_user_picker',
    destinations: 'rcb_destinations',
    client_error: 'rcb_err',
    full_sync: 'rcb_full_sync',
  };
  const name = map[String(action)];
  if (!name) throw new HttpError(500, 'Unknown bridge action');
  return '/' + name + '@' + targetUsername(env);
}

// Reuse the pinned RCB1 relay token and bridge-group configuration for schedule ACKs.
export async function sendScheduleBridgeAck(env, label, jobId, revision) {
  if (!['SCHEDULE_REGISTERED', 'SCHEDULE_CANCELED', 'SCHEDULE_REJECTED'].includes(label)) {
    throw new HttpError(400, 'Invalid schedule acknowledgement');
  }
  return telegramJson(env, 'sendMessage', {
    chat_id: bridgeChatId(env),
    text: '/rcb_schedule_ack@' + targetUsername(env) + '\n' + JSON.stringify({
      protocol: B2B_PROTOCOL,
      request_id: 'ack_' + String(jobId) + '_' + Number(revision),
      job_id: String(jobId), revision: Number(revision), status: label,
    }),
    disable_notification: true,
  });
}

export async function sendOneWayBridgeEvent(context, {
  action,
  userId,
  extra = null,
}) {
  const id = requestId();
  const meta = envelope({ id, userId, extra });
  const db = requireBridgeDb(context.env);
  try {
    await reserveBridgeSlot(db, context.env);
    await sendTelegramWithRetry(db, context.env, action, () => telegramJson(context.env, 'sendMessage', {
      chat_id: bridgeChatId(context.env),
      text: command(context.env, action) + '\n' + JSON.stringify(meta),
      disable_notification: true,
    }));
  } catch (error) {
    if (Number(error?.status || 0) === 503 && action === 'client_error') {
      console.warn('Dropping client error while B2B bridge is busy', id);
      return id;
    }
    if (!transportOutcomeUncertain(error)) throw error;
    console.warn('B2B one-way event outcome is uncertain', id, action);
  }
  return id;
}

export async function queueFullSyncBridgeRequest(context) {
  const db = requireBridgeDb(context.env);
  await ensureBridgeSchema(db);
  const existing = await db.prepare(
    "SELECT request_id FROM miniapp_bridge_pending "
    + "WHERE action = 'full_sync' AND status = 'pending' AND expires_at > ? "
    + "ORDER BY created_at DESC LIMIT 1"
  ).bind(now()).first();
  if (existing?.request_id) return String(existing.request_id);

  await reserveBridgeSlot(db, context.env);
  const id = requestId();
  const stamp = now();
  await db.prepare(
    'INSERT INTO miniapp_bridge_pending '
    + '(request_id,user_id,action,page_id,status,created_at,expires_at) '
    + "VALUES(?,0,'full_sync',NULL,'pending',?,?)"
  ).bind(id, stamp, stamp + REQUEST_TTL_SECONDS).run();
  const meta = {
    protocol: B2B_PROTOCOL,
    request_id: id,
  };
  try {
    await sendTelegramWithRetry(db, context.env, 'full_sync', () => telegramJson(context.env, 'sendMessage', {
      chat_id: bridgeChatId(context.env),
      text: command(context.env, 'full_sync') + '\n' + JSON.stringify(meta),
      disable_notification: true,
    }));
  } catch (error) {
    if (transportOutcomeUncertain(error)) return id;
    await markQueueFailure(db, id, error);
    throw error;
  }
  return id;
}

export async function queueTextBridgeRequest(context, {
  action,
  userId,
  pageId = null,
  baseUpdatedAt = null,
  extra = null,
}) {
  const db = requireBridgeDb(context.env);
  const reusable = await reusableBridgeRequest(db, { userId, action, pageId });
  if (reusable) return reusable;

  if (String(action) === 'page') {
    await guardPageOpenBurst(db, userId, pageId);
  }

  await reserveBridgeSlot(db, context.env);
  const id = requestId();
  const meta = envelope({ id, userId, pageId, baseUpdatedAt, extra });
  await insertPending(db, { requestId: id, userId, action, pageId });
  try {
    await sendTelegramWithRetry(db, context.env, action, () => telegramJson(context.env, 'sendMessage', {
      chat_id: bridgeChatId(context.env),
      text: command(context.env, action) + '\n' + JSON.stringify(meta),
      disable_notification: true,
    }));
  } catch (error) {
    if (transportOutcomeUncertain(error)) {
      console.warn('B2B text send outcome is uncertain; keeping request pending', id, action);
      return id;
    }
    await markQueueFailure(db, id, error);
    throw error;
  }
  return id;
}

export async function queueDocumentBridgeRequest(context, {
  action,
  userId,
  pageId = null,
  baseUpdatedAt = null,
  payload,
}) {
  const db = requireBridgeDb(context.env);
  await reserveBridgeSlot(db, context.env);
  const id = requestId();
  const meta = envelope({ id, userId, pageId, baseUpdatedAt });
  const body = {
    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    ...meta,
  };
  await insertPending(db, { requestId: id, userId, action, pageId });

  const serialized = JSON.stringify(body);
  const bytes = new TextEncoder().encode(serialized);
  if (bytes.length > 2 * 1024 * 1024) {
    await markQueueFailure(db, id, new Error('Bridge JSON document exceeds 2 MB'));
    throw new HttpError(413, 'Bridge JSON document exceeds 2 MB');
  }

  const form = new FormData();
  form.append('chat_id', String(bridgeChatId(context.env)));
  form.append('caption', command(context.env, action) + '\n' + JSON.stringify(meta));
  form.append('disable_notification', 'true');
  form.append(
    'document',
    new Blob([bytes], { type: 'application/json' }),
    action + '_' + id + '.json',
  );

  try {
    await sendTelegramWithRetry(db, context.env, action, () => telegramMultipart(context.env, 'sendDocument', form));
  } catch (error) {
    if (transportOutcomeUncertain(error)) {
      console.warn('B2B document send outcome is uncertain; keeping request pending', id, action);
      return id;
    }
    await markQueueFailure(db, id, error);
    throw error;
  }
  return id;
}

export async function bridgeRequestRow(db, id, userId) {
  await ensureBridgeSchema(db);
  const request = safeRequestId(id);
  const owner = safeUserId(userId);
  const row = await db.prepare(
    'SELECT request_id, user_id, action, page_id, status, '
    + 'response_kind, response_file_id, response_json, '
    + 'error_code, error_message, created_at, expires_at, completed_at '
    + 'FROM miniapp_bridge_pending WHERE request_id = ? AND user_id = ?'
  ).bind(request, owner).first();

  if (!row) {
    await cleanup(db);
    return null;
  }

  if (Number(row.expires_at || 0) < now()) {
    await db.prepare('DELETE FROM miniapp_bridge_pending WHERE request_id = ?')
      .bind(request).run();
    return { ...row, status: 'expired' };
  }

  await cleanup(db);
  return row;
}

export async function reactBridgeMessage(env, message, reaction = null) {
  const chatId = Number(message?.chat?.id || 0);
  const messageId = Number(message?.message_id || 0);
  if (!chatId || !messageId || !reaction) return false;
  try {
    await telegramJson(env, 'setMessageReaction', {
      chat_id: chatId,
      message_id: messageId,
      reaction: [reaction],
      is_big: false,
    });
    return true;
  } catch (error) {
    console.warn('Could not react to bridge message', reaction, error);
    return false;
  }
}

export async function reactBridgeMessageSuccess(env, message) {
  return reactBridgeMessage(env, message, {
    type: 'custom_emoji',
    custom_emoji_id: SYNC_OK_CUSTOM_EMOJI_ID,
  });
}

export async function reactBridgeMessageFailure(env, message) {
  return reactBridgeMessage(env, message, {
    type: 'emoji',
    emoji: '❌',
  });
}

function syncMentionText(text, env) {
  const developerId = Number(env?.B2B_DEVELOPER_USER_ID || 8997225441);
  const label = 'المطور';
  const output = String(text) + '\n\n' + label;
  return {
    text: output,
    entities: developerId > 0 ? [{
      type: 'text_link',
      offset: output.length - label.length,
      length: label.length,
      url: 'tg://user?id=' + developerId,
    }] : undefined,
  };
}

export async function sendBridgeSyncAck(env, payload, replyMessage = null) {
  const syncId = String(payload?.sync_id || '').trim();
  if (!syncId) return null;
  const replyId = Number(replyMessage?.message_id || 0);

  const ackText = '✅ ' + B2B_PROTOCOL + ' SYNC_OK\n'
    + 'sync_id: ' + syncId + '\n'
    + 'sync_seq: ' + String(payload?.sync_seq || payload?.baseline_seq || 0);

  return telegramJson(env, 'sendMessage', {
    chat_id: bridgeChatId(env),
    text: ackText,
    entities: [{
      type: 'custom_emoji',
      offset: 0,
      length: 1,
      custom_emoji_id: SYNC_OK_CUSTOM_EMOJI_ID,
    }],
    disable_notification: true,
    ...(replyId ? { reply_parameters: { message_id: replyId } } : {}),
  });
}

export async function sendBridgeFullSyncNotice(env, {
  alreadySynced = false,
} = {}, replyMessage = null) {
  const replyId = Number(replyMessage?.message_id || 0);
  return telegramJson(env, 'sendMessage', {
    chat_id: bridgeChatId(env),
    text: alreadySynced
      ? '✅ كلشي متزامن أصلًا.'
      : '✅ كل الصفحات تم مزامنتها.',
    disable_notification: false,
    ...(replyId ? { reply_parameters: { message_id: replyId } } : {}),
  });
}

export async function sendBridgeSyncFailure(env, error, meta = {}, replyMessage = null) {
  const body = syncMentionText(
    '❌ ' + B2B_PROTOCOL + ' SYNC_FAILED\n'
    + 'sync_id: ' + String(meta.syncId || '—') + '\n'
    + 'user_id: ' + String(meta.userId || '—') + '\n'
    + 'page_id: ' + String(meta.pageId || '—') + '\n'
    + 'code: ' + String(error?.code || 'SYNC_FAILED') + '\n'
    + 'detail: ' + String(error?.message || error || 'Unknown sync error').slice(0, 700),
    env,
  );
  const replyId = Number(replyMessage?.message_id || 0);
  return telegramJson(env, 'sendMessage', {
    chat_id: bridgeChatId(env),
    ...body,
    disable_notification: false,
    ...(replyId ? { reply_parameters: { message_id: replyId } } : {}),
  });
}

export async function downloadBridgeJson(env, fileId) {
  const file = await telegramJson(env, 'getFile', { file_id: String(fileId || '') });
  const path = String(file?.file_path || '');
  if (!path) throw new HttpError(502, 'Telegram bridge file path is unavailable');

  const response = await fetch(
    'https://api.telegram.org/file/bot' + bridgeToken(env) + '/' + path,
    { method: 'GET' },
  );
  if (!response.ok) throw new HttpError(502, 'Could not download Telegram bridge response');

  let value;
  try {
    value = await response.json();
  } catch {
    throw new HttpError(502, 'Telegram bridge response is not valid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(502, 'Telegram bridge response is invalid');
  }
  return value;
}

export async function recordBridgeWebhookResult(db, {
  requestId: id,
  status,
  responseKind = null,
  responseFileId = null,
  responseJson = null,
  errorCode = null,
  errorMessage = null,
}) {
  await ensureBridgeSchema(db);
  const request = safeRequestId(id);
  const stamp = now();
  await db.prepare(
    'UPDATE miniapp_bridge_pending SET '
    + 'status = ?, response_kind = ?, response_file_id = ?, response_json = ?, '
    + 'error_code = ?, error_message = ?, completed_at = ?, expires_at = ? '
    + "WHERE request_id = ? AND status = 'pending'"
  ).bind(
    String(status),
    responseKind == null ? null : String(responseKind),
    responseFileId == null ? null : String(responseFileId),
    responseJson == null ? null : JSON.stringify(responseJson),
    errorCode == null ? null : String(errorCode),
    errorMessage == null ? null : String(errorMessage).slice(0, 800),
    stamp,
    stamp + REQUEST_TTL_SECONDS,
    request,
  ).run();
}

export function bridgeWebhookSecretMatches(env, supplied) {
  const expected = String(env.B2B_WEBHOOK_SECRET || '');
  const actual = String(supplied || '');
  if (!expected || expected.length !== actual.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ actual.charCodeAt(i);
  }
  return mismatch === 0;
}

export function bridgeChatMatches(env, chatId) {
  return Number(chatId) === bridgeChatId(env);
}

export function bridgeMainBotMatches(env, from) {
  if (!from?.is_bot) return false;
  const expected = targetUsername(env).toLowerCase();
  const username = String(from?.username || '').replace(/^@+/, '').toLowerCase();
  if (username !== expected) return false;
  const configuredId = Number(env.B2B_MAIN_BOT_ID || 0);
  if (configuredId && Number(from?.id) !== configuredId) return false;
  return true;
}

export async function verifyAndPinMainBotIdentity(db, env, from) {
  await ensureBridgeSchema(db);
  if (!bridgeMainBotMatches(env, from)) return false;

  const incomingId = Number(from?.id);
  if (!Number.isSafeInteger(incomingId) || incomingId <= 0) return false;

  const configuredId = Number(env.B2B_MAIN_BOT_ID || 0);
  if (configuredId) return incomingId === configuredId;

  const row = await db.prepare(
    "SELECT value FROM miniapp_bridge_identity WHERE key = 'main_bot_id'"
  ).first();

  if (row?.value) return Number(row.value) === incomingId;

  await db.prepare(
    "INSERT INTO miniapp_bridge_identity(key, value, updated_at) VALUES('main_bot_id', ?, ?) "
    + "ON CONFLICT(key) DO NOTHING"
  ).bind(String(incomingId), now()).run();

  const pinned = await db.prepare(
    "SELECT value FROM miniapp_bridge_identity WHERE key = 'main_bot_id'"
  ).first();
  return Number(pinned?.value || 0) === incomingId;
}

export function bridgeTokenForSetup(env) {
  return bridgeToken(env);
}

export async function verifyRelayBotIdentity(env) {
  const me = await telegramJson(env, 'getMe');
  const username = String(me?.username || '').replace(/^@+/, '').toLowerCase();
  if (!me?.is_bot || username !== B2B_RELAY_BOT_USERNAME.toLowerCase()) {
    throw new HttpError(500, 'B2B_BOT_TOKEN does not belong to @' + B2B_RELAY_BOT_USERNAME);
  }
  return {
    id: Number(me.id),
    username: String(me.username),
  };
}

export async function sendBridgePairingPing(env) {
  const id = 'pair_' + requestId().slice(0, 18);
  const payload = {
    protocol: B2B_PROTOCOL,
    request_id: id,
  };
  await telegramJson(env, 'sendMessage', {
    chat_id: bridgeChatId(env),
    text: command(env, 'ping') + '\n' + JSON.stringify(payload),
    disable_notification: true,
  });
  return id;
}
