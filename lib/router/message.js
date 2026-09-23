import { api, InputFile } from 'sdk';
import { withIdempotency, slidingWindowAllow, scopeForMessage } from 'lib/runtime/request_guard';
import { isDeveloper, getSetting } from 'lib/config';
import { PageLimitError } from 'lib/errors';
import { t, languageForUser } from 'lib/i18n';
import { observeUser, recordRequest } from 'lib/usage';
import { welcomeRichMessage, welcomeKeyboard as legacyWelcomeKeyboard, editorDashboard } from 'lib/editor/ui';
import {
  storageKeyForMessage, loadSession, saveSession, patchSession, resetSession, STATE,
} from 'lib/editor/session';
import { loadDraft, saveDraft } from 'lib/editor/draft';
import { remember } from 'lib/editor/history';
import { editorWorkflow } from 'lib/editor/workflow';
import { makeBlock } from 'lib/editor/models';
import { textData, quoteData, mapData } from 'lib/editor/builders';
import { messageToBlocks, messagesToBlocks } from 'lib/parser';
import { validateEditorLimits } from 'lib/editor/limits';
import { findUserButtonMarkers, resolveUserButtonMarker } from 'lib/inline_buttons';
import {
  addMessageButton, changeMessageButtonType, getMessageButton, inferButtonTypeAndValue,
  parseMessageButtonSpec, getButtonType,
} from 'lib/buttons';
import { normalizeButtonValue, renderEditor } from 'lib/router/support';
import { richEditorKeyboard, startEditorKeyboard, developerKeyboard, developerImportConfirmationKeyboard } from 'lib/ui/keyboards';
import { savePage, renamePage, queryPagesForUser, getPage } from 'lib/storage/pages';
import { sendAllBlocksShowcase } from 'lib/showcase';
import { handleWebAppData } from 'lib/miniapp/backend';
import { safeTelegramDownload } from 'lib/media_safety';
import { prepareDataImport } from 'lib/data_backup';
import { detailsChildren, addDetailsChild, replaceDetailsChild, findDetailsChild } from 'lib/details';
import { newAnchorData } from 'lib/editor/anchors';
import { getBlockById, editableTableData } from 'lib/blocks';
import { appendAlbumBlocks } from 'lib/albums';

function now(){return Math.floor(Date.now()/1000);}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function commandOf(text){const first=String(text??'').trim().split(/\s+/,1)[0];return first.startsWith('/')?first.split('@',1)[0].toLowerCase():'';}
function lang(message){return languageForUser(message?.from);}
async function send(message,text,reply_markup=null){return api.sendMessage({chat_id:message.chat.id,text,...(reply_markup?{reply_markup}:{})});}
function errorText(error,language='en'){
  if(error?.code==='blocks')return t('limits.blocks',{language,limit:error.limit});
  if(error?.code==='characters')return t('limits.characters',{language,limit:error.limit});
  if(error?.code==='table_rows')return t('limits.table_rows',{language,limit:error.limit});
  if(error?.code==='table_columns')return t('limits.table_columns',{language,limit:error.limit});
  return String(error?.message??error);
}
async function rateLimit(message,state){
  const rule=scopeForMessage(message?.text??'',state??'');
  if(!rule||!Number.isSafeInteger(Number(message?.from?.id)))return true;
  const allowed=await slidingWindowAllow({...rule,userId:Number(message.from.id),member:String(message.message_id??Date.now())});
  if(!allowed)await send(message,'طلبات كثيرة بسرعة، حاول بعد لحظات.');
  return allowed;
}
function initialData(chatId,messageId=null){
  return {blocks:[],message_buttons:[],buttons_per_row:1,buttons_align:'center',current_page_id:null,current_page_title:null,
    management_chat_id:chatId,management_message_id:messageId,editor_last_activity_at:now(),pages_search_query:'',pages_sort_mode:'updated',
    block_scroll_offset:0,block_scroll_enabled:true,current_block_id:null};
}
async function openEditorFromBlocks(message,storageKey,blocks){
  try{validateEditorLimits(blocks);}catch(error){await send(message,errorText(error,lang(message)));return null;}
  const sent=await api.sendMessage({chat_id:message.chat.id,text:editorDashboard({blocks,message_buttons:[]}),reply_markup:richEditorKeyboard(blocks,[],{language:lang(message)})});
  await saveSession(storageKey,STATE.MANAGING,{...initialData(sent.chat.id,sent.message_id),blocks});
  try{if(message.message_id!==sent.message_id)await api.deleteMessage({chat_id:message.chat.id,message_id:message.message_id});}catch{}
  return sent;
}
function blockFromMessage(message,kind,sessionData){
  if(['paragraph','heading','preformatted','footer','mathematical_expression','list','table'].includes(kind)){
    if(typeof message.text!=='string'&&typeof message.caption!=='string')return null;
    return makeBlock(kind,textData(message,kind,{headingSize:sessionData.pending_heading_size??2,listKind:sessionData.pending_list_kind??'bullet'}));
  }
  if(kind==='anchor'){
    const name=String(message?.text??message?.caption??'').trim();
    const targetId=String(sessionData.pending_anchor_target_id??'');
    if(!name||!targetId)return null;
    return makeBlock('anchor',newAnchorData(name,targetId));
  }
  if(['blockquote','pullquote'].includes(kind)){
    if(typeof message.text!=='string'&&typeof message.caption!=='string')return null;
    return makeBlock(kind,quoteData(message));
  }
  if(kind==='map'&&message.location)return makeBlock('map',mapData(message.location.latitude,message.location.longitude));
  const parsed=messageToBlocks(message);
  return parsed.find(b=>b.type===kind)||null;
}
async function finishAdd(message,storageKey,block){
  const draft=await loadDraft(storageKey);await remember(storageKey);
  const result=editorWorkflow.add(draft.blocks,block);
  try{validateEditorLimits(result.blocks);}catch(error){await send(message,errorText(error,lang(message)));return;}
  draft.blocks=result.blocks;await saveDraft(storageKey,draft);
  await patchSession(storageKey,{pending_add_kind:null,pending_heading_size:null,pending_list_kind:null,current_block_id:result.block?.id??null},{state:STATE.MANAGING});
  await renderEditor(message,storageKey,t('block_added',{language:lang(message)}));
}
async function handleAddingBlock(message,storageKey,session){
  const data=session.data,kind=String(data.pending_add_kind??'');
  if(kind==='details'){
    if(data.details_phase==='summary'){
      const summary=String(message.text??'').trim();if(!summary)return send(message,t('details.summary_text_required',{language:lang(message)}));
      await patchSession(storageKey,{details_phase:'content',details_summary:summary,details_children:[]},{state:STATE.ADDING_BLOCK});
      return send(message,t('details.inner_send_content',{language:lang(message)}));
    }
    const childKind=String(data.pending_child_type??'');
    const childData={
      ...data,
      pending_heading_size:data.pending_child_heading_size??data.pending_heading_size,
      pending_list_kind:data.pending_child_list_kind??data.pending_list_kind,
    };
    const child=childKind?blockFromMessage(message,childKind,childData):messageToBlocks(message)[0];
    if(!child)return send(message,t('details.unsupported_content',{language:lang(message)}));
    const children=[...(data.details_children??[])];children.push(child);
    await patchSession(storageKey,{
      details_children:children,details_phase:'content',pending_child_type:null,
      pending_child_heading_size:null,pending_child_list_kind:null,
    },{state:STATE.ADDING_BLOCK});
    return send(message,t('details.inner_count',{language:lang(message),count:children.length}),{inline_keyboard:[
      [{text:t('details.inner_add_button',{language:lang(message)}),callback_data:'r:details:add',style:'primary'}],
      [{text:t('details.finish_button',{language:lang(message),count:children.length}),callback_data:'r:details:finish',style:'success'}],
    ]});
  }
  if(['collage','slideshow'].includes(kind)){
    const child=messageToBlocks(message).find(b=>['photo','video'].includes(b.type));
    if(!child)return send(message,'أرسل صورة أو فيديو.');
    const children=[...(data.pending_media_children??[])];if(children.length>=50)return send(message,'وصلت للحد 50.');
    children.push(child);await patchSession(storageKey,{pending_media_children:children},{state:STATE.ADDING_BLOCK});
    return send(message,`تم استلام ${children.length}/50.`,{inline_keyboard:[
      [{text:'استمرار',callback_data:'r:slides:continue',style:'success'},{text:'أضف المزيد',callback_data:'r:slides:add',style:'primary'}],
    ]});
  }
  const block=blockFromMessage(message,kind,data);
  if(!block)return send(message,t('unsupported',{language:lang(message)}));
  return finishAdd(message,storageKey,block);
}
async function handleEditingBlock(message,storageKey,session){
  const data=session.data,draft=await loadDraft(storageKey);

  if(data.nested_details_id&&data.nested_child_id){
    const detailsId=String(data.nested_details_id),childId=String(data.nested_child_id);
    const details=getBlockById(draft.blocks,detailsId),child=details?findDetailsChild(details,childId):null;
    if(!details||!child){
      await patchSession(storageKey,{nested_details_id:null,nested_child_id:null,nested_action:null},{state:STATE.MANAGING});
      return send(message,t('missing_block',{language:lang(message)}));
    }
    const action=String(data.nested_action??'content');
    await remember(storageKey);
    if(action==='caption'||action==='credit'){
      const replacement=clone(child);replacement.source='generated';replacement.data??={};
      const value=String(message.text??message.caption??'').trim();
      const key=action==='caption'?'caption_rich_text':'credit_rich_text';
      if(String(message.text??'').trim()==='/remove')delete replacement.data[key];else replacement.data[key]=value;
      replaceDetailsChild(details,childId,replacement);
    }else if(action==='add_footer'){
      const value=String(message.text??'').trim();
      if(!value)return send(message,t('details.inner_text_required',{language:lang(message)}));
      const children=detailsChildren(details),index=children.findIndex(x=>x.id===childId);
      addDetailsChild(details,makeBlock('footer',{text:value,rich_text:value}),{index:index+1});
    }else{
      const replacement=blockFromMessage(message,child.type,data);
      if(!replacement)return send(message,t('details.inner_wrong_content',{language:lang(message)}));
      replacement.id=child.id;replacement.position=child.position;
      replaceDetailsChild(details,childId,replacement);
    }
    await saveDraft(storageKey,draft);
    await patchSession(storageKey,{
      nested_details_id:null,nested_child_id:null,nested_action:null,edit_block_id:null,edit_field:null,
    },{state:STATE.MANAGING});
    return renderEditor(message,storageKey,'تم تحديث البلوك الداخلي.');
  }

  const blockId=String(data.edit_block_id??data.current_block_id??'');
  const current=getBlockById(draft.blocks,blockId);if(!current){await patchSession(storageKey,{edit_block_id:null},{state:STATE.MANAGING});return send(message,t('missing_block',{language:lang(message)}));}
  const field=String(data.edit_field??'content');
  if(field==='caption'||field==='credit'||field==='summary'){
    const value=String(message.text??message.caption??'').trim();
    if(!value&&field==='summary')return send(message,t('details.summary_text_required',{language:lang(message)}));
    await remember(storageKey);const next=clone(current);next.source='generated';next.data??={};
    if(field==='caption'){if(message.text==='/remove')delete next.data.caption_rich_text;else next.data.caption_rich_text=value;}
    else if(field==='credit'){if(message.text==='/remove')delete next.data.credit_rich_text;else next.data.credit_rich_text=value;}
    else next.data.summary_rich_text=value;
    const r=editorWorkflow.replace(draft.blocks,blockId,next);draft.blocks=r.blocks;await saveDraft(storageKey,draft);
    await patchSession(storageKey,{edit_block_id:null,edit_field:null},{state:STATE.MANAGING});return renderEditor(message,storageKey,'تم تحديث الجزء بنجاح.');
  }
  if(current.type==='details'){
    const replacementChildren=messageToBlocks(message);
    if(!replacementChildren.length)return send(message,t('details.unsupported_content',{language:lang(message)}));
    await remember(storageKey);const next=clone(current);next.source='generated';next.data??={};next.data.children=replacementChildren;
    const result=editorWorkflow.replace(draft.blocks,blockId,next);draft.blocks=result.blocks;await saveDraft(storageKey,draft);
    await patchSession(storageKey,{edit_block_id:null,edit_field:null},{state:STATE.MANAGING});
    return renderEditor(message,storageKey,'تم تحديث محتوى التفاصيل.');
  }
  const replacement=blockFromMessage(message,current.type,data);if(!replacement)return send(message,'نوع المحتوى غير صحيح.');
  replacement.id=current.id;replacement.position=current.position;
  await remember(storageKey);const r=editorWorkflow.replace(draft.blocks,blockId,replacement);draft.blocks=r.blocks;await saveDraft(storageKey,draft);
  await patchSession(storageKey,{edit_block_id:null,edit_field:null},{state:STATE.MANAGING});return renderEditor(message,storageKey,'تم تحديث الجزء بنجاح.');
}
async function handleEditingButton(message,storageKey,session){
  const data=session.data,draft=await loadDraft(storageKey),action=String(data.pending_button_action??''),text=String(message.text??'').trim();
  if(!text)return send(message,'أرسل قيمة نصية صحيحة.');
  if(action==='add_title'){
    if(text.length>64)return send(message,'عنوان الزر طويل جدًا.');
    const parsed=parseMessageButtonSpec(text);
    if(parsed){
      const norm=normalizeButtonValue(parsed.type,parsed.value,lang(message));if(norm.error)return send(message,norm.error);
      await remember(storageKey);const b=addMessageButton(draft.message_buttons,parsed.title,norm.value,parsed.type);if(!b)return send(message,'وصلت للحد الأقصى للأزرار.');
      await saveDraft(storageKey,draft);await patchSession(storageKey,{pending_button_action:null,current_button_id:b.id},{state:STATE.MANAGING});return renderEditor(message,storageKey,'تمت إضافة الزر.');
    }
    await patchSession(storageKey,{pending_button_action:'add_value',pending_button_title:text},{state:STATE.EDITING_BUTTON});
    return send(message,'أرسل قيمة الزر. تقدر تكتب النوع مثل: url: https://example.com');
  }
  if(action==='add_value'){
    const [type,value]=inferButtonTypeAndValue(text,String(data.pending_button_type??'url'));const norm=normalizeButtonValue(type,value,lang(message));if(norm.error)return send(message,norm.error);
    if(type==='page'){const page=await getPage(norm.value);if(!page||page.owner_id!==Number(message.from.id))return send(message,'كود الصفحة غير موجود أو لا يخصك.');}
    await remember(storageKey);const b=addMessageButton(draft.message_buttons,String(data.pending_button_title??'Button'),norm.value,type);if(!b)return send(message,'وصلت للحد الأقصى للأزرار.');
    await saveDraft(storageKey,draft);await patchSession(storageKey,{pending_button_action:null,pending_button_title:null,current_button_id:b.id},{state:STATE.MANAGING});return renderEditor(message,storageKey,'تمت إضافة الزر.');
  }
  const button=getMessageButton(draft.message_buttons,String(data.current_button_id??''));if(!button){await patchSession(storageKey,{pending_button_action:null},{state:STATE.MANAGING});return send(message,'هذا الزر لم يعد موجودًا.');}
  if(action==='edit_title'){if(text.length>64)return send(message,'عنوان الزر طويل جدًا.');await remember(storageKey);button.text=text;}
  else if(action==='edit_value'){
    const [type,value]=inferButtonTypeAndValue(text,getButtonType(button));const norm=normalizeButtonValue(type,value,lang(message));if(norm.error)return send(message,norm.error);
    if(type==='page'){const page=await getPage(norm.value);if(!page||page.owner_id!==Number(message.from.id))return send(message,'كود الصفحة غير موجود أو لا يخصك.');}
    await remember(storageKey);changeMessageButtonType(button,type,norm.value);
  }else if(action==='change_type_value'){
    const type=String(data.pending_button_type??'url'),norm=normalizeButtonValue(type,text,lang(message));if(norm.error)return send(message,norm.error);
    if(type==='page'){const page=await getPage(norm.value);if(!page||page.owner_id!==Number(message.from.id))return send(message,'كود الصفحة غير موجود أو لا يخصك.');}
    await remember(storageKey);changeMessageButtonType(button,type,norm.value);
  } else return send(message,'انتهت عملية تعديل الزر.');
  await saveDraft(storageKey,draft);await patchSession(storageKey,{pending_button_action:null,pending_button_type:null},{state:STATE.MANAGING});return renderEditor(message,storageKey,'تم تحديث الزر.');
}
async function handleTableCaption(message,storageKey,session){
  const draft=await loadDraft(storageKey),id=String(session.data.table_caption_block_id??''),block=getBlockById(draft.blocks,id);
  if(!block){await patchSession(storageKey,{table_caption_block_id:null},{state:STATE.MANAGING});return send(message,'هذا الجدول لم يعد موجودًا.');}
  const table=editableTableData(block);if(!table)return send(message,'تعذر تعديل الجدول.');
  await remember(storageKey);if(String(message.text??'').trim()==='/empty')delete table.caption_rich_text;else table.caption_rich_text=String(message.text??'').trim();
  await saveDraft(storageKey,draft);await patchSession(storageKey,{table_caption_block_id:null},{state:STATE.MANAGING});return renderEditor(message,storageKey,'تم تحديث الجدول.');
}
async function handleUserSelection(message,storageKey,session){
  const data=session.data,markers=data.pending_user_markers??[],index=Number(data.pending_user_marker_index??0),marker=markers[index];
  if(!marker)return patchSession(storageKey,{pending_user_markers:null},{state:STATE.WAITING_INPUT});
  let userId=null,username=null;
  const shared=message.users_shared?.users?.[0]??message.users_shared?.user_ids?.[0];
  if(typeof shared==='number')userId=shared;else if(shared?.user_id)userId=Number(shared.user_id);
  if(!userId&&message.from?.id&&String(message.text??'').startsWith('@'))username=String(message.text).slice(1);
  if(!userId&&!username)return send(message,'اختار مستخدم أو ارسل @username.');
  const blocks=clone(data.pending_user_blocks??[]);resolveUserButtonMarker(blocks,marker.marker,userId??0,username);
  const next=index+1;
  if(next<markers.length){await patchSession(storageKey,{pending_user_blocks:blocks,pending_user_marker_index:next},{state:STATE.SELECTING_BUTTON_USER});return send(message,'اختار المستخدم للزر التالي.');}
  await patchSession(storageKey,{pending_user_blocks:null,pending_user_markers:null,pending_user_marker_index:null},{state:STATE.MANAGING});
  return openEditorFromBlocks(message,storageKey,blocks);
}
async function handleDeveloperImport(message,storageKey){
  if(!message.document)return send(message,'أرسل ملف JSON كمستند.');
  if(Number(message.document.file_size??0)>20*1024*1024)return send(message,'حجم الملف أكبر من 20MB.');
  try{
    const bytes=await safeTelegramDownload(message.document.file_id,{maxBytes:20*1024*1024});
    const prepared=prepareDataImport(message.document.file_name??'backup.json',bytes);
    await patchSession(storageKey,{pending_import:prepared},{state:STATE.DEV_CONFIRMING_IMPORT});
    return send(message,'⚠️ الملف صالح وجاهز للاستيراد. اضغط تأكيد.',developerImportConfirmationKeyboard());
  }catch(error){return send(message,'❌ تعذر قبول الملف: '+String(error.message??error));}
}

export async function handleMessage(message,ctx={}){
  const started=Date.now();
  return withIdempotency(Number(ctx?.update?.update_id),async()=>{
    let failed=false;
    try{
      if(!message?.chat)return null;
      await observeUser(message.from);
      if(message.web_app_data)return handleWebAppData(message);
      const storageKey=storageKeyForMessage(message),session=await loadSession(storageKey),command=commandOf(message.text),language=lang(message);
      if(!await rateLimit(message,session.state))return null;
      if(command==='/start')return api.sendRichMessage({chat_id:message.chat.id,rich_message:welcomeRichMessage(message.from),reply_markup:legacyWelcomeKeyboard()});
      if(command==='/editor'){
        await resetSession(storageKey);
        const sent=await api.sendMessage({chat_id:message.chat.id,text:t('editor.empty_hint',{language}),reply_markup:richEditorKeyboard([],[],{language})});
        await saveSession(storageKey,STATE.MANAGING,initialData(sent.chat.id,sent.message_id));return sent;
      }
      if(command==='/draft'||['draft','دريفت'].includes(String(message.text??'').trim().toLowerCase())){
        try{return await sendAllBlocksShowcase(message.chat.id,message.from?.id??message.chat.id,language);}catch{return send(message,t('preview_failed',{language}));}
      }
      if(command==='/dev'){
        if(!await isDeveloper(message.from?.id))return null;
        await resetSession(storageKey);await saveSession(storageKey,STATE.MANAGING,initialData(message.chat.id));
        return api.sendRichMessage({chat_id:message.chat.id,rich_message:{blocks:[{type:'paragraph',text:'🛠 لوحة المطوّر\n\nServerless database / export / stats / showcase.'},{type:'buttons',buttons:[
          {text:'فحص قاعدة البيانات',callback_data:'dev:database:check',style:'primary'},{text:'تحديث قناة المعاينة',callback_data:'dev:showcase:refresh',style:'primary'},
          {text:'بيانات / إحصائيات',callback_data:'dev:stats',style:'primary'},{text:'إنشاء Snapshot الآن',callback_data:'dev:snapshot',style:'primary'}],align:'center'}]},reply_markup:developerKeyboard()});
      }
      if(command==='/app'){
        const url=String(await getSetting('mini_app_url','')??'').trim();
        return send(message,url?'افتح Mini App:':'MINI_APP_URL غير مضبوط.',url?{inline_keyboard:[[{text:'فتح التطبيق',web_app:{url}}]]}:null);
      }
      if(command==='/pages'){
        const r=await queryPagesForUser(message.from?.id,{sortMode:'updated'});return send(message,`صفحاتي: ${r.ownedTotal}`);
      }
      if(session.state===STATE.DEV_WAITING_IMPORT&&await isDeveloper(message.from?.id))return handleDeveloperImport(message,storageKey);
      if(session.state===STATE.SAVING_PAGE_NAME){
        const title=String(message.text??'').trim();if(!title)return send(message,'اسم الصفحة يجب أن يكون نصًا.');if(title.length>64)return send(message,'اسم الصفحة طويل جدًا؛ الحد الأقصى 64 حرفًا.');
        const draft=await loadDraft(storageKey);
        try{const pageId=await savePage({ownerId:message.from.id,title,blocks:draft.blocks,buttons:draft.message_buttons,buttonsPerRow:draft.buttons_per_row,buttonsAlign:draft.buttons_align,pageId:draft.current_page_id});draft.current_page_id=pageId;draft.current_page_title=title;await saveDraft(storageKey,draft);await patchSession(storageKey,{}, {state:STATE.MANAGING});return renderEditor(message,storageKey,'✅ تم حفظ الصفحة.');}
        catch(error){if(error instanceof PageLimitError)return send(message,t('pages.limit_reached',{language,limit:error.limit}));throw error;}
      }
      if(session.state===STATE.RENAMING_PAGE){
        const title=String(message.text??'').trim();if(!title||title.length>64)return send(message,'أرسل اسمًا من 1 إلى 64 حرفًا.');
        const id=String(session.data.rename_page_id??''),ok=await renamePage(id,message.from.id,title);await patchSession(storageKey,{rename_page_id:null},{state:STATE.MANAGING});if(!ok)return send(message,'الصفحة محذوفة أو لا تخصك.');
        const draft=await loadDraft(storageKey);if(draft.current_page_id===id){draft.current_page_title=title;await saveDraft(storageKey,draft);}return renderEditor(message,storageKey,'تم تغيير اسم الصفحة.');
      }
      if(session.state===STATE.SEARCHING_PAGE){const query=String(message.text??'').trim()==='/all'?'':String(message.text??'').trim();await patchSession(storageKey,{pages_search_query:query},{state:STATE.MANAGING});return renderEditor(message,storageKey,query?'تم حفظ البحث: '+query:'تم إلغاء البحث.');}
      if(session.state===STATE.ADDING_BLOCK)return handleAddingBlock(message,storageKey,session);
      if(session.state===STATE.EDITING_BLOCK)return handleEditingBlock(message,storageKey,session);
      if(session.state===STATE.EDITING_BUTTON)return handleEditingButton(message,storageKey,session);
      if(session.state===STATE.EDITING_TABLE_CAPTION)return handleTableCaption(message,storageKey,session);
      if(session.state===STATE.SELECTING_BUTTON_USER)return handleUserSelection(message,storageKey,session);
      if(session.state===STATE.WAITING_INPUT){
        let blocks=messageToBlocks(message);if(!blocks.length)return send(message,t('unsupported',{language}));
        let albumId=null;
        if(message.media_group_id){
          const album=await appendAlbumBlocks(message,blocks);blocks=album.blocks;albumId=album.albumId;
        }
        const markers=findUserButtonMarkers(message.text);
        if(markers.length){await patchSession(storageKey,{pending_user_blocks:blocks,pending_user_markers:markers,pending_user_marker_index:0,active_album_id:albumId,active_album_start_index:0},{state:STATE.SELECTING_BUTTON_USER});return send(message,'اختار مستخدم للزر.',{keyboard:[[{text:'اختيار مستخدم',request_users:{request_id:1,user_is_bot:false,max_quantity:1}}]],resize_keyboard:true,one_time_keyboard:true});}
        const opened=await openEditorFromBlocks(message,storageKey,blocks);
        if(opened&&albumId)await patchSession(storageKey,{active_album_id:albumId,active_album_start_index:0},{state:STATE.MANAGING});
        return opened;
      }
      if(session.state===STATE.MANAGING&&message.media_group_id&&String(session.data.active_album_id??'')===String(message.media_group_id)){
        const incoming=messageToBlocks(message);
        const album=await appendAlbumBlocks(message,incoming);
        const draft=await loadDraft(storageKey),start=Math.max(0,Number(session.data.active_album_start_index??0));
        await remember(storageKey);
        draft.blocks=[...draft.blocks.slice(0,start),...album.blocks];
        await saveDraft(storageKey,draft);
        try{validateEditorLimits(draft.blocks);}catch(error){return send(message,errorText(error,language));}
        try{await api.deleteMessage({chat_id:message.chat.id,message_id:message.message_id});}catch{}
        return renderEditor(message,storageKey);
      }
      if(session.state===STATE.MANAGING&&message.rich_message){
        const blocks=messageToBlocks(message);if(!blocks.length)return send(message,t('editor.rich_import_failed',{language}));
        const draft=await loadDraft(storageKey);await remember(storageKey);draft.blocks=blocks;draft.message_buttons=[];draft.buttons_per_row=1;draft.buttons_align='center';draft.current_page_id=null;draft.current_page_title=null;await saveDraft(storageKey,draft);await patchSession(storageKey,{current_block_id:null,block_scroll_offset:0},{state:STATE.MANAGING});return renderEditor(message,storageKey,t('editor.imported_title',{language}));
      }
      if(session.state===STATE.MANAGING)return send(message,t('editor.closed_hint',{language}),startEditorKeyboard(language));
      if(message.chat.type==='private'){
        if(message.from)return api.sendRichMessage({chat_id:message.chat.id,rich_message:welcomeRichMessage(message.from),reply_markup:legacyWelcomeKeyboard()});
        return send(message,t('welcome',{language})+'\n'+t('start_editor',{language}));
      }
      return null;
    }catch(error){failed=true;console.error(error);throw error;}
    finally{await recordRequest(Date.now()-started,{failed});}
  });
}
