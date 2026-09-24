import { api } from 'sdk';
import { createEditorSession } from 'lib/editor-session';
import { resolveLanguage, t } from 'lib/i18n';
import {
  buildEditorGuideRichMessage,
  editorGuideFallback,
} from 'lib/editor-guide';

function homeText(locale) {
  return [
    t(locale, 'customize'),
    '',
    t(locale, 'editor.empty_hint').replace(/^Customize message\n\n/, ''),
    '',
    t(locale, 'editor.forward_hint'),
  ].join('\n');
}


export function buildEditorHome(languageCode) {
  const locale = resolveLanguage(languageCode);
  return {
    text: homeText(locale),
    reply_markup: {
      inline_keyboard: [
        [
          { text: t(locale, 'pages'), callback_data: 'r:pages' },
          { text: t(locale, 'add_block'), callback_data: 'r:addmenu', style: 'primary' },
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
  return t(resolveLanguage(languageCode), 'editor.closed_hint');
}

export function buildStartEditorKeyboard(languageCode) {
  const locale = resolveLanguage(languageCode);
  return {
    inline_keyboard: [[{
      text: t(locale, 'editor.start_button'),
      callback_data: 'r:starteditor',
      style: 'primary',
    }]],
  };
}
