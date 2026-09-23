import { api } from 'sdk';
import {
  FIRST_BLOCK_TYPES,
  addBlock,
  deleteBlock,
  duplicateBlock,
  getBlockById,
  makeBlock,
  moveBlock,
  replaceBlockData,
  textData,
  validateEditorLimits,
} from 'lib/editor-blocks';
import {
  blockPage,
  buildAddBlockKeyboard,
  buildBlockEditorKeyboard,
  buildDeleteConfirmationKeyboard,
  buildEditorKeyboard,
  buildHeadingLevelKeyboard,
  editorCopy,
  editorDashboardText,
} from 'lib/editor-block-ui';
import {
  acquireEditorMutationLock,
  loadEditorSession,
  redoEditorState,
  rememberEditorState,
  releaseEditorMutationLock,
  resetEditorTransientState,
  setEditorState,
  undoEditorState,
  updateEditorSession,
} from 'lib/editor-session';
import { buildInputRichMessage, buildSingleBlockRichMessage } from 'lib/editor-renderer';
import { messageHtmlText, messageRichText, plainRichText } from 'lib/rich-text';
import { recordOperation } from 'lib/usage-stats';

function languageCode(source) {
  return source?.from?.language_code || 'en';
}

function isArabic(code) {
  return String(code || '').toLowerCase().startsWith('ar');
}

function prompts(code) {
  if (isArabic(code)) {
    return {
      expired: 'انتهت الجلسة. أرسل /editor للبدء من جديد.',
      textRequired: 'هذا النوع يحتاج إلى نص.',
      addEnded: 'انتهت عملية الإضافة. ارجع إلى المحرّر وحاول مجددًا.',
      paragraphAdd: 'أرسل نص الفقرة.',
      paragraphEdit: 'أرسل نص الفقرة الجديد',
      footerAdd: 'أرسل نص التذييل.',
      footerEdit: 'أرسل التذييل الجديد',
      codeAdd: 'أرسل النص البرمجي.\n\nلتحديد لغة الكود اكتب في أول سطر: /lang python ثم اكتب الكود في الأسطر التالية. وتكدر أيضًا تستخدم: \`\`\`python ... \`\`\`.',
      codeEdit: 'أرسل النص البرمجي الجديد.\n\nلتحديد لغة الكود اكتب في أول سطر: /lang python ثم اكتب الكود في الأسطر التالية. وتكدر أيضًا تستخدم: \`\`\`python ... \`\`\`.',
      headingSelected: (level) => 'اخترت H' + level + '. أرسل نص العنوان الآن.',
      headingEditSelected: (level) => 'اخترت H' + level + '. أرسل نص العنوان الجديد الآن.',
      invalidHeading: 'مستوى العنوان غير صالح.',
      missingBlock: 'هذا البلوك لم يعد موجودًا.',
      invalidContent: 'نوع المحتوى غير صحيح. أرسل نفس نوع الجزء المطلوب.',
      dividerAdded: 'تمت إضافة الفاصل',
      deleted: 'تم الحذف',
      moved: 'تم تغيير الموقع',
      edge: 'هذا الجزء وصل إلى نهاية الترتيب.',
      deleteQuestion: 'هل تريد حذف هذا الجزء؟',
      previewGenerating: 'جاري إنشاء المعاينة…',
      previewFailed: 'فشلت المعاينة.',
      previewSingleFailed: 'فشلت معاينة هذا البلوك.',
      previewNotice: (label) => 'معاينة: ' + label,
      blockLimit: (limit) => 'الرسالة تقدر تحتوي بحد أقصى ' + limit + ' بلوكة.',
      charLimit: (limit) => 'الرسالة تقدر تحتوي بحد أقصى ' + limit + ' حرف ظاهر.',
    };
  }
  return {
    expired: 'The session has expired. Send /editor to start again.',
    textRequired: 'This block type requires text.',
    addEnded: 'The add flow has ended. Return to the editor and try again.',
    paragraphAdd: 'Send the paragraph text.',
    paragraphEdit: 'Send the new paragraph text.',
    footerAdd: 'Send the footer text.',
    footerEdit: 'Send the new footer text.',
    codeAdd: 'Send the code.\n\nTo set its language, start with /lang python, then put the code on the following lines. You can also use a fenced block such as \`\`\`python ... \`\`\`.',
    codeEdit: 'Send the new code.\n\nTo set its language, start with /lang python, then put the code on the following lines. You can also use a fenced block such as \`\`\`python ... \`\`\`.',
    headingSelected: (level) => 'H' + level + ' selected. Send the heading text now.',
    headingEditSelected: (level) => 'H' + level + ' selected. Send the new heading text now.',
    invalidHeading: 'Invalid heading level.',
    missingBlock: 'This block no longer exists.',
    invalidContent: 'Wrong content type. Send the same type of content requested.',
    dividerAdded: 'Divider added.',
    deleted: 'Deleted',
    moved: 'Position changed',
    edge: 'This block is already at that edge.',
    deleteQuestion: 'Delete this block?',
    previewGenerating: 'Generating preview…',
    previewFailed: 'Preview failed.',
    previewSingleFailed: 'This block preview failed.',
    previewNotice: (label) => 'Preview: ' + label,
    blockLimit: (limit) => 'This message can contain at most ' + limit + ' blocks.',
    charLimit: (limit) => 'This message can contain at most ' + limit + ' visible characters.',
  };
}

async function answerExpired(query) {
  await api.answerCallbackQuery({
    callback_query_id: query.id,
    text: prompts(languageCode(query)).expired,
    show_alert: true,
  });
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

async function deleteQuietly(chatId, messageId) {
  if (!chatId || !messageId) return;
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch {}
}

async function clearInputMessages(session, triggerMessage) {
  const seen = new Set();
  const targets = [
    [triggerMessage?.chat?.id, triggerMessage?.message_id],
    [session?.addPromptChatId, session?.addPromptMessageId],
  ];
  for (const [chatId, messageId] of targets) {
    const key = String(chatId) + ':' + String(messageId);
    if (!chatId || !messageId || seen.has(key)) continue;
    seen.add(key);
    await deleteQuietly(chatId, messageId);
  }
}

function limitText(result, code) {
  const copy = prompts(code);
  return result.code === 'blocks'
    ? copy.blockLimit(result.limit)
    : copy.charLimit(result.limit);
}

async function repostManagement(userId, oldSession, code, notice = null) {
  const latest = await loadEditorSession(userId, { touch: false });
  if (!latest) return null;
  const chatId = oldSession?.managementChatId || oldSession?.chatId;
  if (!chatId) return null;

  const sent = await api.sendMessage({
    chat_id: chatId,
    text: editorDashboardText(latest, code, notice),
    reply_markup: buildEditorKeyboard(latest, code),
  });
  await updateEditorSession(userId, {
    managementChatId: sent.chat?.id || chatId,
    managementMessageId: sent.message_id,
  });
  if (oldSession?.managementMessageId && oldSession.managementMessageId !== sent.message_id) {
    await deleteQuietly(oldSession.managementChatId || chatId, oldSession.managementMessageId);
  }
  return sent;
}

async function finishAdd(userId, session, triggerMessage, block, code) {
  const blocks = JSON.parse(JSON.stringify(session.blocks || []));
  addBlock(blocks, block);
  const limit = validateEditorLimits(blocks);
  if (!limit.ok) {
    await api.sendMessage({
      chat_id: triggerMessage.chat.id,
      text: limitText(limit, code),
    });
    return false;
  }

  await rememberEditorState(userId, session);
  await updateEditorSession(userId, {
    blocks,
    state: 'managing',
    currentBlockId: null,
    pendingAddType: null,
    addStep: null,
    addPayload: {},
    expectedType: null,
    editField: null,
    headingSize: null,
    addPromptChatId: null,
    addPromptMessageId: null,
    blockScrollOffset: 0,
  });
  await clearInputMessages(session, triggerMessage);
  await repostManagement(userId, session, code, editorCopy(code).added);
  return true;
}

function compactPeek(block, code) {
  const data = block?.data || {};
  if (block?.type === 'divider') return editorCopy(code).divider;
  const value = plainRichText(data.rich_text)
    || String(data.text || '')
    || String(data.html || '').replace(/<[^>]+>/g, ' ');
  const plain = value.replace(/\s+/g, ' ').trim();
  if (!plain) return editorCopy(code)[block?.type] || String(block?.type || '');
  return plain.length <= 180 ? plain : plain.slice(0, 179).trimEnd() + '…';
}

async function showDashboard(query, session) {
  const code = languageCode(query);
  await editMessage(
    query.message.chat.id,
    query.message.message_id,
    session.blocks?.length ? editorDashboardText(session, code) : editorCopy(code).empty,
    buildEditorKeyboard(session, code),
  );
  await updateEditorSession(query.from.id, {
    managementChatId: query.message.chat.id,
    managementMessageId: query.message.message_id,
    state: 'managing',
    currentBlockId: null,
    blockScrollOffset: session.blockScrollOffset || 0,
  });
  await api.answerCallbackQuery({ callback_query_id: query.id });
}

async function previewBlock(query, session, block) {
  const code = languageCode(query);
  const copy = prompts(code);
  await api.answerCallbackQuery({ callback_query_id: query.id, text: copy.previewGenerating });
  try {
    let rich;
    try {
      rich = buildSingleBlockRichMessage(block);
      await api.sendRichMessage({ chat_id: query.from.id, rich_message: rich });
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toUpperCase();
      if (block.type !== 'divider' && !reason.includes('RICH_MESSAGE_EMPTY')) throw error;
      const context = makeBlock('footer', {
        text: editorCopy(code).preview,
        rich_text: editorCopy(code).preview,
        parse_inline_buttons: false,
      }, 1);
      rich = buildInputRichMessage([{ ...block, position: 0 }, context]);
      await api.sendRichMessage({ chat_id: query.from.id, rich_message: rich });
    }
    await api.sendMessage({
      chat_id: query.from.id,
      text: copy.previewNotice(editorCopy(code)[block.type] || block.type),
    });
    await recordOperation('preview', true);
  } catch (error) {
    console.error('Single block preview failed', error);
    await recordOperation('preview', false);
    await api.sendMessage({ chat_id: query.from.id, text: copy.previewSingleFailed });
  }
}

async function previewResult(query, session) {
  const code = languageCode(query);
  const copy = prompts(code);
  await api.answerCallbackQuery({ callback_query_id: query.id, text: copy.previewGenerating });
  try {
    await api.sendRichMessage({
      chat_id: query.from.id,
      rich_message: buildInputRichMessage(session.blocks || []),
    });
    await recordOperation('preview', true);
  } catch (error) {
    console.error('Rich result preview failed', error);
    await recordOperation('preview', false);
    await api.sendMessage({
      chat_id: query.from.id,
      text: copy.previewFailed + '\n' + String(error?.message || error),
    });
  }
}

export async function handleEditorBlockCallback(query) {
  const data = String(query?.data || '');
  const relevant = data === 'r:addmenu'
    || data === 'r:back'
    || data === 'r:result'
    || data === 'r:undo'
    || data === 'r:redo'
    || data.startsWith('r:add:')
    || data.startsWith('r:hs:')
    || data.startsWith('r:b:')
    || data.startsWith('r:e:')
    || data.startsWith('r:dup:')
    || data.startsWith('r:d:')
    || data.startsWith('r:dc:')
    || data.startsWith('r:mu:')
    || data.startsWith('r:md:')
    || data.startsWith('r:peek:')
    || data.startsWith('r:pv:')
    || data.startsWith('r:blockscroll:');
  if (!relevant) return false;

  const session = await loadEditorSession(query.from?.id);
  if (!session) {
    if (data === 'r:back') return false;
    await answerExpired(query);
    return true;
  }
  const code = languageCode(query);
  const copy = editorCopy(code);
  const p = prompts(code);
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data === 'r:back') {
    await showDashboard(query, session);
    return true;
  }

  if (data === 'r:undo' || data === 'r:redo') {
    const changed = data === 'r:undo'
      ? await undoEditorState(query.from.id)
      : await redoEditorState(query.from.id);
    if (!changed) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: data === 'r:undo'
          ? (isArabic(code) ? 'ماكو إجراء يمكن التراجع عنه.' : 'There is no action to undo.')
          : (isArabic(code) ? 'ماكو إجراء يمكن إعادته.' : 'There is no action to redo.'),
      });
      return true;
    }
    await editMessage(
      chatId,
      messageId,
      changed.blocks?.length ? editorDashboardText(changed, code) : copy.empty,
      buildEditorKeyboard(changed, code),
    );
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: data === 'r:undo'
        ? (isArabic(code) ? 'تم التراجع' : 'Undone')
        : (isArabic(code) ? 'تمت الإعادة' : 'Redone'),
    });
    return true;
  }

  if (data === 'r:addmenu') {
    await editMessage(chatId, messageId, copy.chooseNewBlock, buildAddBlockKeyboard(code));
    await updateEditorSession(query.from.id, {
      managementChatId: chatId,
      managementMessageId: messageId,
      state: 'managing',
    });
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:blockscroll:')) {
    const raw = Number.parseInt(data.split(':').at(-1), 10);
    const updated = await updateEditorSession(query.from.id, {
      blockScrollOffset: Number.isFinite(raw) ? Math.max(0, raw) : 0,
    });
    await editMessage(chatId, messageId, editorDashboardText(updated, code), buildEditorKeyboard(updated, code));
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:add:')) {
    const type = data.slice('r:add:'.length);
    if (!FIRST_BLOCK_TYPES.includes(type)) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: 'Unsupported block type', show_alert: true });
      return true;
    }

    if (type === 'heading') {
      await api.sendMessage({
        chat_id: chatId,
        text: copy.chooseHeading,
        reply_markup: buildHeadingLevelKeyboard('add', code),
      });
      await api.answerCallbackQuery({ callback_query_id: query.id });
      return true;
    }

    if (type === 'divider') {
      const ok = await finishAdd(
        query.from.id,
        session,
        query.message,
        makeBlock('divider', { html: '<hr/>' }),
        code,
      );
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        ...(ok ? { text: p.dividerAdded } : {}),
      });
      return true;
    }

    const prompt = type === 'paragraph'
      ? p.paragraphAdd
      : type === 'preformatted'
        ? p.codeAdd
        : p.footerAdd;
    await setEditorState(query.from.id, 'adding_block', {
      pendingAddType: type,
      addStep: 'content',
      addPayload: {},
    });
    await sendPrompt(query.from.id, chatId, prompt);
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:hs:')) {
    const parts = data.split(':');
    const action = parts[2];
    const level = Number.parseInt(parts[3], 10);
    if (!['add', 'edit'].includes(action) || !Number.isInteger(level) || level < 1 || level > 6) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: p.invalidHeading, show_alert: true });
      return true;
    }

    if (action === 'add') {
      await setEditorState(query.from.id, 'adding_block', {
        pendingAddType: 'heading',
        addStep: 'content',
        addPayload: { heading_size: level },
        headingSize: level,
      });
      await sendPrompt(query.from.id, chatId, p.headingSelected(level));
    } else {
      const blockId = parts[4];
      const block = getBlockById(session.blocks, blockId);
      if (!block || block.type !== 'heading') {
        await api.answerCallbackQuery({ callback_query_id: query.id, text: p.missingBlock, show_alert: true });
        return true;
      }
      await setEditorState(query.from.id, 'editing_block', {
        currentBlockId: blockId,
        expectedType: 'heading',
        editField: null,
        headingSize: level,
      });
      await sendPrompt(query.from.id, chatId, p.headingEditSelected(level));
    }
    await deleteQuietly(chatId, messageId);
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:b:')) {
    const id = data.slice('r:b:'.length);
    const block = getBlockById(session.blocks, id);
    if (!block) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: p.missingBlock, show_alert: true });
      return true;
    }
    await updateEditorSession(query.from.id, {
      currentBlockId: id,
      managementChatId: chatId,
      managementMessageId: messageId,
    });
    await editMessage(chatId, messageId, blockPage(block, session.blocks, code), buildBlockEditorKeyboard(block, session.blocks, code));
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:e:')) {
    const id = data.slice('r:e:'.length);
    const block = getBlockById(session.blocks, id);
    if (!block || !FIRST_BLOCK_TYPES.includes(block.type) || block.type === 'divider') {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: p.missingBlock, show_alert: true });
      return true;
    }
    if (block.type === 'heading') {
      await api.sendMessage({
        chat_id: chatId,
        text: copy.chooseNewHeading,
        reply_markup: buildHeadingLevelKeyboard('edit', code, id),
      });
      await api.answerCallbackQuery({ callback_query_id: query.id });
      return true;
    }

    const prompt = block.type === 'paragraph'
      ? p.paragraphEdit
      : block.type === 'preformatted'
        ? p.codeEdit
        : p.footerEdit;
    await setEditorState(query.from.id, 'editing_block', {
      currentBlockId: id,
      expectedType: block.type,
      editField: null,
      headingSize: null,
    });
    await sendPrompt(query.from.id, chatId, prompt);
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:dup:')) {
    const id = data.slice('r:dup:'.length);
    const blocks = JSON.parse(JSON.stringify(session.blocks || []));
    const duplicate = duplicateBlock(blocks, id, { after: true });
    if (!duplicate) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: p.missingBlock, show_alert: true });
      return true;
    }
    const limit = validateEditorLimits(blocks);
    if (!limit.ok) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: limitText(limit, code),
        show_alert: true,
      });
      return true;
    }
    await rememberEditorState(query.from.id, session);
    const updated = await updateEditorSession(query.from.id, {
      blocks,
      currentBlockId: duplicate.id,
    });
    const current = getBlockById(updated.blocks, duplicate.id);
    await editMessage(
      chatId,
      messageId,
      blockPage(current, updated.blocks, code),
      buildBlockEditorKeyboard(current, updated.blocks, code),
    );
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: copy.duplicated,
    });
    return true;
  }

  if (data.startsWith('r:d:')) {
    const id = data.slice('r:d:'.length);
    if (!getBlockById(session.blocks, id)) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: p.missingBlock, show_alert: true });
      return true;
    }
    await editMessage(chatId, messageId, p.deleteQuestion, buildDeleteConfirmationKeyboard(id, code));
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data.startsWith('r:dc:')) {
    if (!await acquireEditorMutationLock(query.from.id)) {
      await api.answerCallbackQuery({ callback_query_id: query.id });
      return true;
    }
    try {
      const lockedSession = await loadEditorSession(query.from.id);
      if (!lockedSession) {
        await answerExpired(query);
        return true;
      }
      const id = data.slice('r:dc:'.length);
      const blocks = JSON.parse(JSON.stringify(lockedSession.blocks || []));
      if (!deleteBlock(blocks, id)) {
        await api.answerCallbackQuery({ callback_query_id: query.id, text: p.missingBlock, show_alert: true });
        return true;
      }
      await rememberEditorState(query.from.id, lockedSession);
      const updated = await updateEditorSession(query.from.id, {
        blocks,
        state: 'managing',
        currentBlockId: null,
        blockScrollOffset: 0,
      });
      await editMessage(
        chatId,
        messageId,
        blocks.length ? editorDashboardText(updated, code, copy.delete) : copy.empty,
        buildEditorKeyboard(updated, code),
      );
      await api.answerCallbackQuery({ callback_query_id: query.id, text: p.deleted });
      return true;
    } finally {
      await releaseEditorMutationLock(query.from.id);
    }
  }

  if (data.startsWith('r:mu:') || data.startsWith('r:md:')) {
    if (!await acquireEditorMutationLock(query.from.id)) {
      await api.answerCallbackQuery({ callback_query_id: query.id });
      return true;
    }
    try {
      const lockedSession = await loadEditorSession(query.from.id);
      if (!lockedSession) {
        await answerExpired(query);
        return true;
      }
      const up = data.startsWith('r:mu:');
      const id = data.slice(5);
      const blocks = JSON.parse(JSON.stringify(lockedSession.blocks || []))
        .sort((a, b) => Number(a.position || 0) - Number(b.position || 0));
      const block = getBlockById(blocks, id);
      if (!block) {
        await api.answerCallbackQuery({ callback_query_id: query.id, text: p.missingBlock, show_alert: true });
        return true;
      }
      const current = blocks.findIndex((item) => String(item.id) === String(id));
      const target = current + (up ? -1 : 1);
      if (target < 0 || target >= blocks.length || !moveBlock(blocks, id, target)) {
        await api.answerCallbackQuery({ callback_query_id: query.id, text: p.edge });
        return true;
      }
      await rememberEditorState(query.from.id, lockedSession);
      const updated = await updateEditorSession(query.from.id, { blocks });
      const moved = getBlockById(updated.blocks, id);
      await editMessage(chatId, messageId, blockPage(moved, updated.blocks, code), buildBlockEditorKeyboard(moved, updated.blocks, code));
      await api.answerCallbackQuery({ callback_query_id: query.id, text: p.moved });
      return true;
    } finally {
      await releaseEditorMutationLock(query.from.id);
    }
  }

  if (data.startsWith('r:peek:')) {
    const id = data.slice('r:peek:'.length);
    const block = getBlockById(session.blocks, id);
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      ...(block
        ? { text: compactPeek(block, code), show_alert: true }
        : { text: p.missingBlock, show_alert: true }),
    });
    return true;
  }

  if (data.startsWith('r:pv:')) {
    const id = data.slice('r:pv:'.length);
    const block = getBlockById(session.blocks, id);
    if (!block) {
      await api.answerCallbackQuery({ callback_query_id: query.id, text: p.missingBlock, show_alert: true });
      return true;
    }
    await previewBlock(query, session, block);
    return true;
  }

  if (data === 'r:result') {
    await previewResult(query, session);
    return true;
  }

  return false;
}

export async function handleEditorBlockMessage(message) {
  const userId = message?.from?.id;
  if (!userId) return false;
  const session = await loadEditorSession(userId);
  if (!session || !['adding_block', 'editing_block'].includes(String(session.state))) return false;

  const code = languageCode(message);
  const p = prompts(code);
  if (typeof message.text !== 'string') {
    await api.sendMessage({ chat_id: message.chat.id, text: p.textRequired });
    return true;
  }

  if (session.state === 'adding_block') {
    const type = String(session.pendingAddType || '');
    if (!FIRST_BLOCK_TYPES.includes(type) || type === 'divider') {
      await resetEditorTransientState(userId);
      await api.sendMessage({ chat_id: message.chat.id, text: p.addEnded });
      return true;
    }
    const headingSize = Number(session.addPayload?.heading_size || session.headingSize || 2);
    const data = textData(message, type, headingSize, messageRichText(message), messageHtmlText(message));
    await finishAdd(userId, session, message, makeBlock(type, data), code);
    return true;
  }

  const type = String(session.expectedType || '');
  const block = getBlockById(session.blocks, session.currentBlockId);
  if (!block || !FIRST_BLOCK_TYPES.includes(type) || type === 'divider' || block.type !== type) {
    await resetEditorTransientState(userId);
    await api.sendMessage({ chat_id: message.chat.id, text: p.missingBlock });
    return true;
  }

  const headingSize = type === 'heading'
    ? Number(session.headingSize || block.data?.size || 2)
    : 2;
  const replacement = textData(message, type, headingSize, messageRichText(message), messageHtmlText(message));
  const blocks = JSON.parse(JSON.stringify(session.blocks || []));
  const updatedBlock = replaceBlockData(blocks, block.id, replacement, 'generated');
  if (!updatedBlock) {
    await api.sendMessage({ chat_id: message.chat.id, text: p.missingBlock });
    return true;
  }

  const limit = validateEditorLimits(blocks);
  if (!limit.ok) {
    await api.sendMessage({ chat_id: message.chat.id, text: limitText(limit, code) });
    return true;
  }

  await rememberEditorState(userId, session);
  await updateEditorSession(userId, {
    blocks,
    state: 'managing',
    currentBlockId: block.id,
    expectedType: null,
    editField: null,
    headingSize: null,
    addPromptChatId: null,
    addPromptMessageId: null,
  });
  await clearInputMessages(session, message);
  const latest = await loadEditorSession(userId, { touch: false });
  const current = getBlockById(latest.blocks, block.id);
  if (current) {
    await editManagement(
      latest,
      blockPage(current, latest.blocks, code),
      buildBlockEditorKeyboard(current, latest.blocks, code),
    );
  }
  return true;
}
