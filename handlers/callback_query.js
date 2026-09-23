import { api } from 'sdk';
import { openEditor } from 'lib/editor-home';

export default async function (query) {
  if (!query?.id) return;

  if (query.data !== 'r:starteditor') {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
    });
    return;
  }

  await api.answerCallbackQuery({
    callback_query_id: query.id,
  });

  const chatId = query.message?.chat?.id;
  if (!chatId) return;

  await openEditor(chatId, query.from?.language_code || 'en');

  const messageId = query.message?.message_id;
  if (messageId) {
    try {
      await api.deleteMessage({
        chat_id: chatId,
        message_id: messageId,
      });
    } catch (error) {
      // Opening the editor is the important part. A stale/inaccessible welcome
      // message should not make the callback fail.
      console.warn('Could not delete welcome message after opening editor', error);
    }
  }
}
