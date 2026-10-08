import { api } from 'sdk';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import {
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
} from 'lib/editor-session';
import { openEditor } from 'lib/editor-home';
import { parseMessageButtons, parseRichMessage } from 'lib/editor-import';
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

async function applyImportedDraft(userId, session, draft, code, source = null) {
  const changed = JSON.stringify(comparableDraft(session)) !== JSON.stringify(draft);
  if (changed && hasEditorContent(session)) await rememberEditorState(userId, session);

  await clearSessionArtifacts(session);

  const updated = await updateEditorSession(userId, {
    ...draft,
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
  );
  await api.answerCallbackQuery({callback_query_id:query.id});
  return true;
}
