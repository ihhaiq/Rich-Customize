import { HttpError } from './http.js';

const MIRROR_PROTOCOL = 'RCB1';
const BOOTSTRAP_LOCK_SECONDS = 5 * 60;
const EVENT_RETENTION_SECONDS = 7 * 24 * 60 * 60;

function now() {
  return Math.floor(Date.now() / 1000);
}

function stringValue(value, fallback = '') {
  return value == null ? fallback : String(value);
}

function safePositive(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new HttpError(502, 'Invalid sync ' + label);
  }
  return parsed;
}

function safeNonNegative(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new HttpError(502, 'Invalid sync ' + label);
  }
  return parsed;
}

let mirrorSchemaPromise = null;

export async function ensurePageMirrorSchema(db) {
  if (!db || typeof db.prepare !== 'function') {
    throw new HttpError(500, 'Cloudflare D1 binding "DB" is not configured');
  }
  if (mirrorSchemaPromise) return mirrorSchemaPromise;
  mirrorSchemaPromise = (async () => {
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_pages_mirror ('
      + 'generation TEXT NOT NULL, '
      + 'owner_id INTEGER NOT NULL, '
      + 'page_id TEXT NOT NULL, '
      + "title TEXT NOT NULL DEFAULT '', "
      + "blocks_json TEXT NOT NULL DEFAULT '[]', "
      + "buttons_json TEXT NOT NULL DEFAULT '[]', "
      + 'buttons_per_row INTEGER NOT NULL DEFAULT 1, '
      + "buttons_align TEXT NOT NULL DEFAULT 'center', "
      + 'revision INTEGER NOT NULL DEFAULT 1, '
      + 'sync_seq INTEGER NOT NULL DEFAULT 0, '
      + 'created_at INTEGER NOT NULL DEFAULT 0, '
      + 'updated_at INTEGER NOT NULL DEFAULT 0, '
      + 'deleted INTEGER NOT NULL DEFAULT 0, '
      + 'snapshot_id TEXT, '
      + 'applied_at INTEGER NOT NULL DEFAULT 0, '
      + 'PRIMARY KEY(generation, owner_id, page_id)'
      + ')'
    ).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_miniapp_pages_mirror_owner '
      + 'ON miniapp_pages_mirror(generation, owner_id, deleted, updated_at DESC)'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_sync_meta ('
      + 'key TEXT PRIMARY KEY, '
      + 'value TEXT NOT NULL, '
      + 'updated_at INTEGER NOT NULL'
      + ')'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_sync_processed ('
      + 'sync_id TEXT PRIMARY KEY, '
      + 'sync_seq INTEGER NOT NULL, '
      + 'created_at INTEGER NOT NULL'
      + ')'
    ).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_miniapp_sync_processed_created '
      + 'ON miniapp_sync_processed(created_at)'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_sync_events ('
      + 'sync_id TEXT PRIMARY KEY, '
      + 'sync_seq INTEGER NOT NULL, '
      + 'payload_json TEXT NOT NULL, '
      + 'created_at INTEGER NOT NULL'
      + ')'
    ).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_miniapp_sync_events_seq '
      + 'ON miniapp_sync_events(sync_seq)'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_sync_locks ('
      + 'key TEXT PRIMARY KEY, '
      + 'token TEXT NOT NULL, '
      + 'expires_at INTEGER NOT NULL'
      + ')'
    ).run();
    return true;
  })().catch((error) => {
    mirrorSchemaPromise = null;
    throw error;
  });
  return mirrorSchemaPromise;
}

async function meta(db, key) {
  await ensurePageMirrorSchema(db);
  const row = await db.prepare(
    'SELECT value FROM miniapp_sync_meta WHERE key = ?'
  ).bind(String(key)).first();
  return row?.value == null ? null : String(row.value);
}

async function setMeta(db, key, value) {
  await ensurePageMirrorSchema(db);
  await db.prepare(
    'INSERT INTO miniapp_sync_meta(key,value,updated_at) VALUES(?,?,?) '
    + 'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).bind(String(key), String(value), now()).run();
}

export async function pageMirrorReady(db) {
  return await meta(db, 'initial_sync_completed') === '1'
    && Boolean(await meta(db, 'active_generation'));
}

export async function pageMirrorStatus(db) {
  await ensurePageMirrorSchema(db);
  return {
    ready: await pageMirrorReady(db),
    status: await meta(db, 'sync_status') || 'empty',
    active_generation: await meta(db, 'active_generation'),
    staging_generation: await meta(db, 'staging_generation'),
    last_snapshot_id: await meta(db, 'last_snapshot_id'),
    baseline_seq: Number(await meta(db, 'baseline_seq') || 0),
  };
}

function randomToken() {
  const uuid = crypto.randomUUID?.();
  if (uuid) return String(uuid).replaceAll('-', '');
  return String(Date.now()) + '_' + String(Math.random()).slice(2);
}

export async function claimMirrorBootstrap(db) {
  await ensurePageMirrorSchema(db);
  if (await pageMirrorReady(db)) return { acquired: false, ready: true };
  const token = randomToken();
  const stamp = now();
  const row = await db.prepare(
    "INSERT INTO miniapp_sync_locks(key,token,expires_at) VALUES('bootstrap', ?, ?) "
    + 'ON CONFLICT(key) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at '
    + 'WHERE miniapp_sync_locks.expires_at <= ? '
    + 'RETURNING token'
  ).bind(token, stamp + BOOTSTRAP_LOCK_SECONDS, stamp).first();
  if (!row?.token || String(row.token) !== token) {
    return { acquired: false, ready: false };
  }
  await setMeta(db, 'sync_status', 'requested');
  return { acquired: true, ready: false, token };
}

export async function releaseMirrorBootstrap(db) {
  await ensurePageMirrorSchema(db);
  await db.prepare("DELETE FROM miniapp_sync_locks WHERE key = 'bootstrap'").run();
}

export async function markMirrorBootstrapFailed(db, detail = '') {
  await setMeta(db, 'sync_status', 'failed:' + String(detail || '').slice(0, 120));
  await releaseMirrorBootstrap(db);
}

function parseJsonList(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function pageFromRow(row) {
  return {
    page_id: String(row.page_id),
    owner_id: Number(row.owner_id),
    title: String(row.title || row.page_id),
    blocks: parseJsonList(row.blocks_json),
    buttons: parseJsonList(row.buttons_json),
    buttons_per_row: Number(row.buttons_per_row || 1),
    buttons_align: String(row.buttons_align || 'center'),
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
    revision: Math.max(1, Number(row.revision || 1)),
    sync_seq: Math.max(0, Number(row.sync_seq || 0)),
  };
}

async function activeGeneration(db) {
  return meta(db, 'active_generation');
}

async function stagingGeneration(db) {
  return meta(db, 'staging_generation');
}

export async function listMirrorPages(db, ownerId) {
  await ensurePageMirrorSchema(db);
  const generation = await activeGeneration(db);
  if (!generation) return [];
  const rows = await db.prepare(
    'SELECT page_id,title,blocks_json,created_at,updated_at,revision,sync_seq '
    + 'FROM miniapp_pages_mirror '
    + 'WHERE generation = ? AND owner_id = ? AND deleted = 0 '
    + 'ORDER BY updated_at DESC, page_id ASC'
  ).bind(generation, Number(ownerId)).all();
  return (rows?.results || []).map((row) => ({
    page_id: String(row.page_id),
    title: String(row.title || row.page_id),
    block_count: parseJsonList(row.blocks_json).length,
    created_at: Number(row.created_at || 0),
    updated_at: Number(row.updated_at || 0),
    revision: Math.max(1, Number(row.revision || 1)),
    sync_seq: Math.max(0, Number(row.sync_seq || 0)),
  }));
}

export async function getMirrorPage(db, ownerId, pageId) {
  await ensurePageMirrorSchema(db);
  const generation = await activeGeneration(db);
  if (!generation) return null;
  const row = await db.prepare(
    'SELECT * FROM miniapp_pages_mirror '
    + 'WHERE generation = ? AND owner_id = ? AND page_id = ? AND deleted = 0'
  ).bind(generation, Number(ownerId), String(pageId)).first();
  return row ? pageFromRow(row) : null;
}

function validateEvent(payload) {
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new HttpError(502, 'Invalid page sync payload');
  }
  if (String(payload.protocol || '') !== MIRROR_PROTOCOL) {
    throw new HttpError(502, 'Page sync protocol mismatch');
  }
  const type = String(payload.type || '');
  if (!['page_upsert', 'page_delete'].includes(type)) {
    throw new HttpError(502, 'Unsupported page sync type');
  }
  const syncId = stringValue(payload.sync_id).trim();
  if (!syncId || syncId.length > 160) throw new HttpError(502, 'Invalid sync_id');
  const ownerId = safePositive(payload.user_id, 'user_id');
  const pageId = stringValue(payload.page_id).trim();
  if (!pageId || pageId.length > 64 || /\s/.test(pageId)) throw new HttpError(502, 'Invalid sync page_id');
  const revision = safePositive(payload.revision, 'revision');
  const syncSeq = safePositive(payload.sync_seq, 'sync_seq');
  return { type, syncId, ownerId, pageId, revision, syncSeq };
}

function upsertStatement(db, generation, payload, snapshotId = null) {
  const meta = validateEvent(payload);
  if (meta.type !== 'page_upsert') throw new HttpError(502, 'Expected page_upsert');
  const page = payload.page;
  if (!page || Array.isArray(page) || typeof page !== 'object') {
    throw new HttpError(502, 'page_upsert is missing page data');
  }
  if (Number(page.owner_id) !== meta.ownerId || String(page.page_id || '') !== meta.pageId) {
    throw new HttpError(502, 'Page sync identity mismatch');
  }
  const blocks = Array.isArray(page.blocks) ? page.blocks : null;
  const buttons = page.buttons == null ? [] : page.buttons;
  if (!blocks || !Array.isArray(buttons)) throw new HttpError(502, 'Invalid mirrored page arrays');
  const title = stringValue(page.title || meta.pageId).trim().slice(0, 64);
  const perRow = Math.max(1, Math.min(8, Number(page.buttons_per_row || 1)));
  const align = ['left', 'center', 'right'].includes(String(page.buttons_align || 'center'))
    ? String(page.buttons_align || 'center')
    : 'center';
  return db.prepare(
    'INSERT INTO miniapp_pages_mirror('
    + 'generation,owner_id,page_id,title,blocks_json,buttons_json,buttons_per_row,buttons_align,'
    + 'revision,sync_seq,created_at,updated_at,deleted,snapshot_id,applied_at'
    + ') VALUES(?,?,?,?,?,?,?,?,?,?,?,?,0,?,?) '
    + 'ON CONFLICT(generation,owner_id,page_id) DO UPDATE SET '
    + 'title=excluded.title, blocks_json=excluded.blocks_json, buttons_json=excluded.buttons_json, '
    + 'buttons_per_row=excluded.buttons_per_row, buttons_align=excluded.buttons_align, '
    + 'revision=excluded.revision, sync_seq=excluded.sync_seq, '
    + 'created_at=excluded.created_at, updated_at=excluded.updated_at, deleted=0, '
    + 'snapshot_id=COALESCE(excluded.snapshot_id, miniapp_pages_mirror.snapshot_id), '
    + 'applied_at=excluded.applied_at '
    + 'WHERE excluded.sync_seq > miniapp_pages_mirror.sync_seq '
    + 'OR (excluded.sync_seq = miniapp_pages_mirror.sync_seq AND excluded.revision >= miniapp_pages_mirror.revision)'
  ).bind(
    String(generation),
    meta.ownerId,
    meta.pageId,
    title || meta.pageId,
    JSON.stringify(blocks),
    JSON.stringify(buttons),
    Number.isFinite(perRow) ? perRow : 1,
    align,
    meta.revision,
    meta.syncSeq,
    safeNonNegative(page.created_at || 0, 'created_at'),
    safeNonNegative(page.updated_at || 0, 'updated_at'),
    snapshotId == null ? null : String(snapshotId),
    now(),
  );
}

function deleteStatement(db, generation, payload) {
  const meta = validateEvent(payload);
  if (meta.type !== 'page_delete') throw new HttpError(502, 'Expected page_delete');
  const stamp = safeNonNegative(payload.deleted_at || now(), 'deleted_at');
  return db.prepare(
    'INSERT INTO miniapp_pages_mirror('
    + 'generation,owner_id,page_id,title,blocks_json,buttons_json,buttons_per_row,buttons_align,'
    + 'revision,sync_seq,created_at,updated_at,deleted,snapshot_id,applied_at'
    + ") VALUES(?,?,?,'','[]','[]',1,'center',?,?,0,?,1,NULL,?) "
    + 'ON CONFLICT(generation,owner_id,page_id) DO UPDATE SET '
    + 'revision=excluded.revision, sync_seq=excluded.sync_seq, updated_at=excluded.updated_at, '
    + 'deleted=1, applied_at=excluded.applied_at '
    + 'WHERE excluded.sync_seq > miniapp_pages_mirror.sync_seq '
    + 'OR (excluded.sync_seq = miniapp_pages_mirror.sync_seq AND excluded.revision >= miniapp_pages_mirror.revision)'
  ).bind(
    String(generation),
    meta.ownerId,
    meta.pageId,
    meta.revision,
    meta.syncSeq,
    stamp,
    now(),
  );
}

async function executeStatements(db, statements, chunkSize = 40) {
  for (let i = 0; i < statements.length; i += chunkSize) {
    const chunk = statements.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    if (typeof db.batch === 'function') await db.batch(chunk);
    else {
      for (const statement of chunk) await statement.run();
    }
  }
}

async function applyEventToGeneration(db, generation, payload) {
  if (!generation) return;
  const type = String(payload.type || '');
  const statement = type === 'page_upsert'
    ? upsertStatement(db, generation, payload)
    : deleteStatement(db, generation, payload);
  await statement.run();
}

async function cleanupEventJournal(db) {
  const cutoff = now() - EVENT_RETENTION_SECONDS;
  try {
    await db.prepare('DELETE FROM miniapp_sync_processed WHERE created_at < ?').bind(cutoff).run();
    await db.prepare('DELETE FROM miniapp_sync_events WHERE created_at < ?').bind(cutoff).run();
  } catch {}
}

export async function applyPageMirrorSync(db, payload) {
  await ensurePageMirrorSchema(db);
  const event = validateEvent(payload);
  const duplicate = await db.prepare(
    'SELECT sync_id FROM miniapp_sync_processed WHERE sync_id = ?'
  ).bind(event.syncId).first();
  if (duplicate) return { duplicate: true, ...event };

  const active = await activeGeneration(db);
  const staging = await stagingGeneration(db);
  if (active) await applyEventToGeneration(db, active, payload);
  if (staging && staging !== active) await applyEventToGeneration(db, staging, payload);

  const stamp = now();
  const statements = [
    db.prepare(
      'INSERT OR IGNORE INTO miniapp_sync_events(sync_id,sync_seq,payload_json,created_at) VALUES(?,?,?,?)'
    ).bind(event.syncId, event.syncSeq, JSON.stringify(payload), stamp),
    db.prepare(
      'INSERT OR IGNORE INTO miniapp_sync_processed(sync_id,sync_seq,created_at) VALUES(?,?,?)'
    ).bind(event.syncId, event.syncSeq, stamp),
  ];
  if (typeof db.batch === 'function') await db.batch(statements);
  else {
    for (const statement of statements) await statement.run();
  }
  await cleanupEventJournal(db);
  return { duplicate: false, ...event };
}

function snapshotPageEvent(userId, page) {
  const ownerId = safePositive(userId, 'snapshot user_id');
  if (!page || Array.isArray(page) || typeof page !== 'object') {
    throw new HttpError(502, 'Invalid page in full snapshot');
  }
  const pageId = stringValue(page.page_id).trim();
  if (!pageId || Number(page.owner_id) !== ownerId) {
    throw new HttpError(502, 'Full snapshot page owner mismatch');
  }
  const revision = safePositive(page.revision || 1, 'snapshot revision');
  const syncSeq = safeNonNegative(page.sync_seq || 0, 'snapshot sync_seq');
  return {
    protocol: MIRROR_PROTOCOL,
    type: 'page_upsert',
    sync_id: 'snapshot_' + String(syncSeq) + '_' + pageId,
    user_id: ownerId,
    page_id: pageId,
    revision,
    sync_seq: syncSeq,
    page,
  };
}

export async function applyFullPageSnapshot(db, payload) {
  await ensurePageMirrorSchema(db);
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
    throw new HttpError(502, 'Invalid full snapshot');
  }
  if (String(payload.protocol || '') !== MIRROR_PROTOCOL || String(payload.type || '') !== 'full_snapshot') {
    throw new HttpError(502, 'Full snapshot protocol mismatch');
  }
  const snapshotId = stringValue(payload.snapshot_id || payload.sync_id).trim();
  if (!snapshotId || snapshotId.length > 180) throw new HttpError(502, 'Invalid snapshot_id');
  const baselineSeq = safeNonNegative(payload.baseline_seq || 0, 'baseline_seq');
  const users = Array.isArray(payload.users) ? payload.users : null;
  if (!users) throw new HttpError(502, 'Full snapshot users must be an array');

  const generation = snapshotId;
  await setMeta(db, 'sync_status', 'importing');
  await setMeta(db, 'staging_generation', generation);
  await db.prepare('DELETE FROM miniapp_pages_mirror WHERE generation = ?').bind(generation).run();

  const statements = [];
  let ownerCount = 0;
  let pageCount = 0;
  const seenOwners = new Set();
  for (const user of users) {
    const ownerId = safePositive(user?.user_id, 'snapshot user_id');
    if (seenOwners.has(ownerId)) throw new HttpError(502, 'Duplicate user in full snapshot');
    seenOwners.add(ownerId);
    ownerCount += 1;
    const pages = Array.isArray(user?.pages) ? user.pages : null;
    if (!pages) throw new HttpError(502, 'Snapshot user pages must be an array');
    for (const page of pages) {
      const event = snapshotPageEvent(ownerId, page);
      statements.push(upsertStatement(db, generation, event, snapshotId));
      pageCount += 1;
    }
  }
  if (Number(payload.owner_count ?? ownerCount) !== ownerCount) {
    throw new HttpError(502, 'Full snapshot owner_count mismatch');
  }
  if (Number(payload.page_count ?? pageCount) !== pageCount) {
    throw new HttpError(502, 'Full snapshot page_count mismatch');
  }

  await executeStatements(db, statements);

  const journal = await db.prepare(
    'SELECT payload_json FROM miniapp_sync_events WHERE sync_seq > ? ORDER BY sync_seq ASC'
  ).bind(baselineSeq).all();
  for (const row of journal?.results || []) {
    let event;
    try {
      event = JSON.parse(String(row.payload_json || ''));
    } catch {
      continue;
    }
    await applyEventToGeneration(db, generation, event);
  }

  const stamp = now();
  const metaStatements = [
    db.prepare(
      'INSERT INTO miniapp_sync_meta(key,value,updated_at) VALUES(?,?,?) '
      + 'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at'
    ).bind('active_generation', generation, stamp),
    db.prepare(
      'INSERT INTO miniapp_sync_meta(key,value,updated_at) VALUES(?,?,?) '
      + 'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at'
    ).bind('initial_sync_completed', '1', stamp),
    db.prepare(
      'INSERT INTO miniapp_sync_meta(key,value,updated_at) VALUES(?,?,?) '
      + 'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at'
    ).bind('sync_status', 'ready', stamp),
    db.prepare(
      'INSERT INTO miniapp_sync_meta(key,value,updated_at) VALUES(?,?,?) '
      + 'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at'
    ).bind('last_snapshot_id', snapshotId, stamp),
    db.prepare(
      'INSERT INTO miniapp_sync_meta(key,value,updated_at) VALUES(?,?,?) '
      + 'ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at'
    ).bind('baseline_seq', String(baselineSeq), stamp),
    db.prepare("DELETE FROM miniapp_sync_meta WHERE key = 'staging_generation'"),
  ];
  if (typeof db.batch === 'function') await db.batch(metaStatements);
  else {
    for (const statement of metaStatements) await statement.run();
  }

  await releaseMirrorBootstrap(db);
  try {
    await db.prepare('DELETE FROM miniapp_pages_mirror WHERE generation <> ?').bind(generation).run();
  } catch {}
  await cleanupEventJournal(db);

  return {
    snapshot_id: snapshotId,
    generation,
    baseline_seq: baselineSeq,
    owner_count: ownerCount,
    page_count: pageCount,
  };
}
