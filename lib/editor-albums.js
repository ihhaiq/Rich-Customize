import { db } from 'sdk';
import { and, asc, eq, lt } from 'sdk/db';
import { editorAlbumItems } from 'schema';

const ALBUM_TTL_SECONDS = 60 * 60;

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function safeTokenPart(value) {
  const input = String(value || '');
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    first ^= code;
    first = Math.imul(first, 0x01000193) >>> 0;
    second ^= code + index;
    second = Math.imul(second, 0x85ebca6b) >>> 0;
  }
  return first.toString(16).padStart(8, '0') + second.toString(16).padStart(8, '0');
}

export function albumToken(userId, mediaGroupId, purpose = '') {
  return safeTokenPart(String(userId) + ':' + String(mediaGroupId) + ':' + String(purpose));
}

async function cleanupAlbums(stamp = nowSeconds()) {
  await db.delete(editorAlbumItems)
    .where(lt(editorAlbumItems.createdAt, stamp - ALBUM_TTL_SECONDS))
    .run();
}

export async function rememberAlbumPart(
  userId,
  mediaGroupId,
  messageId,
  blocks,
) {
  const uid = Number(userId);
  const mid = Number(messageId);
  const group = String(mediaGroupId || '');
  if (!Number.isSafeInteger(uid) || !Number.isSafeInteger(mid) || !group) return false;

  const stamp = nowSeconds();
  await cleanupAlbums(stamp);
  const key = uid + ':' + group + ':' + mid;
  await db.insert(editorAlbumItems).values({
    key,
    userId: uid,
    mediaGroupId: group,
    messageId: mid,
    blocks: Array.isArray(blocks) ? blocks : [],
    createdAt: stamp,
  }).onConflictDoUpdate({
    target: editorAlbumItems.key,
    set: {
      blocks: Array.isArray(blocks) ? blocks : [],
      createdAt: stamp,
    },
  }).run();
  return true;
}

export async function readAlbumBatch(userId, mediaGroupId) {
  const uid = Number(userId);
  const group = String(mediaGroupId || '');
  if (!Number.isSafeInteger(uid) || !group) {
    return { blocks: [], parts: 0, latestCreatedAt: 0, quiet: false };
  }
  const rows = await db.select().from(editorAlbumItems)
    .where(and(
      eq(editorAlbumItems.userId, uid),
      eq(editorAlbumItems.mediaGroupId, group),
    ))
    .orderBy(asc(editorAlbumItems.messageId))
    .all();
  const blocks = [];
  let latestCreatedAt = 0;
  for (const row of rows) {
    latestCreatedAt = Math.max(latestCreatedAt, Number(row.createdAt || 0));
    for (const block of Array.isArray(row.blocks) ? row.blocks : []) {
      if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
      blocks.push({
        ...JSON.parse(JSON.stringify(block)),
        position: blocks.length,
      });
    }
  }
  return {
    blocks,
    parts: rows.length,
    latestCreatedAt,
    quiet: Boolean(rows.length && nowSeconds() - latestCreatedAt >= 1),
  };
}

export async function readAlbumBlocks(userId, mediaGroupId) {
  return (await readAlbumBatch(userId, mediaGroupId)).blocks;
}

export async function clearAlbum(userId, mediaGroupId) {
  const uid = Number(userId);
  const group = String(mediaGroupId || '');
  if (!Number.isSafeInteger(uid) || !group) return;
  await db.delete(editorAlbumItems)
    .where(and(
      eq(editorAlbumItems.userId, uid),
      eq(editorAlbumItems.mediaGroupId, group),
    ))
    .run();
}
