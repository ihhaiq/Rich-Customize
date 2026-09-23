import { api } from 'sdk';
import { resetSession, saveSession, loadSession, patchSession, STATE } from 'lib/editor/session';
import { loadDraft } from 'lib/editor/draft';
import { undo, redo } from 'lib/editor/history';
import { normalizeBlockScrollOffset } from 'lib/editor/view_state';
import { sendRichMessagePreview } from 'lib/renderer';
import { recordOperation } from 'lib/usage';
import { sendAllBlocksShowcase } from 'lib/showcase';
import { t, languageForUser } from 'lib/i18n';
import { richEditorKeyboard, editorToolsKeyboard, errorRecoveryKeyboard } from 'lib/ui/keyboards';
import { answerCallback, editCallback, renderEditor, prepareMessageButtons, friendlyRichError } from 'lib/router/support';

function language(callback){return languageForUser(callback?.from);}
function initialData(callback){
  return {
    blocks:[],message_buttons:[],buttons_per_row:1,buttons_align:'center',
    current_page_id:null,current_page_title:null,
    management_chat_id:callback.message?.chat?.id??callback.from.id,
    management_message_id:callback.message?.message_id??null,
    editor_last_activity_at:Math.floor(Date.now()/1000),
    pages_search_query:'',pages_sort_mode:'updated',block_scroll_offset:0,
    block_scroll_enabled:true,current_block_id:null,
  };
}

export async function handleEditorCallback(callback,storageKey,data){
  const lang=language(callback);
  if(data==='r:starteditor'){
    await resetSession(storageKey);
    const next=initialData(callback);
    await saveSession(storageKey,STATE.MANAGING,next);
    if(callback.message){
      await editCallback(callback,{
        text:t('editor.empty_hint',{language:lang}),
        replyMarkup:richEditorKeyboard([],[],{language:lang}),
      });
    }else{
      const sent=await api.sendMessage({chat_id:callback.from.id,text:t('editor.empty_hint',{language:lang}),reply_markup:richEditorKeyboard([],[],{language:lang})});
      await patchSession(storageKey,{management_chat_id:sent.chat.id,management_message_id:sent.message_id},{state:STATE.MANAGING});
    }
    await answerCallback(callback);return true;
  }
  if(data==='r:no'){await answerCallback(callback,t('editor.current_position',{language:lang}));return true;}
  if(data==='r:back'){
    await patchSession(storageKey,{
      current_block_id:null,current_button_id:null,pending_button_action:null,pending_button_text:null,
      pending_add_kind:null,pending_child_type:null,edit_block_id:null,edit_field:null,
      nested_details_id:null,nested_child_id:null,nested_action:null,block_scroll_enabled:true,
    },{state:STATE.MANAGING});
    await renderEditor(callback,storageKey);await answerCallback(callback);return true;
  }
  if(data.startsWith('r:blockscroll:')){
    const requested=Number.parseInt(data.split(':').at(-1),10);
    const draft=await loadDraft(storageKey),offset=normalizeBlockScrollOffset(draft.blocks.length,Number.isFinite(requested)?requested:0);
    await patchSession(storageKey,{block_scroll_offset:offset},{state:STATE.MANAGING});
    await editCallback(callback,{
      text:(await import('lib/editor/ui')).editorDashboard(draft),
      replyMarkup:richEditorKeyboard(draft.blocks,draft.message_buttons,{offset,language:lang}),
    });
    await answerCallback(callback);return true;
  }
  if(data==='r:tools'){
    await patchSession(storageKey,{block_scroll_enabled:false},{state:STATE.MANAGING});
    await editCallback(callback,{text:t('editor.tools_text',{language:lang}),replyMarkup:editorToolsKeyboard(lang)});
    await answerCallback(callback);return true;
  }
  if(data==='r:undo'){
    const restored=await undo(storageKey);
    if(!restored){await answerCallback(callback,t('editor.undo_empty',{language:lang}),true);return true;}
    await patchSession(storageKey,{}, {state:STATE.MANAGING});
    await renderEditor(callback,storageKey);await answerCallback(callback,t('editor.undo_done',{language:lang}));return true;
  }
  if(data==='r:redo'){
    const restored=await redo(storageKey);
    if(!restored){await answerCallback(callback,t('editor.redo_empty',{language:lang}),true);return true;}
    await patchSession(storageKey,{}, {state:STATE.MANAGING});
    await renderEditor(callback,storageKey);await answerCallback(callback,t('editor.redo_done',{language:lang}));return true;
  }
  if(data==='r:result'){
    const draft=await loadDraft(storageKey);
    if(!draft.blocks.length){await answerCallback(callback,'المحرر فارغ.',true);return true;}
    await answerCallback(callback,t('preview_generating',{language:lang}));
    try{
      const prepared=await prepareMessageButtons(draft.message_buttons);
      const sent=await sendRichMessagePreview(callback.from.id,draft.blocks,prepared,{
        buttonsPerRow:draft.buttons_per_row,buttonsAlign:draft.buttons_align,sourcePageId:draft.current_page_id,
      });
      const session=await loadSession(storageKey);
      for(const id of session.data.preview_message_ids??[]){try{await api.deleteMessage({chat_id:callback.from.id,message_id:id});}catch{}}
      await patchSession(storageKey,{preview_message_ids:(sent??[]).map(x=>x.message_id)},{state:STATE.MANAGING});
      await recordOperation('preview',{success:true});
      await renderEditor(callback,storageKey,'✅ '+t('preview_ready',{language:lang}));
    }catch(error){
      console.error('preview failed',error);await recordOperation('preview',{success:false});
      await api.sendMessage({chat_id:callback.from.id,text:t('preview_failed',{language:lang})+'\n'+t('common.reason',{language:lang,reason:friendlyRichError(error)}),reply_markup:errorRecoveryKeyboard(lang)});
      await renderEditor(callback,storageKey,'⚠️ '+t('preview_failed',{language:lang}));
    }
    return true;
  }
  if(data==='r:showcase'){
    await answerCallback(callback,t('preview_generating',{language:lang}));
    try{await sendAllBlocksShowcase(callback.from.id,callback.from.id,lang);}
    catch(error){console.error('showcase failed',error);await api.sendMessage({chat_id:callback.from.id,text:t('preview_failed',{language:lang})});}
    return true;
  }
  return false;
}
