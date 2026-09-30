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

function envelope({ id, userId, pageId = null, baseUpdatedAt = null }) {
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
  };
  const name = map[String(action)];
  if (!name) throw new HttpError(500, 'Unknown bridge action');
  return '/' + name + '@' + targetUsername(env);
}

export async function queueTextBridgeRequest(context, {
  action,
  userId,
  pageId = null,
  baseUpdatedAt = null,
}) {
  const id = requestId();
  const meta = envelope({ id, userId, pageId, baseUpdatedAt });
  await insertPending(context.env.DB, { requestId: id, userId, action, pageId });
  try {
    await telegramJson(context.env, 'sendMessage', {
      chat_id: bridgeChatId(context.env),
      text: command(context.env, action) + '\n' + JSON.stringify(meta),
      disable_notification: true,
    });
  } catch (error) {
    await markQueueFailure(context.env.DB, id, error);
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
  await insertPending(context.env.DB, { requestId: id, userId, action, pageId });

  const form = new FormData();
  form.append('chat_id', String(bridgeChatId(context.env)));
  form.append('caption', command(context.env, action) + '\n' + JSON.stringify(meta));
  form.append('disable_notification', 'true');
  form.append(
    'document',
    new Blob([JSON.stringify(body)], { type: 'application/json' }),
    action + '_' + id + '.json',
  );

  try {
    await telegramMultipart(context.env, 'sendDocument', form);
  } catch (error) {
    await markQueueFailure(context.env.DB, id, error);
    throw error;
  }
  return id;
}

export async function bridgeRequestRow(db, id, userId) {
  await cleanup(db);
  return db.prepare(
    'SELECT request_id, user_id, action, page_id, status, '
    + 'response_kind, response_file_id, response_json, '
    + 'error_code, error_message, created_at, expires_at, completed_at '
    + 'FROM miniapp_bridge_pending WHERE request_id = ? AND user_id = ?'
  ).bind(safeRequestId(id), safeUserId(userId)).first();
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
  const request = safeRequestId(id);
  const stamp = now();
  await db.prepare(
    'UPDATE miniapp_bridge_pending SET '
    + 'status = ?, response_kind = ?, response_file_id = ?, response_json = ?, '
    + 'error_code = ?, error_message = ?, completed_at = ?, expires_at = ? '
    + 'WHERE request_id = ?'
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

export function bridgeTokenForSetup(env) {
  return bridgeToken(env);
}
