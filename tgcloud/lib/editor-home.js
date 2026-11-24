import { api } from 'sdk';
import { createEditorSession } from 'lib/editor-session';
import { resolveLanguage, t, tr } from 'lib/i18n';
import { logError } from 'lib/error-log';
import {
  buildEditorGuideRichMessage,
  editorGuideFallback,
} from 'lib/editor-guide';

function memberStatus(member) {
  return String(member?.status?.value || member?.status || '');
}

function isAdmin(member) {
  return ['creator', 'administrator'].includes(memberStatus(member));
}

function validUserId(value) {
  const userId = Number(value);
  return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
}

export function isGroupEditorChat(chat) {
  return ['group', 'supergroup'].includes(String(chat?.type || ''));
}

export async function verifyGroupEditorAdmin(chatId, userId) {
  const actorId = validUserId(userId);
  if (!actorId) return { status: 'not_admin' };
  try {
    const member = await api.getChatMember({
      chat_id: Number(chatId),
      user_id: actorId,
    });
    return isAdmin(member)
      ? { status: 'admin', userId: actorId }
      : { status: 'not_admin' };
  } catch (error) {
    return { status: 'unavailable', error };
  }
}

export async function resolveGroupEditorActor(message) {
  const chat = message?.chat;
  if (!isGroupEditorChat(chat)) return { status: 'not_group' };
  const chatId = Number(chat.id);
  const senderChatId = Number(message?.sender_chat?.id);

  if (senderChatId === chatId && !message?.is_automatic_forward) {
    const signature = String(message?.author_signature || '').trim();
    if (!signature) return { status: 'anonymous' };
    let administrators;
    try {
      administrators = await api.getChatAdministrators({ chat_id: chatId });
    } catch (error) {
      return { status: 'unavailable', error };
    }
    if (!Array.isArray(administrators)) {
      return {
        status: 'unavailable',
        error: new Error('Telegram returned an invalid administrator list'),
      };
    }
    const matches = administrators.filter((member) => (
      isAdmin(member)
      && String(member?.custom_title || '').trim() === signature
      && validUserId(member?.user?.id) != null
    ));
    if (matches.length !== 1) return { status: 'anonymous' };
    return {
      status: 'admin',
      userId: validUserId(matches[0].user.id),
      matchedByTitle: true,
    };
  }

  if (message?.sender_chat) return { status: 'anonymous' };
  const actorId = validUserId(message?.from?.id);
  if (!actorId || message?.from?.is_bot) return { status: 'anonymous' };
  return verifyGroupEditorAdmin(chatId, actorId);
}

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

export async function openEditor(
  chatId,
  languageCode,
  userId = null,
  { reuseMessageId = null, messageThreadId = null } = {},
) {
  const view = buildEditorHome(languageCode);
  const threadId = Number(messageThreadId);
  const threadOptions = Number.isSafeInteger(threadId) && threadId > 0
    ? { message_thread_id: threadId }
    : {};
  let sent;

  if (reuseMessageId != null) {
    const messageId = Number(reuseMessageId);
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        rich_message: buildEditorGuideRichMessage(view.text, languageCode),
        reply_markup: view.reply_markup,
      });
      sent = {
        message_id: messageId,
        chat: { id: chatId },
      };
    } catch (error) {
      const reason = String(error?.description || error?.message || error).toLowerCase();
      if (!reason.includes('message is not modified')) {
        console.warn('Could not edit welcome into rich editor; using plain edit fallback', error);
        await logError('editor.home_rich_fallback', error, {
          userId,
          chatId,
          extra: 'reuse_message_id=' + messageId,
        });
        try {
          await api.editMessageText({
            chat_id: chatId,
            message_id: messageId,
            text: editorGuideFallback(view.text, languageCode),
            reply_markup: view.reply_markup,
          });
        } catch (fallbackError) {
          const fallbackReason = String(
            fallbackError?.description || fallbackError?.message || fallbackError,
          ).toLowerCase();
          if (!fallbackReason.includes('message is not modified')) throw fallbackError;
        }
      }
      sent = {
        message_id: messageId,
        chat: { id: chatId },
      };
    }
  } else {
    try {
      sent = await api.sendRichMessage({
        chat_id: chatId,
        ...threadOptions,
        rich_message: buildEditorGuideRichMessage(view.text, languageCode),
        reply_markup: view.reply_markup,
      });
    } catch (error) {
      console.warn('Could not send editor button guide; using plain fallback', error);
      await logError('editor.home_rich_fallback', error, {
        userId,
        chatId,
      });
      sent = await api.sendMessage({
        chat_id: chatId,
        ...threadOptions,
        text: editorGuideFallback(view.text, languageCode),
        reply_markup: view.reply_markup,
      });
    }
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

export function buildAnonymousGroupEditorPrompt(languageCode) {
  const locale = resolveLanguage(languageCode);
  return {
    text: tr(
      locale,
      'Telegram received your message as the group, so I cannot identify your account. Set a unique custom title for your admin account, then send /start in this group again; or open the bot in private chat.',
    ),
    reply_markup: {
      inline_keyboard: [
        [{
          text: tr(locale, 'Open the bot in private chat'),
          url: 'https://t.me/RichCustomizebot?start=group_editor',
        }],
        [{
          text: tr(locale, 'How to set a custom title'),
          callback_data: 'r:group_editor:title_help',
        }],
      ],
    },
  };
}

export function groupEditorTitleHelp(languageCode) {
  return tr(
    resolveLanguage(languageCode),
    'Ask the group owner to set a unique custom title for your admin account in Group Info > Administrators > your account. Then send /start in this group again. The bot must be an administrator to refresh the list.',
  );
}

export function groupEditorAccessText(languageCode, status) {
  const locale = resolveLanguage(languageCode);
  if (status === 'unavailable') {
    return tr(
      locale,
      'I could not verify your group permissions. Make the bot an administrator and try again.',
    );
  }
  return tr(locale, 'Only group administrators can use the editor.');
}
