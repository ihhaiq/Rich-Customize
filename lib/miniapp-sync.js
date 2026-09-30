import { api, db, InputFile } from 'sdk';
import { asc, eq, lt } from 'sdk/db';
import {
  maintenanceLocks,
  miniappSyncOutbox,
  miniappSyncState,
  richPages,
} from 'schema';
import { DEVELOPER_IDS } from 'lib/developer-access';

export const MINIAPP_SYNC_CHAT_ID = -1003993506865;
export const MINIAPP_SYNC_PROTOCOL = 'RCB1';
export const MINIAPP_SYNC_TARGET_USERNAME = 'richminiappsbot';
const MINIAPP_SYNC_COMMAND = '/rcb_sync@Richminiappsbot';

const PAGE_SYNC_MAX_BYTES = 2 * 1024 * 1024;
const OUTBOX_RETRY_SECONDS = 60;
const SEQ_LOCK_SECONDS = 5;
const TOMBSTONE_EVENT = 'page_delete';
const UPSERT_EVENT = 'page_upsert';

function now() {
  return Math.floor(Date.now() / 1000);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function positive(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function syncId(pageId, seq, type) {
  const prefix = type === TOMBSTONE_EVENT ? 'pd' : 'pu';
  return prefix + '_' + String(seq) + '_' + String(pageId);
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSeqLock() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const stamp = now();
    await db.delete(maintenanceLocks).where(lt(maintenanceLocks.expiresAt, stamp)).run();
    const expiresAt = stamp + SEQ_LOCK_SECONDS;
    const rows = await db.insert(maintenanceLocks).values({
      name: 'miniapp:sync-seq',
      expiresAt,
    }).onConflictDoNothing({
      target: maintenanceLocks.name,
    }).returning({
      name: maintenanceLocks.name,
    }).run();
    if (Array.isArray(rows) && rows.length) {
      return { name: 'miniapp:sync-seq', expiresAt };
    }
    await sleep(20 + (attempt * 15));
  }
  const error = new Error('Could not allocate Mini App sync sequence');
  error.code = 'SYNC_SEQ_BUSY';
  throw error;
}

async function releaseSeqLock(lock) {
  if (!lock?.name) return;
  try {
    await db.delete(maintenanceLocks).where(eq(maintenanceLocks.name, String(lock.name))).run();
  } catch {}
}

export async function currentMiniAppSyncSeq() {
  const row = await db.select().from(miniappSyncState)
    .where(eq(miniappSyncState.id, 1)).get();
  return Math.max(0, Number(row?.seq || 0));
}

export async function nextMiniAppSyncSeq() {
  const lock = await acquireSeqLock();
  try {
    const current = await currentMiniAppSyncSeq();
    const next = current + 1;
    const stamp = now();
    await db.insert(miniappSyncState).values({
      id: 1,
      seq: next,
      updatedAt: stamp,
    }).onConflictDoUpdate({
      target: miniappSyncState.id,
      set: {
        seq: next,
        updatedAt: stamp,
      },
    }).run();
    return next;
  } finally {
    await releaseSeqLock(lock);
  }
}

export async function nextPageSyncVersion(currentRevision = 0) {
  return {
    revision: Math.max(0, Number(currentRevision || 0)) + 1,
    syncSeq: await nextMiniAppSyncSeq(),
  };
}

export function pageForMiniAppSync(row) {
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

export function buildPageUpsertSync(row, requestId = null) {
  const page = pageForMiniAppSync(row);
  const id = syncId(page.page_id, page.sync_seq, UPSERT_EVENT);
  return {
    protocol: MINIAPP_SYNC_PROTOCOL,
    type: UPSERT_EVENT,
    action: 'page_sync',
    sync_id: id,
    ...(requestId ? { request_id: String(requestId) } : {}),
    user_id: page.owner_id,
    page_id: page.page_id,
    revision: page.revision,
    sync_seq: page.sync_seq,
    page,
  };
}

export function buildPageDeleteSync({
  ownerId,
  pageId,
  revision,
  syncSeq,
  updatedAt = null,
  requestId = null,
}) {
  const id = syncId(pageId, syncSeq, TOMBSTONE_EVENT);
  return {
    protocol: MINIAPP_SYNC_PROTOCOL,
    type: TOMBSTONE_EVENT,
    action: 'page_sync',
    sync_id: id,
    ...(requestId ? { request_id: String(requestId) } : {}),
    user_id: Number(ownerId),
    page_id: String(pageId),
    revision: Math.max(1, Number(revision || 1)),
    sync_seq: Math.max(1, Number(syncSeq || 1)),
    deleted_at: positive(updatedAt, now()),
  };
}

async function enqueueEvent(event) {
  const stamp = now();
  const key = 'page:' + String(event.page_id);
  await db.insert(miniappSyncOutbox).values({
    outboxKey: key,
    eventType: String(event.type),
    syncId: String(event.sync_id),
    ownerId: Number(event.user_id),
    pageId: String(event.page_id),
    revision: Number(event.revision),
    syncSeq: Number(event.sync_seq),
    payload: clone(event),
    status: 'pending',
    attempts: 0,
    nextAttemptAt: stamp,
    createdAt: stamp,
    updatedAt: stamp,
  }).onConflictDoUpdate({
    target: miniappSyncOutbox.outboxKey,
    set: {
      eventType: String(event.type),
      syncId: String(event.sync_id),
      ownerId: Number(event.user_id),
      pageId: String(event.page_id),
      revision: Number(event.revision),
      syncSeq: Number(event.sync_seq),
      payload: clone(event),
      status: 'pending',
      attempts: 0,
      nextAttemptAt: stamp,
      updatedAt: stamp,
    },
  }).run();
  return event;
}

export async function enqueuePageUpsertSync(row) {
  return enqueueEvent(buildPageUpsertSync(row));
}

export async function enqueuePageDeleteSync(values) {
  return enqueueEvent(buildPageDeleteSync(values));
}

function captionForEvent(event) {
  return MINIAPP_SYNC_COMMAND + '\n\n'
    + MINIAPP_SYNC_PROTOCOL + ' PAGE_SYNC\n'
    + 'type: ' + String(event.type) + '\n'
    + 'sync_id: ' + String(event.sync_id) + '\n'
    + 'sync_seq: ' + String(event.sync_seq) + '\n'
    + 'user_id: ' + String(event.user_id) + '\n'
    + 'page_id: ' + String(event.page_id);
}

async function sendEventDocument(event) {
  const bytes = new TextEncoder().encode(JSON.stringify(event));
  if (!bytes.length || bytes.length > PAGE_SYNC_MAX_BYTES) {
    const error = new Error('Page sync document exceeds the 2 MB per-page limit');
    error.code = 'PAGE_SYNC_TOO_LARGE';
    throw error;
  }
  return api.sendDocument({
    chat_id: MINIAPP_SYNC_CHAT_ID,
    document: new InputFile(bytes, 'page_sync_' + String(event.page_id) + '_' + String(event.sync_seq) + '.json', {
      type: 'application/json',
    }),
    caption: captionForEvent(event),
    disable_notification: true,
  });
}

function mentionPayload(text) {
  const developerId = Number(DEVELOPER_IDS?.[0] || 0);
  if (!developerId) return { text };
  const label = 'المطور';
  const output = String(text) + '\n\n' + label;
  return {
    text: output,
    entities: [{
      type: 'text_link',
      offset: output.length - label.length,
      length: label.length,
      url: 'tg://user?id=' + developerId,
    }],
  };
}

export async function sendMiniAppSyncFailure(error, meta = {}) {
  const code = String(error?.code || 'SYNC_FAILED');
  const detail = String(error?.message || error || 'Unknown sync error').slice(0, 700);
  const body = mentionPayload(
    '❌ ' + MINIAPP_SYNC_PROTOCOL + ' SYNC_FAILED\n'
    + 'sync_id: ' + String(meta.syncId || '—') + '\n'
    + 'user_id: ' + String(meta.ownerId || '—') + '\n'
    + 'page_id: ' + String(meta.pageId || '—') + '\n'
    + 'code: ' + code + '\n'
    + 'detail: ' + detail
  );
  try {
    await api.sendMessage({
      chat_id: MINIAPP_SYNC_CHAT_ID,
      ...body,
    });
  } catch {}
}

export async function flushMiniAppSyncOutbox({ limit = 1 } = {}) {
  const stamp = now();
  const rows = await db.select().from(miniappSyncOutbox)
    .where(lt(miniappSyncOutbox.nextAttemptAt, stamp + 1))
    .orderBy(asc(miniappSyncOutbox.nextAttemptAt))
    .all();
  const selected = rows.slice(0, Math.max(1, Math.min(5, Number(limit || 1))));
  let sent = 0;
  for (const row of selected) {
    const event = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? row.payload
      : null;
    if (!event?.sync_id) {
      await db.delete(miniappSyncOutbox)
        .where(eq(miniappSyncOutbox.outboxKey, String(row.outboxKey))).run();
      continue;
    }
    try {
      await sendEventDocument(event);
      const attempts = Number(row.attempts || 0) + 1;
      await db.update(miniappSyncOutbox).set({
        status: 'sent',
        attempts,
        nextAttemptAt: stamp + OUTBOX_RETRY_SECONDS,
        updatedAt: stamp,
      }).where(eq(miniappSyncOutbox.outboxKey, String(row.outboxKey))).run();
      sent += 1;
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1;
      const delay = Math.min(300, Math.max(10, Math.pow(2, Math.min(attempts, 6)) * 5));
      await db.update(miniappSyncOutbox).set({
        status: 'pending',
        attempts,
        nextAttemptAt: stamp + delay,
        updatedAt: stamp,
      }).where(eq(miniappSyncOutbox.outboxKey, String(row.outboxKey))).run();
      await sendMiniAppSyncFailure(error, {
        syncId: row.syncId,
        ownerId: row.ownerId,
        pageId: row.pageId,
      });
    }
  }
  return { sent, considered: selected.length };
}

export async function acknowledgeMiniAppSync(syncIdValue) {
  const id = String(syncIdValue || '').trim();
  if (!id) return false;
  const row = await db.select().from(miniappSyncOutbox)
    .where(eq(miniappSyncOutbox.syncId, id)).get();
  if (!row) return false;
  await db.delete(miniappSyncOutbox)
    .where(eq(miniappSyncOutbox.outboxKey, String(row.outboxKey))).run();
  return true;
}

export async function retryMiniAppSync(syncIdValue) {
  const id = String(syncIdValue || '').trim();
  if (!id) return false;
  const row = await db.select().from(miniappSyncOutbox)
    .where(eq(miniappSyncOutbox.syncId, id)).get();
  if (!row) return false;
  await db.update(miniappSyncOutbox).set({
    status: 'pending',
    nextAttemptAt: now(),
    updatedAt: now(),
  }).where(eq(miniappSyncOutbox.outboxKey, String(row.outboxKey))).run();
  return true;
}

export async function reactMiniAppSyncSuccess(message) {
  const chatId = Number(message?.chat?.id || 0);
  const messageId = Number(message?.message_id || 0);
  if (!chatId || !messageId) return false;
  try {
    await api.setMessageReaction({
      chat_id: chatId,
      message_id: messageId,
      reaction: [{ type: 'emoji', emoji: '✅' }],
      is_big: false,
    });
    return true;
  } catch {
    return false;
  }
}

export async function buildMiniAppFullSnapshot({ requestId = null, reason = 'bootstrap' } = {}) {
  const baseline = await currentMiniAppSyncSeq();
  const rows = await db.select().from(richPages).all();
  rows.sort((a, b) => Number(a.ownerId) - Number(b.ownerId)
    || String(a.pageId).localeCompare(String(b.pageId)));
  const users = [];
  let current = null;
  for (const row of rows) {
    const owner = Number(row.ownerId);
    if (!current || current.user_id !== owner) {
      current = { user_id: owner, pages: [] };
      users.push(current);
    }
    current.pages.push(pageForMiniAppSync(row));
  }
  const snapshotId = 'fs_' + String(Date.now()) + '_' + String(rows.length);
  return {
    protocol: MINIAPP_SYNC_PROTOCOL,
    type: 'full_snapshot',
    action: 'full_sync',
    sync_id: snapshotId,
    snapshot_id: snapshotId,
    ...(requestId ? { request_id: String(requestId) } : {}),
    reason: String(reason || 'bootstrap'),
    baseline_seq: baseline,
    owner_count: users.length,
    page_count: rows.length,
    generated_at: now(),
    users,
  };
}

export async function sendMiniAppFullSnapshot({
  requestId = null,
  replyToMessage = null,
  reason = 'bootstrap',
} = {}) {
  const payload = await buildMiniAppFullSnapshot({ requestId, reason });
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const replyMessageId = Number(replyToMessage?.message_id || 0);
  const sent = await api.sendDocument({
    chat_id: MINIAPP_SYNC_CHAT_ID,
    document: new InputFile(bytes, 'rich_pages_full_snapshot_' + String(payload.snapshot_id) + '.json', {
      type: 'application/json',
    }),
    caption: MINIAPP_SYNC_COMMAND + '\n\n'
      + MINIAPP_SYNC_PROTOCOL + ' FULL_SYNC\n'
      + (requestId ? 'request_id: ' + String(requestId) + '\n' : '')
      + 'snapshot_id: ' + String(payload.snapshot_id) + '\n'
      + 'baseline_seq: ' + String(payload.baseline_seq) + '\n'
      + 'owners: ' + String(payload.owner_count) + '\n'
      + 'pages: ' + String(payload.page_count),
    disable_notification: true,
    ...(replyMessageId ? { reply_parameters: { message_id: replyMessageId } } : {}),
  });
  return {
    snapshotId: payload.snapshot_id,
    pageCount: payload.page_count,
    ownerCount: payload.owner_count,
    baselineSeq: payload.baseline_seq,
    messageId: Number(sent?.message_id || 0),
    bytes: bytes.length,
  };
}
