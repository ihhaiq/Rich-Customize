import { api, db, InputFile } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import {
  legacyStates,
  maintenanceLocks,
  miniappBridgeRequests,
  richPages,
} from 'schema';
import { isDeveloper } from 'lib/developer-access';
import {
  MAX_SAVED_PAGES,
  validateEditorLimits,
} from 'lib/editor-blocks';
import { logError } from 'lib/error-log';
import { allowBridgeRequest } from 'lib/request-guard';

export const MINIAPP_BRIDGE_CHAT_ID = -1003993506865;
export const MINIAPP_BRIDGE_BOT_USERNAME = 'richminiappsbot';

const BRIDGE_CONFIG_NAMESPACE = 'miniapp_bridge_config';
const BRIDGE_PROTOCOL = 'RCB1';
const REQUEST_TTL_SECONDS = 15 * 60;
const CREATE_LOCK_SECONDS = 20;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const MAX_BUTTONS = 100;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

const COMMANDS = Object.freeze({
  rcb_ping: 'ping',
  rcb_pages: 'pages',
  rcb_page: 'page',
  rcb_create: 'create',
  rcb_save: 'save',
  rcb_delete: 'delete',
});

class BridgeError extends Error {
  constructor(code, message, { alert = false } = {}) {
    super(message);
    this.name = 'BridgeError';
    this.code = String(code || 'BRIDGE_ERROR');
    this.alert = Boolean(alert);
  }
}

function now() {
  return Math.floor(Date.now() / 1000);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function safeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function positiveInteger(value) {
  const parsed = safeInteger(value);
  return parsed != null && parsed > 0 ? parsed : null;
}

function commandSource(message) {
  return String(message?.text || message?.caption || '').trim();
}

function bridgeAction(message) {
  const source = commandSource(message);
  if (!source.startsWith('/')) return null;
  const token = source.split(/\s+/, 1)[0].slice(1).toLowerCase();
  const name = token.split('@', 1)[0];
  return COMMANDS[name] || null;
}

function payloadText(message) {
  const source = commandSource(message);
  const match = source.match(/^\/[^\s]+(?:\s+([\s\S]*))?$/);
  return String(match?.[1] || '').trim();
}

function parseEnvelope(message, action) {
  const raw = payloadText(message);
  if (!raw) {
    throw new BridgeError('INVALID_REQUEST', action + ' request is missing JSON metadata.', { alert: true });
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new BridgeError('INVALID_JSON', 'Request metadata is not valid JSON.', { alert: true });
  }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new BridgeError('INVALID_REQUEST', 'Request metadata must be a JSON object.', { alert: true });
  }
  return payload;
}

function requestId(value) {
  const id = String(value || '').trim();
  if (!REQUEST_ID_RE.test(id)) {
    throw new BridgeError('INVALID_REQUEST_ID', 'request_id must be 8-80 letters, digits, "_" or "-".', { alert: true });
  }
  return id;
}

function userId(value) {
  const id = positiveInteger(value);
  if (!id) throw new BridgeError('INVALID_USER_ID', 'user_id is missing or invalid.', { alert: true });
  return id;
}

function pageId(value) {
  const id = String(value || '').trim();
  if (!id || id.length > 64 || /\s/.test(id)) {
    throw new BridgeError('INVALID_PAGE_ID', 'page_id is missing or invalid.', { alert: true });
  }
  return id;
}

function bridgeUsername(message) {
  return String(message?.from?.username || '').replace(/^@+/, '').toLowerCase();
}

async function readBridgeConfig() {
  const row = await db.select({ payload: legacyStates.payload })
    .from(legacyStates)
    .where(eq(legacyStates.namespace, BRIDGE_CONFIG_NAMESPACE))
    .get();
  return row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload
    : {};
}

async function pinBridgeBot(senderId) {
  const config = await readBridgeConfig();
  const pinned = positiveInteger(config.bot_id ?? config.botId);
  if (pinned && pinned !== Number(senderId)) {
    throw new BridgeError('UNAUTHORIZED_BOT', 'Bridge bot ID does not match the pinned bot.', { alert: true });
  }
  if (pinned) return pinned;

  await db.insert(legacyStates).values({
    namespace: BRIDGE_CONFIG_NAMESPACE,
    payload: {
      bot_id: Number(senderId),
      bot_username: MINIAPP_BRIDGE_BOT_USERNAME,
      bridge_chat_id: MINIAPP_BRIDGE_CHAT_ID,
      pinned_at: now(),
    },
    updatedAt: now(),
  }).onConflictDoUpdate({
    target: legacyStates.namespace,
    set: {
      payload: {
        bot_id: Number(senderId),
        bot_username: MINIAPP_BRIDGE_BOT_USERNAME,
        bridge_chat_id: MINIAPP_BRIDGE_CHAT_ID,
        pinned_at: now(),
      },
      updatedAt: now(),
    },
  }).run();
  return Number(senderId);
}

async function authorizeBridgeMessage(message) {
  if (Number(message?.chat?.id) !== MINIAPP_BRIDGE_CHAT_ID) {
    throw new BridgeError('WRONG_BRIDGE_CHAT', 'Bridge command received outside the configured bridge group.', { alert: true });
  }
  if (!message?.from?.is_bot || bridgeUsername(message) !== MINIAPP_BRIDGE_BOT_USERNAME) {
    throw new BridgeError('UNAUTHORIZED_SENDER', 'Bridge command sender is not the configured Mini App bot.', { alert: true });
  }
  const senderId = positiveInteger(message?.from?.id);
  if (!senderId) {
    throw new BridgeError('INVALID_SENDER', 'Bridge sender has no valid Telegram ID.', { alert: true });
  }
  await pinBridgeBot(senderId);
  return senderId;
}

async function cleanupRequests() {
  await db.delete(miniappBridgeRequests)
    .where(lt(miniappBridgeRequests.expiresAt, now()))
    .run();
}

async function claimRequest(id, action, senderBotId, ownerId = null) {
  await cleanupRequests();
  const stamp = now();
  const inserted = await db.insert(miniappBridgeRequests).values({
    requestId: id,
    action,
    senderBotId: Number(senderBotId),
    userId: ownerId == null ? null : Number(ownerId),
    status: 'processing',
    result: null,
    createdAt: stamp,
    expiresAt: stamp + REQUEST_TTL_SECONDS,
  }).onConflictDoNothing({
    target: miniappBridgeRequests.requestId,
  }).returning({
    requestId: miniappBridgeRequests.requestId,
  }).run();

  if (Array.isArray(inserted) && inserted.length) return { fresh: true, row: null };

  const existing = await db.select().from(miniappBridgeRequests)
    .where(eq(miniappBridgeRequests.requestId, id))
    .get();
  if (!existing) return { fresh: true, row: null };
  if (
    String(existing.action) !== String(action)
    || Number(existing.senderBotId) !== Number(senderBotId)
    || (ownerId != null && Number(existing.userId) !== Number(ownerId))
  ) {
    throw new BridgeError('REQUEST_ID_COLLISION', 'request_id was already used for a different request.', { alert: true });
  }
  return { fresh: false, row: existing };
}

async function finishRequest(id, status, result = null) {
  await db.update(miniappBridgeRequests).set({
    status: String(status),
    result: result == null ? null : clone(result),
    expiresAt: now() + REQUEST_TTL_SECONDS,
  }).where(eq(miniappBridgeRequests.requestId, id)).run();
}

function replyParameters(message) {
  const id = positiveInteger(message?.message_id);
  return id ? { reply_parameters: { message_id: id } } : {};
}

async function sendText(message, text) {
  return api.sendMessage({
    chat_id: MINIAPP_BRIDGE_CHAT_ID,
    text: String(text),
    disable_notification: true,
    ...replyParameters(message),
  });
}

async function sendJson(message, filename, caption, payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload, null, 2));
  return api.sendDocument({
    chat_id: MINIAPP_BRIDGE_CHAT_ID,
    document: new InputFile(bytes, filename, { type: 'application/json' }),
    caption: String(caption),
    disable_notification: true,
    ...replyParameters(message),
  });
}

async function sendError(message, id, action, error) {
  const code = String(error?.code || 'INTERNAL_ERROR');
  const detail = String(error?.message || 'Unknown bridge error').slice(0, 900);
  try {
    await sendText(
      message,
      '❌ ' + BRIDGE_PROTOCOL + ' ERROR\n'
      + 'action: ' + String(action || 'unknown').toUpperCase() + '\n'
      + 'request_id: ' + String(id || '—') + '\n'
      + 'code: ' + code + '\n'
      + 'detail: ' + detail,
    );
  } catch (sendFailure) {
    await logError('miniapp_bridge.response', sendFailure, {
      userId: message?.from?.id,
      chatId: message?.chat?.id,
      extra: 'Failed to send bridge error response; action=' + String(action || 'unknown') + '; request=' + String(id || '—'),
    });
  }
}

async function logBridgeError(scope, error, message, { request = null, action = null, ownerId = null, page = null } = {}) {
  await logError(scope, error, {
    userId: ownerId ?? message?.from?.id,
    chatId: message?.chat?.id,
    extra: [
      'action=' + String(action || 'unknown'),
      'request=' + String(request || '—'),
      page ? 'page=' + String(page) : null,
      'sender_bot_id=' + String(message?.from?.id || '—'),
    ].filter(Boolean).join('; '),
  });
}

function pageForWire(row) {
  return {
    page_id: String(row.pageId),
    owner_id: Number(row.ownerId),
    title: String(row.title || row.pageId),
    blocks: clone(row.blocks || []),
    buttons: clone(row.buttons || []),
    buttons_per_row: Number(row.buttonsPerRow || 1),
    buttons_align: String(row.buttonsAlign || 'center'),
    created_at: Number(row.createdAt || 0),
    updated_at: Number(row.updatedAt || 0),
  };
}

async function getOwnedPage(ownerId, id) {
  const row = await db.select().from(richPages)
    .where(and(
      eq(richPages.pageId, String(id)),
      eq(richPages.ownerId, Number(ownerId)),
    )).get();
  return row || null;
}

function validatePageInput(payload, { requirePageId = true } = {}) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new BridgeError('INVALID_PAGE_PAYLOAD', 'Page payload must be a JSON object.', { alert: true });
  }
  const ownerId = userId(payload.user_id);
  const id = requirePageId ? pageId(payload.page_id) : null;
  const title = String(payload.title || '').trim();
  if (!title || title.length > 64) {
    throw new BridgeError('INVALID_TITLE', 'title must contain 1-64 characters.');
  }
  if (!Array.isArray(payload.blocks) || !payload.blocks.length) {
    throw new BridgeError('EMPTY_PAGE', 'blocks must contain at least one block.');
  }
  const limits = validateEditorLimits(payload.blocks);
  if (!limits.ok) {
    throw new BridgeError(
      'EDITOR_LIMIT_' + String(limits.code || 'UNKNOWN').toUpperCase(),
      'Page content exceeds editor limit ' + String(limits.code || 'unknown') + '.',
    );
  }
  const buttons = payload.buttons == null ? [] : payload.buttons;
  if (!Array.isArray(buttons) || buttons.length > MAX_BUTTONS) {
    throw new BridgeError('INVALID_BUTTONS', 'buttons must be an array with at most ' + MAX_BUTTONS + ' items.');
  }
  const buttonsPerRow = Number(payload.buttons_per_row ?? 1);
  if (!Number.isInteger(buttonsPerRow) || buttonsPerRow < 1 || buttonsPerRow > 8) {
    throw new BridgeError('INVALID_BUTTON_LAYOUT', 'buttons_per_row must be between 1 and 8.');
  }
  const buttonsAlign = String(payload.buttons_align || 'center');
  if (!['left', 'center', 'right'].includes(buttonsAlign)) {
    throw new BridgeError('INVALID_BUTTON_ALIGN', 'buttons_align must be left, center or right.');
  }
  return {
    ownerId,
    pageId: id,
    title,
    blocks: clone(payload.blocks),
    buttons: clone(buttons),
    buttonsPerRow,
    buttonsAlign,
  };
}

async function readJsonDocument(message, envelope) {
  const document = message?.document;
  if (!document?.file_id) {
    throw new BridgeError('DOCUMENT_REQUIRED', 'This action requires a JSON document.');
  }
  const announced = Number(document.file_size || 0);
  if (announced > MAX_DOCUMENT_BYTES) {
    throw new BridgeError('DOCUMENT_TOO_LARGE', 'JSON document exceeds the 2 MB bridge limit.', { alert: true });
  }

  let bytes;
  try {
    bytes = await api.getFileContent(document.file_id);
  } catch (error) {
    const wrapped = new BridgeError('DOCUMENT_DOWNLOAD_FAILED', 'Could not download the JSON document.', { alert: true });
    wrapped.cause = error;
    throw wrapped;
  }
  if (!bytes?.length || bytes.length > MAX_DOCUMENT_BYTES) {
    throw new BridgeError('DOCUMENT_TOO_LARGE', 'JSON document is empty or exceeds the 2 MB bridge limit.', { alert: true });
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new BridgeError('INVALID_DOCUMENT_JSON', 'Attached document does not contain valid JSON.', { alert: true });
  }
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new BridgeError('INVALID_DOCUMENT_JSON', 'Attached JSON must contain an object.', { alert: true });
  }

  if (String(payload.request_id || '') !== String(envelope.request_id || '')) {
    throw new BridgeError('REQUEST_MISMATCH', 'request_id in document does not match message metadata.', { alert: true });
  }
  if (Number(payload.user_id) !== Number(envelope.user_id)) {
    throw new BridgeError('USER_MISMATCH', 'user_id in document does not match message metadata.', { alert: true });
  }
  if (envelope.page_id != null && String(payload.page_id || '') !== String(envelope.page_id)) {
    throw new BridgeError('PAGE_MISMATCH', 'page_id in document does not match message metadata.', { alert: true });
  }
  return payload;
}

function makePageId() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return String(uuid).replaceAll('-', '').slice(0, 8).toLowerCase();
  return (
    Math.random().toString(16).slice(2)
    + Date.now().toString(16)
    + Math.random().toString(16).slice(2)
  ).replace(/[^0-9a-f]/gi, '').slice(0, 8).toLowerCase().padEnd(8, '0');
}

async function allocatePageId() {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = makePageId();
    const row = await db.select({ pageId: richPages.pageId }).from(richPages)
      .where(eq(richPages.pageId, id)).get();
    if (!row) return id;
  }
  throw new BridgeError('PAGE_ID_ALLOCATION_FAILED', 'Could not allocate a unique page ID.', { alert: true });
}

async function acquireCreateLock(ownerId) {
  const stamp = now();
  await db.delete(maintenanceLocks).where(lt(maintenanceLocks.expiresAt, stamp)).run();
  const name = 'miniapp:create:' + Number(ownerId);
  const expiresAt = stamp + CREATE_LOCK_SECONDS;
  const inserted = await db.insert(maintenanceLocks).values({
    name,
    expiresAt,
  }).onConflictDoNothing({
    target: maintenanceLocks.name,
  }).returning({
    name: maintenanceLocks.name,
  }).run();
  return Array.isArray(inserted) && inserted.length ? { name, expiresAt } : null;
}

async function releaseCreateLock(lock) {
  if (!lock?.name) return;
  await db.delete(maintenanceLocks).where(and(
    eq(maintenanceLocks.name, String(lock.name)),
    eq(maintenanceLocks.expiresAt, Number(lock.expiresAt)),
  )).run();
}

async function handlePing(message, id, senderBotId) {
  const result = {
    protocol: BRIDGE_PROTOCOL,
    request_id: id,
    action: 'ping',
    status: 'ok',
    bridge_bot_id: Number(senderBotId),
    bridge_chat_id: MINIAPP_BRIDGE_CHAT_ID,
    server_time: now(),
  };
  await sendText(
    message,
    '✅ ' + BRIDGE_PROTOCOL + ' PONG\n'
    + 'request_id: ' + id + '\n'
    + 'bridge_bot_id: ' + senderBotId,
  );
  return result;
}

async function handlePages(message, id, ownerId) {
  const rows = await db.select().from(richPages)
    .where(eq(richPages.ownerId, Number(ownerId))).all();
  rows.sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0)
    || String(a.pageId).localeCompare(String(b.pageId)));
  const payload = {
    protocol: BRIDGE_PROTOCOL,
    request_id: id,
    action: 'pages',
    user_id: Number(ownerId),
    pages: rows.map((row) => ({
      page_id: String(row.pageId),
      title: String(row.title || row.pageId),
      created_at: Number(row.createdAt || 0),
      updated_at: Number(row.updatedAt || 0),
    })),
  };
  await sendJson(
    message,
    'pages_' + id + '.json',
    '✅ ' + BRIDGE_PROTOCOL + ' GET_PAGES_OK\nrequest_id: ' + id + '\nuser_id: ' + ownerId + '\npages: ' + payload.pages.length,
    payload,
  );
  return { status: 'ok', page_count: payload.pages.length };
}

async function handlePage(message, id, ownerId, idValue) {
  const row = await getOwnedPage(ownerId, idValue);
  if (!row) throw new BridgeError('PAGE_NOT_FOUND', 'Page does not exist or does not belong to this user.');
  const payload = {
    protocol: BRIDGE_PROTOCOL,
    request_id: id,
    action: 'page',
    ...pageForWire(row),
  };
  await sendJson(
    message,
    'page_' + idValue + '_' + id + '.json',
    '✅ ' + BRIDGE_PROTOCOL + ' GET_PAGE_OK\nrequest_id: ' + id + '\nuser_id: ' + ownerId + '\npage_id: ' + idValue,
    payload,
  );
  return { status: 'ok', page_id: idValue, updated_at: Number(row.updatedAt || 0) };
}

async function handleCreate(message, id, envelope) {
  const documentPayload = await readJsonDocument(message, envelope);
  const input = validatePageInput(documentPayload, { requirePageId: false });
  const lock = await acquireCreateLock(input.ownerId);
  if (!lock) throw new BridgeError('PAGE_BUSY', 'Another page creation is already in progress. Retry with a new request_id.');

  try {
    if (!isDeveloper(input.ownerId)) {
      const count = await db.$count(richPages, eq(richPages.ownerId, Number(input.ownerId)));
      if (count >= MAX_SAVED_PAGES) {
        throw new BridgeError('PAGE_LIMIT', 'Saved page limit reached: ' + MAX_SAVED_PAGES + '.');
      }
    }
    const idValue = await allocatePageId();
    const stamp = now();
    await db.insert(richPages).values({
      pageId: idValue,
      ownerId: Number(input.ownerId),
      title: input.title,
      blocks: input.blocks,
      buttons: input.buttons,
      buttonsPerRow: input.buttonsPerRow,
      buttonsAlign: input.buttonsAlign,
      createdAt: stamp,
      updatedAt: stamp,
    }).run();
    const result = { status: 'created', page_id: idValue, updated_at: stamp };
    await sendText(
      message,
      '✅ ' + BRIDGE_PROTOCOL + ' CREATE_PAGE_OK\n'
      + 'request_id: ' + id + '\n'
      + 'user_id: ' + input.ownerId + '\n'
      + 'page_id: ' + idValue + '\n'
      + 'updated_at: ' + stamp,
    );
    return result;
  } finally {
    await releaseCreateLock(lock);
  }
}

async function handleSave(message, id, envelope) {
  const documentPayload = await readJsonDocument(message, envelope);
  const input = validatePageInput(documentPayload);
  const baseUpdatedAt = positiveInteger(documentPayload.base_updated_at);
  if (!baseUpdatedAt) {
    throw new BridgeError('BASE_REVISION_REQUIRED', 'base_updated_at is required for SAVE_PAGE.');
  }

  const existing = await getOwnedPage(input.ownerId, input.pageId);
  if (!existing) throw new BridgeError('PAGE_NOT_FOUND', 'Page does not exist or does not belong to this user.');
  if (Number(existing.updatedAt) !== Number(baseUpdatedAt)) {
    throw new BridgeError('PAGE_CONFLICT', 'Page was changed after the Mini App loaded it. Reload the latest version.');
  }

  const stamp = Math.max(now(), Number(baseUpdatedAt) + 1);
  const updated = await db.update(richPages).set({
    title: input.title,
    blocks: input.blocks,
    buttons: input.buttons,
    buttonsPerRow: input.buttonsPerRow,
    buttonsAlign: input.buttonsAlign,
    updatedAt: stamp,
  }).where(and(
    eq(richPages.pageId, input.pageId),
    eq(richPages.ownerId, Number(input.ownerId)),
    eq(richPages.updatedAt, Number(baseUpdatedAt)),
  )).returning({
    pageId: richPages.pageId,
  }).run();

  if (!Array.isArray(updated) || !updated.length) {
    throw new BridgeError('PAGE_CONFLICT', 'Page changed while SAVE_PAGE was being applied. Reload the latest version.');
  }

  const result = { status: 'saved', page_id: input.pageId, updated_at: stamp };
  await sendText(
    message,
    '✅ ' + BRIDGE_PROTOCOL + ' SAVE_PAGE_OK\n'
    + 'request_id: ' + id + '\n'
    + 'user_id: ' + input.ownerId + '\n'
    + 'page_id: ' + input.pageId + '\n'
    + 'updated_at: ' + stamp,
  );
  return result;
}

async function handleDelete(message, id, ownerId, idValue, envelope) {
  const existing = await getOwnedPage(ownerId, idValue);
  if (!existing) throw new BridgeError('PAGE_NOT_FOUND', 'Page does not exist or does not belong to this user.');
  const baseRaw = envelope.base_updated_at;
  const baseUpdatedAt = baseRaw == null ? null : positiveInteger(baseRaw);
  if (baseRaw != null && !baseUpdatedAt) {
    throw new BridgeError('INVALID_BASE_REVISION', 'base_updated_at is invalid.');
  }
  if (baseUpdatedAt && Number(existing.updatedAt) !== Number(baseUpdatedAt)) {
    throw new BridgeError('PAGE_CONFLICT', 'Page changed after the Mini App loaded it. Reload before deleting.');
  }

  const conditions = [
    eq(richPages.pageId, idValue),
    eq(richPages.ownerId, Number(ownerId)),
  ];
  if (baseUpdatedAt) conditions.push(eq(richPages.updatedAt, Number(baseUpdatedAt)));

  const removed = await db.delete(richPages).where(and(...conditions)).returning({
    pageId: richPages.pageId,
  }).run();
  if (!Array.isArray(removed) || !removed.length) {
    throw new BridgeError('PAGE_CONFLICT', 'Page changed while DELETE_PAGE was being applied.');
  }

  const result = { status: 'deleted', page_id: idValue };
  await sendText(
    message,
    '✅ ' + BRIDGE_PROTOCOL + ' DELETE_PAGE_OK\n'
    + 'request_id: ' + id + '\n'
    + 'user_id: ' + ownerId + '\n'
    + 'page_id: ' + idValue,
  );
  return result;
}

async function replayCompletedMutation(message, id, action, result) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  const label = {
    create: 'CREATE_PAGE_OK',
    save: 'SAVE_PAGE_OK',
    delete: 'DELETE_PAGE_OK',
  }[action];
  if (!label) return false;

  const lines = [
    '✅ ' + BRIDGE_PROTOCOL + ' ' + label + ' (REPLAY)',
    'request_id: ' + id,
  ];
  if (result.page_id) lines.push('page_id: ' + result.page_id);
  if (result.updated_at) lines.push('updated_at: ' + result.updated_at);
  await sendText(message, lines.join('\n'));
  return true;
}

export async function handleMiniAppBridgeMessage(message, context = {}) {
  const action = bridgeAction(message);
  if (!action) return false;

  let id = null;
  let ownerId = null;
  let idValue = null;
  let claimed = false;

  try {
    const senderBotId = await authorizeBridgeMessage(message);
    const allowed = await allowBridgeRequest(senderBotId, action);
    if (!allowed) {
      throw new BridgeError('RATE_LIMITED', 'Bridge rate limit exceeded. Retry shortly.', { alert: true });
    }

    const envelope = parseEnvelope(message, action);
    id = requestId(envelope.request_id);
    ownerId = action === 'ping' ? null : userId(envelope.user_id);
    idValue = ['page', 'save', 'delete'].includes(action) ? pageId(envelope.page_id) : null;

    const claim = await claimRequest(id, action, senderBotId, ownerId);
    if (!claim.fresh) {
      if (
        claim.row?.status === 'completed'
        && ['create', 'save', 'delete'].includes(action)
        && await replayCompletedMutation(message, id, action, claim.row.result)
      ) {
        return true;
      }
      throw new BridgeError(
        claim.row?.status === 'processing' ? 'REQUEST_IN_PROGRESS' : 'DUPLICATE_REQUEST',
        'This request_id was already processed. Use a new request_id for read requests.',
      );
    }
    claimed = true;

    let result;
    if (action === 'ping') result = await handlePing(message, id, senderBotId);
    else if (action === 'pages') result = await handlePages(message, id, ownerId);
    else if (action === 'page') result = await handlePage(message, id, ownerId, idValue);
    else if (action === 'create') result = await handleCreate(message, id, envelope);
    else if (action === 'save') result = await handleSave(message, id, envelope);
    else if (action === 'delete') result = await handleDelete(message, id, ownerId, idValue, envelope);
    else throw new BridgeError('UNKNOWN_ACTION', 'Unsupported bridge action.', { alert: true });

    await finishRequest(id, 'completed', result);
    return true;
  } catch (error) {
    if (claimed && id) {
      try {
        await finishRequest(id, 'failed', {
          code: String(error?.code || 'INTERNAL_ERROR'),
        });
      } catch (stateError) {
        await logBridgeError('miniapp_bridge.state', stateError, message, {
          request: id,
          action,
          ownerId,
          page: idValue,
        });
      }
    }

    if (error?.alert || !(error instanceof BridgeError)) {
      await logBridgeError(
        error?.code === 'RATE_LIMITED' ? 'miniapp_bridge.rate_limit'
          : error?.code?.startsWith('UNAUTHORIZED') || error?.code === 'WRONG_BRIDGE_CHAT'
            ? 'miniapp_bridge.unauthorized'
            : 'miniapp_bridge.request',
        error?.cause || error,
        message,
        {
          request: id,
          action,
          ownerId,
          page: idValue,
        },
      );
    }

    await sendError(message, id, action, error);
    return true;
  }
}
