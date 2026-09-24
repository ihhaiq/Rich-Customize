import { api } from 'sdk';
import {
  validateEditorLimits,
} from 'lib/editor-blocks';
import {
  buildEditorKeyboard,
  editorDashboardText,
} from 'lib/editor-block-ui';
import {
  loadEditorSession,
  rememberEditorState,
  updateEditorSession,
} from 'lib/editor-session';
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

async function editSavedUi(userId, session, text, replyMarkup) {
  const chatId = session?.managementChatId || session?.chatId;
  const messageId = session?.managementMessageId;
  if (!chatId) return null;

  if (messageId) {
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
      });
      return { chatId, messageId };
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toLowerCase();
      if (reason.includes('message is not modified')) {
        return { chatId, messageId };
      }
    }
  }

  const sent = await api.sendMessage({
    chat_id: chatId,
    text,
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

export async function handleEditorCoreMessage(message) {
  const userId = message?.from?.id;
  if (!userId || !message?.rich_message) return false;

  const session = await loadEditorSession(userId);
  if (!session || session.state !== 'managing') return false;

  const code = languageCode(message);
  const blocks = parseRichMessage(message);
  if (!blocks.length) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: importFailedText(code),
    });
    return true;
  }

  const limit = validateEditorLimits(blocks);
  if (!limit.ok) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: limitText(limit, code),
    });
    return true;
  }

  const importedButtons = parseMessageButtons(message);
  const nextDraft = {
    blocks,
    messageButtons: importedButtons.buttons,
    buttonsPerRow: importedButtons.buttonsPerRow,
    buttonsAlign: importedButtons.buttonsAlign,
    currentPageId: null,
    currentPageTitle: null,
  };
  const changed = JSON.stringify(comparableDraft(session)) !== JSON.stringify(nextDraft);
  if (changed) await rememberEditorState(userId, session);

  const updated = await updateEditorSession(userId, {
    ...nextDraft,
    state: 'managing',
    currentBlockId: null,
    currentButtonId: null,
    blockScrollOffset: 0,
    blockScrollEnabled: 1,
  });

  await deleteQuietly(message.chat.id, message.message_id);
  await editSavedUi(
    userId,
    updated,
    editorDashboardText(updated, code),
    buildEditorKeyboard(updated, code),
  );
  return true;
}
