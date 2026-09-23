import { api, BotApiError } from 'sdk';
import { makeStorageKey, readFsm, writeFsm, updateFsmData, clearFsm } from 'lib/storage/fsm';

export const STATE = {
  WAITING_INPUT: 'RichEditorStates:waiting_input',
  SAVING_PAGE_NAME: 'RichEditorStates:saving_page_name',
  RENAMING_PAGE: 'RichEditorStates:renaming_page',
  SEARCHING_PAGE: 'RichEditorStates:searching_page',
  MANAGING: 'RichEditorStates:managing',
};

export function storageKeyForMessage(message) {
  return makeStorageKey({
    chatId: message?.chat?.id ?? null,
    userId: message?.from?.id ?? null,
    threadId: message?.message_thread_id ?? null,
    businessConnectionId: message?.business_connection_id ?? null,
  });
}

export function storageKeyForCallback(callback) {
  const message = callback?.message;
  return makeStorageKey({
    chatId: message?.chat?.id ?? null,
    userId: callback?.from?.id ?? null,
    threadId: message?.message_thread_id ?? null,
    businessConnectionId: callback?.business_connection_id ?? message?.business_connection_id ?? null,
  });
}

export async function loadSession(storageKey, { touch = true } = {}) {
  return readFsm(storageKey, { touch });
}

export async function saveSession(storageKey, state, data) {
  await writeFsm(storageKey, state, data);
}

export async function patchSession(storageKey, changes, options = {}) {
  return updateFsmData(storageKey, changes, options);
}

export async function resetSession(storageKey) {
  await clearFsm(storageKey);
}

export async function safeEditText({ chatId, messageId, text, replyMarkup }) {
  try {
    return await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup,
    });
  } catch (error) {
    if (
      error instanceof BotApiError
      && error.code === 400
      && String(error.description ?? '').toLocaleLowerCase().includes('message is not modified')
    ) {
      return null;
    }
    throw error;
  }
}
