// One server-owned default topic per forum supergroup. Never accept a topic
// ID from a Mini App publish request or fall back to General on send failure.
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { forumPublishTopics } from 'schema';
import { publishFailure } from 'lib/publish-errors';

const BOT_USERNAME = 'richcustomizebot';
const isAdmin = member => ['administrator','creator'].includes(
  String(member?.status?.value || member?.status || ''),
);
const threadFrom = message => {
  const id=Number(message?.message_thread_id);
  return Number.isSafeInteger(id)&&id>0?id:0; // General is explicit only.
};
export function parseDefaultCommand(text) {
  const value=String(text||'').trim();
  const m=value.match(/^\/default(?:@([A-Za-z0-9_]{5,32}))?(?:\s+(status|clear))?\s*$/i);
  if (!m || (m[1]&&m[1].toLowerCase()!==BOT_USERNAME)) return null;
  return m[2]?.toLowerCase() || 'set';
}
export async function getDefaultTopic(chatId) {
  return db.select().from(forumPublishTopics)
    .where(eq(forumPublishTopics.chatId,Number(chatId))).get();
}
export function topicDestinationLabel(row) {
  if(!row) return 'لم يتم تحديد موضوع';
  return Number(row.threadId)===0 ? 'العام (General)'
    : String(row.title || 'الموضوع #'+row.threadId);
}
function threadArgs(threadId) {
  return Number(threadId)>0 ? {message_thread_id:Number(threadId)} : {};
}
async function notice(message,text) {
  return api.sendMessage({
    chat_id:message.chat.id,...threadArgs(threadFrom(message)),
    text,disable_notification:true,
  });
}
export async function handleDefaultTopicMessage(message) {
  const action=parseDefaultCommand(message?.text);
  if(!action)return false;
  if(!['supergroup','group'].includes(String(message?.chat?.type||'')))return false;
  const chatId=Number(message.chat.id);
  const chat=await api.getChat({chat_id:chatId});
  if(String(chat?.type)!=='supergroup' || !chat?.is_forum){
    await notice(message,'الأمر /default يعمل فقط داخل مجموعة مفعّل بيها المواضيع.');
    return true;
  }

  const anonymous = Number(message?.sender_chat?.id)===chatId
    && String(message?.sender_chat?.type||'')==='supergroup'
    && !message?.is_automatic_forward;
  let authorized=anonymous;
  if(!authorized && Number.isSafeInteger(Number(message?.from?.id)) && !message?.from?.is_bot){
    try{
      const member=await api.getChatMember({chat_id:chatId,user_id:Number(message.from.id)});
      authorized=isAdmin(member);
    }catch{}
  }
  if(!authorized){
    await notice(message,'هذا الأمر للمشرفين ومالك المجموعة فقط.');
    return true;
  }
  const current=await getDefaultTopic(chatId);
  if(action==='status'){
    await notice(message,current
      ? 'وجهة النشر الحالية: '+topicDestinationLabel(current)
        +'\nالمعرّف: '+(Number(current.threadId)||'General')
        +(current.closed?'\nالحالة: مغلق، النشر متوقف حتى إعادة فتح الموضوع أو تغييره.':'\nالحالة: محدد للنشر.')
      : 'ماكو موضوع افتراضي محدد. اكتب /default داخل الموضوع المطلوب حتى تفعّل النشر.');
    return true;
  }
  if(action==='clear'){
    if(current)await db.delete(forumPublishTopics)
      .where(eq(forumPublishTopics.chatId,chatId)).run();
    await notice(message,'تم إلغاء الموضوع الافتراضي. النشر لهذه المجموعة متوقف حتى يحدد مسؤول موضوعاً جديداً بـ /default.');
    return true;
  }
  const threadId=threadFrom(message);
  const topicTitle=threadId===0?'العام (General)':(
    message?.forum_topic_created?.name || message?.forum_topic_edited?.name || null
  );
  const now=Math.floor(Date.now()/1000);
  await db.insert(forumPublishTopics).values({
    chatId,threadId,title:topicTitle,closed:0,
    setBy:anonymous?0:Number(message.from?.id)||0,updatedAt:now,
  }).onConflictDoUpdate({target:forumPublishTopics.chatId,set:{
    threadId,title:topicTitle,closed:0,
    setBy:anonymous?0:Number(message.from?.id)||0,updatedAt:now,
  }}).run();
  await notice(message,'✅ تم تحديد '+topicDestinationLabel({threadId,title:topicTitle})
    +' كموضوع افتراضي لهذه المجموعة.\n'
    +'كل منشورات المحرر الغني راح تُرسل له فقط. إذا انغلق الموضوع، تتوقف هذه المجموعة ويكمل النشر لبقية المجموعات.');
  return true;
}

// Telegram service updates are used to mark closed topics before any send.
// A fresh /default is also enough to re-select/reopen a topic.
export async function observeForumTopicEvent(message) {
  const id=Number(message?.chat?.id),threadId=threadFrom(message);
  if(!Number.isSafeInteger(id)||!threadId)return false;
  const closed=Boolean(message?.forum_topic_closed);
  const reopened=Boolean(message?.forum_topic_reopened);
  const edited=message?.forum_topic_edited;
  if(!closed&&!reopened&&!edited)return false;
  const current=await getDefaultTopic(id);
  if(!current || Number(current.threadId)!==threadId)return true;
  const patch={updatedAt:Math.floor(Date.now()/1000)};
  if(closed||reopened)patch.closed=closed?1:0;
  if(edited?.name)patch.title=String(edited.name).slice(0,128);
  await db.update(forumPublishTopics).set(patch)
    .where(eq(forumPublishTopics.chatId,id)).run();
  return true;
}

export async function resolvePublishForumThread(chatId,{chat=null}={}) {
  const id=Number(chatId);
  if(!Number.isSafeInteger(id)||id>=0)return {};
  const target=chat || await api.getChat({chat_id:id});
  const configured=await getDefaultTopic(id);
  if(!target?.is_forum){
    // A removed topic must never silently publish to a now-nonforum chat.
    if(configured)throw publishFailure('PUBLISH_TOPIC_UNAVAILABLE',
      'This chat no longer has forum topics. Reset its /default configuration.');
    return {};
  }
  if(!configured)throw publishFailure('PUBLISH_TOPIC_NOT_CONFIGURED',
    'No /default topic is configured in this forum group.');
  if(configured.closed)throw publishFailure('PUBLISH_TOPIC_CLOSED',
    'The default forum topic is closed.');
  return threadArgs(configured.threadId);
}

export async function noteForumPublishFailure(chatId, error) {
  if(String(error?.code||'')!=='PUBLISH_TOPIC_CLOSED')return;
  const configured=await getDefaultTopic(chatId);
  if(!configured)return;
  await db.update(forumPublishTopics).set({closed:1,updatedAt:Math.floor(Date.now()/1000)})
    .where(eq(forumPublishTopics.chatId,Number(chatId))).run();
}
