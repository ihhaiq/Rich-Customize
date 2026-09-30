import { api, db } from 'sdk';
import { and, eq, lt } from 'sdk/db';
import { miniappUserPickerRequests, richPages } from 'schema';
import { findUserButtonMarkers } from 'lib/rich-text';
import { validateEditorLimits } from 'lib/editor-blocks';
import { directMiniAppLink } from 'lib/miniapp';
import { resolveUserLanguage, tr } from 'lib/i18n';

const PICKER_TTL_SECONDS = 30 * 60;

function now() {
  return Math.floor(Date.now() / 1000);
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function findBlock(blocks, blockId) {
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object' || Array.isArray(block)) continue;
    if (String(block.id) === String(blockId)) return block;
    const data = block.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
    const nested = [];
    if (Array.isArray(data.children)) nested.push(...data.children);
    if (Array.isArray(data.media_children)) nested.push(...data.media_children);
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        if (item && typeof item === 'object' && Array.isArray(item.blocks)) {
          nested.push(...item.blocks);
        }
      }
    }
    const found = findBlock(nested, blockId);
    if (found) return found;
  }
  return null;
}

function cleanTitle(value) {
  const title = String(value || 'زر')
    .replaceAll('{', '')
    .replaceAll('}', '')
    .replaceAll('\n', ' ')
    .trim();
  return title.slice(0, 64) || 'زر';
}

function containsMarker(value, marker) {
  if (typeof value === 'string') return value.includes(marker);
  if (Array.isArray(value)) return value.some((item) => containsMarker(item, marker));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => containsMarker(item, marker));
  }
  return false;
}

function replaceMarkerAll(value, marker, replacement) {
  if (typeof value === 'string') return value.replaceAll(marker, replacement);
  if (Array.isArray(value)) {
    return value.map((item) => replaceMarkerAll(item, marker, replacement));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        replaceMarkerAll(item, marker, replacement),
      ]),
    );
  }
  return value;
}

async function getOwnedPage(ownerId, pageId) {
  const row = await db.select().from(richPages).where(and(
    eq(richPages.pageId, String(pageId)),
    eq(richPages.ownerId, Number(ownerId)),
  )).get();
  return row || null;
}

async function cleanup() {
  await db.delete(miniappUserPickerRequests)
    .where(lt(miniappUserPickerRequests.expiresAt, now()))
    .run();
}

function nextRequestId() {
  const bytes = new Uint32Array(1);
  globalThis.crypto.getRandomValues(bytes);
  return 1 + (bytes[0] % 2147483646);
}

async function allocateRequestId(payload) {
  await cleanup();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const requestId = nextRequestId();
    const inserted = await db.insert(miniappUserPickerRequests).values({
      requestId,
      ownerId: Number(payload.ownerId),
      pageId: String(payload.pageId),
      blockId: String(payload.blockId),
      marker: payload.marker == null ? null : String(payload.marker),
      title: String(payload.title),
      color: payload.color == null ? null : String(payload.color),
      baseUpdatedAt: Number(payload.baseUpdatedAt),
      createdAt: now(),
      expiresAt: now() + PICKER_TTL_SECONDS,
    }).onConflictDoNothing({
      target: miniappUserPickerRequests.requestId,
    }).returning({
      requestId: miniappUserPickerRequests.requestId,
    }).run();
    if (Array.isArray(inserted) && inserted.length) return requestId;
  }
  throw new Error('Could not allocate Mini App user-picker request ID');
}

export async function prepareMiniAppUserPicker({
  ownerId,
  pageId,
  blockId,
  marker = null,
}) {
  const page = await getOwnedPage(ownerId, pageId);
  if (!page) {
    const error = new Error('Page not found');
    error.code = 'PAGE_NOT_FOUND';
    throw error;
  }

  const block = findBlock(page.blocks || [], blockId);
  if (!block) {
    const error = new Error('Block not found');
    error.code = 'BLOCK_NOT_FOUND';
    throw error;
  }

  let title;
  let color = null;
  if (marker) {
    const matches = findUserButtonMarkers(String(marker));
    if (!matches.length || matches[0].marker !== String(marker)) {
      const error = new Error('Invalid user-button marker');
      error.code = 'INVALID_USER_BUTTON';
      throw error;
    }
    if (!containsMarker(block.data || {}, String(marker))) {
      const error = new Error('User button was not found in the selected block');
      error.code = 'BUTTON_NOT_FOUND';
      throw error;
    }
    title = cleanTitle(matches[0].title);
    color = matches[0].color || null;
  } else {
    const rich = block?.data?._rich_button;
    if (!rich || typeof rich !== 'object' || String(rich.button_type) !== 'user') {
      const error = new Error('User button was not found in the selected block');
      error.code = 'BUTTON_NOT_FOUND';
      throw error;
    }
    title = cleanTitle(rich.title);
    color = rich.color || null;
  }

  const requestId = await allocateRequestId({
    ownerId,
    pageId,
    blockId,
    marker,
    title,
    color,
    baseUpdatedAt: page.updatedAt,
  });

  await api.sendMessage({
    chat_id: Number(ownerId),
    text: 'اختر المستخدم\n' + title,
    reply_markup: {
      keyboard: [[{
        text: '👤 اختيار · ' + title,
        request_users: {
          request_id: requestId,
          max_quantity: 1,
          request_name: true,
          request_username: true,
          request_photo: true,
        },
      }]],
      resize_keyboard: true,
      one_time_keyboard: true,
      selective: true,
    },
  });

  return {
    status: 'picker_ready',
    user_id: Number(ownerId),
    page_id: String(pageId),
    user_picker_request_id: requestId,
    updated_at: Number(page.updatedAt || 0),
  };
}

async function selectedUsername(sharedUser) {
  const direct = String(sharedUser?.username || '').replace(/^@+/, '').trim();
  if (direct) return direct;
  try {
    const known = await api.getChat({ chat_id: Number(sharedUser?.user_id) });
    return String(known?.username || '').replace(/^@+/, '').trim() || null;
  } catch {
    return null;
  }
}

async function sendPickerFailure(message, source) {
  const locale = await resolveUserLanguage(message?.from);
  await api.sendMessage({
    chat_id: message.chat.id,
    text: tr(locale, source),
    reply_markup: { remove_keyboard: true },
  });
}

export async function handleMiniAppUserPickerShared(message) {
  if (String(message?.chat?.type || '') !== 'private') return false;
  const shared = message?.users_shared;
  if (!shared || !Array.isArray(shared.users) || !shared.users.length) return false;

  const ownerId = Number(message?.from?.id);
  const requestId = Number(shared.request_id);
  if (!Number.isSafeInteger(ownerId) || !Number.isInteger(requestId)) return false;

  await cleanup();
  const pending = await db.select().from(miniappUserPickerRequests).where(and(
    eq(miniappUserPickerRequests.requestId, requestId),
    eq(miniappUserPickerRequests.ownerId, ownerId),
  )).get();
  if (!pending) return false;

  await db.delete(miniappUserPickerRequests)
    .where(eq(miniappUserPickerRequests.requestId, requestId))
    .run();

  const page = await getOwnedPage(ownerId, pending.pageId);
  if (!page) {
    await sendPickerFailure(message, 'The saved page no longer exists.');
    return true;
  }
  if (Number(page.updatedAt) !== Number(pending.baseUpdatedAt)) {
    await sendPickerFailure(
      message,
      'The page changed after the user picker was opened. Open the Mini App and try again.',
    );
    return true;
  }

  const blocks = clone(page.blocks || []);
  const block = findBlock(blocks, pending.blockId);
  if (!block) {
    await sendPickerFailure(message, 'The selected button no longer exists.');
    return true;
  }

  const selectedUser = shared.users[0];
  const selectedUserId = Number(selectedUser?.user_id);
  if (!Number.isSafeInteger(selectedUserId) || selectedUserId <= 0) {
    await sendPickerFailure(message, 'The selected user is invalid.');
    return true;
  }

  const username = await selectedUsername(selectedUser);
  const targetLabel = username ? '@' + username : String(selectedUserId);
  let title = cleanTitle(pending.title);

  if (pending.marker) {
    if (!containsMarker(block.data || {}, pending.marker)) {
      await sendPickerFailure(message, 'The selected button no longer exists.');
      return true;
    }
    const color = ['r', 'b', 'p', 'g'].includes(String(pending.color || ''))
      ? ' #' + String(pending.color)
      : '';
    const replacement = '{' + title + ':user:' + selectedUserId + color + '}';
    block.data = replaceMarkerAll(block.data || {}, pending.marker, replacement);
  } else {
    const rich = block?.data?._rich_button;
    if (!rich || typeof rich !== 'object' || String(rich.button_type) !== 'user') {
      await sendPickerFailure(message, 'The selected button no longer exists.');
      return true;
    }
    rich.value = String(selectedUserId);
    rich.target_user_id = selectedUserId;
    if (username) rich.target_username = username;
    rich.target_label = targetLabel;
    rich.configured = true;
    title = cleanTitle(rich.title);

    const suffix = ['r', 'b', 'p', 'g'].includes(String(rich.color || ''))
      ? ' #' + String(rich.color)
      : '';
    const marker = '{' + title + ':user:' + selectedUserId + suffix + '}';
    block.data.text = marker;
    block.data.html = '<p>' + marker
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      + '</p>';
    block.data.rich_text = null;
  }

  const limits = validateEditorLimits(blocks);
  if (!limits.ok) {
    await sendPickerFailure(message, 'The updated page exceeds the editor limits.');
    return true;
  }

  const stamp = Math.max(now(), Number(page.updatedAt || 0) + 1);
  const updated = await db.update(richPages).set({
    blocks,
    updatedAt: stamp,
  }).where(and(
    eq(richPages.pageId, String(page.pageId)),
    eq(richPages.ownerId, ownerId),
    eq(richPages.updatedAt, Number(pending.baseUpdatedAt)),
  )).returning({
    pageId: richPages.pageId,
  }).run();

  if (!Array.isArray(updated) || !updated.length) {
    await sendPickerFailure(
      message,
      'The page changed while the user selection was being applied. Open the Mini App and try again.',
    );
    return true;
  }

  const locale = await resolveUserLanguage(message?.from);
  await api.sendMessage({
    chat_id: message.chat.id,
    text: tr(locale, 'Button added') + '\n' + title + ' → ' + targetLabel,
    reply_markup: { remove_keyboard: true },
  });

  try {
    const me = await api.getMe();
    if (me?.username) {
      await api.sendMessage({
        chat_id: message.chat.id,
        text: tr(locale, 'Customize'),
        reply_markup: {
          inline_keyboard: [[{
            text: tr(locale, 'Edit'),
            url: directMiniAppLink(me.username, 'page_' + String(page.pageId)),
          }]],
        },
      });
    }
  } catch {}

  return true;
}
