import { HttpError } from './http.js';

export const B2B_PROTOCOL = 'RCB1';
export const B2B_BRIDGE_CHAT_ID = -1003993506865;
export const B2B_TARGET_BOT_USERNAME = 'RichCustomizebot';
export const B2B_RELAY_BOT_USERNAME = 'Richminiappsbot';

const REQUEST_TTL_SECONDS = 5 * 60;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

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
    throw new HttpError(
      Number(data?.error_code || response.status || 502),
      data?.description || ('Telegram bridge API HTTP ' + response.status),
    );
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
    throw new HttpError(
      Number(data?.error_code || response.status || 502),
      data?.description || ('Telegram bridge API HTTP ' + response.status),
    );
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
    page: 'rcb_page',
    create: 'rcb_create',
    save: 'rcb_save',
    delete: 'rcb_delete',
    publish: 'rcb_publish',
    user_picker: 'rcb_user_picker',
    destinations: 'rcb_destinations',
    client_error: 'rcb_err',
  };
  const name = map[String(action)];
  if (!name) throw new HttpError(500, 'Unknown bridge action');
  return '/' + name + '@' + targetUsername(env);
}

export async function sendOneWayBridgeEvent(context, {
  action,
  userId,
  extra = null,
}) {
  const id = requestId();
  const meta = envelope({ id, userId, extra });
  try {
    await telegramJson(context.env, 'sendMessage', {
      chat_id: bridgeChatId(context.env),
      text: command(context.env, action) + '\n' + JSON.stringify(meta),
      disable_notification: true,
    });
  } catch (error) {
    if (!transportOutcomeUncertain(error)) throw error;
    console.warn('B2B one-way event outcome is uncertain', id, action);
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
  const id = requestId();
  const meta = envelope({ id, userId, pageId, baseUpdatedAt, extra });
  const db = requireBridgeDb(context.env);
  await insertPending(db, { requestId: id, userId, action, pageId });
  try {
    await telegramJson(context.env, 'sendMessage', {
      chat_id: bridgeChatId(context.env),
      text: command(context.env, action) + '\n' + JSON.stringify(meta),
      disable_notification: true,
    });
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
  const id = requestId();
  const meta = envelope({ id, userId, pageId, baseUpdatedAt });
  const body = {
    ...(payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {}),
    ...meta,
  };
  const db = requireBridgeDb(context.env);
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
    await telegramMultipart(context.env, 'sendDocument', form);
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
