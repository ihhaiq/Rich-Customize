import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { richPages } from 'schema';
import { blockId, blockLabel, validateEditorLimits } from 'lib/editor-blocks';
import { buildEditorKeyboard, buildEditorToolsKeyboard, editorDashboardRichMessage, editorCopy } from 'lib/editor-block-ui';
import { acquireEditorMutationLock, releaseEditorMutationLock, loadEditorSession, updateEditorSession, resetEditorTransientState } from 'lib/editor-session';
import { buildSingleBlockRichMessage } from 'lib/editor-renderer';
import { resolveLanguage, resolveUserLanguage, t } from 'lib/i18n';
import { richTextToHtml, plainRichText } from 'lib/rich-text';
import { emojiTargets, applyEmojiTarget } from 'lib/editor-emoji-targets';
import { initialEmojiPosition, moveEmojiPosition, insertEmojiAt } from 'lib/premium-emoji-text';

const FIRST = 9;
const PAGE_SIZE = 18;
const STATE = 'premium_emoji';
const clone = (value) => JSON.parse(JSON.stringify(value));
const copy = (locale, key, args) => t(locale, 'emoji.' + key, args);
const cell = (text, extra = {}) => ({ text, align: 'center', valign: 'middle', ...extra });
const table = (cells) => ({ type: 'table', cells, is_bordered: true, is_compact: true });
const button = (text, callback_data, style = 'primary') => ({ type: 'button', button: { text, callback_data, style } });
const callback = (flow, action, arg) => 'r:emoji:' + flow.token + ':' + action + (arg == null ? '' : ':' + arg);
const btn = (flow, text, action, arg, style) => button(text, callback(flow, action, arg), style);
const wide = (text) => [cell(text, { colspan: 3 })];
const flowOf = (session) => session?.addPayload?.premiumEmoji;

export function emojiPackName(input) {
  const value = String(input || '').trim();
  const match = value.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/addemoji\/([A-Za-z0-9_]{1,64})\/?(?:\?[^\s#]*)?$/i)
    || value.match(/^tg:\/\/addemoji\?set=([A-Za-z0-9_]{1,64})$/i);
  return match?.[1] || null;
}

export function customEmojiPack(set) {
  if (set?.sticker_type !== 'custom_emoji' || !Array.isArray(set.stickers) || !set.stickers.length) return null;
  // Reject inconsistent packs explicitly; never silently omit unavailable entries.
  if (set.stickers.some((sticker) => !/^[1-9][0-9]{0,19}$/.test(String(sticker.custom_emoji_id || ''))
    || typeof sticker.emoji !== 'string' || !sticker.emoji || sticker.emoji.length > 64)) return null;
  return set.stickers.map((sticker) => ({ type: 'custom_emoji',
    custom_emoji_id: String(sticker.custom_emoji_id), alternative_text: sticker.emoji }));
}

function headers(locale) {
  return ['choose', 'preview', 'code'].map((key) => cell(copy(locale, key), { is_header: true }));
}
function emojiRow(flow, index, locale) {
  const emoji = flow.emojis[index];
  const selected = flow.selected.includes(index);
  return [cell(btn(flow, selected ? '☑' : '☐', 'select', index, selected ? 'success' : 'primary')),
    cell(emoji), cell({ type: 'code', text: richTextToHtml(emoji) }, { align: 'left' })];
}

export function emojiPickerView(flow, locale) {
  const count = flow.emojis.length;
  const rows = [headers(locale), ...flow.emojis.slice(0, FIRST).map((_, i) => emojiRow(flow, i, locale))];
  if (flow.selected.length) rows.push(wide(btn(flow, copy(locale, 'finish'), 'finish', null, 'success')));
  if (count > FIRST) rows.push(wide(btn(flow, copy(locale, 'more'), 'more')));
  const blocks = [{ type: 'heading', size: 3, text: flow.title || copy(locale, 'title') }, table(rows)];
  if (flow.more && count > FIRST) {
    const start = FIRST + flow.page * PAGE_SIZE;
    const end = Math.min(count, start + PAGE_SIZE);
    const extraRows = [headers(locale)];
    for (let i = start; i < end; i += 1) extraRows.push(emojiRow(flow, i, locale));
    const nav = [];
    if (start > FIRST) nav.push(btn(flow, '‹', 'page', flow.page - 1));
    nav.push(copy(locale, 'range', { start: start + 1, end, total: count }));
    if (end < count) nav.push(btn(flow, '›', 'page', flow.page + 1));
    extraRows.push(wide(nav));
    blocks.push({ type: 'details', summary: copy(locale, 'range', { start: start + 1, end, total: count }),
      is_open: true, blocks: [table(extraRows)] });
  }
  blocks.push({ type: 'paragraph', text: btn(flow, t(locale, 'back'), 'back') });
  return { blocks, is_rtl: ['ar', 'ur'].includes(locale) };
}

function selectedBlock(session, flow) {
  return session.blocks.find((block) => block.id === flow.blockId);
}
function previewBlock(session, flow) {
  const block = selectedBlock(session, flow);
  const target = emojiTargets(block)[flow.targetIndex];
  return applyEmojiTarget(block, target, insertEmojiAt(target.value,
    flow.selected.map((index) => flow.emojis[index]), flow.position));
}
function inertPreview(value) {
  if (Array.isArray(value)) return value.map(inertPreview);
  if (!value || typeof value !== 'object') return value;
  if (value.type === 'button') return { type: 'button', button: { text: value.button?.text || '…', disabled: {} } };
  if (value.type === 'buttons') return { ...value, buttons: (value.buttons || []).map((item) => ({ text: item.text, disabled: {} })) };
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, inertPreview(item)]));
}

export function premiumEmojiView(session, locale) {
  const flow = flowOf(session);
  if (flow.stage === 'pack') return emojiPickerView(flow, locale);
  let blocks = [{ type: 'heading', size: 3, text: copy(locale, 'title') }];
  if (flow.stage === 'link') {
    blocks.push({ type: 'paragraph', text: copy(locale, flow.error || 'prompt') });
  } else if (flow.stage === 'blocks') {
    blocks.push({ type: 'paragraph', text: copy(locale, 'choose_block') });
    const rows = session.blocks.map((block, index) => [cell(emojiTargets(block).length
      ? btn(flow, (index + 1) + '. ' + blockLabel(block.type, locale), 'block', index)
      : (index + 1) + '. ' + blockLabel(block.type, locale) + ' — ' + copy(locale, 'no_text'))]);
    if (rows.length) blocks.push(table(rows));
    else blocks.push({ type: 'paragraph', text: copy(locale, 'no_text') });
  } else if (flow.stage === 'fields') {
    const targets = emojiTargets(selectedBlock(session, flow));
    const start = flow.fieldPage * PAGE_SIZE;
    blocks.push({ type: 'paragraph', text: copy(locale, 'choose_field') });
    blocks.push(table(targets.slice(start, start + PAGE_SIZE).map((target, index) => [cell(btn(flow,
      (start + index + 1) + '. ' + (plainRichText(target.value).replace(/\s+/g, ' ').slice(0, 40) || '…'),
      'field', start + index))])));
    const nav = [];
    if (start) nav.push(btn(flow, '‹', 'fields', flow.fieldPage - 1));
    nav.push(copy(locale, 'range', { start: start + 1, end: Math.min(targets.length, start + PAGE_SIZE), total: targets.length }));
    if (start + PAGE_SIZE < targets.length) nav.push(btn(flow, '›', 'fields', flow.fieldPage + 1));
    blocks.push({ type: 'paragraph', text: nav });
  } else if (flow.stage === 'position') {
    const preview = buildSingleBlockRichMessage(previewBlock(session, flow));
    blocks = inertPreview(preview.blocks);
    blocks.push({ type: 'divider' });
    blocks.push({ type: 'paragraph', text: copy(locale, 'move') });
    blocks.push(table([
      [cell(''), cell(btn(flow, '↑', 'move', 'up')), cell('')],
      [cell(btn(flow, '←', 'move', 'left')), cell(''), cell(btn(flow, '→', 'move', 'right'))],
      [cell(''), cell(btn(flow, '↓', 'move', 'down')), cell('')],
    ]));
    blocks.push({ type: 'paragraph', text: [btn(flow, copy(locale, 'confirm'), 'confirm', null, 'success'), ' ', btn(flow, copy(locale, 'cancel'), 'cancel')] });
    return { blocks, ...(typeof preview.is_rtl === 'boolean' ? { is_rtl: preview.is_rtl } : {}) };
  }
  blocks.push({ type: 'paragraph', text: btn(flow, t(locale, 'back'), 'back') });
  return { blocks, is_rtl: ['ar', 'ur'].includes(locale) };
}

async function render(session, locale, rich = premiumEmojiView(session, locale), reply_markup = { inline_keyboard: [] }) {
  try {
    await api.editMessageText({ chat_id: session.managementChatId, message_id: session.managementMessageId,
      rich_message: rich, reply_markup });
  } catch (error) {
    if (!/message is not modified/i.test(String(error?.description || error?.message || error))) throw error;
  }
}
async function saveFlow(session, flow, locale) {
  flow.token = blockId(); // Old buttons and double taps cannot replay an operation.
  const next = { ...session, state: STATE, addPayload: { premiumEmoji: flow }, blockScrollEnabled: 0 };
  // Build first: invalid/oversized previews must not strand the stored workflow.
  const view = premiumEmojiView(next, locale);
  await updateEditorSession(session.userId, { state: STATE, addPayload: next.addPayload, blockScrollEnabled: 0 });
  try { await render(next, locale, view); }
  catch (error) {
    await updateEditorSession(session.userId, { state: session.state, addPayload: session.addPayload, blockScrollEnabled: session.blockScrollEnabled });
    throw error;
  }
}
async function ownsPage(session, userId) {
  if (!session.currentPageId) return true;
  const page = await db.select().from(richPages).where(eq(richPages.pageId, String(session.currentPageId))).get();
  return Boolean(page && Number(page.ownerId) === Number(userId));
}
function ownsPanel(session, source) {
  const message = source.message || source;
  return session && String(message.chat?.type) === 'private'
    && Number(session.userId) === Number(source.from?.id)
    && Number(session.managementChatId) === Number(message.chat?.id)
    && (!source.message || Number(session.managementMessageId) === Number(message.message_id));
}
async function language(source) { return resolveLanguage(await resolveUserLanguage(source.from)); }

export async function handlePremiumEmojiMessage(message) {
  const initial = await loadEditorSession(message.from?.id, { touch: false });
  if (initial?.state !== STATE) return false;
  const lock = await acquireEditorMutationLock(message.from.id);
  if (!lock) return true;
  try {
    const session = await loadEditorSession(message.from.id);
    if (!ownsPanel(session, message) || session.state !== STATE) return true;
    const locale = await language(message);
    const flow = clone(flowOf(session));
    if (flow.stage !== 'link') return true;
    if (!await ownsPage(session, message.from.id)) {
      await api.sendMessage({ chat_id: message.chat.id, text: t(locale, 'expired') });
      return true;
    }
    const name = emojiPackName(message.text);
    if (!name) { flow.error = 'invalid'; await saveFlow(session, flow, locale); return true; }
    let set;
    try { set = await api.getStickerSet({ name }); }
    catch { flow.error = 'load_failed'; await saveFlow(session, flow, locale); return true; }
    const emojis = customEmojiPack(set);
    if (!emojis) { flow.error = 'invalid'; await saveFlow(session, flow, locale); return true; }
    Object.assign(flow, { stage: 'pack', title: String(set.title || name), emojis, selected: [], more: false, page: 0 });
    delete flow.error;
    await saveFlow(session, flow, locale);
    return true;
  } finally { await releaseEditorMutationLock(lock); }
}

export async function handlePremiumEmojiCallback(query) {
  const data = String(query.data || '');
  if (!data.startsWith('r:emoji:')) return false;
  const locale = await language(query);
  const answer = (text) => api.answerCallbackQuery({ callback_query_id: query.id, ...(text ? { text, show_alert: true } : {}) });
  const lock = await acquireEditorMutationLock(query.from.id);
  if (!lock) { await answer(); return true; }
  try {
    const session = await loadEditorSession(query.from.id);
    if (!ownsPanel(session, query) || !await ownsPage(session, query.from.id)) { await answer(t(locale, 'expired')); return true; }
    if (data === 'r:emoji:open') {
      if (session.state !== 'managing') { await answer(t(locale, 'expired')); return true; }
      await saveFlow(session, { stage: 'link', pageId: session.currentPageId }, locale);
      await answer(); return true;
    }
    const [, , token, action, arg] = data.split(':');
    const old = flowOf(session);
    if (session.state !== STATE || !old || token !== old.token || old.pageId !== session.currentPageId) { await answer(t(locale, 'expired')); return true; }
    const flow = clone(old);
    const index = /^\d+$/.test(arg || '') ? Number(arg) : -1;
    if (['fields', 'position'].includes(flow.stage) && !['cancel', 'back'].includes(action)
      && JSON.stringify(selectedBlock(session, flow)) !== JSON.stringify(flow.original)) {
      await answer(t(locale, 'expired')); return true;
    }
    if (action === 'back') {
      if (flow.stage === 'link' || flow.stage === 'pack') {
        await resetEditorTransientState(query.from.id);
        await api.editMessageText({ chat_id: session.managementChatId, message_id: session.managementMessageId,
          text: editorCopy(locale).toolsText, reply_markup: buildEditorToolsKeyboard(locale) });
        await answer(); return true;
      }
      flow.stage = 'pack';
    } else if (action === 'select' && flow.stage === 'pack' && flow.emojis[index]) {
      flow.selected = flow.selected.includes(index) ? flow.selected.filter((i) => i !== index) : [...flow.selected, index];
    } else if (action === 'more' && flow.stage === 'pack') { flow.more = true;
    } else if (action === 'page' && flow.stage === 'pack' && index >= 0 && FIRST + index * PAGE_SIZE < flow.emojis.length) { flow.page = index; flow.more = true;
    } else if (action === 'finish' && flow.stage === 'pack' && flow.selected.length) { flow.stage = 'blocks';
    } else if (action === 'block' && flow.stage === 'blocks' && session.blocks[index]) {
      const block = session.blocks[index];
      const targets = emojiTargets(block);
      if (!targets.length) { await answer(copy(locale, 'no_text')); return true; }
      flow.blockId = block.id;
      flow.original = clone(block);
      flow.fieldPage = 0;
      flow.stage = targets.length === 1 ? 'position' : 'fields';
      if (targets.length === 1) { flow.targetIndex = 0; flow.position = initialEmojiPosition(targets[0].value); }
    } else if (action === 'fields' && flow.stage === 'fields' && index >= 0 && index * PAGE_SIZE < emojiTargets(selectedBlock(session, flow)).length) { flow.fieldPage = index;
    } else if (action === 'field' && flow.stage === 'fields' && emojiTargets(selectedBlock(session, flow))[index]) {
      flow.targetIndex = index;
      flow.position = initialEmojiPosition(emojiTargets(selectedBlock(session, flow))[index].value);
      flow.stage = 'position';
    } else if (action === 'cancel' && flow.stage === 'position') { flow.stage = 'pack'; delete flow.original;
    } else if (['move', 'confirm'].includes(action) && flow.stage === 'position') {
      const block = selectedBlock(session, flow);
      if (JSON.stringify(block) !== JSON.stringify(flow.original)) { await answer(t(locale, 'expired')); return true; }
      if (action === 'move') {
        if (!['up', 'down', 'left', 'right'].includes(arg)) { await answer(); return true; }
        const direction = session.blocks.find((item) => typeof item.data?.rich_is_rtl === 'boolean')?.data.rich_is_rtl;
        flow.position = moveEmojiPosition(emojiTargets(block)[flow.targetIndex].value, flow.position, arg, direction);
      } else {
        const blocks = session.blocks.map((item) => item.id === block.id ? previewBlock(session, flow) : item);
        const limit = validateEditorLimits(blocks);
        if (!limit.ok) { await answer(t(locale, 'limits.' + limit.code, { limit: limit.limit })); return true; }
        // Store the mutation and history together. Saving the page is still explicit.
        const snapshot = { blocks: clone(session.blocks), messageButtons: clone(session.messageButtons || []),
          buttonsPerRow: session.buttonsPerRow, buttonsAlign: session.buttonsAlign,
          currentPageId: session.currentPageId, currentPageTitle: session.currentPageTitle };
        const updated = await updateEditorSession(query.from.id, { blocks, state: 'managing', addPayload: {},
          undoStack: [...(session.undoStack || []), snapshot].slice(-50), redoStack: [], blockScrollEnabled: 1 });
        await render(updated, locale, editorDashboardRichMessage(updated, locale), buildEditorKeyboard(updated, locale));
        await answer(); return true;
      }
    } else { await answer(t(locale, 'expired')); return true; }
    if (flow.stage === 'position') {
      const blocks = session.blocks.map((item) => item.id === flow.blockId ? previewBlock(session, flow) : item);
      const limit = validateEditorLimits(blocks);
      if (!limit.ok) { await answer(t(locale, 'limits.' + limit.code, { limit: limit.limit })); return true; }
    }
    await saveFlow(session, flow, locale);
    await answer();
    return true;
  } finally { await releaseEditorMutationLock(lock); }
}
