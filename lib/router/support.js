import { api, BotApiError } from 'sdk';
import { t, languageForUser } from 'lib/i18n';
import { getSetting } from 'lib/config';
import { rememberPopup, managedChatsForUser, removeManagedChat, rememberPublishPanel, clearPublishPanel } from 'lib/registries';
import { normalizeButtonUrl, normalizeHttpsUrl, normalizePageCode, getButtonType, getButtonValue } from 'lib/buttons';
import { renderedMessageButtons, richEditorKeyboard } from 'lib/ui/keyboards';
import { buildInputRichMessage } from 'lib/renderer';
import { loadDraft } from 'lib/editor/draft';
import { loadSession, patchSession, STATE } from 'lib/editor/session';
import { editorDashboard } from 'lib/editor/ui';

let botId=null;
async function currentBotId(){if(botId!=null)return botId;botId=Number((await api.getMe()).id);return botId;}
export function statusValue(member){return String(member?.status??'');}
export function isAdministrator(member){return ['administrator','creator'].includes(statusValue(member));}
export async function isChatSubscriber(chatId,userId){try{return ['member','administrator','creator'].includes(statusValue(await api.getChatMember({chat_id:chatId,user_id:userId})));}catch{return false;}}
export async function canPublishToChat(chatId,userId){
  try{
    const [botMember,userMember,chat]=await Promise.all([
      api.getChatMember({chat_id:chatId,user_id:await currentBotId()}),
      api.getChatMember({chat_id:chatId,user_id:userId}),
      api.getChat({chat_id:chatId}),
    ]);
    if(!isAdministrator(botMember)||!isAdministrator(userMember))return false;
    if(String(chat.type)==='channel'&&!botMember.can_post_messages)return false;
    return true;
  }catch{return false;}
}
export async function eligiblePostChats(userId){
  const result=[];
  for(const chat of await managedChatsForUser(userId)){
    const id=Number(chat.chat_id);
    if(id&&await canPublishToChat(id,userId))result.push(chat);else if(id)await removeManagedChat(userId,id);
  }
  return result;
}
export async function botAddLinks(){
  const me=await api.getMe(),username=me.username||'RichCustomizebot',base='https://t.me/'+username;
  return {channel:base+'?startchannel&admin=post_messages+edit_messages+delete_messages+manage_chat+invite_users+restrict_members',group:base+'?startgroup&admin=delete_messages+manage_chat+invite_users+restrict_members'};
}
export async function prepareMessageButtons(buttons){
  const prepared=(buttons??[]).map(x=>({...x}));
  for(const button of prepared)if(getButtonType(button)==='popup'){const token=(Date.now().toString(16)+Math.floor(Math.random()*1e15).toString(16)).slice(-20);button.popup_token=token;await rememberPopup(token,getButtonValue(button));}
  return prepared;
}
export function normalizeButtonValue(type,value,language='en'){
  value=String(value??'');
  if(type==='disabled')return {value:'',error:null};
  if(type==='url'){const v=normalizeButtonUrl(value);return v&&v.length<=256?{value:v,error:null}:{value:null,error:t('ux.buttons.invalid_url',{language})};}
  if(['web_app','login_url'].includes(type)){const v=normalizeHttpsUrl(value);return v&&v.length<=256?{value:v,error:null}:{value:null,error:'HTTPS URL required'};}
  if(type==='page'){const v=normalizePageCode(value);return v?{value:v,error:null}:{value:null,error:'Invalid page code'};}
  if(type==='copy'&&value.length>256)return {value:null,error:'Copy text exceeds 256 characters'};
  if(type==='callback_data'&&(new TextEncoder().encode(value).length<1||new TextEncoder().encode(value).length>64))return {value:null,error:'callback_data must be 1-64 bytes'};
  if(type==='popup'&&value.length>200)return {value:null,error:'Popup text exceeds 200 characters'};
  if(['switch_inline','switch_inline_current'].includes(type)){const v=value.trim().toLowerCase()==='/empty'?'':value;return v.length<=256?{value:v,error:null}:{value:null,error:'Inline query exceeds 256 characters'};}
  return {value,error:null};
}
export function friendlyRichError(error){return String(error?.description??error?.message??error??'Unknown error').replace(/^Telegram server says - /i,'').slice(0,300);}
export async function answerCallback(callback,text=null,showAlert=false){
  try{await api.answerCallbackQuery({callback_query_id:callback.id,...(text?{text}:{}),...(showAlert?{show_alert:true}:{})});}catch{}
}
export async function editCallback(callback,{text=null,richMessage=null,replyMarkup=null}={}){
  if(!callback?.message)return null;
  const params={chat_id:callback.message.chat.id,message_id:callback.message.message_id,...(replyMarkup?{reply_markup:replyMarkup}:{})};
  if(richMessage)params.rich_message=richMessage;else params.text=text??' ';
  try{return await api.editMessageText(params);}catch(error){if(error instanceof BotApiError&&/message is not modified/i.test(String(error.description??'')))return null;throw error;}
}
export async function renderEditor(callbackOrMessage,storageKey,notice=''){
  const session=await loadSession(storageKey),draft=await loadDraft(storageKey),language=languageForUser(callbackOrMessage.from??callbackOrMessage.from_user);
  const text=editorDashboard({...session.data,...draft},notice),keyboard=richEditorKeyboard(draft.blocks,draft.message_buttons,{offset:Number(session.data.block_scroll_offset??0),language});
  if(callbackOrMessage.id&&callbackOrMessage.message)return editCallback(callbackOrMessage,{text,replyMarkup:keyboard});
  const chatId=session.data.management_chat_id??callbackOrMessage.chat?.id;
  const messageId=session.data.management_message_id;
  if(messageId){
    try{return await api.editMessageText({chat_id:chatId,message_id:messageId,text,reply_markup:keyboard});}catch(error){if(!(error instanceof BotApiError&&/message.*not found|can't be edited|message_id_invalid/i.test(String(error.description??''))))throw error;}
  }
  const sent=await api.sendMessage({chat_id:chatId,text,reply_markup:keyboard});
  await patchSession(storageKey,{management_chat_id:sent.chat.id,management_message_id:sent.message_id},{state:STATE.MANAGING});
  return sent;
}
export function navigationButtons(nav,language='en'){
  const buttons=[];if(nav.can_go_back)buttons.push({id:'navigation-back',text:t('back',{language}),type:'callback_data',value:'r:pback:'+nav.token,position:buttons.length,style:'default'});
  if(nav.can_go_home)buttons.push({id:'navigation-home',text:t('navigation.home',{language}),type:'callback_data',value:'r:phome:'+nav.token,position:buttons.length,style:'primary'});
  return buttons;
}
export async function pageRichPayload(page,pageId,navigation=null,language='en'){
  const prepared=await prepareMessageButtons(page.buttons??[]);
  const navButtons=navigation?navigationButtons(navigation,language):[];
  const richMessage=buildInputRichMessage(page.blocks??[],prepared,{buttonsPerRow:Number(page.buttons_per_row??1),buttonsAlign:String(page.buttons_align??'center'),sourcePageId:pageId,navigationToken:navigation?.token??null,navigationButtons:navButtons});
  const replyMarkup=prepared.length?renderedMessageButtons(prepared,{buttonsPerRow:Number(page.buttons_per_row??1),sourcePageId:pageId,navigationToken:navigation?.token??null,language}):undefined;
  return {richMessage,replyMarkup};
}
