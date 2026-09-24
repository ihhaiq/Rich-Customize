import { api } from 'sdk';
import { createEditorSession } from 'lib/editor-session';
import {
  buildEditorGuideRichMessage,
  editorGuideFallback,
} from 'lib/editor-guide';

const COPY = {
  en: {
    text: 'Customize message\n\nAdd a Block or open one of your saved pages:\n\nYou can also forward a Rich Message here to import and customize its blocks.',
    pages: '📚 My Pages',
    addBlock: '➕ Add block',
    closedHint: 'Use the editor buttons, or send /editor to start a new message.',
    startEditor: '▶️ Start editor',
  },
  ar: {
    text: 'تخصيص الرسالة\n\nأضف Block أو افتح إحدى صفحاتك المحفوظة:\n\nوتكدر أيضًا تحوّل رسالة غنية هنا حتى تستورد بلوكاتها وتخصصها.',
    pages: '📚 صفحاتي',
    addBlock: '➕ إضافة بلوك',
    closedHint: 'استخدم أزرار المحرر، أو أرسل /editor لبدء رسالة جديدة.',
    startEditor: '▶️ بدء المحرر',
  },
};

function language(languageCode) {
  return String(languageCode || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function buildEditorHome(languageCode) {
  const copy = COPY[language(languageCode)];
  return {
    text: copy.text,
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: copy.pages,
            callback_data: 'r:pages',
          },
          {
            text: copy.addBlock,
            callback_data: 'r:addmenu',
            style: 'primary',
          },
        ],
      ],
    },
  };
}

export async function openEditor(chatId, languageCode, userId = null) {
  const view = buildEditorHome(languageCode);
  let sent;
  try {
    sent = await api.sendRichMessage({
      chat_id: chatId,
      rich_message: buildEditorGuideRichMessage(view.text, languageCode),
      reply_markup: view.reply_markup,
    });
  } catch (error) {
    console.warn('Could not send editor button guide; using plain fallback', error);
    sent = await api.sendMessage({
      chat_id: chatId,
      text: editorGuideFallback(view.text, languageCode),
      reply_markup: view.reply_markup,
    });
  }
  if (userId != null) {
    await createEditorSession(userId, sent.chat?.id || chatId, sent.message_id);
  }
  return sent;
}


export function editorClosedHint(languageCode) {
  return COPY[language(languageCode)].closedHint;
}

export function buildStartEditorKeyboard(languageCode) {
  return {
    inline_keyboard: [[{
      text: COPY[language(languageCode)].startEditor,
      callback_data: 'r:starteditor',
      style: 'primary',
    }]],
  };
}
