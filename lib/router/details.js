import { api } from 'sdk';
import { loadDraft, saveDraft } from 'lib/editor/draft';
import { remember } from 'lib/editor/history';
import { editorWorkflow } from 'lib/editor/workflow';
import { makeBlock } from 'lib/editor/models';
import {
  detailsChildren, findDetailsChild, addDetailsChild, deleteDetailsChild,
  moveDetailsChild,
} from 'lib/details';
import { getBlockById, getBlockButtonText } from 'lib/blocks';
import { compatibleChildBlockTypes } from 'lib/editor/specs';
import { patchSession, STATE } from 'lib/editor/session';
import { headingLevelKeyboard, listTypeKeyboard, blockEditorKeyboard } from 'lib/ui/keyboards';
import { answerCallback, editCallback, renderEditor } from 'lib/router/support';
import { sendRichMessagePreview } from 'lib/renderer';
import { t, languageForUser } from 'lib/i18n';

function lang(callback){return languageForUser(callback?.from);}
function clone(v){return v==null?v:JSON.parse(JSON.stringify(v));}
function contentKeyboard(count,language){return {inline_keyboard:[
  [{text:'➕ بلوك داخلي',callback_data:'r:details:add',style:'primary'}],
  [{text:'✅ إنهاء التفاصيل ('+count+')',callback_data:'r:details:finish',style:'success'}],
  [{text:t('common.cancel',{language}),callback_data:'r:details:cancel'}],
]};}
function childTypeKeyboard(language){
  const types=compatibleChildBlockTypes('details'),rows=[];
  for(let i=0;i<types.length;i+=2)rows.push(types.slice(i,i+2).map(type=>({text:t('block.'+type,{language}),callback_data:'r:details:type:'+type})));
  rows.push([{text:t('ux.common.back',{language}),callback_data:'r:details:content'}]);return {inline_keyboard:rows};
}
function innerListText(details,language){return [t('details.inner_list_title',{language}),t('details.inner_count',{language,count:detailsChildren(details).length})].join('\n');}
function innerListKeyboard(details,language){
  const children=detailsChildren(details),rows=children.map((child,i)=>[{text:getBlockButtonText(child,i,language),callback_data:'r:di:'+details.id+':'+child.id,style:'primary'}]);
  rows.push([{text:t('ux.common.back',{language}),callback_data:'r:b:'+details.id}]);return {inline_keyboard:rows};
}
function innerPage(details,child,language){
  const children=detailsChildren(details),index=children.findIndex(x=>x.id===child.id);
  return [t('details.inner_settings_title',{language}),t('details.inner_type',{language,name:t('block.'+String(child.type??'content'),{language})}),t('details.inner_position',{language,current:index+1,total:children.length})].join('\n');
}
function innerKeyboard(details,child,language){
  const children=detailsChildren(details),i=children.findIndex(x=>x.id===child.id),rows=[
    [{text:t('preview_block',{language}),callback_data:'r:dip:'+details.id+':'+child.id,style:'primary'}],
  ];
  if(child.type!=='divider')rows.push([{text:t('edit_content',{language}),callback_data:'r:die:'+details.id+':'+child.id}]);
  if(['photo','video','animation','audio','voice','document','collage','slideshow','map'].includes(child.type))rows.push([{text:t('details.inner_send_caption',{language}),callback_data:'r:dif:'+details.id+':'+child.id+':caption'},{text:t('details.inner_credit',{language}),callback_data:'r:dif:'+details.id+':'+child.id+':credit'}]);
  if(['blockquote','pullquote'].includes(child.type))rows.push([{text:t('details.inner_credit',{language}),callback_data:'r:dif:'+details.id+':'+child.id+':credit'}]);
  if(!['footer','divider','anchor'].includes(child.type))rows.push([{text:t('details.inner_add_footer',{language}),callback_data:'r:dif:'+details.id+':'+child.id+':add_footer'}]);
  rows.push([{text:t('delete',{language}),callback_data:'r:did:'+details.id+':'+child.id,style:'danger'}]);
  rows.push([
    i<=0?{text:t('block.move_up',{language}),disabled:{}}:{text:t('block.move_up',{language}),callback_data:'r:dimu:'+details.id+':'+child.id},
    i>=children.length-1?{text:t('block.move_down',{language}),disabled:{}}:{text:t('block.move_down',{language}),callback_data:'r:dimd:'+details.id+':'+child.id},
  ]);
  rows.push([{text:t('ux.common.back',{language}),callback_data:'r:dim:'+details.id}]);return {inline_keyboard:rows};
}
function childPrompt(type,language){
  return {
    paragraph:t('details.send_paragraph',{language}),preformatted:t('code.add_prompt',{language}),footer:t('details.send_footer',{language}),
    mathematical_expression:t('math.add_prompt',{language}),anchor:t('details.send_anchor',{language}),table:t('details.send_table',{language}),
    blockquote:t('details.send_quote',{language}),pullquote:t('details.send_pullquote',{language}),collage:t('details.send_collage',{language}),
    slideshow:t('slideshow.send_more',{language,limit:50}),map:t('details.send_map',{language}),animation:t('details.send_animation',{language}),
    audio:t('details.send_audio',{language}),document:t('details.send_document',{language}),photo:t('details.send_photo',{language}),
    video:t('details.send_video',{language}),voice:t('details.send_voice',{language}),
  }[type]??t('details.inner_send_content',{language});
}

export async function handleDetailsCallback(callback,storageKey,data){
  const language=lang(callback),draft=await loadDraft(storageKey);

  if(data==='r:add:details'){
    await patchSession(storageKey,{pending_add_kind:'details',details_phase:'summary',details_summary:null,details_children:[],pending_child_type:null},{state:STATE.ADDING_BLOCK});
    await api.sendMessage({chat_id:callback.message.chat.id,text:t('details.summary_prompt',{language})});await answerCallback(callback);return true;
  }
  if(data==='r:details:add'){
    await patchSession(storageKey,{details_phase:'child_select',pending_child_type:null},{state:STATE.ADDING_BLOCK});
    await editCallback(callback,{text:t('details.choose_child',{language}),replyMarkup:childTypeKeyboard(language)});await answerCallback(callback);return true;
  }
  if(data==='r:details:content'){
    const session=(await import('lib/editor/session')).loadSession?await (await import('lib/editor/session')).loadSession(storageKey):null;
    const count=session?.data?.details_children?.length??0;
    await patchSession(storageKey,{details_phase:'content',pending_child_type:null},{state:STATE.ADDING_BLOCK});
    await editCallback(callback,{text:t('details.inner_count',{language,count}),replyMarkup:contentKeyboard(count,language)});await answerCallback(callback);return true;
  }
  if(data==='r:details:cancel'){
    await patchSession(storageKey,{pending_add_kind:null,details_phase:null,details_summary:null,details_children:null,pending_child_type:null},{state:STATE.MANAGING});
    await renderEditor(callback,storageKey,t('details.cancelled',{language}));await answerCallback(callback);return true;
  }
  if(data==='r:details:finish'){
    const { loadSession }=await import('lib/editor/session');const session=await loadSession(storageKey);
    const summary=String(session.data.details_summary??''),children=session.data.details_children??[];
    if(!summary){await answerCallback(callback,t('details.expired',{language}),true);return true;}
    if(!children.length){await answerCallback(callback,t('details.child_required',{language}),true);return true;}
    const block=makeBlock('details',{summary_rich_text:summary,children:clone(children)});
    await remember(storageKey);const result=editorWorkflow.add(draft.blocks,block);draft.blocks=result.blocks;await saveDraft(storageKey,draft);
    await patchSession(storageKey,{pending_add_kind:null,details_phase:null,details_summary:null,details_children:null,pending_child_type:null,current_block_id:result.block.id},{state:STATE.MANAGING});
    await renderEditor(callback,storageKey,t('details.added',{language}));await answerCallback(callback,t('details.added',{language}));return true;
  }
  if(data.startsWith('r:details:type:')){
    const type=data.slice('r:details:type:'.length);
    if(!compatibleChildBlockTypes('details').includes(type)){await answerCallback(callback,t('details.invalid_child',{language}),true);return true;}
    if(type==='divider'){
      const { loadSession }=await import('lib/editor/session');const session=await loadSession(storageKey),children=[...(session.data.details_children??[])];
      children.push(makeBlock('divider',{html:'<hr/>'},{position:children.length}));
      await patchSession(storageKey,{details_children:children,details_phase:'content',pending_child_type:null},{state:STATE.ADDING_BLOCK});
      await editCallback(callback,{text:t('details.inner_count',{language,count:children.length}),replyMarkup:contentKeyboard(children.length,language)});
      await answerCallback(callback,t('details.child_added',{language}));return true;
    }
    if(type==='heading'){await patchSession(storageKey,{pending_child_type:'heading',details_phase:'child_heading'},{state:STATE.ADDING_BLOCK});await editCallback(callback,{text:t('details.choose_heading',{language}),replyMarkup:headingLevelKeyboard('details',null,language)});await answerCallback(callback);return true;}
    if(type==='list'){await editCallback(callback,{text:t('list.menu_title',{language}),replyMarkup:listTypeKeyboard({prefix:'r:details:list',back:'r:details:add',language})});await answerCallback(callback);return true;}
    await patchSession(storageKey,{pending_child_type:type,details_phase:'child_content'},{state:STATE.ADDING_BLOCK});
    await editCallback(callback,{text:childPrompt(type,language),replyMarkup:{inline_keyboard:[[{text:t('ux.common.back',{language}),callback_data:'r:details:add'}]]}});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:details:list:')){
    const kind=data.split(':').at(-1);if(!['bullet','numbered','checklist'].includes(kind)){await answerCallback(callback,t('list.invalid',{language}),true);return true;}
    await patchSession(storageKey,{pending_child_type:'list',pending_child_list_kind:kind,details_phase:'child_content'},{state:STATE.ADDING_BLOCK});
    await editCallback(callback,{text:t('list.'+kind+'_prompt',{language}),replyMarkup:{inline_keyboard:[[{text:t('ux.common.back',{language}),callback_data:'r:details:add'}]]}});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:hs:details:')){
    const level=Number(data.split(':').at(-1));if(level<1||level>6){await answerCallback(callback,t('details.invalid_heading',{language}),true);return true;}
    await patchSession(storageKey,{pending_child_type:'heading',pending_child_heading_size:level,details_phase:'child_content'},{state:STATE.ADDING_BLOCK});
    await editCallback(callback,{text:t('details.heading_selected',{language,level}),replyMarkup:{inline_keyboard:[[{text:t('ux.common.back',{language}),callback_data:'r:details:add'}]]}});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:dim:')){
    const id=data.slice('r:dim:'.length),details=getBlockById(draft.blocks,id);
    if(!details||details.type!=='details'){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await editCallback(callback,{text:innerListText(details,language),replyMarkup:innerListKeyboard(details,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:di:')){
    const p=data.slice('r:di:'.length).split(':');if(p.length!==2)return false;
    const details=getBlockById(draft.blocks,p[0]),child=details?findDetailsChild(details,p[1]):null;
    if(!details||!child){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await editCallback(callback,{text:innerPage(details,child,language),replyMarkup:innerKeyboard(details,child,language)});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:dip:')){
    const p=data.slice('r:dip:'.length).split(':'),details=getBlockById(draft.blocks,p[0]),child=details?findDetailsChild(details,p[1]):null;
    if(!child){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await answerCallback(callback,t('preview_generating',{language}));try{await sendRichMessagePreview(callback.from.id,[child],[],{});}catch(error){console.error(error);await api.sendMessage({chat_id:callback.from.id,text:t('preview_failed',{language})});}return true;
  }
  if(data.startsWith('r:die:')){
    const p=data.slice('r:die:'.length).split(':'),details=getBlockById(draft.blocks,p[0]),child=details?findDetailsChild(details,p[1]):null;
    if(!child||child.type==='divider'){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await patchSession(storageKey,{nested_details_id:p[0],nested_child_id:p[1],nested_action:'content',edit_block_id:null,edit_field:null},{state:STATE.EDITING_BLOCK});
    await api.sendMessage({chat_id:callback.message.chat.id,text:t('details.inner_send_content',{language})});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:dif:')){
    const p=data.slice('r:dif:'.length).split(':');if(p.length!==3){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    const details=getBlockById(draft.blocks,p[0]),child=details?findDetailsChild(details,p[1]):null,action=p[2];
    if(!child||!['caption','credit','add_footer'].includes(action)){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await patchSession(storageKey,{nested_details_id:p[0],nested_child_id:p[1],nested_action:action,edit_block_id:null,edit_field:null},{state:STATE.EDITING_BLOCK});
    const key=action==='caption'?'details.inner_send_caption':action==='credit'?'details.inner_send_credit':'details.inner_send_footer';
    await api.sendMessage({chat_id:callback.message.chat.id,text:t(key,{language})});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:did:')){
    const p=data.slice('r:did:'.length).split(':'),details=getBlockById(draft.blocks,p[0]),child=details?findDetailsChild(details,p[1]):null;
    if(!child){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await editCallback(callback,{text:t('details.inner_delete_question',{language}),replyMarkup:{inline_keyboard:[[{text:t('ux.common.yes_delete',{language}),callback_data:'r:didok:'+p[0]+':'+p[1],style:'danger'},{text:t('ux.common.cancel',{language}),callback_data:'r:di:'+p[0]+':'+p[1]}]]}});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:didok:')){
    const p=data.slice('r:didok:'.length).split(':'),details=getBlockById(draft.blocks,p[0]);
    if(!details||!deleteDetailsChild(details,p[1])){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    await remember(storageKey);await saveDraft(storageKey,draft);await editCallback(callback,{text:innerListText(details,language),replyMarkup:innerListKeyboard(details,language)});await answerCallback(callback,t('details.inner_deleted',{language}));return true;
  }
  if(data.startsWith('r:dimu:')||data.startsWith('r:dimd:')){
    const prefix=data.startsWith('r:dimu:')?'r:dimu:':'r:dimd:',p=data.slice(prefix.length).split(':'),details=getBlockById(draft.blocks,p[0]),child=details?findDetailsChild(details,p[1]):null;
    if(!details||!child){await answerCallback(callback,t('missing_block',{language}),true);return true;}
    const children=detailsChildren(details),current=children.indexOf(child),target=prefix==='r:dimu:'?current-1:current+1;
    if(target<0||target>=children.length){await answerCallback(callback,t('details.inner_current_position',{language}));return true;}
    await remember(storageKey);if(!moveDetailsChild(details,p[1],target)){await answerCallback(callback,t('details.inner_current_position',{language}));return true;}
    await saveDraft(storageKey,draft);const moved=findDetailsChild(details,p[1]);await editCallback(callback,{text:innerPage(details,moved,language),replyMarkup:innerKeyboard(details,moved,language)});await answerCallback(callback,t('details.inner_moved',{language}));return true;
  }
  if(data.startsWith('r:e:')){
    const id=data.slice('r:e:'.length),details=getBlockById(draft.blocks,id);
    if(!details||details.type!=='details')return false;
    await patchSession(storageKey,{edit_block_id:id,current_block_id:id,edit_field:'content',nested_details_id:null,nested_child_id:null,nested_action:null},{state:STATE.EDITING_BLOCK});
    await api.sendMessage({chat_id:callback.message.chat.id,text:t('details.replace_content_prompt',{language})});await answerCallback(callback);return true;
  }
  if(data.startsWith('r:f:')){
    const p=data.split(':'),id=p[2],field=p[3],details=getBlockById(draft.blocks,id);
    if(field!=='summary'||!details||details.type!=='details')return false;
    await patchSession(storageKey,{edit_block_id:id,current_block_id:id,edit_field:'summary'},{state:STATE.EDITING_BLOCK});
    await api.sendMessage({chat_id:callback.message.chat.id,text:t('details.summary_edit_prompt',{language})});await answerCallback(callback);return true;
  }
  return false;
}
