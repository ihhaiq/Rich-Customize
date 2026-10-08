import { managedPage } from 'lib/managed-pages';
import { listManagedBotLicensesForBridge } from 'lib/managed-bot-billing';
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
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { safePlanLimit } from 'lib/subscription-policy';
import { archivePreviousPageVersion } from 'lib/page-version-history';
import { allowBridgeRequest } from 'lib/request-guard';
import { validateStoredButtons } from 'lib/button-validation';
import {
  listMiniAppDestinations,
  publishPageContentFromBridge,
  publishSavedPageFromBridge,
} from 'lib/publish';
import { prepareMiniAppUserPicker } from 'lib/miniapp-user-picker';
import {
  acknowledgeMiniAppSync,
  buildPageDeleteSync,
  buildPageUpsertSync,
  flushMiniAppSyncOutbox,
  nextPageSyncVersion,
  reactMiniAppSyncSuccess,
  retryMiniAppSync,
  sendMiniAppFullSnapshot,
} from 'lib/miniapp-sync';
import { DEVELOPER_IDS } from 'lib/developer-access';

export const MINIAPP_BRIDGE_CHAT_ID = -1003993506865;
export const MINIAPP_BRIDGE_BOT_USERNAME = 'richminiappsbot';
export const MINIAPP_BRIDGE_TARGET_USERNAME = 'richcustomizebot';

const BRIDGE_CONFIG_NAMESPACE = 'miniapp_bridge_config';
const BRIDGE_PROTOCOL = 'RCB1';
const REQUEST_TTL_SECONDS = 15 * 60;
const PROCESSING_STALE_SECONDS = 45;
const CREATE_LOCK_SECONDS = 20;
const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,80}$/;

const COMMANDS = Object.freeze({
  rcb_ping: 'ping',
  rcb_full_sync: 'full_sync',
  rcb_pages: 'pages',
  rcb_licenses: 'licenses',
  rcb_page: 'page',
  rcb_managed_page: 'managed_page',
  rcb_create: 'create',
  rcb_save: 'save',
  rcb_delete: 'delete',
  rcb_publish: 'publish',
  rcb_user_picker: 'user_picker',
  rcb_destinations: 'destinations',
  rcb_err: 'client_error',
  rcb_client_error: 'client_error',
});

class BridgeError extends Error {
  constructor(code, message, { alert = false } = {}) {
    super(message);
    this.name = 'BridgeError';
    this.code = String(code || 'BRIDGE_ERROR');
    this.alert = Boolean(alert);
  }
}

const EXPECTED_PUBLISH_ERROR_CODES = new Set([
  'PUBLISH_CHAT_UNAVAILABLE',
  'PUBLISH_CHAT_MIGRATED',
  'PUBLISH_PRIVATE_UNAVAILABLE',
  'PUBLISH_BOT_BLOCKED',
  'PUBLISH_RIGHTS_MISSING',
  'PUBLISH_RATE_LIMITED',
  'PUBLISH_CONTENT_TOO_LARGE',
  'PUBLISH_MEDIA_INVALID',
  'PUBLISH_BUTTON_INVALID',
  'PUBLISH_CONTENT_INVALID',
  'PUBLISH_FORBIDDEN',
  'EMPTY_PAGE',
  'PAGE_NOT_FOUND',
]);

function isExpectedPublishErrorCode(code) {
  return EXPECTED_PUBLISH_ERROR_CODES.has(String(code || ''));
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
  const parts = token.split('@');
  const name = parts[0];
  const action = COMMANDS[name] || null;
  if (!action) return null;
  const target = parts.length === 2 ? parts[1] : '';
  if (target !== MINIAPP_BRIDGE_TARGET_USERNAME) return '__wrong_target__';
  return action;
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
  if (String(payload.protocol || '') !== BRIDGE_PROTOCOL) {
    throw new BridgeError('PROTOCOL_MISMATCH', 'Unsupported bridge protocol.', { alert: true });
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

function syncControl(message) {
  const source = commandSource(message);
  if (/^✅\s*RCB1\s+SYNC_OK\b/i.test(source)) return 'ok';
  if (/^❌\s*RCB1\s+SYNC_FAILED\b/i.test(source)) return 'failed';
  return null;
}

function controlFields(source) {
  const out = {};
  for (const line of String(source || '').split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

async function handleSyncControl(message) {
  const kind = syncControl(message);
  if (!kind || !isBridgeOrigin(message)) return false;
  await authorizeBridgeMessage(message, 'sync_ack');
  const parsed = controlFields(commandSource(message));
  const id = String(parsed.sync_id || '').trim();
  if (!id) return true;
  if (kind === 'ok') {
    await acknowledgeMiniAppSync(id);
    try {
      await api.deleteMessage({
        chat_id: message?.chat?.id,
        message_id: message?.message_id,
      });
    } catch {}
  } else {
    await retryMiniAppSync(id);
  }
  try {
    await flushMiniAppSyncOutbox({ limit: 1 });
  } catch {}
  return true;
}

function isBridgeOrigin(message) {
  return (
    Number(message?.chat?.id) === MINIAPP_BRIDGE_CHAT_ID
    && Boolean(message?.from?.is_bot)
    && bridgeUsername(message) === MINIAPP_BRIDGE_BOT_USERNAME
  );
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

async function pinBridgeBot(senderId, action) {
  const config = await readBridgeConfig();
  const pinned = positiveInteger(config.bot_id ?? config.botId);
  if (pinned && pinned !== Number(senderId)) {
    throw new BridgeError('UNAUTHORIZED_BOT', 'Bridge bot ID does not match the pinned bot.', { alert: true });
  }
  if (pinned) return pinned;

  // The exact bridge chat, Telegram bot flag and relay username are validated
  // before this function is called. PING remains the normal bootstrap path,
  // but after a Serverless state reset the first valid RCB1 request may safely
  // restore the numeric pin instead of failing every Mini App request.
  await db.insert(legacyStates).values({
    namespace: BRIDGE_CONFIG_NAMESPACE,
    payload: {
      bot_id: Number(senderId),
      bot_username: MINIAPP_BRIDGE_BOT_USERNAME,
      bridge_chat_id: MINIAPP_BRIDGE_CHAT_ID,
      paired_via: String(action || 'unknown'),
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

async function authorizeBridgeMessage(message, action) {
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
  await pinBridgeBot(senderId, action);
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

  if (
    String(existing.status) === 'processing'
    && !new Set(['publish', 'user_picker', 'client_error']).has(String(action))
    && stamp - Number(existing.createdAt || 0) >= PROCESSING_STALE_SECONDS
  ) {
    await db.update(miniappBridgeRequests).set({
      createdAt: stamp,
      expiresAt: stamp + REQUEST_TTL_SECONDS,
    }).where(eq(miniappBridgeRequests.requestId, id)).run();
    return { fresh: true, row: existing, retry: true };
  }

  return { fresh: false, row: existing, retry: false };
}

async function finishRequest(id, status, result = null) {
  await db.update(miniappBridgeRequests).set({
    status: String(status),
    result: result == null ? null : clone(result),
    expiresAt: now() + REQUEST_TTL_SECONDS,
  }).where(eq(miniappBridgeRequests.requestId, id)).run();
}

function replyParameters(message) {
  if (Number(message?.chat?.id) !== MINIAPP_BRIDGE_CHAT_ID) return {};
  const id = positiveInteger(message?.message_id);
  return id ? { reply_parameters: { message_id: id } } : {};
}

async function sendText(message, text, extra = {}) {
  return api.sendMessage({
    chat_id: MINIAPP_BRIDGE_CHAT_ID,
    text: String(text),
    disable_notification: true,
    ...replyParameters(message),
    ...extra,
  });
}

async function sendJson(message, filename, caption, payload) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new BridgeError('RESPONSE_TOO_LARGE', 'Bridge JSON response exceeds the 2 MB limit.', { alert: true });
  }
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
    const label = 'المطور';
    const notifyDeveloper = Boolean(error?.alert);
    const syncFailure = String(action || '') === 'full_sync'
      || (Boolean(message?.document?.file_id)
        && ['create', 'save', 'delete'].includes(String(action || '')));
    const text = '❌ ' + BRIDGE_PROTOCOL + (syncFailure ? ' SYNC_FAILED' : ' ERROR') + '\n'
      + 'action: ' + String(action || 'unknown').toUpperCase() + '\n'
      + 'request_id: ' + String(id || '—') + '\n'
      + 'code: ' + code + '\n'
      + 'detail: ' + detail
      + (notifyDeveloper ? '\n\n' + label : '');
    const developerId = notifyDeveloper ? Number(DEVELOPER_IDS?.[0] || 0) : 0;
    await sendText(
      message,
      text,
      developerId ? {
        entities: [{
          type: 'text_link',
          offset: text.length - label.length,
          length: label.length,
          url: 'tg://user?id=' + developerId,
        }],
      } : {},
    );
  } catch (sendFailure) {
    await logError('miniapp_bridge.response', sendFailure, {
      userId: message?.from?.id,
      chatId: message?.chat?.id,
      extra: 'Failed to send bridge error response; action=' + String(action || 'unknown') + '; request=' + String(id || '—'),
    });
  }
}

async function logBridgeError(
  scope,
  error,
  message,
  { request = null, action = null, ownerId = null, page = null, updateId = null } = {},
) {
  await logError(scope, error, {
    updateId,
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
    revision: Math.max(1, Number(row.revision || 1)),
    sync_seq: Math.max(0, Number(row.syncSeq || 0)),
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

async function validateButtonPageTargets(ownerId, buttons) {
  const ids = [...new Set(
    (Array.isArray(buttons) ? buttons : [])
      .filter((button) => String(button?.type || '') === 'page')
      .map((button) => String(button?.value ?? button?.url ?? '').trim())
      .filter(Boolean),
  )];

  for (const id of ids) {
    const page = await getOwnedPage(ownerId, id);
    if (!page) {
      throw new BridgeError(
        'INVALID_BUTTON_PAGE_TARGET',
        'Page button target does not exist or does not belong to this user: ' + id,
      );
    }
  }
}

async function validatePageInput(payload, { requirePageId = true, previousBlocks = null, skipQuota = false } = {}) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new BridgeError('INVALID_PAGE_PAYLOAD', 'Page payload must be a JSON object.', { alert: true });
  }
  const ownerId = userId(payload.user_id);
  const id = requirePageId ? pageId(payload.page_id) : null;
  const title = String(payload.title || '').trim();
  if (!title || title.length > 64) {
    throw new BridgeError('INVALID_TITLE', 'title must contain 1-64 characters.');
  }
  if (
    !Array.isArray(payload.blocks)
    || !payload.blocks.length
    || payload.blocks.some((block) => !block || typeof block !== 'object' || Array.isArray(block))
  ) {
    throw new BridgeError('EMPTY_PAGE', 'blocks must contain at least one valid block object.');
  }
  const limits = skipQuota ? { ok:true } : validateEditorLimits(payload.blocks, ownerId, {
    previousBlocks, entitlement:await getEditorEntitlement(ownerId),
  });
  if (!limits.ok) {
    throw new BridgeError(
      'EDITOR_LIMIT_' + String(limits.code || 'UNKNOWN').toUpperCase(),
      'Page content exceeds editor limit ' + String(limits.code || 'unknown') + '.',
    );
  }
  const buttons = payload.buttons == null ? [] : payload.buttons;
  const buttonValidation = validateStoredButtons(buttons);
  if (!buttonValidation.ok) {
    throw new BridgeError(
      'INVALID_BUTTONS',
      'Invalid stored button at index '
        + String(buttonValidation.index ?? 'n/a')
        + ': '
        + String(buttonValidation.code || 'unknown') + '.',
    );
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

  if (String(payload.protocol || '') !== BRIDGE_PROTOCOL) {
    throw new BridgeError('PROTOCOL_MISMATCH', 'Attached document uses an unsupported bridge protocol.', { alert: true });
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

function pageIdForRequest(request) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (const byte of new TextEncoder().encode(String(request || ''))) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * prime);
  }
  return 'm' + hash.toString(16).padStart(16, '0').slice(0, 15);
}

function samePageContent(row, input) {
  if (!row) return false;
  return (
    String(row.title || '') === String(input.title || '')
    && JSON.stringify(row.blocks || []) === JSON.stringify(input.blocks || [])
    && JSON.stringify(row.buttons || []) === JSON.stringify(input.buttons || [])
    && Number(row.buttonsPerRow || 1) === Number(input.buttonsPerRow || 1)
    && String(row.buttonsAlign || 'center') === String(input.buttonsAlign || 'center')
  );
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
      block_count: Array.isArray(row.blocks) ? row.blocks.length : 0,
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
    user_id: Number(ownerId),
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
  const input = await validatePageInput(documentPayload, { requirePageId: false });
  await validateButtonPageTargets(input.ownerId, input.buttons);
  const lock = await acquireCreateLock(input.ownerId);
  if (!lock) throw new BridgeError('PAGE_BUSY', 'Another page creation is already in progress. Retry shortly.');

  try {
    const idValue = pageIdForRequest(id);
    const existing = await getOwnedPage(input.ownerId, idValue);
    if (existing) {
      if (!samePageContent(existing, input)) {
        throw new BridgeError('PAGE_ID_COLLISION', 'Deterministic bridge page ID collision detected.', { alert: true });
      }
      return {
        status: 'created',
        user_id: input.ownerId,
        page_id: idValue,
        updated_at: Number(existing.updatedAt || 0),
      };
    }

    const foreign = await db.select({ ownerId: richPages.ownerId }).from(richPages)
      .where(eq(richPages.pageId, idValue)).get();
    if (foreign) {
      throw new BridgeError('PAGE_ID_COLLISION', 'Deterministic bridge page ID is already in use.', { alert: true });
    }

    const allowedPages=safePlanLimit(await getEditorEntitlement(input.ownerId),'pages');
    if (allowedPages != null) {
      const count = await db.$count(richPages, eq(richPages.ownerId, Number(input.ownerId)));
      if (count >= allowedPages) {
        throw new BridgeError('PAGE_LIMIT', 'Saved page limit reached: ' + allowedPages + '.');
      }
    }

    const stamp = now();
    const version = await nextPageSyncVersion(0);
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
      revision: version.revision,
      syncSeq: version.syncSeq,
    }).run();
    const created = await getOwnedPage(input.ownerId, idValue);
    return {
      status: 'created',
      user_id: input.ownerId,
      page_id: idValue,
      updated_at: stamp,
      revision: version.revision,
      sync_seq: version.syncSeq,
      sync_event: buildPageUpsertSync(created, id),
    };
  } finally {
    await releaseCreateLock(lock);
  }
}

async function handleSave(message, id, envelope) {
  const documentPayload = await readJsonDocument(message, envelope);
  const input = await validatePageInput(documentPayload, { skipQuota: true });
  await validateButtonPageTargets(input.ownerId, input.buttons);
  const baseRevision = positiveInteger(documentPayload.base_revision);
  const baseUpdatedAt = positiveInteger(documentPayload.base_updated_at);
  if (!baseRevision && !baseUpdatedAt) {
    throw new BridgeError('BASE_REVISION_REQUIRED', 'base_revision is required for SAVE_PAGE.');
  }

  const existing = await getOwnedPage(input.ownerId, input.pageId);
  if (!existing) throw new BridgeError('PAGE_NOT_FOUND', 'Page does not exist or does not belong to this user.');
  const revisionMatches = baseRevision
    ? Number(existing.revision || 1) === Number(baseRevision)
    : Number(existing.updatedAt) === Number(baseUpdatedAt);
  if (!revisionMatches) {
    if (samePageContent(existing, input)) {
      return {
        status: 'saved',
        user_id: input.ownerId,
        page_id: input.pageId,
        updated_at: Number(existing.updatedAt),
        revision: Number(existing.revision || 1),
        sync_seq: Number(existing.syncSeq || 0),
        sync_event: buildPageUpsertSync(existing, id),
      };
    }
    throw new BridgeError('PAGE_CONFLICT', 'Page was changed after the Mini App loaded it. Reload the latest version.');
  }

  await validatePageInput(documentPayload, { previousBlocks: existing.blocks || [] });
  const stamp = Math.max(now(), Number(existing.updatedAt || 0) + 1);
  const version = await nextPageSyncVersion(existing.revision || 1);
  const updated = await db.update(richPages).set({
    title: input.title,
    blocks: input.blocks,
    buttons: input.buttons,
    buttonsPerRow: input.buttonsPerRow,
    buttonsAlign: input.buttonsAlign,
    updatedAt: stamp,
    revision: version.revision,
    syncSeq: version.syncSeq,
  }).where(and(
    eq(richPages.pageId, input.pageId),
    eq(richPages.ownerId, Number(input.ownerId)),
    eq(richPages.revision, Number(existing.revision || 1)),
  )).returning({
    pageId: richPages.pageId,
  }).run();

  if (!Array.isArray(updated) || !updated.length) {
    throw new BridgeError('PAGE_CONFLICT', 'Page changed while SAVE_PAGE was being applied. Reload the latest version.');
  }
  const saved = await getOwnedPage(input.ownerId, input.pageId);
  if (saved) {
    try { await archivePreviousPageVersion(input.ownerId, existing, saved); }
    catch (error) { await logError('page_history.miniapp_save', error, { userId:input.ownerId }); }
  }
  return {
    status: 'saved',
    user_id: input.ownerId,
    page_id: input.pageId,
    updated_at: stamp,
    revision: version.revision,
    sync_seq: version.syncSeq,
    sync_event: buildPageUpsertSync(saved, id),
  };
}

async function handleDestinations(message, id, ownerId) {
  const destinations = await listMiniAppDestinations(ownerId);
  const payload = {
    protocol: BRIDGE_PROTOCOL,
    request_id: id,
    action: 'destinations',
    user_id: Number(ownerId),
    destinations,
  };
  await sendJson(
    message,
    'destinations_' + id + '.json',
    '✅ ' + BRIDGE_PROTOCOL + ' GET_DESTINATIONS_OK\n'
      + 'request_id: ' + id + '\n'
      + 'user_id: ' + ownerId + '\n'
      + 'destinations: ' + destinations.length,
    payload,
  );
  return { status: 'ok', destination_count: destinations.length };
}

async function handleUserPicker(message, id, ownerId, idValue, envelope) {
  const blockId = String(envelope.block_id || '').trim();
  if (!blockId || blockId.length > 128) {
    throw new BridgeError('INVALID_BLOCK_ID', 'block_id is missing or invalid.');
  }
  const marker = envelope.marker == null ? null : String(envelope.marker);
  try {
    return await prepareMiniAppUserPicker({
      ownerId,
      pageId: idValue,
      blockId,
      marker,
    });
  } catch (error) {
    const wrapped = new BridgeError(
      String(error?.code || 'USER_PICKER_FAILED'),
      String(error?.message || 'Could not prepare user picker.'),
      { alert: true },
    );
    wrapped.cause = error;
    throw wrapped;
  }
}

function reportField(value, limit) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
}

async function handleClientError(message, id, ownerId, envelope) {
  const source = reportField(envelope.source || 'miniapp', 120);
  const detail = reportField(envelope.message, 900);
  if (!detail) {
    throw new BridgeError('INVALID_CLIENT_ERROR', 'Client error report is missing a message.');
  }

  const stack = reportField(envelope.stack, 700);
  const path = reportField(envelope.path, 240);
  const code = reportField(envelope.code, 120);
  const contextText = reportField(envelope.context, 300);

  const reported = new Error(detail + (stack ? ' | ' + stack : ''));
  reported.name = 'MiniAppClientError';
  if (code) reported.code = code;

  await logError('miniapp.client', reported, {
    userId: Number(ownerId),
    extra: [
      'source=' + source,
      path ? 'path=' + path : null,
      contextText ? 'context=' + contextText : null,
      'request=' + id,
    ].filter(Boolean).join('; '),
  });

  return {
    status: 'reported',
    user_id: Number(ownerId),
  };
}

async function handlePublish(message, id, ownerId, idValue, envelope) {
  let directInput = null;
  let destination = envelope;

  if (message?.document?.file_id) {
    const documentPayload = await readJsonDocument(message, envelope);
    directInput = await validatePageInput(documentPayload, { requirePageId: false });
    await validateButtonPageTargets(directInput.ownerId, directInput.buttons);
    destination = documentPayload;
  }

  const kind = String(destination.kind || 'private');
  const chatId = kind === 'chat' ? safeInteger(destination.chat_id) : null;
  if (kind === 'chat' && !chatId) {
    throw new BridgeError('INVALID_CHAT_ID', 'chat_id is missing or invalid.');
  }
  if (!['private', 'chat'].includes(kind)) {
    throw new BridgeError('INVALID_DESTINATION', 'Unsupported publish destination.');
  }

  try {
    const result = directInput
      ? await publishPageContentFromBridge({
          ownerId: directInput.ownerId,
          blocks: directInput.blocks,
          buttons: directInput.buttons,
          buttonsPerRow: directInput.buttonsPerRow,
          kind,
          chatId,
        })
      : await publishSavedPageFromBridge({
          ownerId,
          pageId: idValue,
          kind,
          chatId,
        });

    return {
      status: 'published',
      user_id: ownerId,
      page_id: directInput ? null : idValue,
      chat_id: result.chat_id,
      message_id: result.message_id,
    };
  } catch (error) {
    const code = String(error?.code || 'PUBLISH_FAILED');
    const wrapped = new BridgeError(
      code,
      String(error?.message || 'Publishing failed.'),
      { alert: !isExpectedPublishErrorCode(code) },
    );
    wrapped.cause = error;
    if (error?.retry_after != null) wrapped.retry_after = Number(error.retry_after) || null;
    throw wrapped;
  }
}

async function handleDelete(message, id, ownerId, idValue, envelope, retry = false) {
  let documentPayload = null;
  if (message?.document?.file_id) {
    documentPayload = await readJsonDocument(message, envelope);
  }
  const baseRevision = positiveInteger(documentPayload?.base_revision ?? envelope.base_revision);
  const baseUpdatedAt = positiveInteger(documentPayload?.base_updated_at ?? envelope.base_updated_at);
  if (!baseRevision && !baseUpdatedAt) {
    throw new BridgeError('BASE_REVISION_REQUIRED', 'base_revision is required for DELETE_PAGE.');
  }

  const existing = await getOwnedPage(ownerId, idValue);
  if (!existing) {
    if (retry) {
      return {
        status: 'deleted',
        user_id: ownerId,
        page_id: idValue,
      };
    }
    throw new BridgeError('PAGE_NOT_FOUND', 'Page does not exist or does not belong to this user.');
  }

  const revisionMatches = baseRevision
    ? Number(existing.revision || 1) === Number(baseRevision)
    : Number(existing.updatedAt) === Number(baseUpdatedAt);
  if (!revisionMatches) {
    throw new BridgeError('PAGE_CONFLICT', 'Page changed after the Mini App loaded it. Reload before deleting.');
  }

  const version = await nextPageSyncVersion(existing.revision || 1);
  const removed = await db.delete(richPages).where(and(
    eq(richPages.pageId, idValue),
    eq(richPages.ownerId, Number(ownerId)),
    eq(richPages.revision, Number(existing.revision || 1)),
  )).returning({
    pageId: richPages.pageId,
  }).run();

  if (!Array.isArray(removed) || !removed.length) {
    throw new BridgeError('PAGE_CONFLICT', 'Page changed while DELETE_PAGE was being applied.');
  }

  return {
    status: 'deleted',
    user_id: ownerId,
    page_id: idValue,
    revision: version.revision,
    sync_seq: version.syncSeq,
    sync_event: buildPageDeleteSync({
      ownerId,
      pageId: idValue,
      revision: version.revision,
      syncSeq: version.syncSeq,
      updatedAt: now(),
      requestId: id,
    }),
  };
}

async function sendMutationAck(message, id, action, result, replay = false) {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return false;
  if (['create', 'save', 'delete'].includes(action) && result.sync_event) {
    const event = {
      ...clone(result.sync_event),
      request_id: id,
    };
    await sendJson(
      message,
      'page_sync_' + String(result.page_id || 'deleted') + '_' + id + '.json',
      '✅ ' + BRIDGE_PROTOCOL + ' PAGE_SYNC_OK' + (replay ? ' (REPLAY)' : '') + '\n'
        + 'request_id: ' + id + '\n'
        + 'sync_id: ' + String(event.sync_id || '—') + '\n'
        + 'sync_seq: ' + String(event.sync_seq || 0) + '\n'
        + 'user_id: ' + String(result.user_id || '—') + '\n'
        + 'page_id: ' + String(result.page_id || '—'),
      event,
    );
    await reactMiniAppSyncSuccess(message);
    return true;
  }
  const label = {
    create: 'CREATE_PAGE_OK',
    save: 'SAVE_PAGE_OK',
    delete: 'DELETE_PAGE_OK',
    publish: 'PUBLISH_OK',
    user_picker: 'USER_PICKER_OK',
  }[action];
  if (!label) return false;

  const lines = [
    '✅ ' + BRIDGE_PROTOCOL + ' ' + label + (replay ? ' (REPLAY)' : ''),
    'request_id: ' + id,
  ];
  if (result.user_id) lines.push('user_id: ' + result.user_id);
  if (result.page_id) lines.push('page_id: ' + result.page_id);
  if (result.updated_at) lines.push('updated_at: ' + result.updated_at);
  if (result.chat_id) lines.push('chat_id: ' + result.chat_id);
  if (result.message_id) lines.push('message_id: ' + result.message_id);
  if (result.user_picker_request_id) lines.push('user_picker_request_id: ' + result.user_picker_request_id);
  await sendText(message, lines.join('\n'));
  return true;
}

async function replayCompletedMutation(message, id, action, result) {
  return sendMutationAck(message, id, action, result, true);
}

export async function handleMiniAppBridgeMessage(message, context = {}) {
  if (await handleSyncControl(message)) return true;
  const action = bridgeAction(message);
  if (!action) return false;
  if (!isBridgeOrigin(message)) return false;

  let id = null;
  let ownerId = null;
  let idValue = null;
  let claimed = false;

  try {
    if (action === '__wrong_target__') {
      throw new BridgeError('WRONG_TARGET', 'Bridge command is not addressed to the configured main bot.', { alert: true });
    }

    // Parse and validate the RCB1 envelope before pairing. This prevents an
    // otherwise valid-looking bridge sender from being pinned by malformed
    // traffic, and also lets error replies keep the real request_id.
    const envelope = parseEnvelope(message, action);
    id = requestId(envelope.request_id);
    ownerId = ['ping', 'full_sync'].includes(action) ? null : userId(envelope.user_id);
    const publishNeedsPageId = action === 'publish' && !message?.document?.file_id;
    idValue = (
      ['page', 'managed_page', 'save', 'delete', 'user_picker'].includes(action)
      || publishNeedsPageId
    ) ? pageId(envelope.page_id) : null;
    const senderBotId = await authorizeBridgeMessage(message, action);

    const allowed = await allowBridgeRequest(senderBotId, action, ownerId);
    if (!allowed) {
      throw new BridgeError('RATE_LIMITED', 'Bridge rate limit exceeded. Retry shortly.', { alert: true });
    }

    const claim = await claimRequest(id, action, senderBotId, ownerId);
    if (!claim.fresh) {
      if (
        claim.row?.status === 'completed'
        && action === 'client_error'
      ) {
        return true;
      }
      if (
        claim.row?.status === 'completed'
        && ['create', 'save', 'delete', 'publish', 'user_picker'].includes(action)
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
    else if (action === 'full_sync') result = await sendMiniAppFullSnapshot({
      requestId: id,
      replyToMessage: message,
      reason: 'bootstrap',
    });
    else if (action === 'pages') result = await handlePages(message, id, ownerId);
    else if (action === 'licenses') {
      const licenses = await listManagedBotLicensesForBridge(ownerId);
      await sendJson(
        message,
        'managed_licenses_' + id + '.json',
        '✅ RCB1 GET_MANAGED_LICENSES_OK\\nrequest_id: ' + id + '\\nuser_id: ' + ownerId,
        { protocol: BRIDGE_PROTOCOL, request_id: id, action, user_id: ownerId, licenses },
      );
      result = { status: 'ok' };
    }
    else if (action === 'managed_page') {
      const payload = await managedPage(ownerId,idValue);
      await sendJson(message,'managed_'+id+'.json','✅ RCB1 GET_MANAGED_PAGE_OK\nrequest_id: '+id+'\nuser_id: '+ownerId+'\npage_id: '+idValue,{protocol:BRIDGE_PROTOCOL,request_id:id,action,user_id:ownerId,...payload});
      result={status:'ok'};
    }
    else if (action === 'page') result = await handlePage(message, id, ownerId, idValue);
    else if (action === 'destinations') result = await handleDestinations(
      message,
      id,
      ownerId,
    );
    else if (action === 'create') result = await handleCreate(message, id, envelope);
    else if (action === 'save') result = await handleSave(message, id, envelope);
    else if (action === 'delete') result = await handleDelete(
      message,
      id,
      ownerId,
      idValue,
      envelope,
      Boolean(claim.retry),
    );
    else if (action === 'publish') result = await handlePublish(
      message,
      id,
      ownerId,
      idValue,
      envelope,
    );
    else if (action === 'client_error') result = await handleClientError(
      message,
      id,
      ownerId,
      envelope,
    );
    else if (action === 'user_picker') result = await handleUserPicker(
      message,
      id,
      ownerId,
      idValue,
      envelope,
    );
    else throw new BridgeError('UNKNOWN_ACTION', 'Unsupported bridge action.', { alert: true });

    try {
      await finishRequest(id, 'completed', result);
    } catch (stateError) {
      await logBridgeError('miniapp_bridge.state', stateError, message, {
        request: id,
        action,
        ownerId,
        page: idValue,
        updateId: context?.updateId,
      });
      if (['create', 'save', 'delete', 'publish', 'user_picker'].includes(action)) {
        try {
          await sendMutationAck(message, id, action, result);
        } catch (responseError) {
          await logBridgeError('miniapp_bridge.response', responseError, message, {
            request: id,
            action,
            ownerId,
            page: result?.page_id || idValue,
            updateId: context?.updateId,
          });
        }
      }
      return true;
    }

    if (['create', 'save', 'delete', 'publish', 'user_picker'].includes(action)) {
      try {
        await sendMutationAck(message, id, action, result);
      } catch (responseError) {
        await logBridgeError('miniapp_bridge.response', responseError, message, {
          request: id,
          action,
          ownerId,
          page: result?.page_id || idValue,
          updateId: context?.updateId,
        });
      }
    }
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
          updateId: context?.updateId,
        });
      }
    }

    if (error?.alert || !(error instanceof BridgeError)) {
      const errorCode = String(error?.code || '');
      await logBridgeError(
        errorCode === 'RATE_LIMITED' ? 'miniapp_bridge.rate_limit'
          : errorCode.startsWith('UNAUTHORIZED')
            || errorCode === 'WRONG_BRIDGE_CHAT'
            || errorCode === 'WRONG_TARGET'
            ? 'miniapp_bridge.unauthorized'
            : 'miniapp_bridge.request',
        error?.cause || error,
        message,
        {
          request: id,
          action,
          ownerId,
          page: idValue,
          updateId: context?.updateId,
        },
      );
    }

    await sendError(message, id, action, error);
    return true;
  }
}
