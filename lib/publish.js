import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { managedChats, managedPublishPanels, richPages } from 'schema';
import {
  acquireEditorMutationLock,
  loadEditorSession,
  releaseEditorMutationLock,
  updateEditorSession,
  withEditorMessageLock,
} from 'lib/editor-session';
import { buildInputRichMessage } from 'lib/editor-renderer';
import {
  buildMessageButtonsKeyboard,
  prepareMessageButtons,
} from 'lib/page-buttons';
import { recordOperation } from 'lib/usage-stats';
import { resolveLanguage, resolveUserLanguage, t as i18nT, tr } from 'lib/i18n';
import { logError } from 'lib/error-log';

const ADMIN = new Set(['administrator', 'creator']);
const SUBSCRIBER = new Set(['member', 'administrator', 'creator']);
const CHANNEL_ADMIN_RIGHTS = 'post_messages+edit_messages+delete_messages+manage_chat+invite_users+restrict_members';
const GROUP_ADMIN_RIGHTS = 'delete_messages+manage_chat+invite_users+restrict_members';

function nowSeconds(){return Math.floor(Date.now()/1000);}
function code(source){return source?.from?.language_code||'en';}
function copy(languageCode){
  const locale=resolveLanguage(languageCode);
  return {
    locale,
    create:i18nT(locale,'create_post'),
    none:tr(locale,'There is no group or channel where both you and the bot are administrators.'),
    addHint:tr(locale,'Add the bot using one of the buttons. This panel updates after access is granted.'),
    choose:tr(locale,'Select every group or channel you want to publish to.'),
    selected:tr(locale,'Selected: '),
    select:tr(locale,'Select'),
    settings:i18nT(locale,'publish.settings_send'),
    addChannel:i18nT(locale,'publish.add_bot_channel'),
    addGroup:i18nT(locale,'publish.add_bot_group'),
    back:i18nT(locale,'ux.common.back'),
    silentOn:i18nT(locale,'ux.publish.silent_on'),
    silentOff:i18nT(locale,'ux.publish.silent_off'),
    protectedOn:i18nT(locale,'ux.publish.protected_on'),
    protectedOff:i18nT(locale,'ux.publish.protected_off'),
    send:(n)=>i18nT(locale,'ux.publish.send',{count:n}),
    settingsTitle:i18nT(locale,'post_settings'),
    selectedChats:tr(locale,'Selected chats: '),
    settingsHint:tr(locale,'Choose settings, then send:'),
    confirm:(n)=>i18nT(locale,'ux.publish.confirm',{count:n}),
    yes:i18nT(locale,'ux.publish.confirm_yes'),
    cancel:i18nT(locale,'ux.common.cancel'),
    needChat:i18nT(locale,'select_chat'),
    invalidChat:tr(locale,'Invalid chat selection.'),
    unavailable:tr(locale,'The chat is no longer available, or administrator permissions changed.'),
    selectedOn:tr(locale,'Chat selected'),
    selectedOff:tr(locale,'Chat unselected'),
    sending:tr(locale,'Publishing…'),
    emptyContent:tr(locale,'Publishing failed because no blocks are available.'),
    result:tr(locale,'Send result:'),
    ok:tr(locale,'Succeeded: '),
    fail:tr(locale,'Failed: '),
    again:tr(locale,'You can change settings and send the post again.'),
    shortened:tr(locale,'… result list shortened'),
    reason:tr(locale,'Failure reason: '),
    reached:(title)=>tr(locale,'✅ Reached “{title}”.',{title}),
    noPostRight:tr(locale,'The bot was added, but it cannot post messages in this channel.'),
    publish:i18nT(locale,'ux.editor.publish'),
  };
}

function key(userId,chatId){return String(userId)+':'+String(chatId);}
function status(member){return String(member?.status?.value||member?.status||'');}
function isAdmin(member){return ADMIN.has(status(member));}

async function rememberChat(userId,chat){
  await db.insert(managedChats).values({
    key:key(userId,chat.id),userId:Number(userId),chatId:Number(chat.id),
    title:String(chat.title||chat.id),type:String(chat.type||''),username:chat.username||null,updatedAt:nowSeconds(),
  }).onConflictDoUpdate({target:managedChats.key,set:{
    title:String(chat.title||chat.id),type:String(chat.type||''),username:chat.username||null,updatedAt:nowSeconds(),
  }}).run();
}
async function removeUserChat(userId,chatId){await db.delete(managedChats).where(eq(managedChats.key,key(userId,chatId))).run();}
async function removeChatEverywhere(chatId){
  const rows=await db.select().from(managedChats).where(eq(managedChats.chatId,Number(chatId))).all();
  for(const row of rows)await db.delete(managedChats).where(eq(managedChats.key,row.key)).run();
}
async function listChats(userId){
  const rows=await db.select().from(managedChats).where(eq(managedChats.userId,Number(userId))).all();
  return rows.sort((a,b)=>String(a.title||'').toLocaleLowerCase().localeCompare(String(b.title||'').toLocaleLowerCase()));
}
async function rememberPanel(userId,chatId,messageId,selected){
  const stamp=nowSeconds();
  await db.insert(managedPublishPanels).values({userId:Number(userId),chatId:Number(chatId),messageId:Number(messageId),selectedChatIds:selected||[],updatedAt:stamp})
    .onConflictDoUpdate({target:managedPublishPanels.userId,set:{chatId:Number(chatId),messageId:Number(messageId),selectedChatIds:selected||[],updatedAt:stamp}}).run();
}
async function panel(userId){return db.select().from(managedPublishPanels).where(eq(managedPublishPanels.userId,Number(userId))).get();}
export async function clearPublishPanel(userId){await db.delete(managedPublishPanels).where(eq(managedPublishPanels.userId,Number(userId))).run();}

async function canPublish(chatId,userId){
  try{
    const me=await api.getMe();
    const botMember=await api.getChatMember({chat_id:Number(chatId),user_id:me.id});
    const userMember=await api.getChatMember({chat_id:Number(chatId),user_id:Number(userId)});
    const chat=await api.getChat({chat_id:Number(chatId)});
    if(!isAdmin(botMember)||!isAdmin(userMember))return false;
    if(String(chat?.type||'')==='channel'&&!Boolean(botMember?.can_post_messages))return false;
    return true;
  }catch{return false;}
}
async function eligible(userId){
  const out=[];
  for(const chat of await listChats(userId)){
    if(await canPublish(chat.chatId,userId))out.push(chat);else await removeUserChat(userId,chat.chatId);
  }
  return out;
}
async function addLinks(){
  const me=await api.getMe(),username=me?.username||'RichCustomizebot',base='https://t.me/'+username;
  return [base+'?startchannel&admin='+CHANNEL_ADMIN_RIGHTS,base+'?startgroup&admin='+GROUP_ADMIN_RIGHTS];
}
function richButton(text,opts={}){return {type:'button',button:{text,...(opts.callback_data?{callback_data:opts.callback_data}:{}),...(opts.url?{url:opts.url}:{}),...(['primary','success','danger'].includes(opts.style)?{style:opts.style}:{})}};}
function cell(text,colspan=null){return {text,align:'center',valign:'middle',...(colspan?{colspan}:{})};}
function chatLink(chat){
  const username=String(chat?.username||'').replace(/^@+/,'');if(username)return 'https://t.me/'+username;
  const numeric=String(Math.abs(Number(chat.chatId||0)));
  if(['channel','supergroup'].includes(String(chat.type||''))&&numeric.startsWith('100'))return 'https://t.me/c/'+numeric.slice(3)+'/1';
  return 'tg://openmessage?chat_id='+numeric;
}
function pickerRich(chats,selected,channelUrl,groupUrl,c){
  const cc=copy(c),set=new Set(selected||[]),rows=[];
  for(const chat of chats){
    const id=Number(chat.chatId),on=set.has(id),icon=chat.type==='channel'?'📢':'👥';
    rows.push([
      cell(richButton(icon+' '+String(chat.title||id),{url:chatLink(chat)})),
      cell(richButton((on?'✅':'⬜')+' '+cc.select,{callback_data:'r:postchat:'+id,style:on?'success':'primary'})),
    ]);
  }
  if(chats.length)rows.push([cell(richButton(cc.settings+' ('+set.size+')',{callback_data:'r:postsettings',style:'success'}),2)]);
  rows.push([cell(richButton(cc.addChannel,{url:channelUrl,style:'primary'})),cell(richButton(cc.addGroup,{url:groupUrl,style:'primary'}))]);
  const text=cc.create+'\n\n'+(chats.length?cc.choose+'\n'+cc.selected+set.size:cc.none+'\n'+cc.addHint);
  return {blocks:[{type:'paragraph',text},{type:'table',cells:rows,is_bordered:true,is_compact:true}]};
}
function settingsText(n,c){const cc=copy(c);return cc.settingsTitle+'\n\n'+cc.selectedChats+n+'\n'+cc.settingsHint;}
function settingsRich(n,silent,protectedValue,c,body=null){
  const cc=copy(c),text=body||settingsText(n,c),rows=[
    [cell(richButton(silent?cc.silentOn:cc.silentOff,{callback_data:'r:pt:silent',style:silent?'success':'primary'}),2)],
    [cell(richButton(protectedValue?cc.protectedOn:cc.protectedOff,{callback_data:'r:pt:protected',style:protectedValue?'success':'primary'}),2)],
    [cell(richButton(cc.send(n),{callback_data:'r:postconfirm',style:'success'}),2)],
  ];
  return {blocks:[{type:'paragraph',text},{type:'table',cells:rows,is_bordered:true,is_compact:true}]};
}
function confirmRich(n,c){const cc=copy(c);return {blocks:[{type:'paragraph',text:cc.confirm(n)},{type:'table',cells:[[cell(richButton(cc.yes,{callback_data:'r:postsend',style:'success'}),2)]],is_bordered:true,is_compact:true}]};}
function backKeyboard(data='r:back',c='en'){return {inline_keyboard:[[{text:copy(c).back,callback_data:data}]]};}
function editErrorText(error){return String(error?.description||error?.message||error).toLowerCase();}
function sleep(milliseconds){return new Promise((resolve)=>setTimeout(resolve,milliseconds));}
async function editRich(query,rich,markup){
  const payload={chat_id:query.message.chat.id,message_id:query.message.message_id,rich_message:rich,reply_markup:markup};
  try{await api.editMessageText(payload);}
  catch(error){
    const detail=editErrorText(error);
    if(detail.includes('message is not modified'))return;
    if(detail.includes('canceled by new edit message request')){
      await sleep(75);
      try{await api.editMessageText(payload);}
      catch(retryError){
        if(editErrorText(retryError).includes('message is not modified'))return;
        throw retryError;
      }
      return;
    }
    throw error;
  }
}
async function withPublishUiLock(query,callback){
  const chatId=Number(query?.message?.chat?.id),messageId=Number(query?.message?.message_id);
  const locked=await withEditorMessageLock(chatId,messageId,callback);
  if(locked.acquired)return locked.value;
  try{await api.answerCallbackQuery({callback_query_id:query.id});}catch{}
  return true;
}
async function renderPicker(query,selected){
  const chats=await eligible(query.from.id),ids=new Set(chats.map(x=>Number(x.chatId))),safe=(selected||[]).map(Number).filter(x=>ids.has(x));
  const [channelUrl,groupUrl]=await addLinks();
  await updateEditorSession(query.from.id,{postSelectedChatIds:safe});
  await editRich(query,pickerRich(chats,safe,channelUrl,groupUrl,code(query)),backKeyboard('r:back',code(query)));
  await rememberPanel(query.from.id,query.message.chat.id,query.message.message_id,safe);
  return chats;
}
async function refreshPanel(userId, languageCode='en'){
  const p=await panel(userId);if(!p)return;
  const locked=await withEditorMessageLock(p.chatId,p.messageId,async()=>{
    const session=await loadEditorSession(userId,{touch:false});if(!session)return;
    const chats=await eligible(userId),ids=new Set(chats.map(x=>Number(x.chatId))),safe=(p.selectedChatIds||[]).map(Number).filter(x=>ids.has(x));
    const [channelUrl,groupUrl]=await addLinks();
    try{await api.editMessageText({chat_id:p.chatId,message_id:p.messageId,rich_message:pickerRich(chats,safe,channelUrl,groupUrl,languageCode),reply_markup:backKeyboard('r:back',languageCode)});}
    catch(error){
      const detail=editErrorText(error);
      if(!detail.includes('message is not modified')&&!detail.includes('canceled by new edit message request'))throw error;
    }
  });
  if(!locked.acquired)console.warn('Skipped publish panel refresh because the message is busy',p.chatId,p.messageId);
}
function friendly(languageCode){return tr(resolveLanguage(languageCode),'Publishing failed for this chat.');}

export async function handlePublishCallback(query){
  const data=String(query?.data||'');
  const relevant=data==='r:post'||data==='r:postlist'||data==='r:postsettings'||data==='r:postconfirm'||data==='r:postsend'||data.startsWith('r:postchat:')||data.startsWith('r:pt:');
  if(!relevant)return false;
  const userId=query?.from?.id,c=code(query),cc=copy(c);
  const existing=await loadEditorSession(userId,{touch:false});if(!existing)return false;
  if(!query?.message?.chat?.id||!query?.message?.message_id){await api.answerCallbackQuery({callback_query_id:query.id});return true;}

  if(data==='r:post'){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      if(!Array.isArray(latest.blocks)||!latest.blocks.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.emptyContent,show_alert:true});return true;}
      await updateEditorSession(userId,{postSelectedChatIds:[],postSilent:0,postProtected:0,blockScrollEnabled:0});
      await renderPicker(query,[]);await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data==='r:postlist'){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      await renderPicker(query,latest.postSelectedChatIds||[]);await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data.startsWith('r:postchat:')){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      const id=Number(data.slice('r:postchat:'.length));if(!Number.isSafeInteger(id)){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.invalidChat,show_alert:true});return true;}
      const registered=(await listChats(userId)).find(x=>Number(x.chatId)===id);
      if(!registered||!await canPublish(id,userId)){await removeUserChat(userId,id);await api.answerCallbackQuery({callback_query_id:query.id,text:cc.unavailable,show_alert:true});return true;}
      const selected=(latest.postSelectedChatIds||[]).map(Number),index=selected.indexOf(id);let notice;
      if(index>=0){selected.splice(index,1);notice=cc.selectedOff;}else{selected.push(id);notice=cc.selectedOn;}
      await renderPicker(query,selected);await api.answerCallbackQuery({callback_query_id:query.id,text:notice});return true;
    });
  }
  if(data==='r:postsettings'){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      const chats=await eligible(userId),ids=new Set(chats.map(x=>Number(x.chatId))),selected=(latest.postSelectedChatIds||[]).map(Number).filter(x=>ids.has(x));
      if(!selected.length){await updateEditorSession(userId,{postSelectedChatIds:[]});await api.answerCallbackQuery({callback_query_id:query.id,text:cc.needChat,show_alert:true});return true;}
      await updateEditorSession(userId,{postSelectedChatIds:selected});await clearPublishPanel(userId);
      await editRich(query,settingsRich(selected.length,Boolean(latest.postSilent),Boolean(latest.postProtected),c),backKeyboard('r:postlist',c));
      await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data.startsWith('r:pt:')){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      const selected=(latest.postSelectedChatIds||[]).map(Number);if(!selected.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.needChat,show_alert:true});return true;}
      const option=data.slice('r:pt:'.length);let silent=Boolean(latest.postSilent),protectedValue=Boolean(latest.postProtected);
      if(option==='silent')silent=!silent;else if(option==='protected')protectedValue=!protectedValue;else{await api.answerCallbackQuery({callback_query_id:query.id,text:cc.invalidChat,show_alert:true});return true;}
      await updateEditorSession(userId,{postSilent:silent?1:0,postProtected:protectedValue?1:0});
      await editRich(query,settingsRich(selected.length,silent,protectedValue,c),backKeyboard('r:postlist',c));await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data==='r:postconfirm'){
    return withPublishUiLock(query,async()=>{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      if(!Array.isArray(latest.blocks)||!latest.blocks.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.emptyContent,show_alert:true});return true;}
      const selected=(latest.postSelectedChatIds||[]).map(Number);if(!selected.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.needChat,show_alert:true});return true;}
      await editRich(query,confirmRich(selected.length,c),backKeyboard('r:postsettings',c));await api.answerCallbackQuery({callback_query_id:query.id});return true;
    });
  }
  if(data==='r:postsend'){
    const mutationLock=await acquireEditorMutationLock(userId);if(!mutationLock){await api.answerCallbackQuery({callback_query_id:query.id});return true;}
    try{
      const latest=await loadEditorSession(userId);if(!latest)return true;
      if(!Array.isArray(latest.blocks)||!latest.blocks.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.emptyContent,show_alert:true});return true;}
      const selected=(latest.postSelectedChatIds||[]).map(Number);if(!selected.length){await api.answerCallbackQuery({callback_query_id:query.id,text:cc.needChat,show_alert:true});return true;}
      await api.answerCallbackQuery({callback_query_id:query.id,text:cc.sending});
      const registered=new Map((await listChats(userId)).map(x=>[Number(x.chatId),x]));
      const prepared=await prepareMessageButtons(latest.messageButtons||[]);
      const succeeded=[],failed=[],reasons=[];
      for(const chatId of selected){
        const title=String(registered.get(chatId)?.title||chatId);
        if(!await canPublish(chatId,userId)){await removeUserChat(userId,chatId);failed.push(title);continue;}
        try{
          const markup=prepared.length?buildMessageButtonsKeyboard(prepared,{buttonsPerRow:Number(latest.buttonsPerRow||1),sourcePageId:latest.currentPageId||null}):undefined;
          await api.sendRichMessage({chat_id:chatId,rich_message:buildInputRichMessage(latest.blocks||[],{sourcePageId:latest.currentPageId||null}),...(markup?{reply_markup:markup}:{}),disable_notification:Boolean(latest.postSilent),protect_content:Boolean(latest.postProtected)});
          succeeded.push(title);
        }catch(error){
          failed.push(title);
          reasons.push(friendly(c));
          await logError('publish.send', error, {
            userId,
            chatId,
            callbackData: query?.data,
            extra: 'target_chat=' + chatId,
          });
        }
      }
      if(succeeded.length)await recordOperation('publish',true,succeeded.length);
      if(failed.length)await recordOperation('publish',false,failed.length);
      const lines=[cc.result,'✅ '+cc.ok+succeeded.length,'❌ '+cc.fail+failed.length,...succeeded.slice(0,10).map(x=>'✅ '+x),...failed.slice(0,10).map(x=>'❌ '+x)];
      if(reasons.length)lines.push('',cc.reason+reasons[0]);if(succeeded.length+failed.length>20)lines.push(cc.shortened);lines.push('',cc.again);
      const ui=await withEditorMessageLock(query.message.chat.id,query.message.message_id,async()=>{
        await editRich(query,settingsRich(selected.length,Boolean(latest.postSilent),Boolean(latest.postProtected),c,lines.join('\n')),backKeyboard('r:postlist',c));
      });
      if(!ui.acquired)console.warn('Skipped publish result UI update because the message is busy',query.message.chat.id,query.message.message_id);
      return true;
    }finally{await releaseEditorMutationLock(mutationLock);}
  }
  return false;
}

export async function handleMyChatMember(update){
  const chat=update?.chat,newMember=update?.new_chat_member,actor=update?.from;
  if (actor?.id && !actor.language_code) actor.language_code = await resolveUserLanguage(actor);
  if(!chat?.id)return;
  if(!isAdmin(newMember)){await removeChatEverywhere(chat.id);return;}
  const chatType=String(chat.type||'');
  if(chatType==='channel'&&!Boolean(newMember?.can_post_messages)){
    if(actor?.id){try{await api.sendMessage({chat_id:actor.id,text:copy(actor.language_code).noPostRight});}catch{}}
    return;
  }
  if(!actor?.id||actor?.is_bot)return;
  await rememberChat(actor.id,chat);
  await refreshPanel(actor.id, actor.language_code || 'en');
  try{await api.sendMessage({chat_id:actor.id,text:copy(actor.language_code).reached(chat.title||String(chat.id)),reply_markup:{inline_keyboard:[[{text:copy(actor.language_code).publish,callback_data:'r:postchat:'+chat.id,style:'success'}]]}});}catch{}
}

export async function isChatSubscriber(chatId,userId){
  try{const member=await api.getChatMember({chat_id:Number(chatId),user_id:Number(userId)});return SUBSCRIBER.has(status(member));}catch{return false;}
}


function richTextHasContent(value) {
  if (value == null) return false;
  if (typeof value === 'string') return value.length > 0;
  if (Array.isArray(value)) return value.some(richTextHasContent);
  if (typeof value !== 'object') return Boolean(String(value));
  if (String(value.type || '') === 'custom_emoji') return Boolean(value.custom_emoji_id);
  if (String(value.type || '') === 'button') return true;
  return richTextHasContent(value.text)
    || richTextHasContent(value.children)
    || Boolean(value.alternative_text);
}

function richBlockHasContent(block) {
  const type = String(block?.type || '');
  if (['divider', 'anchor', 'map', 'photo', 'video', 'animation', 'audio', 'document', 'voice_note', 'buttons'].includes(type)) {
    return true;
  }
  if (type === 'mathematical_expression') return Boolean(String(block?.expression || ''));
  if (type === 'table') {
    return Array.isArray(block?.cells) && block.cells.some(row => (
      Array.isArray(row) && row.some(cell => richTextHasContent(cell?.text))
    ));
  }
  if (type === 'list') {
    return Array.isArray(block?.items) && block.items.some(item => (
      Array.isArray(item?.blocks) && item.blocks.some(richBlockHasContent)
    ));
  }
  if (['details', 'collage', 'slideshow', 'blockquote'].includes(type)) {
    return richTextHasContent(block?.summary)
      || richTextHasContent(block?.text)
      || (Array.isArray(block?.blocks) && block.blocks.some(richBlockHasContent));
  }
  return richTextHasContent(block?.text) || richTextHasContent(block?.caption?.text);
}

async function publishBridgePageContent({
  ownerId,
  page,
  sourcePageId = null,
  kind = 'private',
  chatId = null,
}) {
  const userId = Number(ownerId);
  const id = sourcePageId == null ? null : String(sourcePageId);

  let targetChatId = userId;
  if (String(kind) === 'chat') {
    const requested = Number(chatId);
    if (!Number.isSafeInteger(requested)) {
      const error = new Error('Invalid chat_id');
      error.code = 'INVALID_CHAT_ID';
      throw error;
    }
    const registered = (await listChats(userId))
      .some((item) => Number(item.chatId) === requested);
    if (!registered || !await canPublish(requested, userId)) {
      if (registered) await removeUserChat(userId, requested);
      const error = new Error('Publishing is not allowed in this chat');
      error.code = 'PUBLISH_FORBIDDEN';
      throw error;
    }
    targetChatId = requested;
  } else if (String(kind) !== 'private') {
    const error = new Error('Invalid destination kind');
    error.code = 'INVALID_DESTINATION';
    throw error;
  }

  const prepared = await prepareMessageButtons(page.buttons || []);
  const replyMarkup = prepared.length
    ? buildMessageButtonsKeyboard(prepared, {
        buttonsPerRow: Number(page.buttonsPerRow || 1),
        sourcePageId: id,
      })
    : undefined;

  const richMessage = buildInputRichMessage(page.blocks || [], { sourcePageId: id });
  if (
    id == null
    && (!Array.isArray(richMessage?.blocks) || !richMessage.blocks.some(richBlockHasContent))
  ) {
    const error = new Error('The current editor content is empty');
    error.code = 'EMPTY_PAGE';
    throw error;
  }

  let sent;
  try {
    sent = await api.sendRichMessage({
      chat_id: targetChatId,
      rich_message: richMessage,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  } catch (error) {
    try {
      await recordOperation('publish', false, 1);
    } catch (statsError) {
      console.warn('Could not record failed Mini App publish stats', statsError);
    }
    try {
      await logError('publish.send', error, {
        userId,
        chatId: targetChatId,
        extra: 'miniapp_b2b=1; page_id=' + String(id || 'direct'),
      });
    } catch (logFailure) {
      console.warn('Could not log failed Mini App publish', logFailure);
    }
    throw error;
  }

  try {
    await recordOperation('publish', true, 1);
  } catch (statsError) {
    console.warn('Could not record successful Mini App publish stats', statsError);
  }

  return {
    chat_id: Number(targetChatId),
    message_id: Number(sent?.message_id || 0) || null,
  };
}

export async function publishSavedPageFromBridge({
  ownerId,
  pageId,
  kind = 'private',
  chatId = null,
}) {
  const userId = Number(ownerId);
  const id = String(pageId || '');
  const page = await db.select().from(richPages)
    .where(eq(richPages.pageId, id)).get();

  if (!page || Number(page.ownerId) !== userId) {
    const error = new Error('Page not found');
    error.code = 'PAGE_NOT_FOUND';
    throw error;
  }

  return publishBridgePageContent({
    ownerId: userId,
    page,
    sourcePageId: id,
    kind,
    chatId,
  });
}

export async function publishPageContentFromBridge({
  ownerId,
  blocks,
  buttons = [],
  buttonsPerRow = 1,
  kind = 'private',
  chatId = null,
}) {
  return publishBridgePageContent({
    ownerId,
    page: {
      blocks: Array.isArray(blocks) ? blocks : [],
      buttons: Array.isArray(buttons) ? buttons : [],
      buttonsPerRow: Number(buttonsPerRow || 1),
    },
    sourcePageId: null,
    kind,
    chatId,
  });
}

export async function listMiniAppDestinations(ownerId) {
  const userId = Number(ownerId);
  const destinations = [];

  let privateTitle = String(userId);
  try {
    const privateChat = await api.getChat({ chat_id: userId });
    privateTitle = String(
      privateChat?.first_name
      || privateChat?.username
      || privateChat?.title
      || userId,
    );
  } catch {}

  destinations.push({
    kind: 'private',
    chat_id: userId,
    title: privateTitle,
    type: 'private',
  });

  for (const chat of await eligible(userId)) {
    destinations.push({
      kind: 'chat',
      chat_id: Number(chat.chatId),
      title: String(chat.title || chat.chatId),
      type: String(chat.type || 'chat'),
    });
  }

  return destinations;
}
