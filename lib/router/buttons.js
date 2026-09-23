import { api } from 'sdk';
import { loadDraft, saveDraft } from 'lib/editor/draft';
import { remember } from 'lib/editor/history';
import { patchSession, STATE } from 'lib/editor/session';
import {
  MAX_BUTTONS, BUTTON_TYPES, BUTTON_STYLES, getMessageButton, getButtonType,
  deleteMessageButton, moveMessageButton, changeMessageButtonType, buttonRows, setButtonRowWidth,
} from 'lib/buttons';
import {
  buttonsManagerKeyboard, buttonEditorKeyboard, buttonTypeKeyboard, buttonStyleKeyboard,
  buttonPositionKeyboard, pageTargetKeyboard, renderedMessageButtons,
} from 'lib/ui/keyboards';
import { listPagesForUser, getPage } from 'lib/storage/pages';
import { answerCallback, editCallback, prepareMessageButtons } from 'lib/router/support';
import { getPopup } from 'lib/registries';
import { t, languageForUser } from 'lib/i18n';

function lang(callback){return languageForUser(callback?.from);}
function managerText(count,language){return [t('ux.buttons.title',{language}),t('ux.buttons.count',{language,count}),'',count?t('common.choose_action',{language}):t('ux.buttons.empty',{language})].join('\n');}
function editorText(button,language){return [t('ux.buttons.editing',{language,title:String(button.text??'Button')}),t('ux.buttons.current_type',{language,type:getButtonType(button)}),'',t('common.choose_action',{language})].join('\n');}
function deleteKeyboard(id,language){return {inline_keyboard:[[{text:t('ux.common.yes_delete',{language}),callback_data:'r:bdelok:'+id,style:'danger'},{text:t('ux.common.cancel',{language}),callback_data:'r:bed:'+id}]]};}
function picker(buttons,action,language){const rows=buttons.map((b,i)=>[{text:(i+1)+'. '+String(b.text??'Button'),callback_data:'r:bt:'+action+':'+b.id}]);rows.push([{text:t('ux.common.back',{language}),callback_data:'r:buttons'}]);return {inline_keyboard:rows};}
function layoutKeyboard(buttons,perRow,language){
  const rows=[
    [{text:'1',callback_data:'r:browset:1'},{text:'2',callback_data:'r:browset:2'},{text:'3',callback_data:'r:browset:3'},{text:'4',callback_data:'r:browset:4'}],
    [{text:'5',callback_data:'r:browset:5'},{text:'6',callback_data:'r:browset:6'},{text:'7',callback_data:'r:browset:7'},{text:'8',callback_data:'r:browset:8'}],
  ];
  const grouped=buttonRows(buttons,perRow);
  if(grouped.length){
    for(let i=0;i<Math.min(grouped.length,8);i++){
      const options=[];for(let n=1;n<=Math.min(8,buttons.length);n++)options.push({text:String(n),callback_data:'r:browcustom:'+i+':'+n+':0'});
      rows.push([{text:t('ux.buttons.row_number',{language,number:i+1}),disabled:{}}],options.slice(0,8));
    }
  }
  rows.push([{text:t('ux.common.back',{language}),callback_data:'r:buttons'}]);return {inline_keyboard:rows};
}

export async function handleButtonCallback(callback,storageKey,data){
  const language=lang(callback),draft=await loadDraft(storageKey);
  if(data==='r:buttons'){
    await patchSession(storageKey,{current_button_id:null,pending_button_action:null,pending_button_text:null,pending_button_type:null},{state:STATE.MANAGING});
    await editCallback(callback,{text:managerText(draft.message_buttons.length,language),replyMarkup:buttonsManagerKeyboard(draft.message_buttons,draft.buttons_per_row,language)});
    await answerCallback(callback);return true;
  }
  if(data==='r:ba'){
    if(draft.message_buttons.length>=MAX_BUTTONS){await answerCallback(callback,'وصلت إلى الحد الأقصى للأزرار.',true);return true;}
    await patchSession(storageKey,{pending_button_action:'add_title',current_button_id:null,pending_button_text:null,pending_button_type:null},{state:STATE.EDITING_BUTTON});
    await api.sendMessage({chat_id:callback.message.chat.id,text:t('buttons.send_format',{language,label:'{ '+t('buttons.format_parts',{language})+' }'})});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:bed:')){
    const id=data.slice('r:bed:'.length),button=getMessageButton(draft.message_buttons,id);
    if(!button){await answerCallback(callback,t('ux.buttons.missing',{language}),true);return true;}
    await patchSession(storageKey,{current_button_id:id},{state:STATE.MANAGING});
    await editCallback(callback,{text:editorText(button,language),replyMarkup:buttonEditorKeyboard(button,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:bdel:')){
    const id=data.slice('r:bdel:'.length),button=getMessageButton(draft.message_buttons,id);
    if(!button){await answerCallback(callback,t('ux.buttons.missing',{language}),true);return true;}
    await editCallback(callback,{text:t('ux.buttons.delete_confirm',{language,title:String(button.text??'Button')}),replyMarkup:deleteKeyboard(id,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:bdelok:')){
    const id=data.slice('r:bdelok:'.length);
    if(!getMessageButton(draft.message_buttons,id)){await answerCallback(callback,t('ux.buttons.missing',{language}),true);return true;}
    await remember(storageKey);deleteMessageButton(draft.message_buttons,id);await saveDraft(storageKey,draft);await patchSession(storageKey,{current_button_id:null},{state:STATE.MANAGING});
    await editCallback(callback,{text:t('ux.buttons.deleted',{language})+'\n\n'+managerText(draft.message_buttons.length,language),replyMarkup:buttonsManagerKeyboard(draft.message_buttons,draft.buttons_per_row,language)});
    await answerCallback(callback,t('ux.buttons.deleted',{language}));return true;
  }
  if(data.startsWith('r:bedit:')){
    const p=data.split(':'),action=p[2],id=p[3],button=getMessageButton(draft.message_buttons,id);
    if(!button){await answerCallback(callback,t('ux.buttons.missing',{language}),true);return true;}
    if(action==='style'){await editCallback(callback,{text:t('ux.buttons.editing',{language,title:button.text??'Button'}),replyMarkup:buttonStyleKeyboard(id,String(button.style??'default'),language)});}
    else if(action==='move'){await editCallback(callback,{text:t('ux.buttons.editing',{language,title:button.text??'Button'}),replyMarkup:buttonPositionKeyboard(draft.message_buttons,id,language)});}
    else if(action==='type'){await patchSession(storageKey,{current_button_id:id},{state:STATE.MANAGING});await editCallback(callback,{text:t('ux.buttons.editing',{language,title:button.text??'Button'}),replyMarkup:buttonTypeKeyboard('r:bct:'+id,language)});}
    else if(['title','value'].includes(action)){await patchSession(storageKey,{pending_button_action:'edit_'+action,current_button_id:id},{state:STATE.EDITING_BUTTON});await api.sendMessage({chat_id:callback.message.chat.id,text:action==='title'?t('ux.buttons.send_new_title',{language}):t('ux.buttons.send_new_value',{language})});}
    else{await answerCallback(callback,t('invalid',{language}),true);return true;}
    await answerCallback(callback);return true;
  }
  if(data==='r:brow'){
    await editCallback(callback,{text:t('ux.buttons.layout_hint',{language}),replyMarkup:layoutKeyboard(draft.message_buttons,draft.buttons_per_row,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:browset:')){
    const count=Number(data.split(':').at(-1));if(count<1||count>8){await answerCallback(callback,t('invalid',{language}),true);return true;}
    await remember(storageKey);draft.buttons_per_row=count;for(const b of draft.message_buttons)delete b.row_end;await saveDraft(storageKey,draft);
    await editCallback(callback,{text:t('ux.buttons.layout',{language,count}),replyMarkup:layoutKeyboard(draft.message_buttons,count,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:browcustom:')){
    const p=data.split(':'),index=Number(p[2]),count=Number(p[3]);
    try{await remember(storageKey);setButtonRowWidth(draft.message_buttons,draft.buttons_per_row,index,count);await saveDraft(storageKey,draft);}
    catch{await answerCallback(callback,t('invalid',{language}),true);return true;}
    await editCallback(callback,{text:t('ux.buttons.custom_hint',{language}),replyMarkup:layoutKeyboard(draft.message_buttons,draft.buttons_per_row,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:browcustompage:')){await editCallback(callback,{text:t('ux.buttons.custom_hint',{language}),replyMarkup:layoutKeyboard(draft.message_buttons,draft.buttons_per_row,language)});await answerCallback(callback);return true;}
  if(data.startsWith('r:bs:')){
    const action=data.split(':').at(-1);
    if(!['delete','style','move','value','url','title','type'].includes(action)){await answerCallback(callback,t('invalid',{language}),true);return true;}
    if(!draft.message_buttons.length){await answerCallback(callback,t('ux.buttons.empty',{language}),true);return true;}
    await editCallback(callback,{text:t('common.choose_action',{language}),replyMarkup:picker(draft.message_buttons,action,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:bt:')){
    const p=data.split(':'),action=p[2],id=p[3],button=getMessageButton(draft.message_buttons,id);
    if(!button){await answerCallback(callback,t('ux.buttons.missing',{language}),true);return true;}
    if(action==='delete'){await editCallback(callback,{text:t('ux.buttons.delete_confirm',{language,title:button.text??'Button'}),replyMarkup:deleteKeyboard(id,language)});}
    else if(action==='style'){await editCallback(callback,{text:t('ux.buttons.editing',{language,title:button.text??'Button'}),replyMarkup:buttonStyleKeyboard(id,String(button.style??'default'),language)});}
    else if(action==='move'){await editCallback(callback,{text:t('ux.buttons.editing',{language,title:button.text??'Button'}),replyMarkup:buttonPositionKeyboard(draft.message_buttons,id,language)});}
    else if(action==='type'){await patchSession(storageKey,{current_button_id:id},{state:STATE.MANAGING});await editCallback(callback,{text:t('ux.buttons.editing',{language,title:button.text??'Button'}),replyMarkup:buttonTypeKeyboard('r:bct:'+id,language)});}
    else if(['value','url','title'].includes(action)){await patchSession(storageKey,{pending_button_action:action==='title'?'edit_title':'edit_value',current_button_id:id},{state:STATE.EDITING_BUTTON});await api.sendMessage({chat_id:callback.message.chat.id,text:action==='title'?t('ux.buttons.send_new_title',{language}):t('ux.buttons.send_new_value',{language})});}
    else{await answerCallback(callback,t('invalid',{language}),true);return true;}
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:bct:')){
    const p=data.split(':'),id=p[2],type=p[3],button=getMessageButton(draft.message_buttons,id);
    if(!button||!BUTTON_TYPES.has(type)){await answerCallback(callback,'هذا الزر أو النوع لم يعد موجودًا.',true);return true;}
    if(type==='disabled'){
      await remember(storageKey);changeMessageButtonType(button,'disabled','');await saveDraft(storageKey,draft);await patchSession(storageKey,{current_button_id:null},{state:STATE.MANAGING});
      await editCallback(callback,{text:'✅ تم تغيير نوع الزر إلى زر معطّل.\n\n'+managerText(draft.message_buttons.length,language),replyMarkup:buttonsManagerKeyboard(draft.message_buttons,draft.buttons_per_row,language)});await answerCallback(callback,'تم تغيير النوع');return true;
    }
    if(type==='page'){
      const pages=await listPagesForUser(callback.from.id);if(!pages.length){await answerCallback(callback,'احفظ صفحة أولاً حتى تربط الزر بها.',true);return true;}
      await editCallback(callback,{text:'اختر الصفحة التي يفتحها الزر: '+String(button.text??''),replyMarkup:pageTargetKeyboard(pages,'change',id,language)});await answerCallback(callback);return true;
    }
    await patchSession(storageKey,{current_button_id:id,pending_button_action:'change_type_value',pending_button_type:type},{state:STATE.EDITING_BUTTON});
    await api.sendMessage({chat_id:callback.message.chat.id,text:'أرسل القيمة الجديدة للنوع '+type+'.'});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:bsc:')){
    const p=data.split(':'),id=p[2],value=p[3],button=getMessageButton(draft.message_buttons,id);
    if(!button||!BUTTON_STYLES.has(value)||value==='link'){await answerCallback(callback,'هذا الزر أو اللون لم يعد موجودًا.',true);return true;}
    await remember(storageKey);button.style=value;await saveDraft(storageKey,draft);
    await editCallback(callback,{text:'✅ تم تغيير لون الزر.\n\n'+managerText(draft.message_buttons.length,language),replyMarkup:buttonsManagerKeyboard(draft.message_buttons,draft.buttons_per_row,language)});await answerCallback(callback,'تم تغيير اللون');return true;
  }
  if(data.startsWith('r:bmv:')){
    const p=data.split(':'),id=p[2],index=Number(p[3]);await remember(storageKey);
    if(!moveMessageButton(draft.message_buttons,id,index)){await answerCallback(callback,'تعذر تغيير ترتيب الزر.',true);return true;}
    await saveDraft(storageKey,draft);await editCallback(callback,{text:'✅ تم تغيير ترتيب الزر.\n\n'+managerText(draft.message_buttons.length,language),replyMarkup:buttonsManagerKeyboard(draft.message_buttons,draft.buttons_per_row,language)});await answerCallback(callback,'تم تغيير الترتيب');return true;
  }
  if(data.startsWith('r:bpg:')){
    const p=data.split(':');if(p[2]!=='change'||p.length!==5){await answerCallback(callback,t('invalid',{language}),true);return true;}
    const id=p[3],pageId=p[4],page=await getPage(pageId),button=getMessageButton(draft.message_buttons,id);
    if(!page||Number(page.owner_id)!==Number(callback.from.id)){await answerCallback(callback,'الصفحة محذوفة أو لا تخصك.',true);return true;}
    if(!button){await answerCallback(callback,t('ux.buttons.missing',{language}),true);return true;}
    await remember(storageKey);changeMessageButtonType(button,'page',pageId);await saveDraft(storageKey,draft);await patchSession(storageKey,{current_button_id:null,pending_button_action:null,pending_button_type:null},{state:STATE.MANAGING});
    await editCallback(callback,{text:'✅ تم ربط الزر بالصفحة «'+String(page.title??pageId)+'».\n\n'+managerText(draft.message_buttons.length,language),replyMarkup:buttonsManagerKeyboard(draft.message_buttons,draft.buttons_per_row,language)});await answerCallback(callback,'تم ربط الصفحة');return true;
  }
  if(data==='r:bpreview'){
    if(!draft.message_buttons.length){await answerCallback(callback,'لا توجد أزرار لمعاينتها.',true);return true;}
    await answerCallback(callback);const prepared=await prepareMessageButtons(draft.message_buttons);
    const sent=await api.sendMessage({chat_id:callback.from.id,text:t('button_preview',{language}),reply_markup:renderedMessageButtons(prepared,{buttonsPerRow:draft.buttons_per_row,includeBack:true,backText:t('ux.common.back',{language}),language})});
    await patchSession(storageKey,{button_preview_message_id:sent.message_id},{state:STATE.MANAGING});return true;
  }
  if(data==='r:bpback'){
    if(callback.message){try{await api.deleteMessage({chat_id:callback.message.chat.id,message_id:callback.message.message_id});}catch{}}
    await patchSession(storageKey,{button_preview_message_id:null},{state:STATE.MANAGING});await answerCallback(callback,'تم إغلاق المعاينة');return true;
  }
  if(data.startsWith('r:popup:')){
    const text=await getPopup(data.slice('r:popup:'.length));await answerCallback(callback,text??'هذا التنبيه لم يعد متاحاً.',true);return true;
  }
  if(data.startsWith('r:poptext:')){await answerCallback(callback,data.slice('r:poptext:'.length).slice(0,200),true);return true;}
  return false;
}
