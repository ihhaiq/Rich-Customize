import { api } from 'sdk';
import { rememberShowcaseMessage } from 'lib/showcase';
import { rememberManagedChat, removeManagedChatEverywhere } from 'lib/registries';
import { isAdministrator } from 'lib/router/support';
import { richEditorKeyboard } from 'lib/ui/keyboards';

export async function handleChannelPost(message){
  try{return await rememberShowcaseMessage(message);}catch(error){console.error('showcase channel update failed',error);return null;}
}
export async function handleMyChatMember(update){
  const chatId=Number(update?.chat?.id);
  if(!chatId)return null;
  const member=update?.new_chat_member;
  if(!isAdministrator(member)){
    await removeManagedChatEverywhere(chatId);
    return null;
  }
  if(String(update.chat.type)==='channel'&&!member?.can_post_messages){
    try{await api.sendMessage({chat_id:update.from.id,text:'تمت إضافة البوت، لكن بدون صلاحية نشر الرسائل في القناة.'});}catch{}
    return null;
  }
  if(update?.from?.is_bot)return null;
  const chat={
    chat_id:chatId,
    title:String(update.chat.title??chatId),
    type:String(update.chat.type??'group'),
    username:update.chat.username??null,
    invite_link:update.chat.invite_link??null,
  };
  await rememberManagedChat(update.from.id,chat);
  try{
    await api.sendMessage({
      chat_id:update.from.id,
      text:'✅ تم الوصول إلى «'+chat.title+'».',
      reply_markup:{inline_keyboard:[[{text:'📤 نشر',callback_data:'r:postchat:'+chatId,style:'success'}]]},
    });
  }catch{}
  return chat;
}
