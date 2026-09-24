import { api } from 'sdk';
import { loadEditorSession } from 'lib/editor-session';

function languageCode(query) {
  return query?.from?.language_code || 'en';
}

function expiredText(code) {
  return String(code || '').toLowerCase().startsWith('ar')
    ? 'انتهت الجلسة. أرسل /editor للبدء من جديد.'
    : 'The session has expired. Send /editor to start again.';
}

const EXACT = new Set([
  'r:addmenu',
  'r:back',
  'r:no',
  'r:tools',
  'r:result',
  'r:undo',
  'r:redo',
  'r:savepage',
  'r:pages',
  'r:psearch',
  'r:psort',
  'r:prestore',
  'r:buttons',
  'r:ba',
  'r:brow',
  'r:bpreview',
  'r:bpback',
  'r:post',
  'r:postlist',
  'r:postsettings',
  'r:postconfirm',
  'r:postsend',
]);

const PREFIXES = [
  'r:add:',
  'r:hs:',
  'r:b:',
  'r:e:',
  'r:dup:',
  'r:d:',
  'r:dc:',
  'r:adc:',
  'r:adr:',
  'r:am:',
  'r:art:',
  'r:mu:',
  'r:md:',
  'r:m:',
  'r:mt:',
  'r:peek:',
  'r:pv:',
  'r:blockscroll:',
  'r:pages:',
  'r:presults:',
  'r:pageopen:',
  'r:prename:',
  'r:pdelete:',
  'r:pdeleteok:',
  'r:psortset:',
  'r:bed:',
  'r:bdel:',
  'r:bdelok:',
  'r:bedit:',
  'r:bct:',
  'r:bsc:',
  'r:bmv:',
  'r:bpg:',
  'r:browset:',
  'r:browcustom:',
  'r:browcustompage:',
  'r:postchat:',
  'r:pt:',
];

export function isEditorSessionCallback(data) {
  const value = String(data || '');
  return EXACT.has(value) || PREFIXES.some((prefix) => value.startsWith(prefix));
}

export async function rejectExpiredEditorCallback(query) {
  const chatId = query?.message?.chat?.id;
  const messageId = query?.message?.message_id;
  if (chatId && messageId) {
    try {
      await api.editMessageReplyMarkup({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      });
    } catch {}
  }
  await api.answerCallbackQuery({
    callback_query_id: query.id,
    text: expiredText(languageCode(query)),
    show_alert: true,
  });
}

export async function guardEditorCallback(query) {
  if (!isEditorSessionCallback(query?.data)) return false;
  const userId = Number(query?.from?.id);
  if (!Number.isSafeInteger(userId)) {
    await rejectExpiredEditorCallback(query);
    return true;
  }
  const session = await loadEditorSession(userId);
  if (session) return false;
  await rejectExpiredEditorCallback(query);
  return true;
}
