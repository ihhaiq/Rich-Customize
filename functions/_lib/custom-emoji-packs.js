import { HttpError } from './http.js';
import { PLAN_LIMITS } from '../../tgcloud/lib/subscription-policy.js';

export const REGULAR_CUSTOM_EMOJI_PACK_LIMIT = PLAN_LIMITS.free.emojiPacks;

let schemaReadyPromise = null;

function requireDb(env) {
  const db = env?.DB;
  if (!db || typeof db.prepare !== 'function') {
    throw new HttpError(500, 'Cloudflare D1 binding "DB" is not configured');
  }
  return db;
}

async function ensureSchema(db) {
  if (schemaReadyPromise) return schemaReadyPromise;
  schemaReadyPromise = (async () => {
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_custom_emoji_packs ('
      + 'user_id INTEGER NOT NULL, '
      + 'pack_name TEXT NOT NULL, '
      + 'added_at INTEGER NOT NULL, '
      + 'PRIMARY KEY(user_id, pack_name)'
      + ')'
    ).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_miniapp_custom_emoji_packs_user '
      + 'ON miniapp_custom_emoji_packs(user_id, added_at ASC)'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_custom_emoji_primary_pack ('
      + 'user_id INTEGER PRIMARY KEY, '
      + 'pack_name TEXT NOT NULL, '
      + 'added_at INTEGER NOT NULL'
      + ')'
    ).run();
    await db.prepare(
      'CREATE TABLE IF NOT EXISTS miniapp_custom_emoji_pack_state ('
      + 'user_id INTEGER NOT NULL, '
      + 'pack_name TEXT NOT NULL, '
      + 'sort_order INTEGER NOT NULL DEFAULT 0, '
      + 'pinned INTEGER NOT NULL DEFAULT 0, '
      + 'updated_at INTEGER NOT NULL, '
      + 'PRIMARY KEY(user_id, pack_name)'
      + ')'
    ).run();
    await db.prepare(
      'CREATE INDEX IF NOT EXISTS idx_miniapp_custom_emoji_pack_state_user '
      + 'ON miniapp_custom_emoji_pack_state(user_id, pinned DESC, sort_order ASC)'
    ).run();
    // One-pack beta used a separate primary table. Backfill it atomically;
    // keep the original record until rollout is verified (no destructive D1).
    await db.prepare(
      'INSERT OR IGNORE INTO miniapp_custom_emoji_packs(user_id, pack_name, added_at) '
      + 'SELECT user_id, pack_name, added_at FROM miniapp_custom_emoji_primary_pack'
    ).run();
    return true;
  })().catch((error) => {
    schemaReadyPromise = null;
    throw error;
  });
  return schemaReadyPromise;
}

function safeUserId(value) {
  const userId = Number(value);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new HttpError(400, 'invalid_user_id');
  }
  return userId;
}

function safePackName(value) {
  const name = String(value || '').trim();
  if (!/^[A-Za-z0-9_]{1,64}$/.test(name)) {
    throw new HttpError(400, 'invalid_custom_emoji_pack_name');
  }
  return name;
}

async function ensurePackState(db, owner, name, stamp) {
  const max = await db.prepare(
    'SELECT COALESCE(MAX(sort_order), -1) AS max_order '
    + 'FROM miniapp_custom_emoji_pack_state WHERE user_id = ?'
  ).bind(owner).first();
  const next = Math.max(0, Number(max?.max_order ?? -1) + 1);
  await db.prepare(
    'INSERT OR IGNORE INTO miniapp_custom_emoji_pack_state '
    + '(user_id,pack_name,sort_order,pinned,updated_at) VALUES(?,?,?,?,?)'
  ).bind(owner, name, next, 0, stamp).run();
}

async function orderedPackNames(db, owner) {
  const rows = await db.prepare(
    'SELECT p.pack_name '
    + 'FROM miniapp_custom_emoji_packs p '
    + 'LEFT JOIN miniapp_custom_emoji_pack_state s '
    + 'ON s.user_id=p.user_id AND s.pack_name=p.pack_name '
    + 'WHERE p.user_id=? '
    + 'ORDER BY COALESCE(s.pinned,0) DESC, COALESCE(s.sort_order,2147483647) ASC, '
    + 'p.added_at ASC, p.pack_name ASC'
  ).bind(owner).all();
  return (rows?.results || [])
    .map((row) => String(row?.pack_name || ''))
    .filter(Boolean);
}

export async function customEmojiPackAccess(env, userId, {unlimited = false} = {}) {
  const db = requireDb(env);
  await ensureSchema(db);
  const owner = safeUserId(userId);

  if (!unlimited) {
    const stored = await orderedPackNames(db, owner);
    return {
      unlimited:false,
      limit:REGULAR_CUSTOM_EMOJI_PACK_LIMIT,
      packNames:stored.slice(0, REGULAR_CUSTOM_EMOJI_PACK_LIMIT),
      packCount:stored.length,
    };
  }

  const packNames = await orderedPackNames(db, owner);
  return {
    unlimited:true,
    limit:null,
    packNames,
    packCount:packNames.length,
  };
}

export async function claimCustomEmojiPack(env, userId, packName, {unlimited = false} = {}) {
  const db = requireDb(env);
  await ensureSchema(db);
  const owner = safeUserId(userId);
  const name = safePackName(packName);
  const stamp = Math.floor(Date.now() / 1000);

  if (!unlimited) {
    // Single conditional SQLite write: simultaneous requests cannot both
    // observe a free slot then exceed the two-pack limit.
    await db.prepare(
      'INSERT OR IGNORE INTO miniapp_custom_emoji_packs(user_id, pack_name, added_at) '
      + 'SELECT ?, ?, ? WHERE ('
      + 'SELECT COUNT(*) FROM miniapp_custom_emoji_packs WHERE user_id = ?'
      + ') < ?'
    ).bind(owner, name, stamp, owner, REGULAR_CUSTOM_EMOJI_PACK_LIMIT).run();
    const row = await db.prepare(
      'SELECT pack_name FROM miniapp_custom_emoji_packs WHERE user_id = ? AND pack_name = ?'
    ).bind(owner, name).first();
    if (!row?.pack_name) throw new HttpError(403, 'custom_emoji_pack_limit');
  } else {
    await db.prepare(
      'INSERT OR IGNORE INTO miniapp_custom_emoji_packs(user_id, pack_name, added_at) '
      + 'VALUES(?, ?, ?)'
    ).bind(owner, name, stamp).run();
  }
  await ensurePackState(db, owner, name, stamp);

  return customEmojiPackAccess(env, owner, {unlimited});
}

export async function deleteCustomEmojiPack(env, userId, packName, {unlimited = false} = {}) {
  const db = requireDb(env);
  await ensureSchema(db);
  const owner = safeUserId(userId);
  const name = safePackName(packName);

  if (!unlimited) {
    const visible = await orderedPackNames(db, owner);
    if (!visible.includes(name)) throw new HttpError(403, 'custom_emoji_pack_forbidden');
  }
  await db.prepare(
    'DELETE FROM miniapp_custom_emoji_primary_pack WHERE user_id = ? AND pack_name = ?'
  ).bind(owner, name).run();

  await db.prepare(
    'DELETE FROM miniapp_custom_emoji_packs WHERE user_id = ? AND pack_name = ?'
  ).bind(owner, name).run();
  await db.prepare(
    'DELETE FROM miniapp_custom_emoji_pack_state WHERE user_id = ? AND pack_name = ?'
  ).bind(owner, name).run();

  return customEmojiPackAccess(env, owner, {unlimited});
}

export async function reorderCustomEmojiPacks(env, userId, names, {unlimited = false} = {}) {
  const db = requireDb(env);
  await ensureSchema(db);
  const owner = safeUserId(userId);
  const requested = Array.isArray(names) ? names.map(safePackName) : [];
  const existing = await orderedPackNames(db, owner);

  if (!unlimited && requested.length > REGULAR_CUSTOM_EMOJI_PACK_LIMIT) {
    throw new HttpError(403, 'custom_emoji_pack_limit');
  }
  if (requested.length !== existing.length) {
    throw new HttpError(409, 'custom_emoji_pack_order_conflict');
  }
  const expected = new Set(existing);
  if (requested.some((name) => !expected.has(name)) || new Set(requested).size !== requested.length) {
    throw new HttpError(409, 'custom_emoji_pack_order_conflict');
  }

  const stamp = Math.floor(Date.now() / 1000);
  const statements = requested.map((name, index) => db.prepare(
    'UPDATE miniapp_custom_emoji_pack_state SET sort_order=?,updated_at=? '
    + 'WHERE user_id=? AND pack_name=?'
  ).bind(index, stamp, owner, name));
  if (typeof db.batch === 'function') await db.batch(statements);
  else for (const statement of statements) await statement.run();

  return customEmojiPackAccess(env, owner, {unlimited});
}

export async function pinCustomEmojiPack(env, userId, packName, {unlimited = false} = {}) {
  const db = requireDb(env);
  await ensureSchema(db);
  const owner = safeUserId(userId);
  const name = safePackName(packName);
  const existing = await orderedPackNames(db, owner);
  if (!existing.includes(name)) throw new HttpError(404, 'custom_emoji_pack_not_found');

  const stamp = Math.floor(Date.now() / 1000);
  const statements = [
    db.prepare(
      'UPDATE miniapp_custom_emoji_pack_state SET pinned=0,updated_at=? WHERE user_id=?'
    ).bind(stamp, owner),
    db.prepare(
      'UPDATE miniapp_custom_emoji_pack_state SET pinned=1,updated_at=? '
      + 'WHERE user_id=? AND pack_name=?'
    ).bind(stamp, owner, name),
  ];
  if (typeof db.batch === 'function') await db.batch(statements);
  else for (const statement of statements) await statement.run();

  return customEmojiPackAccess(env, owner, {unlimited});
}
