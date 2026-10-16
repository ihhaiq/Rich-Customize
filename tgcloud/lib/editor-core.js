import { api, db } from 'sdk';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { eq } from 'sdk/db';
import { resolveSavedPageReference } from 'lib/page-delivery';
import { richPages, legacyStates } from 'schema';
import { buildInputRichMessage, tutorialView } from 'lib/editor-renderer';
import { persistPage } from 'lib/editor-pages';
import { acquireEditorMutationLock, releaseEditorMutationLock, createEditorSession } from 'lib/editor-session';
import { tutorialCopy, resolveUserLanguage } from 'lib/i18n';
import { logError } from 'lib/error-log';
import {
  blockId,
  makeBlock,
  validateEditorLimits,
} from 'lib/editor-blocks';
import {
  buildEditorKeyboard,
  editorDashboardRichMessage,
} from 'lib/editor-block-ui';
import {
  loadEditorSession,
  rememberEditorState,
  updateEditorSession,
  readTutorial,
  initialTutorial,
  writeTutorial,
} from 'lib/editor-session';
import { openEditor } from 'lib/editor-home';
import { parseMessageButtons, parseRichMessage, clone, orderBlocks, templateBlocks, TEMPLATE_IDS, TYPES, advice, applyAdvice, blockAt, fromInput, exampleBlock } from 'lib/editor-import';
import { buildMessageButtonsKeyboard } from 'lib/page-buttons';
import { resolveLanguage, t, tr } from 'lib/i18n';

function languageCode(source) {
  return source?.from?.language_code || 'en';
}

function limitText(result, code) {
  const locale = resolveLanguage(code);
  if (result.code === 'blocks') return t(locale, 'limits.blocks', { limit: result.limit });
  if (result.code === 'characters') return t(locale, 'limits.characters', { limit: result.limit });
  if (result.code === 'table_rows') return t(locale, 'limits.table_rows', { limit: result.limit });
  if (result.code === 'table_columns') return t(locale, 'limits.table_columns', { limit: result.limit });

  if (result.code === 'nesting_depth') return locale === 'ar'
    ? 'وصلت للحد الأقصى لمستويات التداخل في باقتك: ' + result.limit
    : 'Maximum nesting levels for your plan: ' + result.limit;
  if (result.code === 'media_attachments') return locale === 'ar'
    ? 'وصلت للحد الأقصى لمرفقات الوسائط بالرسالة: ' + result.limit
    : 'Maximum media attachments per message: ' + result.limit;
  return tr(locale, 'The content exceeds an editor limit.');
}

function importFailedText(code) {
  return t(resolveLanguage(code), 'editor.rich_import_failed');
}

async function deleteQuietly(chatId, messageId) {
  if (!chatId || !messageId) return;
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch {}
}

async function deleteChannelChoicePrompt(pending, fallbackChatId) {
  await deleteQuietly(
    Number(pending?.choiceChatId || fallbackChatId || 0),
    Number(pending?.choiceMessageId || 0),
  );
}

async function editSavedUi(userId, session, richMessage, replyMarkup) {
  const chatId = session?.managementChatId || session?.chatId;
  const messageId = session?.managementMessageId;
  if (!chatId) return null;

  if (messageId) {
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        rich_message: richMessage,
        reply_markup: replyMarkup,
      });
      return { chatId, messageId };
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toLowerCase();
      if (reason.includes('message is not modified')) {
        return { chatId, messageId };
      }
      const recoverableTarget = (
        reason.includes('message to edit not found')
        || reason.includes("message can't be edited")
        || reason.includes('message_id_invalid')
      );
      if (!recoverableTarget) throw error;
    }
  }

  const sent = await api.sendRichMessage({
    chat_id: chatId,
    rich_message: richMessage,
    reply_markup: replyMarkup,
  });
  await updateEditorSession(userId, {
    managementChatId: sent.chat?.id || chatId,
    managementMessageId: sent.message_id,
  });
  return {
    chatId: sent.chat?.id || chatId,
    messageId: sent.message_id,
  };
}

function comparableDraft(session) {
  return {
    blocks: session?.blocks || [],
    messageButtons: session?.messageButtons || [],
    buttonsPerRow: Number(session?.buttonsPerRow || 1),
    buttonsAlign: String(session?.buttonsAlign || 'center'),
    currentPageId: session?.currentPageId ?? null,
    currentPageTitle: session?.currentPageTitle ?? null,
  };
}

function importedDraft(message) {
  const blocks = parseRichMessage(message);
  const importedButtons = parseMessageButtons(message);
  return {
    blocks,
    messageButtons: importedButtons.buttons,
    buttonsPerRow: importedButtons.buttonsPerRow,
    buttonsAlign: importedButtons.buttonsAlign,
    currentPageId: null,
    currentPageTitle: null,
  };
}

function hasEditorContent(session) {
  return Boolean(
    (Array.isArray(session?.blocks) && session.blocks.length)
    || (Array.isArray(session?.messageButtons) && session.messageButtons.length)
    || session?.currentPageId
    || (session?.state && session.state !== 'managing')
  );
}

function importWarningCopy(code) {
  const locale = resolveLanguage(code);
  if (locale === 'ar') {
    return {
      text:'⚠️ عندك محتوى مفتوح بالمحرر.\n\nفتح الرسالة الغنية الجديدة راح يستبدل المحتوى الحالي ويبدأ محرر بالمحتوى الجديد. تريد المتابعة؟',
      confirm:'فتح المحتوى الجديد',
      cancel:'إلغاء',
    };
  }
  return {
    text:'⚠️ You already have content open in the editor.\n\nOpening the new rich message will replace the current editor content. Continue?',
    confirm:'Open new content',
    cancel:'Cancel',
  };
}

function importWarningKeyboard(code) {
  const copy = importWarningCopy(code);
  return {
    inline_keyboard: [[
      { text:copy.confirm, callback_data:'r:import:confirm', style:'danger' },
      { text:copy.cancel, callback_data:'r:import:cancel' },
    ]],
  };
}

async function showImportWarning(userId, session, code) {
  const chatId = session?.managementChatId || session?.chatId;
  const messageId = session?.managementMessageId;
  if (!chatId) return null;
  const copy = importWarningCopy(code);
  const replyMarkup = importWarningKeyboard(code);

  if (messageId) {
    try {
      await api.editMessageText({
        chat_id:chatId,
        message_id:messageId,
        text:copy.text,
        reply_markup:replyMarkup,
      });
      return {chatId,messageId};
    } catch (error) {
      const reason=String(error?.description||error?.message||error).toLowerCase();
      if (reason.includes('message is not modified')) return {chatId,messageId};
    }
  }

  const sent = await api.sendMessage({
    chat_id:chatId,
    text:copy.text,
    reply_markup:replyMarkup,
  });
  await updateEditorSession(userId,{
    managementChatId:sent.chat?.id||chatId,
    managementMessageId:sent.message_id,
  });
  return {chatId:sent.chat?.id||chatId,messageId:sent.message_id};
}

async function clearSessionArtifacts(session) {
  const targets = [];
  if (session?.addPromptChatId && session?.addPromptMessageId) {
    targets.push([session.addPromptChatId, session.addPromptMessageId]);
  }
  for (const messageId of Array.isArray(session?.previewMessageIds) ? session.previewMessageIds : []) {
    targets.push([session?.chatId, messageId]);
  }
  for (const messageId of Object.values(session?.blockPreviewMessageIds || {})) {
    targets.push([session?.chatId, messageId]);
  }
  if (session?.blockPeekMessageId) targets.push([session?.chatId, session.blockPeekMessageId]);
  if (session?.buttonPreviewMessageId) targets.push([session?.chatId, session.buttonPreviewMessageId]);

  const seen = new Set();
  for (const [chatId, messageId] of targets) {
    if (!chatId || !messageId) continue;
    const key = String(chatId) + ':' + String(messageId);
    if (seen.has(key)) continue;
    seen.add(key);
    await deleteQuietly(chatId, messageId);
  }
}

async function applyImportedDraft(
  userId,
  session,
  draft,
  code,
  source = null,
  channelPostTarget = null,
) {
  const changed = JSON.stringify(comparableDraft(session)) !== JSON.stringify(draft);
  if (changed && hasEditorContent(session)) await rememberEditorState(userId, session);

  await clearSessionArtifacts(session);

  const updated = await updateEditorSession(userId, {
    ...draft,
    channelPostTarget,
    state:'managing',
    currentBlockId:null,
    currentButtonId:null,
    pendingAddType:null,
    addStep:null,
    addPayload:{},
    expectedType:null,
    editField:null,
    headingSize:null,
    addPromptChatId:null,
    addPromptMessageId:null,
    pendingButtonAction:null,
    pendingButtonText:null,
    pendingButtonType:null,
    pendingChildType:null,
    nestedDetailsId:null,
    nestedChildId:null,
    nestedAction:null,
    pendingUserState:null,
    previewMessageIds:[],
    blockPreviewMessageIds:{},
    blockPeekMessageId:null,
    buttonPreviewMessageId:null,
    blockScrollOffset:0,
    blockScrollEnabled:1,
  });

  if (source?.chatId && source?.messageId) {
    await deleteQuietly(source.chatId, source.messageId);
  }
  await editSavedUi(
    userId,
    updated,
    editorDashboardRichMessage(updated, code),
    buildEditorKeyboard(updated, code),
  );
  return updated;
}

export function isForwardedRichMessage(message) {
  return Boolean(
    message?.rich_message
    && (
      message?.forward_origin
      || message?.forward_date
      || message?.forward_from
      || message?.forward_from_chat
      || message?.forward_sender_name
    )
  );
}

function forwardedChannelPost(message) {
  const origin = message?.forward_origin;
  const chat = origin?.type === 'channel'
    ? origin.chat
    : (message?.forward_from_chat?.type === 'channel' ? message.forward_from_chat : null);
  const messageId = origin?.type === 'channel'
    ? origin.message_id
    : message?.forward_from_message_id;
  const chatId = Number(chat?.id);
  const sourceMessageId = Number(messageId);
  if (
    String(chat?.type || '') !== 'channel'
    || !Number.isSafeInteger(chatId)
    || chatId >= 0
    || !Number.isSafeInteger(sourceMessageId)
    || sourceMessageId <= 0
  ) return null;
  return {
    chatId,
    messageId: sourceMessageId,
    originDate: Number(origin?.date || message?.forward_date || 0) || null,
  };
}

function memberStatus(member) {
  return String(member?.status?.value || member?.status || '');
}

function canEditAsChannelAdmin(member) {
  const status = memberStatus(member);
  return status === 'creator'
    || (status === 'administrator' && Boolean(member?.can_edit_messages));
}

async function canEditChannelPost(userId, target) {
  try {
    const me = await api.getMe();
    if (!Number.isSafeInteger(Number(me?.id)) || Number(me.id) <= 0) return false;
    const [botMember, userMember] = await Promise.all([
      api.getChatMember({ chat_id: target.chatId, user_id: Number(me.id) }),
      api.getChatMember({ chat_id: target.chatId, user_id: Number(userId) }),
    ]);
    return canEditAsChannelAdmin(botMember) && canEditAsChannelAdmin(userMember);
  } catch (error) {
    await logError('editor.channel_post_access', error, {
      userId,
      chatId: target.chatId,
    });
    return false;
  }
}

function channelPostChoiceKeyboard(locale) {
  return {
    inline_keyboard: [[
      { text:t(locale, 'channel_post.edit'), callback_data:'r:channel:edit', style:'success' },
      { text:t(locale, 'channel_post.import'), callback_data:'r:channel:import', style:'primary' },
    ]],
  };
}

async function editManagementPrompt(userId, session, text, replyMarkup) {
  const chatId = Number(session?.managementChatId || session?.chatId || userId);
  const messageId = Number(session?.managementMessageId || 0);
  if (messageId) {
    try {
      await api.editMessageText({ chat_id:chatId, message_id:messageId, text, reply_markup:replyMarkup });
      return { chatId, messageId };
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toLowerCase();
      if (reason.includes('message is not modified')) return { chatId, messageId };
      const recoverable = reason.includes('message to edit not found')
        || reason.includes("message can't be edited")
        || reason.includes('message_id_invalid');
      if (!recoverable) throw error;
    }
  }
  const sent = await api.sendMessage({ chat_id:chatId, text, reply_markup:replyMarkup });
  const managementChatId = sent.chat?.id || chatId;
  await updateEditorSession(userId, {
    managementChatId,
    managementMessageId:sent.message_id,
  });
  return { chatId:managementChatId, messageId:Number(sent.message_id) };
}

async function showChannelPostChoice(userId, session, draft, target, sourceMessage) {
  const locale = resolveLanguage(languageCode(sourceMessage));
  const chatId = Number(session?.managementChatId || session?.chatId || userId);
  const prompt = await api.sendMessage({
    chat_id:chatId,
    text:t(locale, 'channel_post.choice'),
    reply_markup:channelPostChoiceKeyboard(locale),
  });
  await updateEditorSession(userId, {
    pendingUserState:{
      kind:'channel_post_choice',
      importDraft:draft,
      target,
      sourceChatId:Number(sourceMessage.chat.id),
      sourceMessageId:Number(sourceMessage.message_id),
      sourceLanguageCode:languageCode(sourceMessage),
      choiceMessageId:Number(prompt.message_id),
      previousPendingUserState:session.pendingUserState ?? null,
    },
  });
}

function channelPostCloseKeyboard(locale) {
  return {
    inline_keyboard: [[
      { text:t(locale, 'channel_post.close_editor_confirm'), callback_data:'r:channel:close', style:'danger' },
      { text:t(locale, 'ux.common.cancel'), callback_data:'r:channel:stay' },
    ]],
  };
}

async function showChannelPostCloseWarning(userId, session, draft, target, sourceMessage) {
  const locale = resolveLanguage(languageCode(sourceMessage));
  const chatId = Number(session?.managementChatId || session?.chatId || userId);
  const prompt = await api.sendMessage({
    chat_id:chatId,
    text:t(locale, 'channel_post.close_editor_warning'),
    reply_markup:channelPostCloseKeyboard(locale),
  });
  await updateEditorSession(userId, {
    pendingUserState:{
      kind:'channel_post_close_warning',
      importDraft:draft,
      target,
      sourceChatId:Number(sourceMessage.chat.id),
      sourceMessageId:Number(sourceMessage.message_id),
      sourceLanguageCode:languageCode(sourceMessage),
      promptMessageId:Number(prompt.message_id),
      previousPendingUserState:session.pendingUserState ?? null,
    },
  });
}

async function closeEditorForChannelPost(userId, session) {
  const chatId = Number(session?.managementChatId || session?.chatId || userId);
  const managementMessageId = session?.managementMessageId;
  const cleared = await updateEditorSession(userId, {
    blocks:[],
    messageButtons:[],
    buttonsPerRow:1,
    buttonsAlign:'center',
    currentPageId:null,
    currentPageTitle:null,
    channelPostTarget:null,
    state:'managing',
    currentBlockId:null,
    currentButtonId:null,
    pendingAddType:null,
    addStep:null,
    addPayload:{},
    expectedType:null,
    editField:null,
    headingSize:null,
    addPromptChatId:null,
    addPromptMessageId:null,
    pendingButtonAction:null,
    pendingButtonText:null,
    pendingButtonType:null,
    pendingChildType:null,
    nestedDetailsId:null,
    nestedChildId:null,
    nestedAction:null,
    pendingUserState:null,
    previewMessageIds:[],
    blockPreviewMessageIds:{},
    blockPeekMessageId:null,
    buttonPreviewMessageId:null,
    blockScrollOffset:0,
    blockScrollEnabled:1,
    undoStack:[],
    redoStack:[],
    managementMessageId:null,
  });
  await clearSessionArtifacts(session);
  if (managementMessageId) await deleteQuietly(chatId, managementMessageId);
  return cleared;
}

function channelPostConfirmationKeyboard(locale) {
  return {
    inline_keyboard: [[
      { text:t(locale, 'channel_post.confirm'), callback_data:'r:channel:apply', style:'danger' },
      { text:t(locale, 'ux.common.cancel'), callback_data:'r:channel:cancel' },
    ]],
  };
}

async function showChannelPostWarning(userId, session, query) {
  const locale = resolveLanguage(languageCode(query));
  const prompt = await editManagementPrompt(
    userId,
    session,
    t(locale, 'channel_post.warning'),
    channelPostConfirmationKeyboard(locale),
  );
  await updateEditorSession(userId, {
    pendingUserState:{
      kind:'channel_post_confirmation',
      promptMessageId:prompt.messageId,
    },
  });
}

async function restoreChannelPostEditor(userId, session, locale, { clearTarget = false } = {}) {
  const updated = await updateEditorSession(userId, {
    pendingUserState:null,
    ...(clearTarget ? { channelPostTarget:null } : {}),
  });
  await editSavedUi(
    userId,
    updated || session,
    editorDashboardRichMessage(updated || session, locale),
    buildEditorKeyboard(updated || session, locale),
  );
}

function answerExpiredChannelPostAction(query) {
  return api.answerCallbackQuery({
    callback_query_id:query.id,
    text:t(resolveLanguage(languageCode(query)), 'channel_post.expired'),
    show_alert:true,
  });
}

export async function handleEditorChannelPostCallback(query) {
  const action = String(query?.data || '');
  if (!action.startsWith('r:channel:')) return false;

  const userId = Number(query?.from?.id);
  const session = Number.isSafeInteger(userId)
    ? await loadEditorSession(userId)
    : null;
  const pending = session?.pendingUserState;
  const queryMessageId = Number(query?.message?.message_id || 0);
  const queryChatId = Number(query?.message?.chat?.id || 0);
  const managementChatId = Number(session?.managementChatId || session?.chatId || 0);
  const managementMessageId = Number(session?.managementMessageId || 0);
  const actionMessageId = action === 'r:channel:edit' || action === 'r:channel:import'
    ? Number(pending?.choiceMessageId || 0)
    : action === 'r:channel:close' || action === 'r:channel:stay'
      ? Number(pending?.promptMessageId || 0)
      : action === 'r:channel:apply' || action === 'r:channel:cancel'
        ? Number(pending?.promptMessageId || 0)
        : managementMessageId;
  if (
    !session
    || queryChatId !== managementChatId
    || queryMessageId !== actionMessageId
  ) {
    await answerExpiredChannelPostAction(query);
    return true;
  }

  const locale = resolveLanguage(languageCode(query));
  if (action === 'r:channel:stay' || action === 'r:channel:close') {
    if (pending?.kind !== 'channel_post_close_warning' || !pending.importDraft || !pending.target) {
      await answerExpiredChannelPostAction(query);
      return true;
    }
    if (action === 'r:channel:stay') {
      await updateEditorSession(userId, {
        pendingUserState:pending.previousPendingUserState ?? null,
      });
      await deleteQuietly(queryChatId, queryMessageId);
      await api.answerCallbackQuery({ callback_query_id:query.id });
      return true;
    }

    const cleared = await closeEditorForChannelPost(userId, session);
    await showChannelPostChoice(
      userId,
      cleared || session,
      pending.importDraft,
      pending.target,
      {
        from:{language_code:pending.sourceLanguageCode},
        chat:{id:Number(pending.sourceChatId)},
        message_id:Number(pending.sourceMessageId),
      },
    );
    await deleteQuietly(queryChatId, queryMessageId);
    await api.answerCallbackQuery({ callback_query_id:query.id });
    return true;
  }

  if (action === 'r:channel:edit' || action === 'r:channel:import') {
    if (
      pending?.kind !== 'channel_post_choice'
      || Number(pending.choiceMessageId) !== queryMessageId
      || !pending.importDraft
    ) {
      await answerExpiredChannelPostAction(query);
      return true;
    }
    const target = action === 'r:channel:edit' ? pending.target : null;
    if (action === 'r:channel:edit' && !target) {
      await answerExpiredChannelPostAction(query);
      return true;
    }
    if (target && !await canEditChannelPost(userId, target)) {
      await api.answerCallbackQuery({
        callback_query_id:query.id,
        text:t(locale, 'channel_post.no_access'),
        show_alert:true,
      });
      return true;
    }

    const replaceState = {
      kind:'rich_import_replace',
      importDraft:pending.importDraft,
      channelPostTarget:target,
      sourceChatId:pending.sourceChatId,
      sourceMessageId:pending.sourceMessageId,
      choiceChatId:queryChatId,
      choiceMessageId:queryMessageId,
      previousPendingUserState:pending.previousPendingUserState ?? null,
    };
    await updateEditorSession(userId, { pendingUserState:replaceState });
    if (hasEditorContent(session)) {
      const latest = await loadEditorSession(userId, { touch:false });
      await showImportWarning(userId, latest || session, locale);
    } else {
      await applyImportedDraft(
        userId,
        session,
        pending.importDraft,
        locale,
        { chatId:Number(pending.sourceChatId), messageId:Number(pending.sourceMessageId) },
        target,
      );
      await deleteChannelChoicePrompt(pending, queryChatId);
    }
    await api.answerCallbackQuery({ callback_query_id:query.id });
    return true;
  }

  if (action === 'r:channel:confirm') {
    const target = session.channelPostTarget;
    if (!target || pending != null) {
      await api.answerCallbackQuery({
        callback_query_id:query.id,
        text:pending != null
          ? t(locale, 'channel_post.busy')
          : t(locale, 'channel_post.expired'),
        show_alert:true,
      });
      return true;
    }
    if (!await canEditChannelPost(userId, target)) {
      await updateEditorSession(userId, { channelPostTarget:null });
      const updated = await loadEditorSession(userId, { touch:false });
      await editSavedUi(
        userId,
        updated || session,
        editorDashboardRichMessage(updated || session, locale),
        buildEditorKeyboard(updated || session, locale),
      );
      await api.answerCallbackQuery({
        callback_query_id:query.id,
        text:t(locale, 'channel_post.no_access'),
        show_alert:true,
      });
      return true;
    }
    await showChannelPostWarning(userId, session, query);
    await api.answerCallbackQuery({ callback_query_id:query.id });
    return true;
  }

  if (action === 'r:channel:cancel' || action === 'r:channel:apply') {
    const target = session.channelPostTarget;
    if (
      !target
      || pending?.kind !== 'channel_post_confirmation'
      || Number(pending.promptMessageId) !== queryMessageId
    ) {
      await answerExpiredChannelPostAction(query);
      return true;
    }
    if (action === 'r:channel:cancel') {
      await restoreChannelPostEditor(userId, session, locale);
      await api.answerCallbackQuery({ callback_query_id:query.id });
      return true;
    }
    if (!await canEditChannelPost(userId, target)) {
      await restoreChannelPostEditor(userId, session, locale, { clearTarget:true });
      await api.answerCallbackQuery({
        callback_query_id:query.id,
        text:t(locale, 'channel_post.no_access'),
        show_alert:true,
      });
      return true;
    }

    const entitlement = await getEditorEntitlement(userId);
    const richMessage = buildInputRichMessage(session.blocks || [], {
      userId,
      entitlement,
    });
    try {
      await api.editMessageText({
        chat_id:target.chatId,
        message_id:target.messageId,
        rich_message:richMessage,
        reply_markup:buildMessageButtonsKeyboard(session.messageButtons, {
          buttonsPerRow:session.buttonsPerRow,
        }),
      });
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toLowerCase();
      if (!reason.includes('message is not modified')) throw error;
    }
    const updated = await updateEditorSession(userId, {
      pendingUserState:null,
    });
    await editSavedUi(
      userId,
      updated || session,
      editorDashboardRichMessage(updated || session, locale),
      buildEditorKeyboard(updated || session, locale),
    );
    await api.answerCallbackQuery({
      callback_query_id:query.id,
      text:t(locale, 'channel_post.success'),
    });
    return true;
  }

  await answerExpiredChannelPostAction(query);
  return true;
}

export async function handleEditorCoreMessage(
  message,
  { autoOpen = false, confirmReplace = false } = {},
) {
  const userId = message?.from?.id;
  if (!userId || !message?.rich_message) return false;

  const code = languageCode(message);
  const draft = importedDraft(message);
  if (!draft.blocks.length) {
    await api.sendMessage({
      chat_id:message.chat.id,
      text:importFailedText(code),
    });
    return true;
  }

  const limit = validateEditorLimits(draft.blocks, userId, {entitlement:await getEditorEntitlement(userId)});
  if (!limit.ok) {
    await api.sendMessage({
      chat_id:message.chat.id,
      text:limitText(limit, code),
    });
    return true;
  }

  let session = await loadEditorSession(userId);
  if (!session && autoOpen) {
    await openEditor(message.chat.id, code, userId);
    session = await loadEditorSession(userId);
  }
  if (!session) return false;

  const forwardedPost = confirmReplace ? forwardedChannelPost(message) : null;
  if (
    forwardedPost
    && await canEditChannelPost(userId, forwardedPost)
  ) {
    if (
      hasEditorContent(session)
      || session.state !== 'managing'
      || session.pendingUserState != null
    ) {
      await showChannelPostCloseWarning(userId, session, draft, forwardedPost, message);
    } else {
      await showChannelPostChoice(userId, session, draft, forwardedPost, message);
    }
    return true;
  }

  if (!autoOpen && session.state !== 'managing') return false;

  if (confirmReplace && hasEditorContent(session)) {
    await updateEditorSession(userId, {
      pendingUserState:{
        kind:'rich_import_replace',
        importDraft:draft,
        sourceChatId:Number(message.chat.id),
        sourceMessageId:Number(message.message_id),
        previousPendingUserState:session.pendingUserState ?? null,
      },
    });
    const latest = await loadEditorSession(userId, {touch:false});
    await showImportWarning(userId, latest || session, code);
    return true;
  }

  await applyImportedDraft(
    userId,
    session,
    draft,
    code,
    {chatId:message.chat.id,messageId:message.message_id},
  );
  return true;
}

export async function handleEditorImportCallback(query) {
  const data = String(query?.data || '');
  if (data !== 'r:import:confirm' && data !== 'r:import:cancel') return false;

  const userId = Number(query?.from?.id);
  const session = Number.isSafeInteger(userId)
    ? await loadEditorSession(userId)
    : null;
  const pending = session?.pendingUserState;
  if (!session || pending?.kind !== 'rich_import_replace' || !pending.importDraft) {
    await api.answerCallbackQuery({
      callback_query_id:query.id,
      text:t(resolveLanguage(languageCode(query)), 'expired'),
      show_alert:true,
    });
    return true;
  }

  const code = languageCode(query);
  if (data === 'r:import:cancel') {
    const updated = await updateEditorSession(userId, {
      pendingUserState:pending.previousPendingUserState ?? null,
    });
    await editSavedUi(
      userId,
      updated,
      editorDashboardRichMessage(updated, code),
      buildEditorKeyboard(updated, code),
    );
    await deleteChannelChoicePrompt(pending, query?.message?.chat?.id);
    await api.answerCallbackQuery({callback_query_id:query.id});
    return true;
  }

  await applyImportedDraft(
    userId,
    session,
    pending.importDraft,
    code,
    {
      chatId:Number(pending.sourceChatId || 0),
      messageId:Number(pending.sourceMessageId || 0),
    },
    pending.channelPostTarget || null,
  );
  await deleteChannelChoicePrompt(pending, query?.message?.chat?.id);
  await api.answerCallbackQuery({callback_query_id:query.id});
  return true;
}


const now=()=>Math.floor(Date.now()/1000);
const actor=source=>source?.from?.id;
const privateActor=source=>source?.chat?.type==='private' && Number(source.chat.id)===Number(actor(source));
function event(state,name){state.events={...state.events,[name]:state.events?.[name]||now()};}
function tutorialScreen(state){
  return {
    step:state.step,
    listOffset:Number(state.listOffset||0),
    previewOffset:Number(state.previewOffset||0),
    template:state.template||null,
    inspectType:state.inspectType||null,
    example:state.example?clone(state.example):null,
    demoPage:Boolean(state.demoPage),
    previewFailed:Boolean(state.previewFailed),
  };
}
function pushTutorialScreen(state){
  state.navigationStack=[...(state.navigationStack||[]),tutorialScreen(state)].slice(-24);
}
function popTutorialScreen(state){
  const stack=Array.isArray(state.navigationStack)?[...state.navigationStack]:[];
  const previous=stack.pop();
  state.navigationStack=stack;
  if(previous)Object.assign(state,previous);
  else state.step='home';
  state.pending=null;
  state.active=true;
}
function changeContent(state,blocks){state.undo=clone(state.blocks);state.blocks=blocks;state.dirty=true;orderBlocks(state.blocks);state.previewOffset=0;state.pending=null;state.previewFailed=false;state.step='preview';event(state,'first_block');}
async function validate(state,entitlement){
  const result=validateEditorLimits(state.blocks,state.userId,{entitlement});
  if(!result.ok)throw new Error('EDITOR_LIMIT:'+result.code);
  if(state.blocks.length)buildInputRichMessage(state.blocks,{userId:state.userId,entitlement});
}
function errorNotice(error,c){
  const code=String(error?.code||error?.message||'');
  if(error?.pageNameExists || code==='TUTORIAL_NAME')return c.name;
  if(error?.pageLimit)return c.pageLimit;
  if(error?.pageBusy || /CONFLICT|PAGE_BUSY/.test(code))return c.busy;
  if(/LIMIT/.test(code))return c.limit;
  if(/^TUTORIAL_(INPUT|MEDIA|LOCATION)/.test(code))return c.invalid;
  return c.failed;
}
async function display(state,locale,entitlement,notice='') {
  if(Number(state.renderAfter||0)>now())return state;
  let renderState=state;
  if(state.step==='cbd' && state.demoPage){
    const resolved=await resolveSavedPageReference(state.pageId,state.userId);
    const page=resolved.status==='found'?await db.select().from(richPages).where(eq(richPages.pageId,resolved.pageId)).get():null;
    if(page && Number(page.ownerId)===state.userId)renderState={...state,demoBlocks:page.blocks};
    else notice=tutorialCopy(locale).needSave;
  }
  const payload=tutorialView(renderState,locale,entitlement,notice);
  try{await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,...payload});}
  catch(error){
    const message=String(error?.description||error?.message||'').toLowerCase();
    if(message.includes('message is not modified'))return state;
    const retryAfter=Number(error?.parameters?.retry_after||error?.response?.parameters?.retry_after||message.match(/retry after (\d+)/)?.[1]||0);
    if(retryAfter>0)return writeTutorial({...state,renderAfter:now()+retryAfter},state);
    if(!state.previewFailed && /wrong file|failed to get http|webpage_curl_failed|media_invalid|photo_invalid|file_reference|could not fetch|failed to download/.test(message)){
      state=await writeTutorial({...state,previewFailed:true},state);
      await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,...tutorialView(state,locale,entitlement)});
      return state;
    }
    // Only an explicit missing/uneditable anchor permits a replacement. Never
    // create a second message on timeouts, 429, media failures or unknown errors.
    if(!/message to edit not found|message can't be edited|message_id_invalid/.test(message))throw error;
    if(state.recovering)throw error;
    state=await writeTutorial({...state,recovering:true},state);
    const sent=await api.sendRichMessage({chat_id:state.chatId,...tutorialView(state,locale,entitlement,notice)});
    state=await writeTutorial({...state,messageId:sent.message_id,recovering:false},state);
    // The sent keyboard used the pre-send revision. Refresh it once.
    await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,...tutorialView(state,locale,entitlement,notice)});
  }
  return state;
}
async function saveIntent(state){
  const intent=state.saveIntent;
  const id=await persistPage(state.userId,intent.title,{blocks:state.blocks,messageButtons:[],buttonsPerRow:1,buttonsAlign:'center'},intent.existingId,{reservedId:intent.existingId?null:intent.id,expectedRevision:intent.revision});
  if(!id)throw new Error('PAGE_CONFLICT');
  const page=await db.select().from(richPages).where(eq(richPages.pageId,id)).get();
  state.pageId=id;state.pageRevision=page.revision;state.pageTitle=intent.title;state.dirty=false;state.step='saved';state.saveIntent=null;event(state,'saved');
  return state;
}
async function handoff(state,locale,existingOnly=false){
  const current=await loadEditorSession(state.userId);
  if(current?.blocks?.length){
    if(!existingOnly){state.step='handoff';return {state};}
    await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,rich_message:editorDashboardRichMessage(current,locale,tutorialCopy(locale).publishSteps),reply_markup:buildEditorKeyboard(current,locale)});
    await updateEditorSession(state.userId,{managementChatId:state.chatId,managementMessageId:state.messageId});
    return {state:{...state,active:false,step:'paused',handedOff:true},external:true};
  }
  if(existingOnly)return {state:{...state,step:'complete'}};
  const created=await createEditorSession(state.userId,state.chatId,state.messageId);
  const next=await updateEditorSession(state.userId,{blocks:state.blocks,currentPageId:null,currentPageTitle:null,state:'managing'});
  // The editor receives an independent unsaved draft: old saved-page versions
  // are never silently overwritten on transfer.
  await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,rich_message:editorDashboardRichMessage(next||created,locale,tutorialCopy(locale).publishSteps),reply_markup:buildEditorKeyboard(next||created,locale)});
  event(state,'editor_handoff');
  return {state:{...state,active:false,step:'paused'},external:true};
}
export async function pauseTutorialForCommand(message){
  if(!privateActor(message))return;
  const lock=await acquireEditorMutationLock(actor(message));if(!lock)return;
  try{
    const state=await readTutorial(actor(message));
    const showcaseFromGuide=message?.data==='r:showcase'
      && Number(state?.chatId)===Number(message.chat?.id)
      && Number(state?.messageId)===Number(message.message_id);
    if(state?.active&&!showcaseFromGuide)await writeTutorial({...state,active:false,pending:null,step:'paused'},state);
  }
  finally{await releaseEditorMutationLock(lock);}
}
export async function handleTutorialCallback(query){
  const data=String(query?.data||'');if(data!=='tut:open'&&!data.startsWith('tut:'))return false;
  const locale=await resolveUserLanguage(query.from),c=tutorialCopy(locale);
  if(!privateActor({...query.message,from:query.from})) {await api.answerCallbackQuery({callback_query_id:query.id,text:c.stale});return true;}
  const lock=await acquireEditorMutationLock(actor(query));
  if(!lock){await api.answerCallbackQuery({callback_query_id:query.id,text:c.busy});return true;}
  let state;
  try{
    const previous=await readTutorial(actor(query));state=previous?clone(previous):null;
    if(data==='tut:open'){
      state=state||initialTutorial(actor(query),query.message.chat.id,query.message.message_id);
      state.messageId=query.message.message_id;state.chatId=query.message.chat.id;state.active=true;state.recovering=false;
      state.epoch=blockId().slice(0,8);state.step=state.saveIntent?'save_retry':'home';state.pending=null;state.navigationStack=[];
      // Reject delayed input from before this anchor was opened.
      state.inputFloor=Math.max(state.lastInputId||0,query.message.message_id);state.seenInputIds=[];
      event(state,'started');
      state=await writeTutorial(state,previous);
      await api.answerCallbackQuery({callback_query_id:query.id});
      await display(state,locale,await getEditorEntitlement(state.userId));return true;
    }
    const match=data.match(/^tut:([a-zA-Z0-9_-]+):(\d+):(.+)$/);
    if(!state||!match||state.epoch!==match[1]||state.revision!==Number(match[2])||Number(state.messageId)!==Number(query.message.message_id)){
      await api.answerCallbackQuery({callback_query_id:query.id,text:c.stale});return true;
    }
    const action=match[3];await api.answerCallbackQuery({callback_query_id:query.id});
    const entitlement=await getEditorEntitlement(state.userId);
    let external=false;
    // Actions are allowed only from the keyboard rendered for this exact state.
    const allowed=action==='catalog'||containsCallback(tutorialView(state,locale,entitlement),data);
    if(!allowed)return true;
    if(action==='back'){
      popTutorialScreen(state);
    } else if(['home','build','preview','templates','catalog','choose','edit','advice','complete','publish','cbd','guest'].includes(action)){
      if(['complete','edit','advice'].includes(action)&&!state.blocks.length){await display(state,locale,entitlement,c.empty);return true;}
      if(action==='home')state.navigationStack=[];
      else pushTutorialScreen(state);
      state.step=action;state.pending=null;state.listOffset=0;state.previewOffset=0;state.active=true;state.demoPage=false;state.previewFailed=false;
      if(action==='complete')event(state,'completed');if(action==='advice')event(state,'advice');
    } else if(action.startsWith('list:'))state.listOffset=Math.max(0,Number(action.slice(5))||0);
    else if(action.startsWith('previewOffset:'))state.previewOffset=Math.max(0,Number(action.split(':')[1])||0);
    else if(action.startsWith('inspect:')){pushTutorialScreen(state);state.inspectType=action.slice(8);state.example=exampleBlock(state.inspectType,locale,(await db.select().from(legacyStates).where(eq(legacyStates.namespace,'showcase_media')).get())?.payload||{});state.step='inspect';state.previewOffset=0;}
    else if(action.startsWith('template:')){const id=action.slice(9);if(!TEMPLATE_IDS.includes(id))return true;pushTutorialScreen(state);state.template=id;state.step='template';state.previewOffset=0;state.previewFailed=false;}
    else if(action==='useTemplate'&&state.blocks.length){pushTutorialScreen(state);state.step='replace';}
    else if(action==='useTemplate'||action==='replaceTemplate'){changeContent(state,templateBlocks(state.template,locale));event(state,'template');}
    else if(action==='apply'){changeContent(state,applyAdvice(state.blocks,locale));event(state,'advice_applied');}
    else if(action==='undo'&&state.undo){const old=state.undo;state.undo=null;state.blocks=old;state.dirty=true;state.previewOffset=0;state.step='preview';}
    else if(action==='pause'){state.active=false;state.pending=null;state.step='paused';}
    else if(action.startsWith('add:')||action.startsWith('edit:')){
      const editing=action.startsWith('edit:'),path=editing?action.slice(5):null;
      const block=editing?blockAt(state.blocks,path):null,type=editing?block?.type:action.slice(4);
      if(!TYPES.includes(type))return true;
      if(type==='divider'){if(!editing)changeContent(state,[...state.blocks,makeBlock('divider')]);else {state.navigationStack=[];state.step='preview';}}
      else {pushTutorialScreen(state);state.step='input';state.pending={type,path,children:[]};state.inputStartedAt=now();state.inputFloor=Math.max(state.inputFloor||0,state.lastInputId||0);}
    } else if(action==='mediaDone'){
      if(!state.pending?.children?.length){await display(state,locale,entitlement,c.invalid);return true;}
      finishInput(state,makeBlock(state.pending.type,{children:state.pending.children.map(({tutorialInputId,...child})=>child)}));
    } else if(action==='refresh'){
      state.previewFailed=false;
    } else if(action==='trycbd'){
      state.demoPage=true;state.previewOffset=0;event(state,'cbd_demo');
    } else if(action==='save'){
      if(!state.blocks.length){await display(state,locale,entitlement,c.empty);return true;}
      pushTutorialScreen(state);
      state.step='save';state.pending=null;
    } else if(action==='retrySave'){
      state=await saveIntent(state);
    } else if(action==='handoff'||action==='existing'){
      if(!state.blocks.length){await display(state,locale,entitlement,c.empty);return true;}
      const result=await handoff(state,locale,action==='existing');state=result.state;external=result.external;
    } else return true;
    await validate(state,entitlement);
    if(!external)tutorialView(state,locale,entitlement);
    state=await writeTutorial(state,previous);
    if(!external)await display(state,locale,entitlement);
  } catch(error){
    const latest=await readTutorial(actor(query));
    if(latest){try{await display(latest,locale,await getEditorEntitlement(actor(query)),errorNotice(error,c));}catch{await api.answerCallbackQuery({callback_query_id:query.id,text:errorNotice(error,c),show_alert:true}).catch(()=>{});}}
    await logError('tutorial.callback',error,{userId:actor(query),chatId:query.message.chat.id});
  } finally{await releaseEditorMutationLock(lock);}
  return true;
}
function containsCallback(value,data){
  if(Array.isArray(value))return value.some(item=>containsCallback(item,data));
  if(!value||typeof value!=='object')return false;
  if(value.callback_data===data)return true;
  return Object.values(value).some(item=>containsCallback(item,data));
}
function finishInput(state,block){
  const blocks=clone(state.blocks),path=state.pending.path;
  if(path!=null){const target=blockAt(blocks,path);if(!target)throw new Error('TUTORIAL_INPUT');Object.assign(target,{...block,id:target.id,position:target.position});}
  else blocks.push(block);
  changeContent(state,blocks);
}
export async function handleTutorialMessage(message){
  if(!privateActor(message)||String(message.text||'').trim().startsWith('/'))return false;
  let state=await readTutorial(actor(message));if(!state?.active)return false;
  const locale=await resolveUserLanguage(message.from),c=tutorialCopy(locale);
  const lock=await acquireEditorMutationLock(actor(message));if(!lock)throw new Error('TUTORIAL_BUSY_RETRY');
  try{
    state=await readTutorial(actor(message));if(!state?.active)return false;
    const previous=clone(state),entitlement=await getEditorEntitlement(state.userId);
    if(message.date && Number(message.date)<Number(state.inputStartedAt||0))return true;
    if(Number(message.message_id)<=Number(state.inputFloor||0)||(state.seenInputIds||[]).includes(message.message_id))return true;
    if(state.step!=='input'&&state.step!=='save'){await display(state,locale,entitlement,c.preview);return true;}
    // A reply explicitly targeting a different screen is never consumed.
    if(message.reply_to_message&&Number(message.reply_to_message.message_id)!==Number(state.messageId))return true;
    state.lastInputId=Math.max(state.lastInputId||0,message.message_id);state.seenInputIds=[...(state.seenInputIds||[]),message.message_id].slice(-128);
    if(state.step==='save'){
      const title=String(message.text||'').trim();if(!title||title.length>64)throw new Error('TUTORIAL_NAME');
      state.saveIntent={title,id:'tut_'+blockId(),existingId:state.pageId,revision:state.pageRevision};state.step='save_retry';
      state=await writeTutorial(state,previous); // Intent survives a crash during save.
      const saved=await saveIntent(clone(state));
      state=await writeTutorial(saved,state);
    } else {
      const block=fromInput({...message,from:{...message.from,language_code:locale}},state.pending.type,blockAt(state.blocks,state.pending.path));
      if(['slideshow','collage'].includes(state.pending.type)){
        state.pending.children.push(...block.data.children.map(child=>({...child,tutorialInputId:message.message_id})));state.pending.children.sort((a,b)=>a.tutorialInputId-b.tutorialInputId);orderBlocks(state.pending.children);
        // Check the eventual container including everything already collected.
        const prospective=clone(state);finishInput(prospective,makeBlock(state.pending.type,{children:state.pending.children}));await validate(prospective,entitlement);
      } else finishInput(state,block);
      await validate(state,entitlement);
      tutorialView(state,locale,entitlement);
      state=await writeTutorial(state,previous);
    }
    await display(state,locale,entitlement);
  } catch(error){
    const latest=await readTutorial(actor(message));
    if(latest)await display(latest,locale,await getEditorEntitlement(actor(message)),errorNotice(error,c));
    if(!/^TUTORIAL_|LIMIT|PAGE_/.test(String(error?.message||'')))await logError('tutorial.input',error,{userId:actor(message),chatId:message.chat.id});
  } finally{await releaseEditorMutationLock(lock);}
  return true;
}
