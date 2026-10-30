import { api, db } from 'sdk';
import { and, eq } from 'sdk/db';
import { legacyStates } from 'schema';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { isDeveloper } from 'lib/developer-access';
import { safePlanLimit } from 'lib/subscription-policy';

const STATE_PREFIX = 'miniapp_custom_emoji_packs:';
const MAX_LEGACY_PACKS = 50;
const MAX_DEVELOPER_LEGACY_PACKS = 500;
const MAX_PREVIEW_BYTES = 512 * 1024;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function packName(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/addemoji\/([A-Za-z0-9_]{1,64})\/?(?:\?[^\s#]*)?$/i)
    || raw.match(/^tg:\/\/addemoji\?set=([A-Za-z0-9_]{1,64})$/i);
  const name = match?.[1] || raw;
  return /^[A-Za-z0-9_]{1,64}$/.test(name) ? name : '';
}

function packNames(value) {
  if (!Array.isArray(value)) return [];
  const names = value.map(packName);
  if (names.some((name) => !name) || new Set(names).size !== names.length) {
    throw new Error('INVALID_CUSTOM_EMOJI_PACKS');
  }
  return names;
}

function stateNamespace(ownerId) {
  return STATE_PREFIX + String(ownerId);
}

function unpackState(row) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const names = [];
  for (const name of Array.isArray(payload.packNames) ? payload.packNames : []) {
    const safe = packName(name);
    if (safe && !names.includes(safe)) names.push(safe);
  }
  const pinnedPack = names.includes(packName(payload.pinnedPack)) ? packName(payload.pinnedPack) : '';
  return { packNames: names, pinnedPack };
}

async function loadState(ownerId) {
  const namespace = stateNamespace(ownerId);
  const row = await db.select().from(legacyStates).where(eq(legacyStates.namespace, namespace)).get();
  return { namespace, row, state: unpackState(row) };
}

function entitlementLimit(ownerId) {
  return getEditorEntitlement(ownerId).then((entitlement) => ({
    developer: isDeveloper(ownerId),
    limit: safePlanLimit(entitlement, 'emojiPacks'),
  }));
}

function visibleNames(state, limit) {
  const ordered = state.pinnedPack
    ? [state.pinnedPack, ...state.packNames.filter((name) => name !== state.pinnedPack)]
    : state.packNames;
  return limit == null ? ordered : ordered.slice(0, limit);
}

function accessPayload(state, limit, developer) {
  const names = visibleNames(state, limit);
  return {
    is_developer: developer,
    custom_emoji_pack_limit: limit,
    custom_emoji_pack_count: state.packNames.length,
    custom_emoji_packs: names,
    custom_emoji_pinned_pack: state.pinnedPack,
    migration_required: !state.exists,
  };
}

async function stateWithExists(ownerId) {
  const loaded = await loadState(ownerId);
  return { ...loaded.state, exists: Boolean(loaded.row) };
}

async function compareAndSwapState(ownerId, update) {
  const namespace = stateNamespace(ownerId);
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const row = await db.select().from(legacyStates).where(eq(legacyStates.namespace, namespace)).get();
    const current = unpackState(row);
    const next = update(current, Boolean(row));
    if (!next) return { ...current, exists: Boolean(row) };
    const updatedAt = Math.max(Math.floor(Date.now() / 1000), Number(row?.updatedAt || 0) + 1);
    if (!row) {
      const inserted = await db.insert(legacyStates).values({
        namespace,
        payload: { version: 1, packNames: next.packNames, pinnedPack: next.pinnedPack },
        updatedAt,
      }).onConflictDoNothing({ target: legacyStates.namespace })
        .returning({ namespace: legacyStates.namespace }).run();
      if (inserted?.length) return { ...next, exists: true };
      continue;
    }
    const updated = await db.update(legacyStates).set({
      payload: { version: 1, packNames: next.packNames, pinnedPack: next.pinnedPack },
      updatedAt,
    }).where(and(
      eq(legacyStates.namespace, namespace),
      eq(legacyStates.updatedAt, row.updatedAt),
    )).returning({ namespace: legacyStates.namespace }).run();
    if (updated?.length) return { ...next, exists: true };
  }
  throw new Error('CUSTOM_EMOJI_STATE_CONFLICT');
}

function validatePackLimit(names, limit) {
  if (limit != null && names.length > limit) throw new Error('CUSTOM_EMOJI_PACK_LIMIT');
}

export async function getMiniAppCustomEmojiPacks(ownerId) {
  const state = await stateWithExists(ownerId);
  const { developer, limit } = await entitlementLimit(ownerId);
  return { ok: true, access: accessPayload(state, limit, developer) };
}

export async function importMiniAppCustomEmojiPacks(ownerId, inputNames, inputPinnedPack = '') {
  const requested = packNames(inputNames);
  const pinnedPack = inputPinnedPack ? packName(inputPinnedPack) : '';
  if (inputPinnedPack && (!pinnedPack || !requested.includes(pinnedPack))) {
    throw new Error('INVALID_CUSTOM_EMOJI_PACKS');
  }
  const { developer, limit } = await entitlementLimit(ownerId);
  if (requested.length > (developer ? MAX_DEVELOPER_LEGACY_PACKS : MAX_LEGACY_PACKS)) {
    throw new Error('INVALID_CUSTOM_EMOJI_PACKS');
  }
  const state = await compareAndSwapState(ownerId, (current, exists) => {
    if (exists) return null;
    return { packNames: requested, pinnedPack };
  });
  return { ok: true, access: accessPayload(state, limit, developer) };
}

async function telegramCustomEmojiPack(inputName) {
  const name = packName(inputName);
  if (!name) throw new Error('INVALID_CUSTOM_EMOJI_PACK');
  const set = await api.getStickerSet({ name });
  if (set?.sticker_type !== 'custom_emoji' || !Array.isArray(set.stickers) || !set.stickers.length) {
    throw new Error('NOT_A_CUSTOM_EMOJI_PACK');
  }
  const ids = set.stickers.map((sticker) => String(sticker?.custom_emoji_id || ''));
  if (ids.some((id) => !/^[1-9][0-9]{0,19}$/.test(id))) {
    throw new Error('INCOMPLETE_CUSTOM_EMOJI_PACK');
  }
  const verified = [];
  for (let offset = 0; offset < ids.length; offset += 200) {
    const batch = await api.getCustomEmojiStickers({ custom_emoji_ids: ids.slice(offset, offset + 200) });
    if (Array.isArray(batch)) verified.push(...batch);
  }
  const metadata = new Map((Array.isArray(verified) ? verified : []).map((sticker) => [
    String(sticker?.custom_emoji_id || ''),
    {
      emoji: String(sticker?.emoji || ''),
      preview_file_id: String(
        sticker?.thumbnail?.file_id
        || sticker?.thumb?.file_id
        || (!sticker?.is_animated && !sticker?.is_video ? sticker?.file_id : '')
        || ''
      ),
    },
  ]));
  const emojis = ids.map((id) => ({
    custom_emoji_id: id,
    emoji: metadata.get(id)?.emoji || '',
    preview_file_id: metadata.get(id)?.preview_file_id || '',
  }));
  if (emojis.some((item) => !item.emoji)) throw new Error('INCOMPLETE_CUSTOM_EMOJI_METADATA');
  return {
    name,
    set,
    pack: {
      name: String(set.name || name),
      title: String(set.title || name),
      emoji_count: emojis.length,
      emojis,
    },
  };
}

export async function getMiniAppCustomEmojiPack(ownerId, inputName) {
  const name = packName(inputName);
  if (!name) throw new Error('INVALID_CUSTOM_EMOJI_PACK');
  const state = await stateWithExists(ownerId);
  if (!state.exists) throw new Error('CUSTOM_EMOJI_MIGRATION_REQUIRED');
  const { developer, limit } = await entitlementLimit(ownerId);
  if (!visibleNames(state, developer ? null : limit).includes(name)) {
    throw new Error('CUSTOM_EMOJI_PACK_NOT_FOUND');
  }
  const data = await telegramCustomEmojiPack(name);
  return {
    ok: true,
    access: accessPayload(state, limit, developer),
    pack: data.pack,
  };
}

export async function addMiniAppCustomEmojiPack(ownerId, inputName) {
  if (!(await loadState(ownerId)).row) throw new Error('CUSTOM_EMOJI_MIGRATION_REQUIRED');
  const data = await telegramCustomEmojiPack(inputName);
  const { name } = data;
  const { developer, limit } = await entitlementLimit(ownerId);
  const state = await compareAndSwapState(ownerId, (current) => {
    if (current.packNames.includes(name)) return null;
    validatePackLimit(current.packNames.concat(name), developer ? null : limit);
    return { packNames: current.packNames.concat(name), pinnedPack: current.pinnedPack };
  });
  return {
    ok: true,
    access: accessPayload(state, limit, developer),
    pack: data.pack,
  };
}

export async function manageMiniAppCustomEmojiPacks(ownerId, action, input) {
  if (!(await loadState(ownerId)).row) throw new Error('CUSTOM_EMOJI_MIGRATION_REQUIRED');
  const { developer, limit } = await entitlementLimit(ownerId);
  const state = await compareAndSwapState(ownerId, (current) => {
    let names = current.packNames;
    let pinnedPack = current.pinnedPack;
    if (action === 'delete') {
      const name = packName(input?.name);
      if (!name || !names.includes(name)) throw new Error('CUSTOM_EMOJI_PACK_NOT_FOUND');
      names = names.filter((item) => item !== name);
      if (pinnedPack === name) pinnedPack = '';
    } else if (action === 'reorder') {
      const requested = packNames(input?.names);
      if (requested.length !== names.length || requested.some((name) => !names.includes(name))) {
        throw new Error('CUSTOM_EMOJI_PACK_ORDER_CONFLICT');
      }
      names = requested;
    } else if (action === 'pin') {
      const name = packName(input?.name);
      if (!name || !names.includes(name)) throw new Error('CUSTOM_EMOJI_PACK_NOT_FOUND');
      pinnedPack = name;
    } else {
      throw new Error('INVALID_CUSTOM_EMOJI_PACK_ACTION');
    }
    validatePackLimit(names, developer ? null : limit);
    if (names.length === current.packNames.length
      && names.every((name, index) => name === current.packNames[index])
      && pinnedPack === current.pinnedPack) return null;
    return { packNames: names, pinnedPack };
  });
  return { ok: true, access: accessPayload(state, limit, developer) };
}

function base64(bytes) {
  let encoded = '';
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index];
    const hasB = index + 1 < bytes.length;
    const hasC = index + 2 < bytes.length;
    const b = hasB ? bytes[index + 1] : 0;
    const c = hasC ? bytes[index + 2] : 0;
    encoded += BASE64[a >> 2];
    encoded += BASE64[((a & 3) << 4) | (b >> 4)];
    encoded += hasB ? BASE64[((b & 15) << 2) | (c >> 6)] : '=';
    encoded += hasC ? BASE64[c & 63] : '=';
  }
  return encoded;
}

function byteArray(value) {
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error('TELEGRAM_PREVIEW_FORMAT_UNSUPPORTED');
}

function imageType(bytes) {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  throw new Error('TELEGRAM_PREVIEW_TYPE_UNSUPPORTED');
}

export async function getMiniAppCustomEmojiPreview(inputId) {
  const id = String(inputId || '').trim();
  if (!/^[1-9][0-9]{0,19}$/.test(id)) throw new Error('INVALID_CUSTOM_EMOJI_ID');
  const stickers = await api.getCustomEmojiStickers({ custom_emoji_ids: [id] });
  const sticker = Array.isArray(stickers) ? stickers[0] : null;
  if (!sticker) throw new Error('CUSTOM_EMOJI_NOT_FOUND');
  const fileId = String(
    sticker?.thumbnail?.file_id
    || sticker?.thumb?.file_id
    || (!sticker?.is_animated && !sticker?.is_video ? sticker?.file_id : '')
    || ''
  );
  if (!fileId) throw new Error('CUSTOM_EMOJI_PREVIEW_UNAVAILABLE');
  const bytes = byteArray(await api.getFileContent(fileId));
  if (!bytes.length) throw new Error('CUSTOM_EMOJI_PREVIEW_UNAVAILABLE');
  if (bytes.length > MAX_PREVIEW_BYTES) throw new Error('CUSTOM_EMOJI_PREVIEW_TOO_LARGE');
  return { ok: true, content_type: imageType(bytes), data_base64: base64(bytes) };
}
