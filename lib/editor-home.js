import { api } from 'sdk';

const COPY = {
  en: {
    text: 'Customize message\n\nAdd a Block or open one of your saved pages:\n\nYou can also forward a Rich Message here to import and customize its blocks.',
    pages: '📚 My Pages',
    addBlock: '➕ Add block',
  },
  ar: {
    text: 'تخصيص الرسالة\n\nأضف Block أو افتح إحدى صفحاتك المحفوظة:\n\nوتكدر أيضًا تحوّل رسالة غنية هنا حتى تستورد بلوكاتها وتخصصها.',
    pages: '📚 صفحاتي',
    addBlock: '➕ إضافة بلوك',
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

export async function openEditor(chatId, languageCode) {
  const view = buildEditorHome(languageCode);
  return api.sendMessage({
    chat_id: chatId,
    text: view.text,
    reply_markup: view.reply_markup,
  });
}
