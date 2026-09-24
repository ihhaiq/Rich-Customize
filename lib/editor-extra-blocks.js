import { api } from 'sdk';
import {
  DETAILS_CHILD_TYPES,
  FINAL_RICH_BLOCK_TYPES,
  MEDIA_CAPTION_TYPES,
  QUOTE_TYPES,
  addBlock,
  editableTableData,
  getBlockById,
  makeBlock,
  mapData,
  moveBlock,
  normalizeBlocks,
  replaceBlockData,
  setAllTableCellsStyle,
  setTableCellStyle,
  tableFlag,
  tableRows,
  textData,
  validateEditorLimits,
} from 'lib/editor-blocks';
import {
  blockPage,
  buildAnchorTargetKeyboard,
  buildBlockEditorKeyboard,
  buildDetailsChildTypeKeyboard,
  buildDetailsContentKeyboard,
  buildDetailsInnerBlockKeyboard,
  buildDetailsInnerBlocksKeyboard,
  buildDetailsInnerDeleteKeyboard,
  buildEditorKeyboard,
  buildHeadingLevelKeyboard,
  buildListTypeKeyboard,
  buildTableCellKeyboard,
  buildTableDisplayKeyboard,
  buildTableOptionsKeyboard,
  editorCopy,
  editorDashboardText,
  editorLanguage,
} from 'lib/editor-block-ui';
import {
  loadEditorSession,
  rememberEditorState,
  resetEditorTransientState,
  setEditorState,
  updateEditorSession,
} from 'lib/editor-session';
import {
  messageToBlocks,
  quoteMediaPayload,
  replacementData,
} from 'lib/editor-import';
import {
  alignLinkedAnchors,
  anchorName,
  newAnchorData,
  setAnchorDisplayName,
} from 'lib/editor-anchors';
import {
  messageHtmlText,
  messageRichText,
} from 'lib/rich-text';
import { buildSingleBlockRichMessage } from 'lib/editor-renderer';
import {
  albumToken,
  clearAlbum,
  readAlbumBatch,
  readAlbumBlocks,
  rememberAlbumPart,
} from 'lib/editor-albums';

const SIMPLE_TEXT_TYPES = new Set([
  'mathematical_expression',
  'list',
  'table',
]);

const MEDIA_TYPES = new Set([
  'photo',
  'video',
  'animation',
  'audio',
  'voice',
  'document',
]);

const CONTAINER_TYPES = new Set(['collage', 'slideshow']);
const SLIDESHOW_LIMIT = 50;
const MAX_SLIDESHOW_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_SLIDESHOW_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_MEDIA_DIMENSION = 10000;
const MAX_IMAGE_PIXELS = 40000000;

function validateSlideshowMessage(message) {
  const photo = Array.isArray(message?.photo) && message.photo.length
    ? message.photo.at(-1)
    : null;
  const video = message?.video && typeof message.video === 'object'
    ? message.video
    : null;
  const media = photo || video;
  if (!media) return true;
  const maxBytes = photo ? MAX_SLIDESHOW_IMAGE_BYTES : MAX_SLIDESHOW_VIDEO_BYTES;
  const fileSize = Number(media.file_size || 0);
  if (fileSize > maxBytes) return false;
  const width = Number(media.width || 0);
  const height = Number(media.height || 0);
  if (width > MAX_MEDIA_DIMENSION || height > MAX_MEDIA_DIMENSION) return false;
  if (width > 0 && height > 0 && width * height > MAX_IMAGE_PIXELS) return false;
  return true;
}

function code(source) {
  return source?.from?.language_code || 'en';
}

function ar(source) {
  return editorLanguage(typeof source === 'string' ? source : code(source)) === 'ar';
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

async function answer(query, text = null, alert = false) {
  try {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      ...(text ? { text, show_alert: alert } : {}),
    });
  } catch {}
}

async function deleteQuietly(chatId, messageId) {
  if (!chatId || !messageId) return;
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch {}
}

async function editMessage(chatId, messageId, text, replyMarkup) {
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup,
    });
  } catch (error) {
    const reason = String(error?.description || error?.message || error).toLowerCase();
    if (!reason.includes('message is not modified')) throw error;
  }
}

async function editManagement(session, text, replyMarkup) {
  const chatId = session?.managementChatId || session?.chatId;
  const messageId = session?.managementMessageId;
  if (!chatId || !messageId) return false;
  await editMessage(chatId, messageId, text, replyMarkup);
  return true;
}

async function sendPrompt(userId, chatId, text, replyMarkup = undefined) {
  const sent = await api.sendMessage({
    chat_id: chatId,
    text,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });
  await updateEditorSession(userId, {
    addPromptChatId: sent.chat?.id || chatId,
    addPromptMessageId: sent.message_id,
  });
  return sent;
}

async function clearInputMessages(session, message) {
  const seen = new Set();
  for (const [chatId, messageId] of [
    [message?.chat?.id, message?.message_id],
    [session?.addPromptChatId, session?.addPromptMessageId],
  ]) {
    if (!chatId || !messageId) continue;
    const key = String(chatId) + ':' + String(messageId);
    if (seen.has(key)) continue;
    seen.add(key);
    await deleteQuietly(chatId, messageId);
  }
}

function limitText(result, languageCode) {
  if (ar(languageCode)) {
    if (result.code === 'blocks') return 'الرسالة تقدر تحتوي بحد أقصى ' + result.limit + ' بلوكة.';
    if (result.code === 'characters') return 'الرسالة تقدر تحتوي بحد أقصى ' + result.limit + ' حرف ظاهر.';
    if (result.code === 'table_rows') return 'الجدول يقدر يحتوي بحد أقصى ' + result.limit + ' صف.';
    if (result.code === 'table_columns') return 'الجدول يقدر يحتوي بحد أقصى ' + result.limit + ' عمود.';
    return 'تجاوز المحتوى أحد حدود المحرر.';
  }
  if (result.code === 'blocks') return 'This message can contain at most ' + result.limit + ' blocks.';
  if (result.code === 'characters') return 'This message can contain at most ' + result.limit + ' visible characters.';
  if (result.code === 'table_rows') return 'A table can contain at most ' + result.limit + ' rows.';
  if (result.code === 'table_columns') return 'A table can contain at most ' + result.limit + ' columns.';
  return 'The content exceeds an editor limit.';
}

async function repostManagement(userId, oldSession, languageCode, notice = null) {
  const latest = await loadEditorSession(userId, { touch: false });
  if (!latest) return null;
  const chatId = oldSession?.managementChatId || oldSession?.chatId;
  if (!chatId) return null;
  const sent = await api.sendMessage({
    chat_id: chatId,
    text: editorDashboardText(latest, languageCode, notice),
    reply_markup: buildEditorKeyboard(latest, languageCode),
  });
  await updateEditorSession(userId, {
    managementChatId: sent.chat?.id || chatId,
    managementMessageId: sent.message_id,
  });
  if (oldSession?.managementMessageId && Number(oldSession.managementMessageId) !== Number(sent.message_id)) {
    await deleteQuietly(oldSession.managementChatId || chatId, oldSession.managementMessageId);
  }
  return sent;
}

async function finishAdd(userId, session, message, block, languageCode) {
  const blocks = clone(session.blocks || []);
  addBlock(blocks, block);
  alignLinkedAnchors(blocks);
  const limit = validateEditorLimits(blocks);
  if (!limit.ok) {
    await api.sendMessage({ chat_id: message.chat.id, text: limitText(limit, languageCode) });
    return false;
  }
  await rememberEditorState(userId, session);
  await updateEditorSession(userId, {
    blocks,
    state: 'managing',
    currentBlockId: null,
    pendingAddType: null,
    pendingChildType: null,
    addStep: null,
    addPayload: {},
    expectedType: null,
    editField: null,
    headingSize: null,
    nestedDetailsId: null,
    nestedChildId: null,
    nestedAction: null,
    addPromptChatId: null,
    addPromptMessageId: null,
  });
  await clearInputMessages(session, message);
  await repostManagement(
    userId,
    session,
    languageCode,
    editorCopy(languageCode).added,
  );
  return true;
}

async function replaceTopBlock(userId, session, message, block, replacement, languageCode) {
  const blocks = clone(session.blocks || []);
  const updated = replaceBlockData(blocks, String(block.id), replacement, 'generated');
  if (!updated) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: ar(languageCode) ? 'هذا البلوك لم يعد موجودًا.' : 'This block no longer exists.',
    });
    return false;
  }
  alignLinkedAnchors(blocks);
  const limit = validateEditorLimits(blocks);
  if (!limit.ok) {
    await api.sendMessage({ chat_id: message.chat.id, text: limitText(limit, languageCode) });
    return false;
  }
  await rememberEditorState(userId, session);
  const latest = await updateEditorSession(userId, {
    blocks,
    state: 'managing',
    currentBlockId: null,
    expectedType: null,
    editField: null,
    headingSize: null,
    nestedDetailsId: null,
    nestedChildId: null,
    nestedAction: null,
    addPromptChatId: null,
    addPromptMessageId: null,
  });
  await clearInputMessages(session, message);
  const current = getBlockById(latest.blocks, block.id);
  if (current) {
    await editManagement(
      latest,
      blockPage(current, latest.blocks, languageCode),
      buildBlockEditorKeyboard(current, latest.blocks, languageCode),
    );
  }
  return true;
}

function stripNative(data) {
  const result = clone(data || {});
  delete result.native;
  delete result.native_data;
  delete result.native_type;
  return result;
}

function promptForAdd(type, languageCode) {
  const arabic = ar(languageCode);
  const prompts = {
    mathematical_expression: arabic ? 'أرسل المعادلة الرياضية.' : 'Send the mathematical expression.',
    anchor: arabic ? 'أرسل اسم المرساة.' : 'Send the anchor display name.',
    list: arabic ? 'أرسل عناصر القائمة، كل عنصر بسطر.' : 'Send list items, one per line.',
    table: arabic ? 'أرسل صفوف الجدول؛ كل صف بسطر وافصل الأعمدة بعلامة |' : 'Send table rows, one per line, separating columns with |.',
    blockquote: arabic ? 'أرسل نص الاقتباس، أو أرسل وسائط/ملفًا لوضعه داخل الاقتباس.' : 'Send quote text, or media/file to place inside the quote.',
    pullquote: arabic ? 'أرسل نص الاقتباس البارز، أو أرسل وسائط/ملفًا لإرفاقه به.' : 'Send pull quote text, or media/file to attach.',
    collage: arabic ? 'أرسل صور/فيديو للكولاج.' : 'Send photos/videos for the collage.',
    slideshow: arabic ? 'أرسل صور/فيديو لعرض الشرائح.' : 'Send photos/videos for the slideshow.',
    map: arabic ? 'أرسل موقعًا من مرفقات Telegram.' : 'Send a Telegram location.',
    animation: arabic ? 'أرسل GIF أو Animation.' : 'Send a GIF or animation.',
    audio: arabic ? 'أرسل ملف Audio.' : 'Send audio.',
    document: arabic ? 'أرسل الملف.' : 'Send a document.',
    photo: arabic ? 'أرسل الصورة.' : 'Send a photo.',
    video: arabic ? 'أرسل الفيديو.' : 'Send a video.',
    voice: arabic ? 'أرسل بصمة صوتية.' : 'Send a voice note.',
  };
  return prompts[type] || (arabic ? 'أرسل المحتوى.' : 'Send the content.');
}

function promptForEdit(type, languageCode) {
  const arabic = ar(languageCode);
  const prompts = {
    mathematical_expression: arabic ? 'أرسل المعادلة الجديدة.' : 'Send the new mathematical expression.',
    anchor: arabic ? 'أرسل الاسم الجديد للمرساة.' : 'Send the new anchor display name.',
    list: arabic ? 'أرسل عناصر القائمة الجديدة، كل عنصر بسطر.' : 'Send the new list items, one per line.',
    table: arabic ? 'أرسل صفوف الجدول الجديدة؛ افصل الأعمدة بعلامة |' : 'Send the new table rows, separating columns with |.',
    blockquote: arabic ? 'أرسل نص الاقتباس الجديد، أو وسائط/ملفًا جديدًا.' : 'Send new quote text or new media/file.',
    pullquote: arabic ? 'أرسل نص الاقتباس البارز الجديد، أو وسائط/ملفًا جديدًا.' : 'Send new pull quote text or new media/file.',
    collage: arabic ? 'أرسل صور/فيديو جديدة للكولاج.' : 'Send new photos/videos for the collage.',
    slideshow: arabic ? 'أرسل صور/فيديو جديدة لعرض الشرائح.' : 'Send new photos/videos for the slideshow.',
    map: arabic ? 'أرسل الموقع الجديد.' : 'Send the new location.',
    animation: arabic ? 'أرسل GIF جديدًا.' : 'Send a new GIF.',
    audio: arabic ? 'أرسل Audio جديدًا.' : 'Send new audio.',
    document: arabic ? 'أرسل الملف الجديد.' : 'Send the new document.',
    photo: arabic ? 'أرسل الصورة الجديدة.' : 'Send the new photo.',
    video: arabic ? 'أرسل الفيديو الجديد.' : 'Send the new video.',
    voice: arabic ? 'أرسل بصمة صوتية جديدة.' : 'Send the new voice note.',
    details: arabic ? 'أرسل المحتوى الجديد للتفاصيل.' : 'Send the new Details content.',
  };
  return prompts[type] || (arabic ? 'أرسل المحتوى الجديد من النوع نفسه.' : 'Send replacement content of the same type.');
}

function mediaBlock(message, type) {
  const parsed = messageToBlocks(message);
  const found = parsed.find((item) => String(item?.type || '') === String(type));
  if (!found) return null;
  const caption = parsed.find((item) => item?.type === 'caption');
  if (caption) {
    found.data.caption_html = caption.data?.html || null;
    found.data.caption_text = caption.data?.text || null;
    found.data.caption_rich_text = caption.data?.rich_text ?? null;
  }
  if (MEDIA_CAPTION_TYPES.includes(String(type))) {
    if (!Object.hasOwn(found.data, 'credit_html')) found.data.credit_html = null;
  }
  return found;
}

function mediaChildren(message) {
  return messageToBlocks(message)
    .filter((item) => ['photo', 'video'].includes(String(item?.type || '')))
    .map((item, index) => ({ ...item, position: index }));
}
function mediaChildrenFromBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((item) => ['photo', 'video'].includes(String(item?.type || '')))
    .map((item, index) => ({ ...item, position: index }));
}

async function rememberMediaGroup(message, purpose) {
  const groupId = String(message?.media_group_id || '');
  if (!groupId || !message?.from?.id || !message?.message_id) return null;
  await rememberAlbumPart(
    message.from.id,
    groupId,
    message.message_id,
    messageToBlocks(message),
  );
  const blocks = await readAlbumBlocks(message.from.id, groupId);
  return {
    groupId,
    token: albumToken(message.from.id, groupId, purpose),
    blocks,
  };
}

function collageConfirmationKeyboard(token, languageCode, nested = false) {
  return {
    inline_keyboard: [
      [{
        text: ar(languageCode) ? 'استمرار' : 'Continue',
        callback_data: 'r:collage:done:' + token,
        style: 'success',
      }],
      [{
        text: editorCopy(languageCode).back,
        callback_data: nested ? 'r:details:add' : 'r:back',
      }],
    ],
  };
}

function albumConfirmationKeyboard(token, languageCode, backData = 'r:back') {
  return {
    inline_keyboard: [
      [{
        text: ar(languageCode) ? 'استمرار' : 'Continue',
        callback_data: 'r:album:done:' + token,
        style: 'success',
      }],
      [{ text: editorCopy(languageCode).back, callback_data: backData }],
    ],
  };
}

async function queueAlbumFlow(
  message,
  session,
  mode,
  languageCode,
  values = {},
  backData = 'r:back',
) {
  const purpose = [
    'editor',
    mode,
    values.block_id || '',
    values.details_id || '',
    values.child_id || '',
  ].join(':');
  const collected = await rememberMediaGroup(message, purpose);
  if (!collected) return false;

  const payload = clone(session.addPayload || {});
  const existing = payload.album_flow;
  if (
    existing
    && existing.group_id
    && String(existing.group_id) !== String(collected.groupId)
  ) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: ar(languageCode)
        ? 'أنهِ الألبوم الحالي أولًا.'
        : 'Finish the current album first.',
    });
    return true;
  }

  payload.album_flow = {
    mode: String(mode),
    token: collected.token,
    group_id: collected.groupId,
    back_data: String(backData || 'r:back'),
    ...values,
  };
  await updateEditorSession(message.from.id, { addPayload: payload });
  await clearInputMessages(session, message);
  await sendPrompt(
    message.from.id,
    message.chat.id,
    (ar(languageCode) ? 'تم استلام عناصر الألبوم: ' : 'Album items received: ')
      + collected.blocks.length,
    albumConfirmationKeyboard(
      collected.token,
      languageCode,
      backData,
    ),
  );
  return true;
}

function quoteReplacementFromBlocks(parsed, oldData = {}) {
  const [media, caption] = quoteMediaPayload(parsed);
  if (!media.length) return null;
  const result = {
    ...stripNative(oldData),
    media_children: media,
  };
  if (caption) {
    result.quote_text = caption.data?.text || '';
    result.quote_html = caption.data?.html || '';
    result.quote_rich_text = caption.data?.rich_text ?? null;
  }
  return result;
}

function quoteReplacementFromMessage(message, oldData = {}) {
  if (typeof message?.text === 'string' && message.text) {
    return {
      quote_text: message.text,
      quote_html: messageHtmlText(message),
      quote_rich_text: messageRichText(message),
      credit_html: oldData.credit_html ?? null,
      credit_rich_text: oldData.credit_rich_text ?? null,
      media_children: clone(oldData.media_children || []),
    };
  }
  return quoteReplacementFromBlocks(messageToBlocks(message), oldData);
}

function detailsChildren(details) {
  const data = details?.data && typeof details.data === 'object' ? details.data : {};
  const children = Array.isArray(data.children) ? data.children : [];
  normalizeBlocks(children);
  data.children = children;
  details.data = data;
  return children;
}

function detachDetails(details) {
  if (!details.data || typeof details.data !== 'object' || Array.isArray(details.data)) details.data = {};
  details.source = 'generated';
  delete details.data.native;
  delete details.data.native_data;
  delete details.data.native_type;
  delete details.data.html;
  return details;
}

function findDetailsChild(details, childId) {
  return detailsChildren(details).find((item) => String(item?.id) === String(childId)) || null;
}

function replaceDetailsChild(details, childId, replacement) {
  const children = detailsChildren(details);
  const index = children.findIndex((item) => String(item?.id) === String(childId));
  if (index < 0) return null;
  const next = clone(replacement);
  next.id = children[index].id;
  next.position = children[index].position;
  children[index] = next;
  normalizeBlocks(children);
  detachDetails(details);
  details.data.children = children;
  return children[index];
}

function deleteDetailsChild(details, childId) {
  const children = detailsChildren(details);
  const index = children.findIndex((item) => String(item?.id) === String(childId));
  if (index < 0) return false;
  children.splice(index, 1);
  if (!children.length) {
    children.push(makeBlock('paragraph', { text: '…', html: '<p>…</p>' }, 0));
  }
  normalizeBlocks(children);
  detachDetails(details);
  details.data.children = children;
  return true;
}

function moveDetailsChild(details, childId, delta) {
  const children = detailsChildren(details);
  const index = children.findIndex((item) => String(item?.id) === String(childId));
  const target = index + delta;
  if (index < 0 || target < 0 || target >= children.length) return false;
  const [item] = children.splice(index, 1);
  children.splice(target, 0, item);
  normalizeBlocks(children);
  detachDetails(details);
  details.data.children = children;
  return true;
}

function detailsBuilderText(payload, languageCode) {
  const count = Array.isArray(payload?.children) ? payload.children.length : 0;
  return ar(languageCode)
    ? '📂 إنشاء Details\n\nالبلوكات الداخلية: ' + count + '\nاختر إضافة بلوك آخر أو إنهاء.'
    : '📂 Build Details\n\nInner blocks: ' + count + '\nAdd another block or finish.';
}

function detailsInnerListText(details, languageCode) {
  const children = detailsChildren(details);
  const lines = [
    ar(languageCode) ? '📂 البلوكات الداخلية' : '📂 Inner blocks',
    (ar(languageCode) ? 'العدد: ' : 'Count: ') + children.length,
    '',
  ];
  children.forEach((child, index) => {
    lines.push((index + 1) + '. ' + String(child?.type || 'content'));
  });
  lines.push('', ar(languageCode) ? 'اختر العملية:' : 'Choose an action:');
  return lines.join('\n');
}

function detailsInnerPage(details, child, languageCode) {
  const children = detailsChildren(details);
  const index = Math.max(0, children.findIndex((item) => String(item.id) === String(child?.id)));
  return [
    ar(languageCode) ? 'إعدادات البلوك الداخلي' : 'Inner block settings',
    (ar(languageCode) ? 'النوع: ' : 'Type: ') + String(child?.type || 'content'),
    (ar(languageCode) ? 'الموقع: ' : 'Position: ') + (index + 1) + '/' + children.length,
    '',
    ar(languageCode) ? 'اختر العملية:' : 'Choose an action:',
  ].join('\n');
}

async function saveMutatedBlocks(userId, session, blocks, changes = {}) {
  const limit = validateEditorLimits(blocks);
  if (!limit.ok) return { ok: false, limit };
  await rememberEditorState(userId, session);
  const updated = await updateEditorSession(userId, { blocks, ...changes });
  return { ok: true, updated };
}

function listKind(block) {
  return String(block?.data?.kind || 'bullet');
}

function newAnchorNames(blocks) {
  return (Array.isArray(blocks) ? blocks : [])
    .filter((block) => block?.type === 'anchor')
    .map((block) => anchorName(block))
    .filter(Boolean);
}

function slideshowKeyboard(token, count, nested, languageCode) {
  const arabic = ar(languageCode);
  const row = [{
    text: arabic ? 'استمرار' : 'Continue',
    callback_data: 'r:slides:done:' + token,
    style: 'success',
  }];
  if (count < SLIDESHOW_LIMIT) {
    row.push({
      text: arabic ? 'أضف المزيد' : 'Add more',
      callback_data: 'r:slides:more:' + token,
      style: 'primary',
    });
  }
  return {
    inline_keyboard: [
      row,
      [{ text: editorCopy(languageCode).back, callback_data: nested ? 'r:details:add' : 'r:back' }],
    ],
  };
}

async function storeDetailsChild(userId, session, message, child, languageCode) {
  const payload = clone(session.addPayload || {});
  const children = Array.isArray(payload.children) ? payload.children : [];
  addBlock(children, child);
  payload.children = children;
  for (const key of [
    'child_quote_text',
    'child_quote_html',
    'child_quote_rich_text',
    'child_media_children',
    'child_heading_size',
    'child_list_kind',
    'slideshow',
    'collage_upload',
  ]) delete payload[key];
  const updated = await updateEditorSession(userId, {
    pendingAddType: 'details',
    pendingChildType: null,
    addStep: 'details_content',
    addPayload: payload,
  });
  await clearInputMessages(session, message);
  await sendPrompt(
    userId,
    message.chat.id,
    detailsBuilderText(payload, languageCode),
    buildDetailsContentKeyboard(children.length, languageCode),
  );
  return updated;
}

function buildTextBlock(message, type, options = {}) {
  const heading = Number(options.headingSize || 2);
  const kind = String(options.listKind || 'bullet');
  return makeBlock(
    type,
    textData(
      message,
      type,
      heading,
      messageRichText(message),
      messageHtmlText(message),
      kind,
    ),
  );
}

function buildChildFromMessage(message, type, options = {}) {
  if (SIMPLE_TEXT_TYPES.has(type) || ['paragraph', 'heading', 'preformatted', 'footer'].includes(type)) {
    if (typeof message?.text !== 'string' || !message.text) return null;
    const block = buildTextBlock(message, type, options);
    if (type === 'list' && !Array.isArray(block.data?.items)) return null;
    return block;
  }
  if (type === 'anchor') {
    if (typeof message?.text !== 'string' || !message.text.trim()) return null;
    return makeBlock('anchor', textData(message, 'anchor'));
  }
  if (MEDIA_TYPES.has(type)) return mediaBlock(message, type);
  if (type === 'map') {
    if (!message?.location) return null;
    return makeBlock('map', mapData(message.location.latitude, message.location.longitude));
  }
  if (type === 'collage' || type === 'slideshow') {
    const children = mediaChildren(message);
    return children.length ? makeBlock(type, { children, caption_html: null, credit_html: null }) : null;
  }
  return null;
}

async function handleAddCallback(query, session, data, languageCode) {
  const userId = query.from.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) return false;

  if (data === 'r:add:listmenu') {
    await editMessage(
      chatId,
      messageId,
      ar(languageCode) ? 'اختر نوع القائمة:' : 'Choose list type:',
      buildListTypeKeyboard(languageCode),
    );
    await answer(query);
    return true;
  }

  if (data.startsWith('r:addlist:')) {
    const kind = data.slice('r:addlist:'.length);
    if (!['bullet', 'numbered', 'checklist'].includes(kind)) return false;
    await setEditorState(userId, 'adding_block', {
      pendingAddType: 'list',
      addStep: 'content',
      addPayload: { list_kind: kind },
    });
    await sendPrompt(userId, chatId, promptForAdd('list', languageCode));
    await answer(query);
    return true;
  }

  if (data === 'r:add:details') {
    await setEditorState(userId, 'adding_block', {
      pendingAddType: 'details',
      pendingChildType: null,
      addStep: 'details_summary',
      addPayload: {},
    });
    await sendPrompt(
      userId,
      chatId,
      ar(languageCode) ? 'أرسل عنوان Details.' : 'Send the Details summary.',
    );
    await answer(query);
    return true;
  }

  if (!data.startsWith('r:add:')) return false;
  const type = data.slice('r:add:'.length);
  if (!FINAL_RICH_BLOCK_TYPES.includes(type) || ['paragraph', 'heading', 'preformatted', 'footer', 'divider'].includes(type)) {
    return false;
  }

  if (type === 'anchor') {
    const targets = (session.blocks || []).filter((block) => block?.type !== 'anchor');
    if (!targets.length) {
      await answer(
        query,
        ar(languageCode) ? 'أضف بلوك محتوى واحد على الأقل قبل إنشاء مرساة.' : 'Add at least one content block before creating an anchor.',
        true,
      );
      return true;
    }
  }

  const payload = {};
  if (type === 'slideshow') {
    payload.slideshow = {
      token: (globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).replaceAll('-', '').slice(0, 12),
      children: [],
    };
  }
  await setEditorState(userId, 'adding_block', {
    pendingAddType: type,
    addStep: QUOTE_TYPES.includes(type) ? 'quote_text' : 'content',
    addPayload: payload,
  });
  await sendPrompt(userId, chatId, promptForAdd(type, languageCode));
  await answer(query);
  return true;
}

async function handleAnchorTargetCallback(query, session, data, languageCode) {
  if (!data.startsWith('r:at:')) return false;
  if (session.state !== 'adding_block' || session.pendingAddType !== 'anchor' || session.addStep !== 'anchor_target') {
    await answer(query, ar(languageCode) ? 'انتهت عملية المرساة.' : 'Anchor flow expired.', true);
    return true;
  }
  const targetId = data.slice('r:at:'.length);
  const target = getBlockById(session.blocks, targetId);
  const displayName = String(session.addPayload?.display_name || '').trim();
  if (!target || target.type === 'anchor' || !displayName) {
    await answer(query, ar(languageCode) ? 'اختيار غير صالح.' : 'Invalid selection.', true);
    return true;
  }
  const block = makeBlock('anchor', newAnchorData(displayName, targetId, newAnchorNames(session.blocks)));
  const fake = {
    chat: { id: query.message.chat.id },
    message_id: query.message.message_id,
  };
  await finishAdd(query.from.id, session, fake, block, languageCode);
  await answer(query, ar(languageCode) ? 'تمت إضافة المرساة.' : 'Anchor added.');
  return true;
}

async function mergeSlideshowActiveGroup(userId, upload) {
  const current = clone(upload || {});
  const groupId = String(current.active_group || '');
  if (!groupId) return { upload: current, ready: true };
  const batch = await readAlbumBatch(userId, groupId);
  if (!batch.quiet) return { upload: current, ready: false };
  const grouped = mediaChildrenFromBlocks(batch.blocks);
  const remaining = Math.max(0, SLIDESHOW_LIMIT - current.children.length);
  for (const child of grouped.slice(0, remaining)) {
    current.children.push({ ...child, position: current.children.length });
  }
  await clearAlbum(userId, groupId);
  delete current.active_group;
  delete current.active_group_token;
  return { upload: current, ready: true };
}

async function handleSlideshowCallback(query, session, data, languageCode) {
  if (!data.startsWith('r:slides:')) return false;
  const parts = data.split(':');
  if (parts.length !== 4 || !['done', 'more'].includes(parts[2])) return false;
  let upload = clone(session.addPayload?.slideshow || {});
  const token = parts[3];
  if (
    session.state !== 'adding_block'
    || !upload.token
    || String(upload.token) !== String(token)
    || !Array.isArray(upload.children)
  ) {
    await answer(query, ar(languageCode) ? 'انتهت صلاحية العملية.' : 'This flow has expired.', true);
    return true;
  }

  const merged = await mergeSlideshowActiveGroup(query.from.id, upload);
  if (!merged.ready) {
    await answer(
      query,
      ar(languageCode) ? 'الألبوم بعده يستلم عناصر، حاول بعد لحظة.' : 'The album is still receiving items. Try again in a moment.',
      true,
    );
    return true;
  }
  upload = merged.upload;
  if (!upload.children.length) {
    await answer(query, ar(languageCode) ? 'ماكو وسائط محفوظة بعد.' : 'No media has been saved yet.', true);
    return true;
  }

  if (parts[2] === 'more') {
    if (upload.children.length >= SLIDESHOW_LIMIT) {
      await answer(query, ar(languageCode) ? 'وصل عرض الشرائح إلى حد 50 عنصر.' : 'The slideshow reached 50 items.', true);
      return true;
    }
    const payload = clone(session.addPayload || {});
    payload.slideshow = upload;
    const updated = await updateEditorSession(query.from.id, { addPayload: payload });
    await sendPrompt(
      query.from.id,
      query.message.chat.id,
      promptForAdd('slideshow', languageCode),
      slideshowKeyboard(token, upload.children.length, updated.pendingAddType === 'details', languageCode),
    );
    await answer(query);
    return true;
  }

  const block = makeBlock('slideshow', {
    children: upload.children,
    caption_html: null,
    credit_html: null,
  });
  const liveSession = {
    ...session,
    addPayload: {
      ...(session.addPayload || {}),
      slideshow: upload,
    },
  };
  if (session.pendingAddType === 'details') {
    await storeDetailsChild(query.from.id, liveSession, query.message, block, languageCode);
  } else {
    await finishAdd(query.from.id, liveSession, query.message, block, languageCode);
  }
  await answer(query);
  return true;
}

async function handleCollageCallback(query, session, data, languageCode) {
  if (!data.startsWith('r:collage:done:')) return false;
  const token = data.slice('r:collage:done:'.length);
  const upload = clone(session.addPayload?.collage_upload || {});
  if (
    session.state !== 'adding_block'
    || !upload.group_id
    || !upload.token
    || String(upload.token) !== String(token)
  ) {
    await answer(query, ar(languageCode) ? 'انتهت صلاحية العملية.' : 'This flow has expired.', true);
    return true;
  }
  const batch = await readAlbumBatch(query.from.id, upload.group_id);
  if (!batch.quiet) {
    await answer(
      query,
      ar(languageCode) ? 'الألبوم بعده يستلم عناصر، حاول بعد لحظة.' : 'The album is still receiving items. Try again in a moment.',
      true,
    );
    return true;
  }
  const children = mediaChildrenFromBlocks(batch.blocks);
  if (!children.length) {
    await answer(query, ar(languageCode) ? 'ماكو وسائط محفوظة.' : 'No media was saved.', true);
    return true;
  }
  await clearAlbum(query.from.id, upload.group_id);
  const block = makeBlock('collage', {
    children,
    caption_html: null,
    credit_html: null,
  });
  if (session.pendingAddType === 'details') {
    await storeDetailsChild(query.from.id, session, query.message, block, languageCode);
  } else {
    await finishAdd(query.from.id, session, query.message, block, languageCode);
  }
  await answer(query);
  return true;
}

async function handleEditCallback(query, session, data, languageCode) {
  if (!data.startsWith('r:e:')) return false;
  const id = data.slice('r:e:'.length);
  const block = getBlockById(session.blocks, id);
  if (!block) return false;
  const type = String(block.type || '');
  if (['text', 'paragraph', 'heading', 'preformatted', 'footer'].includes(type)) return false;
  if (type === 'divider') return false;

  await setEditorState(query.from.id, 'editing_block', {
    currentBlockId: id,
    expectedType: type,
    editField: null,
    headingSize: null,
  });
  await sendPrompt(query.from.id, query.message.chat.id, promptForEdit(type, languageCode));
  await answer(query);
  return true;
}

async function handleFieldCallback(query, session, data, languageCode) {
  if (!data.startsWith('r:f:')) return false;
  const parts = data.split(':');
  if (parts.length !== 4) return false;
  const id = parts[2];
  const field = parts[3];
  const block = getBlockById(session.blocks, id);
  if (!block) {
    await answer(query, ar(languageCode) ? 'هذا البلوك لم يعد موجودًا.' : 'This block no longer exists.', true);
    return true;
  }
  if (block.type === 'details' && field === 'summary') {
    await setEditorState(query.from.id, 'editing_block', {
      currentBlockId: id,
      expectedType: 'details',
      editField: 'summary',
    });
    await sendPrompt(query.from.id, query.message.chat.id, ar(languageCode) ? 'أرسل عنوان Details الجديد.' : 'Send the new Details summary.');
    await answer(query);
    return true;
  }
  const allowed = (
    (field === 'caption' && MEDIA_CAPTION_TYPES.includes(String(block.type)))
    || (field === 'credit' && (
      MEDIA_CAPTION_TYPES.includes(String(block.type))
      || QUOTE_TYPES.includes(String(block.type))
    ))
  );
  if (!allowed) return false;
  await setEditorState(query.from.id, 'editing_block', {
    currentBlockId: id,
    expectedType: String(block.type),
    editField: field,
  });
  await sendPrompt(
    query.from.id,
    query.message.chat.id,
    field === 'caption'
      ? (ar(languageCode) ? 'أرسل الوصف الجديد، أو /remove لحذفه.' : 'Send the new caption, or /remove.')
      : (ar(languageCode) ? 'أرسل الكاتب/المصدر الجديد، أو /remove لحذفه.' : 'Send the new author/source, or /remove.'),
  );
  await answer(query);
  return true;
}

async function handleChecklistCallback(query, session, data, languageCode) {
  if (!data.startsWith('r:ct:')) return false;
  const parts = data.split(':');
  const id = parts[2];
  const index = Number.parseInt(parts[3], 10);
  const block = getBlockById(session.blocks, id);
  if (
    !block
    || block.type !== 'list'
    || listKind(block) !== 'checklist'
    || !Number.isInteger(index)
    || !Array.isArray(block.data?.items)
    || index < 0
    || index >= block.data.items.length
  ) {
    await answer(query, ar(languageCode) ? 'هذه المهمة لم تعد موجودة.' : 'This task no longer exists.', true);
    return true;
  }
  const blocks = clone(session.blocks);
  const editable = getBlockById(blocks, id);
  const replacement = stripNative(editable.data);
  replacement.items = clone(replacement.items || []);
  replacement.items[index].has_checkbox = true;
  replacement.items[index].is_checked = !Boolean(replacement.items[index].is_checked);
  replaceBlockData(blocks, id, replacement, 'generated');
  const saved = await saveMutatedBlocks(query.from.id, session, blocks);
  if (!saved.ok) {
    await answer(query, limitText(saved.limit, languageCode), true);
    return true;
  }
  const current = getBlockById(saved.updated.blocks, id);
  await editMessage(
    query.message.chat.id,
    query.message.message_id,
    blockPage(current, saved.updated.blocks, languageCode),
    buildBlockEditorKeyboard(current, saved.updated.blocks, languageCode),
  );
  await answer(query, replacement.items[index].is_checked ? '☑️' : '☐');
  return true;
}

async function handleTableCallback(query, session, data, languageCode) {
  const userId = query.from.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) return false;

  if (data.startsWith('r:tm:')) {
    const id = data.slice('r:tm:'.length);
    const block = getBlockById(session.blocks, id);
    if (!block || block.type !== 'table' || !tableRows(block).length) {
      await answer(query, ar(languageCode) ? 'هذا الجدول لم يعد موجودًا أو لا يحتوي خلايا.' : 'This table is missing or has no cells.', true);
      return true;
    }
    await editMessage(chatId, messageId, ar(languageCode) ? 'إعدادات خلايا الجدول\n\nاختر العملية:' : 'Table cell settings\n\nChoose an action:', buildTableOptionsKeyboard(id, languageCode));
    await answer(query);
    return true;
  }

  if (data.startsWith('r:ta:')) {
    const parts = data.split(':');
    const id = parts[2];
    const action = parts[3];
    const block = getBlockById(session.blocks, id);
    if (!block || block.type !== 'table') return false;
    const all = {
      sha: { shaded: true },
      uha: { shaded: false },
      cea: { centered: true },
      uea: { centered: false },
    };
    const single = {
      sh: { shaded: true },
      uh: { shaded: false },
      ce: { centered: true },
      ue: { centered: false },
    };
    if (all[action]) {
      const blocks = clone(session.blocks);
      const editable = getBlockById(blocks, id);
      const table = editableTableData(editable);
      if (!table || !setAllTableCellsStyle(table, all[action])) {
        await answer(query, ar(languageCode) ? 'تعذر تعديل الجدول.' : 'Could not edit the table.', true);
        return true;
      }
      replaceBlockData(blocks, id, table, 'generated');
      const saved = await saveMutatedBlocks(userId, session, blocks);
      if (!saved.ok) {
        await answer(query, limitText(saved.limit, languageCode), true);
        return true;
      }
      await editMessage(chatId, messageId, ar(languageCode) ? 'إعدادات خلايا الجدول\n\nاختر العملية:' : 'Table cell settings\n\nChoose an action:', buildTableOptionsKeyboard(id, languageCode));
      await answer(query, ar(languageCode) ? 'تم تعديل جميع الخلايا.' : 'All cells updated.');
      return true;
    }
    if (single[action]) {
      await editMessage(chatId, messageId, ar(languageCode) ? 'اختر الخلية المطلوبة:' : 'Choose the cell:', buildTableCellKeyboard(block, action, languageCode));
      await answer(query);
      return true;
    }
    return false;
  }

  if (data.startsWith('r:tc:')) {
    const parts = data.split(':');
    if (parts.length !== 6) return false;
    const id = parts[2];
    const action = parts[3];
    const row = Number.parseInt(parts[4], 10);
    const column = Number.parseInt(parts[5], 10);
    const actions = {
      sh: { shaded: true },
      uh: { shaded: false },
      ce: { centered: true },
      ue: { centered: false },
    };
    const settings = actions[action];
    const block = getBlockById(session.blocks, id);
    if (!block || block.type !== 'table' || !settings) return false;
    const blocks = clone(session.blocks);
    const editable = getBlockById(blocks, id);
    const table = editableTableData(editable);
    if (!table || !setTableCellStyle(table, row, column, settings)) {
      await answer(query, ar(languageCode) ? 'هذه الخلية لم تعد موجودة.' : 'This cell no longer exists.', true);
      return true;
    }
    replaceBlockData(blocks, id, table, 'generated');
    const saved = await saveMutatedBlocks(userId, session, blocks);
    if (!saved.ok) {
      await answer(query, limitText(saved.limit, languageCode), true);
      return true;
    }
    await editMessage(chatId, messageId, ar(languageCode) ? 'إعدادات خلايا الجدول\n\nاختر العملية:' : 'Table cell settings\n\nChoose an action:', buildTableOptionsKeyboard(id, languageCode));
    await answer(query, ar(languageCode) ? 'تم تعديل الخلية.' : 'Cell updated.');
    return true;
  }

  if (data.startsWith('r:tdisplay:')) {
    const id = data.slice('r:tdisplay:'.length);
    const block = getBlockById(session.blocks, id);
    if (!block || block.type !== 'table') return false;
    await editMessage(
      chatId,
      messageId,
      ar(languageCode)
        ? '🧱 إعدادات مظهر الجدول\n\nاختر الخاصية التي تريد تغييرها.'
        : '🧱 Table appearance\n\nChoose a property to change.',
      buildTableDisplayKeyboard(block, languageCode),
    );
    await answer(query);
    return true;
  }

  if (data.startsWith('r:ttoggle:')) {
    const parts = data.split(':');
    const id = parts[2];
    const field = parts[3];
    if (!['is_bordered', 'is_striped', 'is_compact'].includes(field)) return false;
    const block = getBlockById(session.blocks, id);
    if (!block || block.type !== 'table') return false;
    const blocks = clone(session.blocks);
    const editable = getBlockById(blocks, id);
    const table = editableTableData(editable);
    if (!table) return false;
    table[field] = !tableFlag(block, field);
    replaceBlockData(blocks, id, table, 'generated');
    const saved = await saveMutatedBlocks(userId, session, blocks);
    if (!saved.ok) {
      await answer(query, limitText(saved.limit, languageCode), true);
      return true;
    }
    const current = getBlockById(saved.updated.blocks, id);
    await editMessage(
      chatId,
      messageId,
      ar(languageCode) ? '🧱 إعدادات مظهر الجدول' : '🧱 Table appearance',
      buildTableDisplayKeyboard(current, languageCode),
    );
    await answer(query);
    return true;
  }

  if (data.startsWith('r:tcaption:')) {
    const id = data.slice('r:tcaption:'.length);
    const block = getBlockById(session.blocks, id);
    if (!block || block.type !== 'table') return false;
    await setEditorState(userId, 'editing_block', {
      currentBlockId: id,
      expectedType: 'table',
      editField: 'table_caption',
    });
    await sendPrompt(
      userId,
      chatId,
      ar(languageCode) ? 'أرسل عنوان الجدول. لإزالته أرسل /empty' : 'Send the table caption. Send /empty to remove it.',
    );
    await answer(query);
    return true;
  }
  return false;
}

async function handleDetailsBuilderCallback(query, session, data, languageCode) {
  const userId = query.from.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) return false;

  if (data === 'r:details:add') {
    if (session.pendingAddType !== 'details') return false;
    await updateEditorSession(userId, {
      addStep: 'details_child_select',
      pendingChildType: null,
    });
    await editMessage(
      chatId,
      messageId,
      ar(languageCode) ? 'اختر نوع البلوك الداخلي:' : 'Choose the inner block type:',
      buildDetailsChildTypeKeyboard(languageCode),
    );
    await answer(query);
    return true;
  }

  if (data === 'r:details:content') {
    if (session.pendingAddType !== 'details') return false;
    const payload = clone(session.addPayload || {});
    const children = Array.isArray(payload.children) ? payload.children : [];
    await updateEditorSession(userId, {
      addStep: 'details_content',
      pendingChildType: null,
      addPayload: payload,
    });
    await editMessage(
      chatId,
      messageId,
      detailsBuilderText(payload, languageCode),
      buildDetailsContentKeyboard(children.length, languageCode),
    );
    await answer(query);
    return true;
  }

  if (data === 'r:details:cancel') {
    if (session.pendingAddType !== 'details') return false;
    await resetEditorTransientState(userId);
    await deleteQuietly(chatId, messageId);
    const latest = await loadEditorSession(userId, { touch: false });
    if (latest) {
      await editManagement(
        latest,
        editorDashboardText(latest, languageCode),
        buildEditorKeyboard(latest, languageCode),
      );
    }
    await answer(query, ar(languageCode) ? 'تم الإلغاء.' : 'Cancelled.');
    return true;
  }

  if (data === 'r:details:finish') {
    if (session.pendingAddType !== 'details') return false;
    const payload = clone(session.addPayload || {});
    const children = Array.isArray(payload.children) ? payload.children : [];
    const summaryHtml = String(payload.summary_html || '');
    if (!summaryHtml || !children.length) {
      await answer(query, ar(languageCode) ? 'أضف بلوك داخلي واحد على الأقل.' : 'Add at least one inner block.', true);
      return true;
    }
    const block = makeBlock('details', {
      summary_html: summaryHtml,
      children,
    });
    await finishAdd(userId, session, query.message, block, languageCode);
    await answer(query);
    return true;
  }

  if (data.startsWith('r:details:list:')) {
    if (session.pendingAddType !== 'details') return false;
    const kind = data.slice('r:details:list:'.length);
    if (!['bullet', 'numbered', 'checklist'].includes(kind)) return false;
    const payload = clone(session.addPayload || {});
    payload.child_list_kind = kind;
    await updateEditorSession(userId, {
      addStep: 'details_child_content',
      pendingChildType: 'list',
      addPayload: payload,
    });
    await editMessage(chatId, messageId, promptForAdd('list', languageCode), {
      inline_keyboard: [[{ text: editorCopy(languageCode).back, callback_data: 'r:details:add' }]],
    });
    await answer(query);
    return true;
  }

  if (data.startsWith('r:hs:details:')) {
    if (session.pendingAddType !== 'details') return false;
    const level = Number.parseInt(data.split(':').at(-1), 10);
    if (!Number.isInteger(level) || level < 1 || level > 6) return false;
    const payload = clone(session.addPayload || {});
    payload.child_heading_size = level;
    await updateEditorSession(userId, {
      addStep: 'details_child_content',
      pendingChildType: 'heading',
      addPayload: payload,
    });
    await editMessage(
      chatId,
      messageId,
      (ar(languageCode) ? 'اخترت H' : 'Selected H') + level + '. ' + (ar(languageCode) ? 'أرسل النص الآن.' : 'Send the text now.'),
      { inline_keyboard: [[{ text: editorCopy(languageCode).back, callback_data: 'r:details:add' }]] },
    );
    await answer(query);
    return true;
  }

  if (data.startsWith('r:details:type:')) {
    if (session.pendingAddType !== 'details') return false;
    const type = data.slice('r:details:type:'.length);
    if (!DETAILS_CHILD_TYPES.includes(type)) return false;
    if (type === 'divider') {
      await storeDetailsChild(userId, session, query.message, makeBlock('divider', { html: '<hr/>' }), languageCode);
      await answer(query);
      return true;
    }
    if (type === 'heading') {
      await updateEditorSession(userId, {
        addStep: 'details_child_heading',
        pendingChildType: 'heading',
      });
      await editMessage(
        chatId,
        messageId,
        ar(languageCode) ? 'اختر مستوى العنوان:' : 'Choose heading level:',
        buildHeadingLevelKeyboard('details', languageCode),
      );
      await answer(query);
      return true;
    }
    if (type === 'list') {
      await editMessage(
        chatId,
        messageId,
        ar(languageCode) ? 'اختر نوع القائمة:' : 'Choose list type:',
        buildListTypeKeyboard(languageCode, 'r:details:list', 'r:details:add'),
      );
      await answer(query);
      return true;
    }
    const payload = clone(session.addPayload || {});
    if (type === 'slideshow') {
      payload.slideshow = {
        token: (globalThis.crypto?.randomUUID?.() || Math.random().toString(16).slice(2)).replaceAll('-', '').slice(0, 12),
        children: [],
      };
    }
    await updateEditorSession(userId, {
      addStep: QUOTE_TYPES.includes(type) ? 'details_child_quote_text' : 'details_child_content',
      pendingChildType: type,
      addPayload: payload,
    });
    await editMessage(
      chatId,
      messageId,
      promptForAdd(type, languageCode),
      { inline_keyboard: [[{ text: editorCopy(languageCode).back, callback_data: 'r:details:add' }]] },
    );
    await answer(query);
    return true;
  }

  return false;
}

async function handleDetailsManagerCallback(query, session, data, languageCode) {
  const userId = query.from.id;
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) return false;

  if (data.startsWith('r:dim:')) {
    const id = data.slice('r:dim:'.length);
    const details = getBlockById(session.blocks, id);
    if (!details || details.type !== 'details') return false;
    await editMessage(chatId, messageId, detailsInnerListText(details, languageCode), buildDetailsInnerBlocksKeyboard(details, languageCode));
    await answer(query);
    return true;
  }

  if (data.startsWith('r:di:')) {
    const parts = data.split(':');
    if (parts.length !== 4) return false;
    const details = getBlockById(session.blocks, parts[2]);
    const child = details ? findDetailsChild(details, parts[3]) : null;
    if (!details || details.type !== 'details' || !child) return false;
    await editMessage(chatId, messageId, detailsInnerPage(details, child, languageCode), buildDetailsInnerBlockKeyboard(details, child, languageCode));
    await answer(query);
    return true;
  }

  if (data.startsWith('r:dip:')) {
    const parts = data.split(':');
    if (parts.length !== 4) return false;
    const details = getBlockById(session.blocks, parts[2]);
    const child = details ? findDetailsChild(details, parts[3]) : null;
    if (!child) return false;
    try {
      await api.sendRichMessage({
        chat_id: userId,
        rich_message: buildSingleBlockRichMessage(child),
      });
      await answer(query);
    } catch (error) {
      await answer(query, ar(languageCode) ? 'فشلت المعاينة.' : 'Preview failed.', true);
    }
    return true;
  }

  if (data.startsWith('r:die:')) {
    const parts = data.split(':');
    if (parts.length !== 4) return false;
    const details = getBlockById(session.blocks, parts[2]);
    const child = details ? findDetailsChild(details, parts[3]) : null;
    if (!child || child.type === 'divider') return false;
    await setEditorState(userId, 'editing_block', {
      nestedDetailsId: parts[2],
      nestedChildId: parts[3],
      nestedAction: 'content',
      expectedType: String(child.type),
      editField: null,
    });
    await sendPrompt(userId, chatId, promptForEdit(String(child.type), languageCode));
    await answer(query);
    return true;
  }

  if (data.startsWith('r:dif:')) {
    const parts = data.split(':');
    if (parts.length !== 5) return false;
    const details = getBlockById(session.blocks, parts[2]);
    const child = details ? findDetailsChild(details, parts[3]) : null;
    const action = parts[4];
    const allowed = Boolean(
      child
      && (
        (
          action === 'caption'
          && MEDIA_CAPTION_TYPES.includes(String(child.type || ''))
        )
        || (
          action === 'credit'
          && (
            MEDIA_CAPTION_TYPES.includes(String(child.type || ''))
            || QUOTE_TYPES.includes(String(child.type || ''))
          )
        )
        || (
          action === 'add_footer'
          && !['footer', 'divider', 'anchor'].includes(String(child.type || ''))
        )
      )
    );
    if (!allowed) {
      await answer(query, ar(languageCode) ? 'هذا الحقل لم يعد موجودًا.' : 'This field is no longer available.', true);
      return true;
    }
    await setEditorState(userId, 'editing_block', {
      nestedDetailsId: parts[2],
      nestedChildId: parts[3],
      nestedAction: action,
      expectedType: String(child.type),
      editField: null,
    });
    const prompt = action === 'caption'
      ? (ar(languageCode) ? 'أرسل الوصف أو /remove.' : 'Send the caption or /remove.')
      : action === 'credit'
        ? (ar(languageCode) ? 'أرسل المصدر/الكاتب أو /remove.' : 'Send the source/author or /remove.')
        : (ar(languageCode) ? 'أرسل نص التذييل.' : 'Send footer text.');
    await sendPrompt(userId, chatId, prompt);
    await answer(query);
    return true;
  }

  if (data.startsWith('r:did:')) {
    const parts = data.split(':');
    if (parts.length !== 4) return false;
    const details = getBlockById(session.blocks, parts[2]);
    const child = details ? findDetailsChild(details, parts[3]) : null;
    if (!child) return false;
    await editMessage(
      chatId,
      messageId,
      ar(languageCode) ? 'هل تريد حذف البلوك الداخلي؟' : 'Delete this inner block?',
      buildDetailsInnerDeleteKeyboard(parts[2], parts[3], languageCode),
    );
    await answer(query);
    return true;
  }

  if (data.startsWith('r:didok:')) {
    const parts = data.split(':');
    if (parts.length !== 4) return false;
    const blocks = clone(session.blocks);
    const details = getBlockById(blocks, parts[2]);
    if (!details || !deleteDetailsChild(details, parts[3])) return false;
    const saved = await saveMutatedBlocks(userId, session, blocks);
    if (!saved.ok) {
      await answer(query, limitText(saved.limit, languageCode), true);
      return true;
    }
    const current = getBlockById(saved.updated.blocks, parts[2]);
    await editMessage(chatId, messageId, detailsInnerListText(current, languageCode), buildDetailsInnerBlocksKeyboard(current, languageCode));
    await answer(query, ar(languageCode) ? 'تم الحذف.' : 'Deleted.');
    return true;
  }

  if (data.startsWith('r:dimu:') || data.startsWith('r:dimd:')) {
    const up = data.startsWith('r:dimu:');
    const parts = data.split(':');
    if (parts.length !== 4) return false;
    const blocks = clone(session.blocks);
    const details = getBlockById(blocks, parts[2]);
    if (!details || !moveDetailsChild(details, parts[3], up ? -1 : 1)) {
      await answer(query, ar(languageCode) ? 'هذا هو الموقع الحالي.' : 'Already at this edge.');
      return true;
    }
    const saved = await saveMutatedBlocks(userId, session, blocks);
    if (!saved.ok) {
      await answer(query, limitText(saved.limit, languageCode), true);
      return true;
    }
    const current = getBlockById(saved.updated.blocks, parts[2]);
    const child = findDetailsChild(current, parts[3]);
    await editMessage(chatId, messageId, detailsInnerPage(current, child, languageCode), buildDetailsInnerBlockKeyboard(current, child, languageCode));
    await answer(query);
    return true;
  }

  return false;
}

export function isExtraBlockCallback(data) {
  const value = String(data || '');
  return (
    value === 'r:add:listmenu'
    || value === 'r:details:add'
    || value === 'r:details:content'
    || value === 'r:details:cancel'
    || value === 'r:details:finish'
    || value.startsWith('r:addlist:')
    || value.startsWith('r:add:details')
    || value.startsWith('r:at:')
    || value.startsWith('r:slides:')
    || value.startsWith('r:collage:done:')
    || value.startsWith('r:f:')
    || value.startsWith('r:ct:')
    || value.startsWith('r:tm:')
    || value.startsWith('r:ta:')
    || value.startsWith('r:tc:')
    || value.startsWith('r:tdisplay:')
    || value.startsWith('r:ttoggle:')
    || value.startsWith('r:tcaption:')
    || value.startsWith('r:details:type:')
    || value.startsWith('r:details:list:')
    || value.startsWith('r:hs:details:')
    || value.startsWith('r:dim:')
    || value.startsWith('r:di:')
    || value.startsWith('r:dip:')
    || value.startsWith('r:die:')
    || value.startsWith('r:dif:')
    || value.startsWith('r:did:')
    || value.startsWith('r:didok:')
    || value.startsWith('r:dimu:')
    || value.startsWith('r:dimd:')
  );
}

export async function handleExtraBlockCallback(query, session) {
  const data = String(query?.data || '');
  const languageCode = code(query);

  if (await handleAddCallback(query, session, data, languageCode)) return true;
  if (await handleAnchorTargetCallback(query, session, data, languageCode)) return true;
  if (await handleSlideshowCallback(query, session, data, languageCode)) return true;
  if (await handleCollageCallback(query, session, data, languageCode)) return true;
  if (await handleFieldCallback(query, session, data, languageCode)) return true;
  if (await handleChecklistCallback(query, session, data, languageCode)) return true;
  if (await handleTableCallback(query, session, data, languageCode)) return true;
  if (await handleDetailsBuilderCallback(query, session, data, languageCode)) return true;
  if (await handleDetailsManagerCallback(query, session, data, languageCode)) return true;
  if (await handleEditCallback(query, session, data, languageCode)) return true;
  return false;
}

async function handleSlideshowMessage(message, session, languageCode, nested = false) {
  const payload = clone(session.addPayload || {});
  const upload = clone(payload.slideshow || {});
  if (!upload.token || !Array.isArray(upload.children)) return false;
  if (!validateSlideshowMessage(message)) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: ar(languageCode)
        ? 'الوسائط تتجاوز حدود الأمان المسموحة لعرض الشرائح.'
        : 'This media exceeds the slideshow safety limits.',
    });
    return true;
  }

  let visibleCount = upload.children.length;
  if (message?.media_group_id) {
    const collected = await rememberMediaGroup(message, 'slideshow');
    if (!collected) return true;
    if (upload.active_group && String(upload.active_group) !== collected.groupId) {
      await api.sendMessage({
        chat_id: message.chat.id,
        text: ar(languageCode)
          ? 'أنهِ الدفعة الحالية أولًا من زر استمرار أو أضف المزيد.'
          : 'Finish the current batch first with Continue or Add more.',
      });
      return true;
    }
    upload.active_group = collected.groupId;
    upload.active_group_token = collected.token;
    const groupChildren = mediaChildrenFromBlocks(collected.blocks);
    visibleCount = Math.min(
      SLIDESHOW_LIMIT,
      upload.children.length + groupChildren.length,
    );
  } else {
    const children = mediaChildren(message);
    if (!children.length) {
      await api.sendMessage({
        chat_id: message.chat.id,
        text: ar(languageCode) ? 'أرسل صورًا أو فيديوهات.' : 'Send photos or videos.',
      });
      return true;
    }
    const remaining = Math.max(0, SLIDESHOW_LIMIT - upload.children.length);
    for (const child of children.slice(0, remaining)) {
      upload.children.push({ ...child, position: upload.children.length });
    }
    visibleCount = upload.children.length;
  }

  payload.slideshow = upload;
  await updateEditorSession(message.from.id, { addPayload: payload });
  await clearInputMessages(session, message);
  await sendPrompt(
    message.from.id,
    message.chat.id,
    (ar(languageCode) ? 'تم الاستلام: ' : 'Received: ') + visibleCount + '/' + SLIDESHOW_LIMIT,
    slideshowKeyboard(upload.token, visibleCount, nested, languageCode),
  );
  return true;
}

async function handleAddMessage(message, session, languageCode) {
  const userId = message.from.id;
  const type = String(session.pendingAddType || '');
  const step = String(session.addStep || 'content');
  const payload = clone(session.addPayload || {});

  if (type === 'details') return handleDetailsAddMessage(message, session, languageCode);

  if (type === 'anchor') {
    if (step === 'content') {
      const display = String(message?.text || '').split(/\s+/).filter(Boolean).join(' ').trim().slice(0, 64);
      if (!display) {
        await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل اسمًا للمرساة.' : 'Send an anchor name.' });
        return true;
      }
      const targets = (session.blocks || []).filter((block) => block?.type !== 'anchor');
      if (!targets.length) {
        await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'لا يوجد بلوك هدف.' : 'There is no target block.' });
        return true;
      }
      await clearInputMessages(session, message);
      await updateEditorSession(userId, {
        addStep: 'anchor_target',
        addPayload: { display_name: display },
      });
      const latest = await loadEditorSession(userId, { touch: false });
      await sendPrompt(
        userId,
        message.chat.id,
        ar(languageCode) ? 'اختر البلوك الهدف للمرساة «' + display + '»:' : 'Choose the target block for “' + display + '”:',
        buildAnchorTargetKeyboard(latest.blocks, languageCode, 'r:at', 'r:addmenu'),
      );
      return true;
    }
    await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'اختر الهدف من الأزرار.' : 'Choose the target using the buttons.' });
    return true;
  }

  if (QUOTE_TYPES.includes(type)) {
    if (step === 'quote_text') {
      if (typeof message?.text === 'string' && message.text) {
        await clearInputMessages(session, message);
        await updateEditorSession(userId, {
          addStep: 'quote_credit',
          addPayload: {
            quote_text: message.text,
            quote_html: messageHtmlText(message),
            quote_rich_text: messageRichText(message),
          },
        });
        await sendPrompt(userId, message.chat.id, ar(languageCode) ? 'أرسل اسم الكاتب، أو /skip.' : 'Send the author, or /skip.');
        return true;
      }
      const parsed = messageToBlocks(message);
      const [media, caption] = quoteMediaPayload(parsed);
      if (!media.length) {
        await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل نصًا أو وسائط صالحة.' : 'Send text or supported media.' });
        return true;
      }
      const next = { media_children: media };
      if (caption) {
        next.quote_text = caption.data?.text || '';
        next.quote_html = caption.data?.html || '';
        next.quote_rich_text = caption.data?.rich_text ?? null;
      }
      await clearInputMessages(session, message);
      await updateEditorSession(userId, {
        addStep: caption ? 'quote_credit' : 'quote_media_text',
        addPayload: next,
      });
      await sendPrompt(
        userId,
        message.chat.id,
        caption
          ? (ar(languageCode) ? 'اعتمدت وصف الوسائط كنص. أرسل الكاتب أو /skip.' : 'Media caption used as quote text. Send author or /skip.')
          : (ar(languageCode) ? 'أرسل الآن نص الاقتباس.' : 'Now send the quote text.'),
      );
      return true;
    }
    if (step === 'quote_media_text') {
      if (!message?.text) {
        await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل نص الاقتباس.' : 'Send the quote text.' });
        return true;
      }
      const next = {
        ...payload,
        quote_text: message.text,
        quote_html: messageHtmlText(message),
        quote_rich_text: messageRichText(message),
      };
      await clearInputMessages(session, message);
      await updateEditorSession(userId, { addStep: 'quote_credit', addPayload: next });
      await sendPrompt(userId, message.chat.id, ar(languageCode) ? 'أرسل اسم الكاتب، أو /skip.' : 'Send the author, or /skip.');
      return true;
    }
    if (step === 'quote_credit') {
      if (!message?.text) {
        await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل اسم الكاتب أو /skip.' : 'Send the author or /skip.' });
        return true;
      }
      const credit = message.text.trim().toLowerCase() === '/skip' ? null : messageHtmlText(message);
      await finishAdd(userId, session, message, makeBlock(type, { ...payload, credit_html: credit }), languageCode);
      return true;
    }
  }

  if (type === 'slideshow') return handleSlideshowMessage(message, session, languageCode, false);

  if (type === 'collage') {
    if (message?.media_group_id) {
      const collected = await rememberMediaGroup(message, 'collage');
      if (!collected) return true;
      const children = mediaChildrenFromBlocks(collected.blocks);
      const nextPayload = clone(session.addPayload || {});
      nextPayload.collage_upload = {
        group_id: collected.groupId,
        token: collected.token,
      };
      await updateEditorSession(userId, { addPayload: nextPayload });
      await clearInputMessages(session, message);
      await sendPrompt(
        userId,
        message.chat.id,
        (ar(languageCode) ? 'تم استلام عناصر الكولاج: ' : 'Collage items received: ') + children.length,
        collageConfirmationKeyboard(collected.token, languageCode),
      );
      return true;
    }
    const children = mediaChildren(message);
    if (!children.length) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل صورًا أو فيديوهات.' : 'Send photos or videos.' });
      return true;
    }
    await finishAdd(userId, session, message, makeBlock('collage', { children, caption_html: null, credit_html: null }), languageCode);
    return true;
  }

  if (type === 'map') {
    if (!message?.location) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل موقعًا من مرفقات Telegram.' : 'Send a Telegram location.' });
      return true;
    }
    await finishAdd(userId, session, message, makeBlock('map', mapData(message.location.latitude, message.location.longitude)), languageCode);
    return true;
  }

  if (MEDIA_TYPES.has(type)) {
    const block = mediaBlock(message, type);
    if (!block) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'نوع الوسائط غير صحيح.' : 'Wrong media type.' });
      return true;
    }
    await finishAdd(userId, session, message, block, languageCode);
    return true;
  }

  if (SIMPLE_TEXT_TYPES.has(type)) {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'هذا النوع يحتاج إلى نص.' : 'This block type requires text.' });
      return true;
    }
    const listKindValue = String(payload.list_kind || 'bullet');
    const block = buildTextBlock(message, type, { listKind: listKindValue });
    if (type === 'list' && !block.data.items.length) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'القائمة فارغة.' : 'The list is empty.' });
      return true;
    }
    await finishAdd(userId, session, message, block, languageCode);
    return true;
  }

  return false;
}

async function handleDetailsAddMessage(message, session, languageCode) {
  const userId = message.from.id;
  const step = String(session.addStep || '');
  const payload = clone(session.addPayload || {});

  if (step === 'details_summary') {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'العنوان يحتاج نص.' : 'The summary requires text.' });
      return true;
    }
    await clearInputMessages(session, message);
    const next = { summary_html: messageHtmlText(message), children: [] };
    await updateEditorSession(userId, { addStep: 'details_content', addPayload: next });
    await sendPrompt(userId, message.chat.id, detailsBuilderText(next, languageCode), buildDetailsContentKeyboard(0, languageCode));
    return true;
  }

  if (step === 'details_child_quote_text') {
    const childType = String(session.pendingChildType || '');
    if (!QUOTE_TYPES.includes(childType)) return false;
    if (message?.text) {
      const next = {
        ...payload,
        child_quote_text: message.text,
        child_quote_html: messageHtmlText(message),
        child_quote_rich_text: messageRichText(message),
      };
      await clearInputMessages(session, message);
      await updateEditorSession(userId, { addStep: 'details_child_quote_credit', addPayload: next });
      await sendPrompt(userId, message.chat.id, ar(languageCode) ? 'أرسل الكاتب أو /skip.' : 'Send the author or /skip.');
      return true;
    }
    const [media, caption] = quoteMediaPayload(messageToBlocks(message));
    if (!media.length) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل نصًا أو وسائط صالحة.' : 'Send text or supported media.' });
      return true;
    }
    const next = { ...payload, child_media_children: media };
    if (caption) {
      next.child_quote_text = caption.data?.text || '';
      next.child_quote_html = caption.data?.html || '';
      next.child_quote_rich_text = caption.data?.rich_text ?? null;
    }
    await clearInputMessages(session, message);
    await updateEditorSession(userId, {
      addStep: caption ? 'details_child_quote_credit' : 'details_child_pullquote_text',
      addPayload: next,
    });
    await sendPrompt(
      userId,
      message.chat.id,
      caption
        ? (ar(languageCode) ? 'أرسل الكاتب أو /skip.' : 'Send the author or /skip.')
        : (ar(languageCode) ? 'أرسل نص الاقتباس.' : 'Send quote text.'),
    );
    return true;
  }

  if (step === 'details_child_pullquote_text') {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل نص الاقتباس.' : 'Send quote text.' });
      return true;
    }
    const next = {
      ...payload,
      child_quote_text: message.text,
      child_quote_html: messageHtmlText(message),
      child_quote_rich_text: messageRichText(message),
    };
    await updateEditorSession(userId, { addStep: 'details_child_quote_credit', addPayload: next });
    await sendPrompt(userId, message.chat.id, ar(languageCode) ? 'أرسل الكاتب أو /skip.' : 'Send author or /skip.');
    return true;
  }

  if (step === 'details_child_quote_credit') {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل الكاتب أو /skip.' : 'Send author or /skip.' });
      return true;
    }
    const childType = String(session.pendingChildType || '');
    const credit = message.text.trim().toLowerCase() === '/skip' ? null : messageHtmlText(message);
    const child = makeBlock(childType, {
      quote_text: payload.child_quote_text || '',
      quote_html: payload.child_quote_html || '',
      quote_rich_text: payload.child_quote_rich_text ?? null,
      credit_html: credit,
      media_children: clone(payload.child_media_children || []),
    });
    await storeDetailsChild(userId, session, message, child, languageCode);
    return true;
  }

  if (step === 'details_child_content') {
    const type = String(session.pendingChildType || '');
    if (!DETAILS_CHILD_TYPES.includes(type)) return false;
    if (type === 'slideshow') return handleSlideshowMessage(message, session, languageCode, true);
    if (type === 'collage') {
      if (message?.media_group_id) {
        const collected = await rememberMediaGroup(message, 'details-collage');
        if (!collected) return true;
        const children = mediaChildrenFromBlocks(collected.blocks);
        const nextPayload = clone(session.addPayload || {});
        nextPayload.collage_upload = {
          group_id: collected.groupId,
          token: collected.token,
        };
        await updateEditorSession(userId, { addPayload: nextPayload });
        await clearInputMessages(session, message);
        await sendPrompt(
          userId,
          message.chat.id,
          (ar(languageCode) ? 'تم استلام عناصر الكولاج: ' : 'Collage items received: ') + children.length,
          collageConfirmationKeyboard(collected.token, languageCode),
        );
        return true;
      }
      const children = mediaChildren(message);
      if (!children.length) {
        await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل صورًا أو فيديوهات.' : 'Send photos or videos.' });
        return true;
      }
      await storeDetailsChild(userId, session, message, makeBlock('collage', { children, caption_html: null, credit_html: null }), languageCode);
      return true;
    }
    const child = buildChildFromMessage(message, type, {
      headingSize: payload.child_heading_size || 2,
      listKind: payload.child_list_kind || 'bullet',
    });
    if (!child) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'المحتوى لا يطابق النوع المختار.' : 'Content does not match the selected type.' });
      return true;
    }
    await storeDetailsChild(userId, session, message, child, languageCode);
    return true;
  }

  if (step === 'details_content') {
    const incoming = messageToBlocks(message);
    if (!incoming.length) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'هذا المحتوى غير مدعوم داخل Details.' : 'This content is not supported inside Details.' });
      return true;
    }
    const children = Array.isArray(payload.children) ? payload.children : [];
    for (const child of incoming) addBlock(children, child);
    await finishAdd(
      userId,
      session,
      message,
      makeBlock('details', {
        summary_html: String(payload.summary_html || ''),
        children,
      }),
      languageCode,
    );
    return true;
  }

  return false;
}

async function handleNestedEditMessage(message, session, languageCode) {
  const detailsId = String(session.nestedDetailsId || '');
  const childId = String(session.nestedChildId || '');
  const action = String(session.nestedAction || '');
  if (!detailsId || !childId || !action) return false;

  const blocks = clone(session.blocks);
  const details = getBlockById(blocks, detailsId);
  const child = details ? findDetailsChild(details, childId) : null;
  if (!details || !child) {
    await resetEditorTransientState(message.from.id);
    await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'هذا البلوك لم يعد موجودًا.' : 'This block no longer exists.' });
    return true;
  }

  let selected = child;
  if (action === 'add_footer') {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل نص التذييل.' : 'Send footer text.' });
      return true;
    }
    const children = detailsChildren(details);
    const index = children.findIndex((item) => String(item.id) === childId);
    const footer = buildTextBlock(message, 'footer');
    children.splice(index + 1, 0, footer);
    normalizeBlocks(children);
    detachDetails(details);
    details.data.children = children;
    selected = footer;
  } else if (action === 'caption' || action === 'credit') {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل نصًا.' : 'Send text.' });
      return true;
    }
    const replacement = stripNative(child.data || {});
    const remove = ['/remove', '/skip'].includes(message.text.trim().toLowerCase());
    replacement[action === 'caption' ? 'caption_html' : 'credit_html'] = remove ? null : messageHtmlText(message);
    selected = replaceDetailsChild(details, childId, makeBlock(String(child.type), replacement, child.position, 'generated', child.id)) || child;
  } else {
    const type = String(session.expectedType || child.type || '');
    let candidate = null;
    if (QUOTE_TYPES.includes(type)) {
      const replacement = quoteReplacementFromMessage(message, child.data || {});
      if (replacement) candidate = makeBlock(type, replacement);
    } else if (type === 'collage' || type === 'slideshow') {
      const children = mediaChildren(message);
      if (children.length) candidate = makeBlock(type, { ...stripNative(child.data), children });
    } else if (type === 'map') {
      if (message?.location) candidate = makeBlock('map', {
        ...mapData(message.location.latitude, message.location.longitude),
        caption_html: child.data?.caption_html ?? null,
        credit_html: child.data?.credit_html ?? null,
      });
    } else if (type === 'anchor') {
      const replacement = stripNative(child.data || {});
      const temp = makeBlock('anchor', replacement);
      if (message?.text && setAnchorDisplayName(temp, message.text)) candidate = temp;
    } else if (SIMPLE_TEXT_TYPES.has(type) || ['paragraph', 'heading', 'preformatted', 'footer'].includes(type)) {
      if (message?.text) candidate = buildTextBlock(message, type, {
        headingSize: child.data?.size || 2,
        listKind: child.data?.kind || 'bullet',
      });
    } else if (MEDIA_TYPES.has(type)) {
      const replacement = mediaBlock(message, type);
      if (replacement) {
        replacement.data.caption_html = child.data?.caption_html ?? replacement.data.caption_html ?? null;
        replacement.data.credit_html = child.data?.credit_html ?? null;
        candidate = replacement;
      }
    }
    if (!candidate) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'المحتوى لا يطابق نوع البلوك.' : 'Content does not match the block type.' });
      return true;
    }
    selected = replaceDetailsChild(details, childId, candidate) || child;
  }

  const saved = await saveMutatedBlocks(message.from.id, session, blocks, {
    state: 'managing',
    nestedDetailsId: null,
    nestedChildId: null,
    nestedAction: null,
    expectedType: null,
    editField: null,
    addPromptChatId: null,
    addPromptMessageId: null,
  });
  if (!saved.ok) {
    await api.sendMessage({ chat_id: message.chat.id, text: limitText(saved.limit, languageCode) });
    return true;
  }
  await clearInputMessages(session, message);
  const latestDetails = getBlockById(saved.updated.blocks, detailsId);
  const latestChild = findDetailsChild(latestDetails, selected.id) || detailsChildren(latestDetails)[0];
  await editManagement(
    saved.updated,
    detailsInnerPage(latestDetails, latestChild, languageCode),
    buildDetailsInnerBlockKeyboard(latestDetails, latestChild, languageCode),
  );
  return true;
}

async function handleEditMessage(message, session, languageCode) {
  if (session.nestedDetailsId) return handleNestedEditMessage(message, session, languageCode);

  const block = getBlockById(session.blocks, session.currentBlockId);
  const type = String(session.expectedType || '');
  if (!block || block.type !== type) return false;

  if (session.editField === 'summary' && type === 'details') {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'العنوان يحتاج نص.' : 'The summary requires text.' });
      return true;
    }
    const blocks = clone(session.blocks);
    const details = getBlockById(blocks, block.id);
    detachDetails(details);
    details.data.summary_html = messageHtmlText(message);
    const saved = await saveMutatedBlocks(message.from.id, session, blocks, {
      state: 'managing',
      currentBlockId: null,
      expectedType: null,
      editField: null,
      addPromptChatId: null,
      addPromptMessageId: null,
    });
    if (!saved.ok) {
      await api.sendMessage({ chat_id: message.chat.id, text: limitText(saved.limit, languageCode) });
      return true;
    }
    await clearInputMessages(session, message);
    const current = getBlockById(saved.updated.blocks, block.id);
    await editManagement(saved.updated, blockPage(current, saved.updated.blocks, languageCode), buildBlockEditorKeyboard(current, saved.updated.blocks, languageCode));
    return true;
  }

  if (session.editField === 'table_caption' && type === 'table') {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل عنوانًا أو /empty.' : 'Send a caption or /empty.' });
      return true;
    }
    const blocks = clone(session.blocks);
    const current = getBlockById(blocks, block.id);
    const table = editableTableData(current);
    if (!table) return false;
    if (message.text.trim().toLowerCase() === '/empty') {
      table.caption_rich_text = null;
      table.caption_html = null;
      table.caption_text = null;
    } else {
      table.caption_rich_text = messageRichText(message);
      table.caption_html = messageHtmlText(message);
      table.caption_text = message.text;
    }
    replaceBlockData(blocks, block.id, table, 'generated');
    const saved = await saveMutatedBlocks(message.from.id, session, blocks, {
      state: 'managing',
      currentBlockId: null,
      expectedType: null,
      editField: null,
      addPromptChatId: null,
      addPromptMessageId: null,
    });
    if (!saved.ok) {
      await api.sendMessage({ chat_id: message.chat.id, text: limitText(saved.limit, languageCode) });
      return true;
    }
    await clearInputMessages(session, message);
    const updated = getBlockById(saved.updated.blocks, block.id);
    await editManagement(
      saved.updated,
      ar(languageCode) ? '🧱 إعدادات مظهر الجدول' : '🧱 Table appearance',
      buildTableDisplayKeyboard(updated, languageCode),
    );
    return true;
  }

  if (session.editField === 'caption' || session.editField === 'credit') {
    if (!message?.text) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'أرسل نصًا.' : 'Send text.' });
      return true;
    }
    const replacement = stripNative(block.data || {});
    const remove = message.text.trim().toLowerCase() === '/remove';
    replacement[session.editField === 'caption' ? 'caption_html' : 'credit_html'] = remove ? null : messageHtmlText(message);
    return replaceTopBlock(message.from.id, session, message, block, replacement, languageCode);
  }

  if (type === 'details') {
    let incoming = messageToBlocks(message);
    if (incoming.length === 1 && incoming[0].type === 'details') {
      incoming = clone(incoming[0].data?.children || []);
    }
    if (!incoming.length) {
      await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'المحتوى غير مدعوم داخل Details.' : 'Unsupported Details content.' });
      return true;
    }
    const replacement = stripNative(block.data || {});
    replacement.children = incoming;
    return replaceTopBlock(message.from.id, session, message, block, replacement, languageCode);
  }

  let replacement = null;
  if (QUOTE_TYPES.includes(type)) {
    replacement = quoteReplacementFromMessage(message, block.data || {});
  } else if (CONTAINER_TYPES.has(type)) {
    const children = mediaChildren(message);
    if (children.length) replacement = { ...stripNative(block.data || {}), children };
  } else if (type === 'map') {
    if (message?.location) {
      replacement = {
        ...mapData(message.location.latitude, message.location.longitude),
        caption_html: block.data?.caption_html ?? null,
        credit_html: block.data?.credit_html ?? null,
      };
    }
  } else if (type === 'anchor') {
    const temp = makeBlock('anchor', stripNative(block.data || {}));
    if (message?.text && setAnchorDisplayName(temp, message.text)) replacement = temp.data;
  } else if (SIMPLE_TEXT_TYPES.has(type)) {
    if (message?.text) replacement = buildTextBlock(message, type, { listKind: block.data?.kind || 'bullet' }).data;
  } else if (MEDIA_TYPES.has(type)) {
    const parsed = replacementData(message, type);
    if (parsed) {
      replacement = {
        ...parsed,
        caption_html: block.data?.caption_html ?? parsed.caption_html ?? null,
        credit_html: block.data?.credit_html ?? null,
      };
    }
  }
  if (!replacement) {
    await api.sendMessage({ chat_id: message.chat.id, text: ar(languageCode) ? 'نوع المحتوى غير صحيح. أرسل نفس نوع البلوك.' : 'Wrong content type. Send the same block type.' });
    return true;
  }
  return replaceTopBlock(message.from.id, session, message, block, stripNative(replacement), languageCode);
}

export async function handleExtraBlockMessage(message, session) {
  if (!message?.from?.id || !session) return false;
  const languageCode = code(message);
  if (session.state === 'adding_block') {
    const type = String(session.pendingAddType || '');
    if (!['paragraph', 'heading', 'preformatted', 'footer', 'divider'].includes(type)) {
      return handleAddMessage(message, session, languageCode);
    }
  }
  if (session.state === 'editing_block') {
    const type = String(session.expectedType || '');
    if (
      session.nestedDetailsId
      || session.editField
      || !['text', 'paragraph', 'heading', 'preformatted', 'footer'].includes(type)
    ) {
      return handleEditMessage(message, session, languageCode);
    }
  }
  return false;
}
