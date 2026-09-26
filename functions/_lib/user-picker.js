import { findUserButtonMarkers } from '../../lib/rich-text.js';
import { HttpError } from './http.js';
import { getPage, updatePage, validatePagePayload } from './pages.js';

function now() {
  return Math.floor(Date.now() / 1000);
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
        if (item && typeof item === 'object' && Array.isArray(item.blocks)) nested.push(...item.blocks);
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

function replaceMarkerAll(value, marker, replacement) {
  if (typeof value === 'string') return value.replaceAll(marker, replacement);
  if (Array.isArray(value)) return value.map((item) => replaceMarkerAll(item, marker, replacement));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, replaceMarkerAll(item, marker, replacement)])
    );
  }
  return value;
}

function containsMarker(value, marker) {
  if (typeof value === 'string') return value.includes(marker);
  if (Array.isArray(value)) return value.some((item) => containsMarker(item, marker));
  if (value && typeof value === 'object') return Object.values(value).some((item) => containsMarker(item, marker));
  return false;
}

function nextRequestId() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return 1 + (bytes[0] % 2147483646);
}

export async function createUserPicker(db, ownerId, pageId, blockId, marker = null) {
  await db.prepare('DELETE FROM miniapp_user_pickers WHERE created_at < ?')
    .bind(now() - 1800).run();

  const page = await getPage(db, pageId);
  if (!page || page.owner_id !== Number(ownerId)) throw new HttpError(404, 'page_not_found');
  const block = findBlock(page.blocks, blockId);
  if (!block) throw new HttpError(404, 'block_not_found');

  let title;
  let color = null;
  if (marker) {
    const matches = findUserButtonMarkers(marker);
    if (!matches.length || matches[0].marker !== marker) throw new HttpError(400, 'invalid_request');
    if (!containsMarker(block.data || {}, marker)) throw new HttpError(400, 'button_not_found');
    title = cleanTitle(matches[0].title);
    color = matches[0].color || null;
  } else {
    const rich = block?.data?._rich_button;
    if (!rich || typeof rich !== 'object' || String(rich.button_type) !== 'user') {
      throw new HttpError(400, 'button_not_found');
    }
    title = cleanTitle(rich.title);
    color = rich.color || null;
  }

  let requestId;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    requestId = nextRequestId();
    const result = await db.prepare(
      'INSERT OR IGNORE INTO miniapp_user_pickers '
      + '(request_id, owner_id, page_id, block_id, marker, title, color, created_at) '
      + 'VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      requestId,
      Number(ownerId),
      String(pageId),
      String(blockId),
      marker ? String(marker) : null,
      title,
      color ? String(color) : null,
      now(),
    ).run();
    if (Number(result.meta?.changes || 0) > 0) break;
    requestId = null;
  }
  if (!requestId) throw new HttpError(500, 'could_not_create_request');
  return { requestId, title };
}

export async function completeUserPicker(db, ownerId, requestId, selectedUserId, username = null) {
  const pending = await db.prepare(
    'SELECT * FROM miniapp_user_pickers WHERE request_id = ? AND owner_id = ?'
  ).bind(Number(requestId), Number(ownerId)).first();
  if (!pending) return null;

  await db.prepare('DELETE FROM miniapp_user_pickers WHERE request_id = ?')
    .bind(Number(requestId)).run();

  const page = await getPage(db, pending.page_id);
  if (!page || page.owner_id !== Number(ownerId)) return null;
  const blocks = JSON.parse(JSON.stringify(page.blocks || []));
  const block = findBlock(blocks, pending.block_id);
  if (!block) return null;

  const targetLabel = username ? '@' + String(username).replace(/^@+/, '') : String(selectedUserId);
  let title = cleanTitle(pending.title);

  if (pending.marker) {
    if (!containsMarker(block.data || {}, pending.marker)) return null;
    const color = ['r','b','p','g'].includes(String(pending.color || ''))
      ? ' #' + String(pending.color)
      : '';
    const replacement = '{' + title + ':user:' + selectedUserId + color + '}';
    block.data = replaceMarkerAll(block.data || {}, pending.marker, replacement);
  } else {
    const rich = block?.data?._rich_button;
    if (!rich || typeof rich !== 'object' || String(rich.button_type) !== 'user') return null;
    rich.value = String(selectedUserId);
    rich.target_user_id = Number(selectedUserId);
    if (username) rich.target_username = String(username).replace(/^@+/, '');
    rich.target_label = targetLabel;
    rich.configured = true;
    title = cleanTitle(rich.title);

    const suffix = ['r','b','p','g'].includes(String(rich.color || ''))
      ? ' #' + String(rich.color)
      : '';
    const marker = '{' + title + ':user:' + selectedUserId + suffix + '}';
    block.data.text = marker;
    block.data.html = '<p>' + marker
      .replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
      + '</p>';
    block.data.rich_text = null;
  }

  const content = validatePagePayload({
    blocks,
    buttons: page.buttons || [],
    buttons_per_row: page.buttons_per_row || 1,
    buttons_align: page.buttons_align || 'center',
  }, page);
  await updatePage(db, ownerId, page.page_id, page.title, content);
  return {
    page_id: page.page_id,
    block_id: String(pending.block_id),
    button_title: title,
    target_label: targetLabel,
  };
}
