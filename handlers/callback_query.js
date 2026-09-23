import { api } from 'sdk';
import { buildEditorHome, openEditor } from 'lib/editor-home';
import { emptyPagesText, showPages } from 'lib/pages';

function pagesIndex(data) {
  if (data === 'r:pages') return 0;
  const value = Number.parseInt(String(data).split(':').at(-1), 10);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

async function returnToEditor(query) {
  const chatId = query.message?.chat?.id;
  const messageId = query.message?.message_id;
  if (!chatId || !messageId) return;

  const view = buildEditorHome(query.from?.language_code || 'en');
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text: view.text,
      reply_markup: view.reply_markup,
    });
  } catch (error) {
    console.warn('Could not edit pages view back to editor', error);
    await api.sendMessage({
      chat_id: chatId,
      text: view.text,
      reply_markup: view.reply_markup,
    });
  }
}

export default async function (query) {
  if (!query?.id) return;

  const data = String(query.data || '');

  if (data === 'r:starteditor') {
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
        console.warn('Could not delete welcome message after opening editor', error);
      }
    }
    return;
  }

  if (data === 'r:pages' || data.startsWith('r:pages:')) {
    const rendered = await showPages(query, pagesIndex(data));
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      ...(rendered ? {} : {
        text: emptyPagesText(query.from?.language_code || 'en'),
        show_alert: true,
      }),
    });
    return;
  }

  if (data === 'r:back') {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
    });
    await returnToEditor(query);
    return;
  }

  await api.answerCallbackQuery({
    callback_query_id: query.id,
  });
}
