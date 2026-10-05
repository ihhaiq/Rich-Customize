import { HttpError } from './http.js';

export const REGULAR_CUSTOM_EMOJI_PACK_LIMIT = 1;

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

export async function customEmojiPackAccess(env, userId, {unlimited = false} = {}) {
  const db = requireDb(env);
  await ensureSchema(db);
  const owner = safeUserId(userId);

  if (!unlimited) {
    const primary = await db.prepare(
      'SELECT pack_name FROM miniapp_custom_emoji_primary_pack WHERE user_id = ?'
    ).bind(owner).first();
    const packNames = primary?.pack_name ? [String(primary.pack_name)] : [];
    return {
      unlimited:false,
      limit:REGULAR_CUSTOM_EMOJI_PACK_LIMIT,
      packNames,
      packCount:packNames.length,
    };
  }

  const rows = await db.prepare(
    'SELECT pack_name FROM miniapp_custom_emoji_packs '
    + 'WHERE user_id = ? ORDER BY added_at ASC, pack_name ASC'
  ).bind(owner).all();
  const packNames = (rows?.results || [])
    .map((row) => String(row?.pack_name || ''))
    .filter(Boolean);

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
    await db.prepare(
      'INSERT OR IGNORE INTO miniapp_custom_emoji_primary_pack(user_id, pack_name, added_at) '
      + 'VALUES(?, ?, ?)'
    ).bind(owner, name, stamp).run();

    const primary = await db.prepare(
      'SELECT pack_name FROM miniapp_custom_emoji_primary_pack WHERE user_id = ?'
    ).bind(owner).first();

    if (!primary?.pack_name || String(primary.pack_name) !== name) {
      throw new HttpError(403, 'custom_emoji_pack_limit');
    }
  }

  await db.prepare(
    'INSERT OR IGNORE INTO miniapp_custom_emoji_packs(user_id, pack_name, added_at) '
    + 'VALUES(?, ?, ?)'
  ).bind(owner, name, stamp).run();

  return customEmojiPackAccess(env, owner, {unlimited});
}
