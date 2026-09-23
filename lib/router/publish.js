import { api } from 'sdk';
import { loadSession, patchSession, STATE } from 'lib/editor/session';
import { loadDraft } from 'lib/editor/draft';
import { sendRichMessagePost } from 'lib/renderer';
import { t, languageForUser } from 'lib/i18n';
import {
  answerCallback, editCallback, eligiblePostChats, canPublishToChat,
  botAddLinks, prepareMessageButtons, friendlyRichError,
} from 'lib/router/support';
import {
  managedChatsForUser, removeManagedChat, rememberPublishPanel, clearPublishPanel,
} from 'lib/registries';
import { buildPostPickerRichMessage, buildPostSettingsRichMessage } from 'lib/ui/publish';
import {
  postChatsKeyboard, postSettingsKeyboard, postConfirmationKeyboard,
} from 'lib/ui/keyboards';
import { recordOperation } from 'lib/usage';

function language(callback){return languageForUser(callback?.from);}
function selected(data){return (data?.post_selected_chat_ids??[]).map(Number).filter(Number.isFinite);}
function pickerText(chats,count,lang){
  if(!chats.length)return 'إنشاء منشور\n\nلا توجد قناة أو مجموعة مشتركة يكون فيها المستخدم والبوت مشرفين.\nأضف البوت ثم ارجع للقائمة.';
  return 'إنشاء منشور\n\nاضغط على كل قناة أو مجموعة لتحديدها للإرسال المتعدد.\nالمحدد حالياً: '+count;
}
async function renderPicker(callback,storageKey,selectedIds){
  const chats=await eligiblePostChats(callback.from.id);
  const available=new Set(chats.map(x=>Number(x.chat_id)));
  const kept=selectedIds.filter(id=>available.has(Number(id)));
  const lang=language(callback),links=await botAddLinks();
  await patchSession(storageKey,{post_selected_chat_ids:kept},{state:STATE.MANAGING});
  await editCallback(callback,{
    richMessage:buildPostPickerRichMessage(pickerText(chats,kept.length,lang),chats,kept),
    replyMarkup:postChatsKeyboard(chats,kept,lang),
  });
  if(callback.message)await rememberPublishPanel(callback.from.id,{chat_id:callback.message.chat.id,message_id:callback.message.message_id,selected_chat_ids:kept});
  return chats;
}
function settingsText(count){return 'إعدادات المنشور\n\nالمحادثات المحددة: '+count+'\nاختر الإعدادات ثم اضغط إرسال:';}

export async function handlePublishCallback(callback,storageKey,data){
  const lang=language(callback),session=await loadSession(storageKey);
  if(data==='r:post'){
    await patchSession(storageKey,{post_selected_chat_ids:[],post_silent:false,post_protected:false,block_scroll_enabled:false},{state:STATE.MANAGING});
    await renderPicker(callback,storageKey,[]);
    await answerCallback(callback);return true;
  }
  if(data==='r:postlist'){
    await renderPicker(callback,storageKey,selected(session.data));
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:postchat:')){
    const chatId=Number(data.slice('r:postchat:'.length));
    if(!Number.isSafeInteger(chatId)){await answerCallback(callback,'اختيار محادثة غير صالح.',true);return true;}
    const registered=(await managedChatsForUser(callback.from.id)).find(x=>Number(x.chat_id)===chatId);
    if(!registered||!await canPublishToChat(chatId,callback.from.id)){
      await removeManagedChat(callback.from.id,chatId);
      await answerCallback(callback,'المحادثة لم تعد متاحة، أو أن صلاحيات أحد المشرفين تغيرت.',true);return true;
    }
    const ids=selected(session.data),index=ids.indexOf(chatId);
    let notice;
    if(index>=0){ids.splice(index,1);notice='تم إلغاء تحديد المحادثة';}
    else{ids.push(chatId);notice='تم تحديد المحادثة للإرسال';}
    await renderPicker(callback,storageKey,ids);await answerCallback(callback,notice);return true;
  }
  if(data==='r:postsettings'){
    const ids=selected(session.data),eligible=await eligiblePostChats(callback.from.id),allowed=new Set(eligible.map(x=>Number(x.chat_id))),ids2=ids.filter(id=>allowed.has(id));
    if(!ids2.length){await patchSession(storageKey,{post_selected_chat_ids:[]},{state:STATE.MANAGING});await answerCallback(callback,t('select_chat',{language:lang}),true);return true;}
    await patchSession(storageKey,{post_selected_chat_ids:ids2},{state:STATE.MANAGING});await clearPublishPanel(callback.from.id);
    await editCallback(callback,{
      richMessage:buildPostSettingsRichMessage(settingsText(ids2.length),{silent:Boolean(session.data.post_silent),protectedContent:Boolean(session.data.post_protected),count:ids2.length}),
      replyMarkup:postSettingsKeyboard({silent:Boolean(session.data.post_silent),protectedContent:Boolean(session.data.post_protected),count:ids2.length,language:lang}),
    });
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:pt:')){
    const ids=selected(session.data);if(!ids.length){await answerCallback(callback,t('select_chat',{language:lang}),true);return true;}
    const option=data.slice('r:pt:'.length);let silent=Boolean(session.data.post_silent),protectedContent=Boolean(session.data.post_protected);
    if(option==='silent')silent=!silent;else if(option==='protected')protectedContent=!protectedContent;else{await answerCallback(callback,t('invalid',{language:lang}),true);return true;}
    await patchSession(storageKey,{post_silent:silent,post_protected:protectedContent},{state:STATE.MANAGING});
    await editCallback(callback,{
      richMessage:buildPostSettingsRichMessage(settingsText(ids.length),{silent,protectedContent,count:ids.length}),
      replyMarkup:postSettingsKeyboard({silent,protectedContent,count:ids.length,language:lang}),
    });
    await answerCallback(callback);return true;
  }
  if(data==='r:postconfirm'){
    const ids=selected(session.data);if(!ids.length){await answerCallback(callback,t('select_chat',{language:lang}),true);return true;}
    await editCallback(callback,{
      richMessage:{blocks:[{type:'paragraph',text:t('ux.publish.confirm',{language:lang,count:ids.length})}]},
      replyMarkup:postConfirmationKeyboard(ids.length,lang),
    });
    await answerCallback(callback);return true;
  }
  if(data==='r:postsend'){
    const ids=selected(session.data);if(!ids.length){await answerCallback(callback,t('select_chat',{language:lang}),true);return true;}
    await answerCallback(callback,'جاري إرسال المنشور…');
    const draft=await loadDraft(storageKey),registered=Object.fromEntries((await managedChatsForUser(callback.from.id)).map(x=>[Number(x.chat_id),x]));
    const prepared=await prepareMessageButtons(draft.message_buttons);
    const succeeded=[],failed=[],reasons=[];
    for(const chatId of ids){
      const title=String(registered[chatId]?.title??chatId);
      if(!await canPublishToChat(chatId,callback.from.id)){await removeManagedChat(callback.from.id,chatId);failed.push(title);continue;}
      try{
        await sendRichMessagePost(chatId,draft.blocks,prepared,{
          buttonsPerRow:draft.buttons_per_row,buttonsAlign:draft.buttons_align,
          disableNotification:Boolean(session.data.post_silent),protectContent:Boolean(session.data.post_protected),
          sourcePageId:draft.current_page_id,
        });
        succeeded.push(title);
      }catch(error){console.error('publish failed',chatId,error);failed.push(title);reasons.push(friendlyRichError(error));}
    }
    if(succeeded.length)await recordOperation('publish',{success:true,count:succeeded.length});
    if(failed.length)await recordOperation('publish',{success:false,count:failed.length});
    const lines=['نتيجة الإرسال:','✅ نجح: '+succeeded.length,'❌ فشل: '+failed.length,...succeeded.slice(0,10).map(x=>'✅ '+x),...failed.slice(0,10).map(x=>'❌ '+x)];
    if(reasons.length)lines.push('سبب الفشل: '+reasons[0]);
    if(succeeded.length+failed.length>20)lines.push('… تم اختصار قائمة النتائج');
    lines.push('','يمكنك تغيير الإعدادات وإرساله مرة أخرى.');
    await editCallback(callback,{
      richMessage:buildPostSettingsRichMessage(lines.join('\n'),{silent:Boolean(session.data.post_silent),protectedContent:Boolean(session.data.post_protected),count:ids.length}),
      replyMarkup:{inline_keyboard:[[{text:t('ux.common.back',{language:lang}),callback_data:'r:postlist'}]]},
    });
    return true;
  }
  return false;
}
