import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { richPages } from 'schema';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { isLegacySavedPage } from 'lib/saved-page-policy';
import { loadEditorSession } from 'lib/editor-session';
import { resolveLanguage, t } from 'lib/i18n';

function languageCode(query) {
  return query?.from?.language_code || 'en';
}

function expiredText(code) {
  return t(resolveLanguage(code), 'expired');
}

const EXACT = new Set([
  'r:addmenu',
  'r:details:add',
  'r:details:content',
  'r:details:cancel',
  'r:details:finish',
  'r:back',
  'r:no',
  'r:tools',
  'r:result',
  'r:dir',
  'r:undo',
  'r:redo',
  'r:savepage',
  'r:syncpage',
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
  'r:import:',
  'r:emoji:',
  'r:add:',
  'r:addlist:',
  'r:at:',
  'r:slides:',
  'r:collage:done:',
  'r:album:done:',
  'r:details:type:',
  'r:details:list:',
  'r:hs:',
  'r:b:',
  'r:e:',
  'r:f:',
  'r:ct:',
  'r:tm:',
  'r:ta:',
  'r:tc:',
  'r:tdisplay:',
  'r:ttoggle:',
  'r:tcaption:',
  'r:dim:',
  'r:di:',
  'r:dip:',
  'r:die:',
  'r:dif:',
  'r:did:',
  'r:didok:',
  'r:dimu:',
  'r:dimd:',
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
  'r:bs:',
  'r:bt:',
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
  if (!session) {
    await rejectExpiredEditorCallback(query);
    return true;
  }
  const data = String(query?.data || '');
  if (!session.currentPageId || legacyNavigationCallback(data)) return false;
  const page = await db.select().from(richPages)
    .where(eq(richPages.pageId, String(session.currentPageId))).get();
  if (page && isLegacySavedPage(page, userId, await getEditorEntitlement(userId))) {
    await api.answerCallbackQuery({
      callback_query_id: query.id, show_alert: true,
      text: resolveLanguage(languageCode(query)) === 'ar'
        ? 'الصفحة القديمة للنشر فقط. لا يمكن تعديلها. افتح مسودة جديدة حتى تنشئ محتوى جديد.'
        : 'This legacy page is publish-only. Open a new draft to make changes.',
    });
    return true;
  }
  return false;
}

function legacyNavigationCallback(data) {
  return [
    'r:back','r:no','r:pages','r:psearch','r:psort',
    'r:post','r:postlist','r:postsettings','r:postconfirm','r:postsend',
    'r:savepage','r:syncpage','r:prestore','r:tools',
  ].includes(data) || [
    'r:postchat:','r:pt:','r:pages:','r:presults:',
    'r:pageopen:','r:psortset:','r:b:','r:blockscroll:',
    'r:import:','r:pdelete:','r:pdeleteok:',
  ].some(prefix => data.startsWith(prefix));
}

// Incoming editing messages can bypass button handlers (e.g. forwarded blocks,
// captions, list/table cell edits). Apply the same read-only guard to text/media
// editing states before routing to any editor-specific message handler.
export async function guardLegacyEditorMessage(message) {
  const userId = Number(message?.from?.id);
  if (!Number.isSafeInteger(userId)) return false;
  const session = await loadEditorSession(userId, { touch:false });
  if (!session?.currentPageId || session?.postSchedulePending) return false;
  if (['managing','searching_page','renaming_page','saving_page_name'].includes(String(session.state))) return false;
  const page = await db.select().from(richPages)
    .where(eq(richPages.pageId, String(session.currentPageId))).get();
  if (!page || !isLegacySavedPage(page, userId, await getEditorEntitlement(userId))) return false;
  await api.sendMessage({
    chat_id:message.chat.id,
    text:resolveLanguage(message?.from?.language_code) === 'ar'
      ? 'هذه الصفحة القديمة متاحة للنشر كما هي فقط. افتح مسودة جديدة للتعديل.'
      : 'This saved legacy page is publish-only. Open a new draft to edit.',
  });
  return true;
}
