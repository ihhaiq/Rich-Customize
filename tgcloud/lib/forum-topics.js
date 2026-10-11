// Per-group Rich Customize publication topic, set by a group admin in-place.
// No implicit fallback to General: prevent posts leaking into the wrong topic.
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { forumTopicDefaults } from 'schema';
import { publishFailure } from 'lib/publish-errors';

function admin(member) {
  const status=String(member?.status?.value||member?.status||'');
  return status==='creator'||status==='administrator';
}
function forum(chat) {
  return String(chat?.type||'')==='supergroup' && Boolean(chat?.is_forum);
}
function safeThread(value){
  const n=Number(value);
  return Number.isSafeInteger(n)&&n>=1?n:null;
}
export async function getDefaultForumTopic(chatId) {
  return db.select().from(forumTopicDefaults).where(eq(forumTopicDefaults.chatId,Number(chatId))).get();
}
export async function resolveForumDeliveryOptions(chatId, chat = null) {
  const target=chat || await api.getChat({chat_id:Number(chatId)});
  const chosen=await getDefaultForumTopic(chatId);
  if(!forum(target)){
    if(chosen)throw publishFailure('PUBLISH_THREAD_INVALID',
      'The destination chat no longer supports forum topics. Clear and reset /default.');
    return {};
  }
  if(!chosen){
    throw publishFailure('PUBLISH_TOPIC_NOT_SET',
      'No default topic is configured for this forum. An administrator must send /default in a topic.');
  }
  // 0 is an explicit /default in General (never an automatic fallback).
  if(Number(chosen.threadId)===0)return {};
  const threadId=safeThread(chosen.threadId);
  if(!threadId)throw publishFailure('PUBLISH_THREAD_INVALID','The configured default topic is invalid.');
  return {message_thread_id:threadId};
}
export async function handleDefaultTopicCommand(message) {
  const chat=message?.chat;
  if(!['group','supergroup'].includes(String(chat?.type||'')))return false;
  const text=String(message?.text||'').trim();
  const command=text.split(/\s+/,1)[0];
  if(!/^\/default(?:@[a-z0-9_]+)?$/i.test(command))return false;
  // Ignore a command explicitly addressed to another bot.
  const to=command.split('@')[1];
  if(to){
    const me=await api.getMe();
    if(to.toLowerCase()!==String(me?.username||'').toLowerCase())return false;
  }

  const threadId=safeThread(message?.message_thread_id);
  const reply=async body=>api.sendMessage({
    chat_id:chat.id,
    ...(threadId && threadId!==1?{message_thread_id:threadId}:{}),
    reply_to_message_id:message.message_id,
    text:body,
  });

  const actorId=Number(message?.from?.id);
  const sentAsGroup=Number(message?.sender_chat?.id)===Number(chat.id)
    && !Boolean(message?.is_automatic_forward);
  let permitted=sentAsGroup;
  if(!permitted && Number.isSafeInteger(actorId) && actorId>0 && !message?.from?.is_bot){
    try{
      const member=await api.getChatMember({chat_id:chat.id,user_id:actorId});
      permitted=admin(member);
    }catch(error){
      await reply('❌ ما گدرت أتحقق من صلاحياتك بالمجموعة. تحقق من صلاحيات البوت وجرّب مرة ثانية.');
      return true;
    }
  }
  if(!permitted){
    await reply('❌ أمر /default مخصص لمالك المجموعة ومسؤوليها فقط.');
    return true;
  }
  let info;
  try{info=await api.getChat({chat_id:chat.id});}
  catch{
    await reply('❌ تعذّر التأكد من إعدادات المجموعة حالياً. جرّب مرة ثانية.');
    return true;
  }
  if(!forum(info)){
    await reply('❌ هذا الأمر يعمل فقط داخل المجموعات المفعّل بيها نظام المواضيع.');
    return true;
  }
  const args=text.slice(command.length).trim().toLowerCase();
  if(args==='status'){
    const current=await getDefaultForumTopic(chat.id);
    await reply(current
      ?'ℹ️ موضوع النشر الافتراضي:\n'+(current.topicTitle||(Number(current.threadId)===0?'العام (General)':'معرّف الموضوع: '+current.threadId))
        +'\nالوجهة: '+(Number(current.threadId)===0?'العام (General)':'الموضوع #'+current.threadId)
        +'\nكل منشورات المحرر الغني لهذه المجموعة تروح لهذا الموضوع.'
      :'ℹ️ ماكو موضوع افتراضي مضبوط. النشر للمجموعة متوقف لحين إرسال /default داخل موضوع.');
    return true;
  }
  if(args==='clear'){
    await db.delete(forumTopicDefaults).where(eq(forumTopicDefaults.chatId,Number(chat.id))).run();
    await reply('✅ ألغيت الموضوع الافتراضي. النشر لهذه المجموعة متوقف إلى أن يرسل أحد المسؤولين /default داخل موضوع جديد.');
    return true;
  }
  if(args){
    await reply('الأوامر المتاحة:\n/default — تعيين هذا الموضوع للنشر\n/default status — عرض الموضوع الحالي\n/default clear — إلغاء التعيين وإيقاف النشر');
    return true;
  }
  // The General topic may omit message_thread_id; accepting /default there
  // is safe because an admin explicitly invoked it in a verified forum.
  // Other topics always require a positive thread id.
  // General is Telegram's reserved topic #1; send without a thread ID
  // only when a moderator explicitly configured General via /default.
  const selectedThreadId=threadId===1?0:(threadId||0);
  const topicTitle=String(message?.reply_to_message?.forum_topic_created?.name
    || message?.reply_to_message?.forum_topic_edited?.name
    || message?.forum_topic_created?.name || (selectedThreadId===0?'العام (General)':''))
    .trim().slice(0,128);
  const stamp=Math.floor(Date.now()/1000);
  await db.insert(forumTopicDefaults).values({
    chatId:Number(chat.id),threadId:selectedThreadId,topicTitle,
    updatedBy:sentAsGroup?0:actorId,updatedAt:stamp,
  }).onConflictDoUpdate({target:forumTopicDefaults.chatId,set:{
    threadId:selectedThreadId,topicTitle,updatedBy:sentAsGroup?0:actorId,updatedAt:stamp,
  }}).run();
  await reply('✅ تم تعيين هذا الموضوع كوجهة النشر الافتراضية للمجموعة.'
    +'\nالموضوع: '+(selectedThreadId===0?'العام (General)':'#'+selectedThreadId)
    +'\nالمنشورات الجديدة راح تنرسل هنا فقط.'
    +'\nإذا الموضوع انغلق أو انحذف، يفشل النشر لهذه المجموعة مع سبب واضح، وتستمر بقية المجموعات.');
  return true;
}
