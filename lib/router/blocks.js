import { api } from 'sdk';
import { loadDraft, saveDraft } from 'lib/editor/draft';
import { remember } from 'lib/editor/history';
import { editorWorkflow } from 'lib/editor/workflow';
import { makeBlock } from 'lib/editor/models';
import {
  getBlockById, tableRows, editableTableData, tableFlag,
  setTableCellStyle, setAllTableCellsStyle,
} from 'lib/blocks';
import {
  anchorTargets, anchorDisplayName, linkedAnchors, newAnchorData,
  setAnchorTarget, retargetLinkedAnchors,
} from 'lib/editor/anchors';
import { validateEditorLimits } from 'lib/editor/limits';
import { loadSession, patchSession, STATE } from 'lib/editor/session';
import {
  addBlockKeyboard, listTypeKeyboard, headingLevelKeyboard, blockEditorKeyboard,
  deleteConfirmationKeyboard, blockPositionKeyboard, anchorTargetKeyboard,
  richEditorKeyboard,
} from 'lib/ui/keyboards';
import { answerCallback, editCallback, renderEditor } from 'lib/router/support';
import { sendRichMessagePreview } from 'lib/renderer';
import { t, languageForUser } from 'lib/i18n';

function lang(callback){return languageForUser(callback?.from);}
function blockSummary(block,blocks,language){
  const ordered=[...(blocks??[])].sort((a,b)=>Number(a.position??0)-Number(b.position??0));
  const index=ordered.findIndex(x=>x.id===block.id);
  return [
    t('block.manage_title',{language,name:t('block.'+String(block.type??'content'),{language})}),
    t('block.position_text',{language,current:index+1,total:ordered.length}),
    'ID: '+String(block.id),
  ].join('\n');
}
async function persist(storageKey,draft,blocks){
  validateEditorLimits(blocks);draft.blocks=blocks;await saveDraft(storageKey,draft);
}
function tableOptionsKeyboard(id,language){
  const choices=[
    [t('table.shade_cell',{language}),'sh'],[t('table.unshade_cell',{language}),'uh'],
    [t('table.center_cell',{language}),'ce'],[t('table.uncenter_cell',{language}),'ue'],
    [t('table.shade_all',{language}),'sha'],[t('table.unshade_all',{language}),'uha'],
    [t('table.center_all',{language}),'cea'],[t('table.uncenter_all',{language}),'uea'],
  ];
  const rows=[];for(let i=0;i<choices.length;i+=2)rows.push(choices.slice(i,i+2).map(([text,a])=>({text,callback_data:'r:ta:'+id+':'+a})));
  rows.push([{text:t('table.appearance_settings_button',{language}),callback_data:'r:tdisplay:'+id,style:'primary'}],[{text:t('ux.common.back',{language}),callback_data:'r:b:'+id}]);
  return {inline_keyboard:rows};
}
function tableCellKeyboard(block,action,language){
  const buttons=[];for(const [r,row] of tableRows(block).entries())for(const [c,raw] of row.entries()){const span=raw&&typeof raw==='object'&&Number(raw.colspan)>1?' ↔'+Number(raw.colspan):'';buttons.push({text:(r+1)+'×'+(c+1)+span,callback_data:'r:tc:'+block.id+':'+action+':'+r+':'+c});}
  const rows=[];for(let i=0;i<buttons.length;i+=4)rows.push(buttons.slice(i,i+4));rows.push([{text:t('ux.common.back',{language}),callback_data:'r:tm:'+block.id}]);return {inline_keyboard:rows};
}
function tableDisplayKeyboard(block,language){
  const id=String(block.id),d=block.data??{},native=d.native_data&&typeof d.native_data==='object'?d.native_data:{},hasCaption=Boolean(d.caption_rich_text||d.caption_text||d.caption_html||native.caption);
  return {inline_keyboard:[
    [{text:(tableFlag(block,'is_bordered')?'✅ ':'❌ ')+t('table.borders',{language}),callback_data:'r:ttoggle:'+id+':is_bordered'}],
    [{text:(tableFlag(block,'is_striped')?'✅ ':'❌ ')+t('table.striped_rows',{language}),callback_data:'r:ttoggle:'+id+':is_striped'}],
    [{text:(tableFlag(block,'is_compact')?'✅ ':'❌ ')+t('table.compact_mode',{language}),callback_data:'r:ttoggle:'+id+':is_compact'}],
    [{text:t(hasCaption?'table.edit_caption':'table.add_caption',{language}),callback_data:'r:tcaption:'+id}],
    [{text:t('ux.common.back',{language}),callback_data:'r:tm:'+id}],
  ]};
}
function addPrompt(kind,language){
  return {
    paragraph:'أرسل نص الفقرة',preformatted:t('code.add_prompt',{language}),footer:'أرسل نص التذييل',
    mathematical_expression:t('math.add_prompt',{language}),anchor:'أرسل اسم المرساة',
    table:'أرسل صفوف الجدول؛ كل صف بسطر وافصل الأعمدة بعلامة |',
    blockquote:'أرسل نص الاقتباس',pullquote:'أرسل نص الاقتباس البارز',
    collage:'أرسل صور/فيديو للكولاج',slideshow:t('slideshow.send_more',{language,limit:50}),
    map:'أرسل موقعًا من مرفقات Telegram',animation:'أرسل GIF أو Animation',
    audio:t('send_audio',{language}),document:t('send_file',{language}),photo:t('send_photo',{language}),
    video:t('send_video',{language}),voice:t('send_voice',{language}),list:t('list.bullet_prompt',{language}),
  }[kind]??'أرسل المحتوى.';
}
function tableAction(action){
  return {
    sh:{shaded:true,centered:null,all:false,notice:'تم تظليل الخلية'},
    uh:{shaded:false,centered:null,all:false,notice:'تم إلغاء تظليل الخلية'},
    ce:{shaded:null,centered:true,all:false,notice:'تم توسيط الخلية'},
    ue:{shaded:null,centered:false,all:false,notice:'تم إلغاء توسيط الخلية'},
    sha:{shaded:true,centered:null,all:true,notice:'تم تظليل كل الخلايا'},
    uha:{shaded:false,centered:null,all:true,notice:'تم إلغاء تظليل كل الخلايا'},
    cea:{shaded:null,centered:true,all:true,notice:'تم توسيط كل الخلايا'},
    uea:{shaded:null,centered:false,all:true,notice:'تم إلغاء توسيط كل الخلايا'},
  }[action]??null;
}

export async function handleBlockCallback(callback,storageKey,data){
  const language=lang(callback),draft=await loadDraft(storageKey);

  if(data==='r:addmenu'){
    await editCallback(callback,{text:'اختر نوع الـBlock الجديد:',replyMarkup:addBlockKeyboard(language)});
    await answerCallback(callback);return true;
  }
  if(data==='r:add:listmenu'){
    await editCallback(callback,{text:t('list.menu_title',{language}),replyMarkup:listTypeKeyboard({language})});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:addlist:')){
    const kind=data.split(':').at(-1);
    if(!['bullet','numbered','checklist'].includes(kind)){await answerCallback(callback,t('list.invalid',{language}),true);return true;}
    await patchSession(storageKey,{pending_add_kind:'list',pending_list_kind:kind},{state:STATE.ADDING_BLOCK});
    await api.sendMessage({chat_id:callback.message.chat.id,text:t('list.'+kind+'_prompt',{language})});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:add:')){
    const kind=data.slice('r:add:'.length);
    if(kind==='details')return false;
    if(kind==='heading'){
      await editCallback(callback,{text:'اختر مستوى العنوان:',replyMarkup:headingLevelKeyboard('add',null,language)});await answerCallback(callback);return true;
    }
    if(kind==='divider'){
      await remember(storageKey);const result=editorWorkflow.add(draft.blocks,makeBlock('divider',{html:'<hr/>'}));await persist(storageKey,draft,result.blocks);
      await patchSession(storageKey,{current_block_id:result.block.id},{state:STATE.MANAGING});await renderEditor(callback,storageKey,'تمت إضافة الفاصل');await answerCallback(callback);return true;
    }
    if(kind==='anchor'){
      const targets=anchorTargets(draft.blocks);
      if(!targets.length){await answerCallback(callback,t('anchor.no_targets',{language}),true);return true;}
      await editCallback(callback,{text:'اختر البلوك الذي ستؤدي إليه المرساة:',replyMarkup:anchorTargetKeyboard(draft.blocks,{prefix:'r:at',language})});
      await answerCallback(callback);return true;
    }
    const supported=['paragraph','preformatted','footer','mathematical_expression','list','table','blockquote','pullquote','collage','slideshow','map','animation','audio','document','photo','video','voice'];
    if(!supported.includes(kind)){await answerCallback(callback,'نوع غير معروف.',true);return true;}
    await patchSession(storageKey,{pending_add_kind:kind,pending_media_children:[],pending_list_kind:kind==='list'?'bullet':null},{state:STATE.ADDING_BLOCK});
    await api.sendMessage({chat_id:callback.message.chat.id,text:addPrompt(kind,language)});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:hs:')){
    const p=data.split(':'),action=p[2],level=Number(p[3]),id=p[4]??null;
    if(!['add','edit'].includes(action)||level<1||level>6){return false;}
    if(action==='add'){
      await patchSession(storageKey,{pending_add_kind:'heading',pending_heading_size:level},{state:STATE.ADDING_BLOCK});
      await api.sendMessage({chat_id:callback.message.chat.id,text:'اخترت H'+level+'. أرسل نص العنوان الآن.'});
    }else{
      const block=getBlockById(draft.blocks,id);
      if(!block||block.type!=='heading'){await answerCallback(callback,'هذا العنوان لم يعد موجودًا.',true);return true;}
      await patchSession(storageKey,{edit_block_id:id,pending_heading_size:level,edit_field:'content'},{state:STATE.EDITING_BLOCK});
      await api.sendMessage({chat_id:callback.message.chat.id,text:'اخترت H'+level+'. أرسل نص العنوان الجديد الآن.'});
    }
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:at:')){
    const targetId=data.slice('r:at:'.length);
    if(!getBlockById(draft.blocks,targetId)){await answerCallback(callback,t('anchor.no_targets',{language}),true);return true;}
    await patchSession(storageKey,{pending_add_kind:'anchor',pending_anchor_target_id:targetId},{state:STATE.ADDING_BLOCK});
    await api.sendMessage({chat_id:callback.message.chat.id,text:'أرسل اسم المرساة.'});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:b:')){
    const id=data.slice('r:b:'.length),block=getBlockById(draft.blocks,id);
    if(!block){await answerCallback(callback,t('missing_block',{language}),true);await renderEditor(callback,storageKey);return true;}
    await patchSession(storageKey,{current_block_id:id},{state:STATE.MANAGING});
    await editCallback(callback,{text:blockSummary(block,draft.blocks,language),replyMarkup:blockEditorKeyboard(block,draft.blocks,language)});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:dup:')){
    const id=data.slice('r:dup:'.length);
    if(!getBlockById(draft.blocks,id)){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    const result=editorWorkflow.duplicate(draft.blocks,id,{after:true});
    try{validateEditorLimits(result.blocks);}catch(error){await answerCallback(callback,String(error.message??error),true);return true;}
    await remember(storageKey);await persist(storageKey,draft,result.blocks);await patchSession(storageKey,{current_block_id:result.block?.id??null},{state:STATE.MANAGING});
    await editCallback(callback,{text:blockSummary(result.block,result.blocks,language),replyMarkup:blockEditorKeyboard(result.block,result.blocks,language)});
    await answerCallback(callback,t('block.duplicated',{language}));return true;
  }
  if(data.startsWith('r:d:')){
    const id=data.slice('r:d:'.length),block=getBlockById(draft.blocks,id);
    if(!block){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    const anchors=linkedAnchors(draft.blocks,id);
    const text=anchors.length?t('anchor.target_delete_warning',{language,count:anchors.length}):'هل تريد حذف هذا الجزء؟';
    await editCallback(callback,{text,replyMarkup:deleteConfirmationKeyboard(id,language)});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:dc:')||data.startsWith('r:adc:')){
    const id=data.split(':').at(-1),result=editorWorkflow.delete(draft.blocks,id);
    if(!result.changed){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await remember(storageKey);await persist(storageKey,draft,result.blocks);await patchSession(storageKey,{current_block_id:null},{state:STATE.MANAGING});
    await renderEditor(callback,storageKey,'تم الحذف');await answerCallback(callback,'تم الحذف');return true;
  }
  if(data.startsWith('r:adr:')){
    const p=data.split(':'),id=p[2],target=p[3];
    const blocks=clone(draft.blocks);
    if(!retargetLinkedAnchors(blocks,id,target)){await answerCallback(callback,t('editor.block_missing',{language}),true);return true;}
    const result=editorWorkflow.delete(blocks,id);await remember(storageKey);await persist(storageKey,draft,result.blocks);
    await patchSession(storageKey,{current_block_id:null},{state:STATE.MANAGING});await renderEditor(callback,storageKey,t('anchor.deleted',{language}));await answerCallback(callback);return true;
  }
  if(data.startsWith('r:am:')){
    const id=data.slice('r:am:'.length),anchor=getBlockById(draft.blocks,id);
    if(!anchor||anchor.type!=='anchor'){await answerCallback(callback,t('editor.block_missing',{language}),true);return true;}
    await editCallback(callback,{text:t('anchor.choose_target',{language,name:anchorDisplayName(anchor)}),replyMarkup:anchorTargetKeyboard(draft.blocks,{prefix:'r:art:'+id,back:'r:b:'+id,language})});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:art:')){
    const p=data.split(':'),anchorId=p[2],targetId=p[3],blocks=clone(draft.blocks);
    if(!setAnchorTarget(blocks,anchorId,targetId)){await answerCallback(callback,t('editor.block_missing',{language}),true);return true;}
    await remember(storageKey);await persist(storageKey,draft,blocks);const anchor=getBlockById(blocks,anchorId);
    await editCallback(callback,{text:blockSummary(anchor,blocks,language),replyMarkup:blockEditorKeyboard(anchor,blocks,language)});
    await answerCallback(callback,t('anchor.target_changed',{language}));return true;
  }
  if(data.startsWith('r:m:')){
    const id=data.slice('r:m:'.length);
    if(!getBlockById(draft.blocks,id)){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await editCallback(callback,{text:'اختر الموقع الجديد:',replyMarkup:blockPositionKeyboard(draft.blocks,id,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:mu:')||data.startsWith('r:md:')){
    const id=data.split(':').at(-1),ordered=[...draft.blocks].sort((a,b)=>Number(a.position??0)-Number(b.position??0)),block=getBlockById(ordered,id);
    if(!block){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    const current=ordered.indexOf(block),target=data.startsWith('r:mu:')?current-1:current+1;
    if(target<0||target>=ordered.length){await answerCallback(callback,'هذا الجزء وصل إلى نهاية الترتيب.');return true;}
    const result=editorWorkflow.move(draft.blocks,id,target);await remember(storageKey);await persist(storageKey,draft,result.blocks);
    const moved=getBlockById(result.blocks,id);await editCallback(callback,{text:blockSummary(moved,result.blocks,language),replyMarkup:blockEditorKeyboard(moved,result.blocks,language)});await answerCallback(callback,'تم تغيير الموقع');return true;
  }
  if(data.startsWith('r:mt:')){
    const p=data.split(':'),id=p[2],target=Number(p[3]),result=editorWorkflow.move(draft.blocks,id,target);
    if(!result.changed){await answerCallback(callback,'تعذر نقل الجزء.',true);return true;}
    await remember(storageKey);await persist(storageKey,draft,result.blocks);await patchSession(storageKey,{current_block_id:null},{state:STATE.MANAGING});await renderEditor(callback,storageKey);await answerCallback(callback,'تم تغيير الموقع');return true;
  }
  if(data.startsWith('r:e:')){
    const id=data.slice('r:e:'.length),block=getBlockById(draft.blocks,id);
    if(!block){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    if(block.type==='divider'){await answerCallback(callback,'الفاصل ما عنده محتوى قابل للتعديل.',true);return true;}
    if(block.type==='heading'){await editCallback(callback,{text:'اختر مستوى العنوان الجديد:',replyMarkup:headingLevelKeyboard('edit',id,language)});await answerCallback(callback);return true;}
    await patchSession(storageKey,{edit_block_id:id,current_block_id:id,edit_field:'content'},{state:STATE.EDITING_BLOCK});
    await api.sendMessage({chat_id:callback.message.chat.id,text:'أرسل المحتوى الجديد من النوع نفسه.'});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:f:')){
    const p=data.split(':'),id=p[2],field=p[3],block=getBlockById(draft.blocks,id);
    if(!block){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await patchSession(storageKey,{edit_block_id:id,current_block_id:id,edit_field:field},{state:STATE.EDITING_BLOCK});
    const prompt=field==='summary'?'أرسل عنوان «تفاصيل» الجديد':field==='caption'?'أرسل الوصف الجديد، أو /remove لحذفه':'أرسل اسم الكاتب/المصدر الجديد، أو /remove لحذفه';
    await api.sendMessage({chat_id:callback.message.chat.id,text:prompt});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:ct:')){
    const p=data.split(':'),id=p[2],index=Number(p[3]),block=getBlockById(draft.blocks,id);
    if(!block||block.type!=='list'||block.data?.kind!=='checklist'||!block.data.items?.[index]){await answerCallback(callback,t('list.missing_task',{language}),true);return true;}
    await remember(storageKey);block.data.items[index].is_checked=!Boolean(block.data.items[index].is_checked);await saveDraft(storageKey,draft);
    await editCallback(callback,{text:blockSummary(block,draft.blocks,language),replyMarkup:blockEditorKeyboard(block,draft.blocks,language)});
    await answerCallback(callback,t(block.data.items[index].is_checked?'list.marked_done':'list.marked_pending',{language}));return true;
  }
  if(data.startsWith('r:peek:')||data.startsWith('r:pv:')){
    const id=data.split(':').at(-1),block=getBlockById(draft.blocks,id);
    if(!block){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await answerCallback(callback,t('preview_generating',{language}));
    try{await sendRichMessagePreview(callback.from.id,[block],[],{});}catch(error){console.error(error);await api.sendMessage({chat_id:callback.from.id,text:t('preview_failed',{language})});}
    return true;
  }
  if(data.startsWith('r:tm:')){
    const id=data.slice('r:tm:'.length),block=getBlockById(draft.blocks,id);
    if(!block||block.type!=='table'||!tableRows(block).length){await answerCallback(callback,'هذا الجدول لم يعد موجودًا أو لا يحتوي خلايا.',true);return true;}
    await editCallback(callback,{text:'إعدادات خلايا الجدول\n\nاختر العملية التي تريد تطبيقها:',replyMarkup:tableOptionsKeyboard(id,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:ta:')){
    const p=data.split(':'),id=p[2],action=p[3],settings=tableAction(action),block=getBlockById(draft.blocks,id);
    if(!block||block.type!=='table'||!settings){await answerCallback(callback,t('invalid',{language}),true);return true;}
    if(settings.all){
      const editable=clone(block);if(!setAllTableCellsStyle(editable,{shaded:settings.shaded,centered:settings.centered})){await answerCallback(callback,'تعذر تعديل خلايا الجدول.',true);return true;}
      const result=editorWorkflow.replace(draft.blocks,id,editable);await remember(storageKey);await persist(storageKey,draft,result.blocks);
      await editCallback(callback,{text:'إعدادات خلايا الجدول',replyMarkup:tableOptionsKeyboard(id,language)});await answerCallback(callback,settings.notice);return true;
    }
    await editCallback(callback,{text:'اختر الخلية المطلوبة:',replyMarkup:tableCellKeyboard(block,action,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:tc:')){
    const p=data.split(':'),id=p[2],action=p[3],row=Number(p[4]),column=Number(p[5]),settings=tableAction(action),block=getBlockById(draft.blocks,id);
    if(!block||!settings){await answerCallback(callback,t('invalid',{language}),true);return true;}
    const editable=clone(block);if(!setTableCellStyle(editable,row,column,{shaded:settings.shaded,centered:settings.centered})){await answerCallback(callback,'هذه الخلية لم تعد موجودة.',true);return true;}
    const result=editorWorkflow.replace(draft.blocks,id,editable);await remember(storageKey);await persist(storageKey,draft,result.blocks);
    await editCallback(callback,{text:'إعدادات خلايا الجدول',replyMarkup:tableOptionsKeyboard(id,language)});await answerCallback(callback,settings.notice);return true;
  }
  if(data.startsWith('r:tdisplay:')){
    const id=data.slice('r:tdisplay:'.length),block=getBlockById(draft.blocks,id);
    if(!block||block.type!=='table'){await answerCallback(callback,'هذا الجدول لم يعد موجودًا.',true);return true;}
    await editCallback(callback,{text:'إعدادات شكل الجدول',replyMarkup:tableDisplayKeyboard(block,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:ttoggle:')){
    const p=data.split(':'),id=p[2],field=p[3],block=getBlockById(draft.blocks,id);
    if(!block||block.type!=='table'||!['is_bordered','is_striped','is_compact'].includes(field)){await answerCallback(callback,t('invalid',{language}),true);return true;}
    const editable=clone(block),table=editableTableData(editable);if(!table){await answerCallback(callback,'تعذر تعديل الجدول.',true);return true;}
    table[field]=!tableFlag(block,field);const result=editorWorkflow.replace(draft.blocks,id,editable);await remember(storageKey);await persist(storageKey,draft,result.blocks);
    const updated=getBlockById(result.blocks,id);await editCallback(callback,{text:'إعدادات شكل الجدول',replyMarkup:tableDisplayKeyboard(updated,language)});await answerCallback(callback,'تم تحديث الجدول');return true;
  }
  if(data.startsWith('r:tcaption:')){
    const id=data.slice('r:tcaption:'.length),block=getBlockById(draft.blocks,id);
    if(!block||block.type!=='table'){await answerCallback(callback,'هذا الجدول لم يعد موجودًا.',true);return true;}
    await patchSession(storageKey,{table_caption_block_id:id},{state:STATE.EDITING_TABLE_CAPTION});
    await api.sendMessage({chat_id:callback.message.chat.id,text:'أرسل عنوان الجدول. لإزالة العنوان أرسل /empty'});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:slides:')){
    const session=await loadSession(storageKey),kind=String(session.data.pending_add_kind??'slideshow'),children=session.data.pending_media_children??[];
    if(data==='r:slides:add'){await answerCallback(callback,'أرسل المزيد.');return true;}
    if(data==='r:slides:continue'){
      if(!children.length){await answerCallback(callback,'أضف صورة أو فيديو أولًا.',true);return true;}
      const block=makeBlock(kind,{children,caption_rich_text:null,credit_rich_text:null});
      await remember(storageKey);const result=editorWorkflow.add(draft.blocks,block);await persist(storageKey,draft,result.blocks);
      await patchSession(storageKey,{pending_add_kind:null,pending_media_children:null,current_block_id:result.block.id},{state:STATE.MANAGING});
      await renderEditor(callback,storageKey,'تمت إضافة '+(kind==='collage'?'الكولاج':'عرض الشرائح'));await answerCallback(callback);return true;
    }
    await answerCallback(callback);return true;
  }
  return false;
}
