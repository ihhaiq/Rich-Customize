import { resolveSavedPageReference } from 'lib/page-delivery';
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { richPages, legacyStates } from 'schema';
import { resolveUserLanguage } from 'lib/i18n';
import { blockId, makeBlock, validateEditorLimits } from 'lib/editor-blocks';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { buildInputRichMessage } from 'lib/editor-renderer';
import { persistPage } from 'lib/editor-pages';
import { acquireEditorMutationLock, releaseEditorMutationLock, loadEditorSession, createEditorSession, updateEditorSession } from 'lib/editor-session';
import { buildEditorKeyboard, editorDashboardRichMessage } from 'lib/editor-block-ui';
import { tutorialCopy } from 'lib/tutorial-copy';
import { tutorialView } from 'lib/tutorial-view';
import { readTutorial, initialTutorial, writeTutorial } from 'lib/tutorial-store';
import { clone, orderBlocks, templateBlocks, TEMPLATE_IDS, TYPES, advice, applyAdvice, blockAt, fromInput, exampleBlock } from 'lib/tutorial-model';
import { logError } from 'lib/error-log';

const now=()=>Math.floor(Date.now()/1000);
const actor=source=>source?.from?.id;
const privateActor=source=>source?.chat?.type==='private' && Number(source.chat.id)===Number(actor(source));
function event(state,name){state.events={...state.events,[name]:state.events?.[name]||now()};}
function changeContent(state,blocks){state.undo=clone(state.blocks);state.blocks=blocks;state.dirty=true;orderBlocks(state.blocks);state.previewOffset=0;state.pending=null;state.previewFailed=false;state.step='preview';event(state,'first_block');}
async function validate(state,entitlement){
  const result=validateEditorLimits(state.blocks,state.userId,{entitlement});
  if(!result.ok)throw new Error('EDITOR_LIMIT:'+result.code);
  if(state.blocks.length)buildInputRichMessage(state.blocks,{userId:state.userId,entitlement});
}
function errorNotice(error,c){
  const code=String(error?.code||error?.message||'');
  if(error?.pageNameExists || code==='TUTORIAL_NAME')return c.name;
  if(error?.pageLimit)return c.pageLimit;
  if(error?.pageBusy || /CONFLICT|PAGE_BUSY/.test(code))return c.busy;
  if(/LIMIT/.test(code))return c.limit;
  if(/^TUTORIAL_(INPUT|MEDIA|LOCATION)/.test(code))return c.invalid;
  return c.failed;
}
async function display(state,locale,entitlement,notice='') {
  if(Number(state.renderAfter||0)>now())return state;
  let renderState=state;
  if(state.step==='cbd' && state.demoPage){
    const resolved=await resolveSavedPageReference(state.pageId,state.userId);
    const page=resolved.status==='found'?await db.select().from(richPages).where(eq(richPages.pageId,resolved.pageId)).get():null;
    if(page && Number(page.ownerId)===state.userId)renderState={...state,demoBlocks:page.blocks};
    else notice=tutorialCopy(locale).needSave;
  }
  const payload=tutorialView(renderState,locale,entitlement,notice);
  try{await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,...payload});}
  catch(error){
    const message=String(error?.description||error?.message||'').toLowerCase();
    if(message.includes('message is not modified'))return state;
    const retryAfter=Number(error?.parameters?.retry_after||error?.response?.parameters?.retry_after||message.match(/retry after (\d+)/)?.[1]||0);
    if(retryAfter>0)return writeTutorial({...state,renderAfter:now()+retryAfter},state);
    if(!state.previewFailed && /wrong file|failed to get http|webpage_curl_failed|media_invalid|photo_invalid|file_reference|could not fetch|failed to download/.test(message)){
      state=await writeTutorial({...state,previewFailed:true},state);
      await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,...tutorialView(state,locale,entitlement)});
      return state;
    }
    // Only an explicit missing/uneditable anchor permits a replacement. Never
    // create a second message on timeouts, 429, media failures or unknown errors.
    if(!/message to edit not found|message can't be edited|message_id_invalid/.test(message))throw error;
    if(state.recovering)throw error;
    state=await writeTutorial({...state,recovering:true},state);
    const sent=await api.sendRichMessage({chat_id:state.chatId,...tutorialView(state,locale,entitlement,notice)});
    state=await writeTutorial({...state,messageId:sent.message_id,recovering:false},state);
    // The sent keyboard used the pre-send revision. Refresh it once.
    await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,...tutorialView(state,locale,entitlement,notice)});
  }
  return state;
}
async function saveIntent(state){
  const intent=state.saveIntent;
  const id=await persistPage(state.userId,intent.title,{blocks:state.blocks,messageButtons:[],buttonsPerRow:1,buttonsAlign:'center'},intent.existingId,{reservedId:intent.existingId?null:intent.id,expectedRevision:intent.revision});
  if(!id)throw new Error('PAGE_CONFLICT');
  const page=await db.select().from(richPages).where(eq(richPages.pageId,id)).get();
  state.pageId=id;state.pageRevision=page.revision;state.pageTitle=intent.title;state.dirty=false;state.step='saved';state.saveIntent=null;event(state,'saved');
  return state;
}
async function handoff(state,locale,existingOnly=false){
  const current=await loadEditorSession(state.userId);
  if(current?.blocks?.length){
    if(!existingOnly){state.step='handoff';return {state};}
    await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,rich_message:editorDashboardRichMessage(current,locale),reply_markup:buildEditorKeyboard(current,locale)});
    await updateEditorSession(state.userId,{managementChatId:state.chatId,managementMessageId:state.messageId});
    return {state:{...state,active:false,step:'paused'},external:true};
  }
  if(existingOnly)return {state:{...state,step:'complete'}};
  const created=await createEditorSession(state.userId,state.chatId,state.messageId);
  const next=await updateEditorSession(state.userId,{blocks:state.blocks,currentPageId:null,currentPageTitle:null,state:'managing'});
  // The editor receives an independent unsaved draft: old saved-page versions
  // are never silently overwritten on transfer.
  await api.editMessageText({chat_id:state.chatId,message_id:state.messageId,rich_message:editorDashboardRichMessage(next||created,locale),reply_markup:buildEditorKeyboard(next||created,locale)});
  event(state,'editor_handoff');
  return {state:{...state,active:false,step:'paused',handedOff:true},external:true};
}
export async function pauseTutorialForCommand(message){
  if(!privateActor(message))return;
  const lock=await acquireEditorMutationLock(actor(message));if(!lock)return;
  try{const state=await readTutorial(actor(message));if(state?.active)await writeTutorial({...state,active:false,pending:null,step:'paused'},state);}
  finally{await releaseEditorMutationLock(lock);}
}
export async function handleTutorialCallback(query){
  const data=String(query?.data||'');if(data!=='tut:open'&&!data.startsWith('tut:'))return false;
  const locale=await resolveUserLanguage(query.from),c=tutorialCopy(locale);
  if(!privateActor({...query.message,from:query.from})) {await api.answerCallbackQuery({callback_query_id:query.id,text:c.stale});return true;}
  const lock=await acquireEditorMutationLock(actor(query));
  if(!lock){await api.answerCallbackQuery({callback_query_id:query.id,text:c.busy});return true;}
  let state;
  try{
    const previous=await readTutorial(actor(query));state=previous?clone(previous):null;
    if(data==='tut:open'){
      state=state||initialTutorial(actor(query),query.message.chat.id,query.message.message_id);
      state.messageId=query.message.message_id;state.chatId=query.message.chat.id;state.active=true;state.recovering=false;
      state.epoch=blockId().slice(0,8);state.step=state.saveIntent?'save_retry':'home';state.pending=null;
      // Reject delayed input from before this anchor was opened.
      state.inputFloor=Math.max(state.lastInputId||0,query.message.message_id);state.seenInputIds=[];
      event(state,'started');
      state=await writeTutorial(state,previous);
      await api.answerCallbackQuery({callback_query_id:query.id});
      await display(state,locale,await getEditorEntitlement(state.userId));return true;
    }
    const match=data.match(/^tut:([a-zA-Z0-9_-]+):(\d+):(.+)$/);
    if(!state||!match||state.epoch!==match[1]||state.revision!==Number(match[2])||Number(state.messageId)!==Number(query.message.message_id)){
      await api.answerCallbackQuery({callback_query_id:query.id,text:c.stale});return true;
    }
    const action=match[3];await api.answerCallbackQuery({callback_query_id:query.id});
    const entitlement=await getEditorEntitlement(state.userId);
    let external=false;
    // Actions are allowed only from the keyboard rendered for this exact state.
    const allowed=containsCallback(tutorialView(state,locale,entitlement),data);
    if(!allowed)return true;
    if(['home','build','preview','templates','catalog','choose','edit','advice','complete','cbd','guest'].includes(action)){
      if(['complete','edit','advice'].includes(action)&&!state.blocks.length){await display(state,locale,entitlement,c.empty);return true;}
      state.step=action;state.pending=null;state.listOffset=0;state.previewOffset=0;state.active=true;state.demoPage=false;state.previewFailed=false;
      if(action==='complete')event(state,'completed');if(action==='advice')event(state,'advice');
    } else if(action.startsWith('list:'))state.listOffset=Math.max(0,Number(action.slice(5))||0);
    else if(action.startsWith('previewOffset:'))state.previewOffset=Math.max(0,Number(action.split(':')[1])||0);
    else if(action.startsWith('inspect:')){state.inspectType=action.slice(8);state.example=exampleBlock(state.inspectType,locale,(await db.select().from(legacyStates).where(eq(legacyStates.namespace,'showcase_media')).get())?.payload||{});state.step='inspect';state.previewOffset=0;}
    else if(action.startsWith('template:')){const id=action.slice(9);if(!TEMPLATE_IDS.includes(id))return true;state.template=id;state.step='template';state.previewOffset=0;state.previewFailed=false;}
    else if(action==='useTemplate'&&state.blocks.length)state.step='replace';
    else if(action==='useTemplate'||action==='replaceTemplate'){changeContent(state,templateBlocks(state.template,locale));event(state,'template');}
    else if(action==='apply'){changeContent(state,applyAdvice(state.blocks,locale));event(state,'advice_applied');}
    else if(action==='undo'&&state.undo){const old=state.undo;state.undo=null;state.blocks=old;state.dirty=true;state.previewOffset=0;state.step='preview';}
    else if(action==='pause'){state.active=false;state.pending=null;state.step='paused';}
    else if(action.startsWith('add:')||action.startsWith('edit:')){
      const editing=action.startsWith('edit:'),path=editing?action.slice(5):null;
      const block=editing?blockAt(state.blocks,path):null,type=editing?block?.type:action.slice(4);
      if(!TYPES.includes(type))return true;
      if(type==='divider'){if(!editing)changeContent(state,[...state.blocks,makeBlock('divider')]);else state.step='preview';}
      else {state.step='input';state.pending={type,path,children:[]};state.inputStartedAt=now();state.inputFloor=Math.max(state.inputFloor||0,state.lastInputId||0);}
    } else if(action==='mediaDone'){
      if(!state.pending?.children?.length){await display(state,locale,entitlement,c.invalid);return true;}
      finishInput(state,makeBlock(state.pending.type,{children:state.pending.children.map(({tutorialInputId,...child})=>child)}));
    } else if(action==='refresh'){
      state.previewFailed=false;
    } else if(action==='trycbd'){
      state.demoPage=true;state.previewOffset=0;event(state,'cbd_demo');
    } else if(action==='save'){
      if(!state.blocks.length){await display(state,locale,entitlement,c.empty);return true;}
      state.step='save';state.pending=null;
    } else if(action==='retrySave'){
      state=await saveIntent(state);
    } else if(action==='handoff'||action==='existing'){
      if(!state.blocks.length){await display(state,locale,entitlement,c.empty);return true;}
      const result=await handoff(state,locale,action==='existing');state=result.state;external=result.external;
    } else return true;
    await validate(state,entitlement);
    if(!external)tutorialView(state,locale,entitlement);
    state=await writeTutorial(state,previous);
    if(!external)await display(state,locale,entitlement);
  } catch(error){
    const latest=await readTutorial(actor(query));
    if(latest){try{await display(latest,locale,await getEditorEntitlement(actor(query)),errorNotice(error,c));}catch{await api.answerCallbackQuery({callback_query_id:query.id,text:errorNotice(error,c),show_alert:true}).catch(()=>{});}}
    await logError('tutorial.callback',error,{userId:actor(query),chatId:query.message.chat.id});
  } finally{await releaseEditorMutationLock(lock);}
  return true;
}
function containsCallback(value,data){
  if(Array.isArray(value))return value.some(item=>containsCallback(item,data));
  if(!value||typeof value!=='object')return false;
  if(value.callback_data===data)return true;
  return Object.values(value).some(item=>containsCallback(item,data));
}
function finishInput(state,block){
  const blocks=clone(state.blocks),path=state.pending.path;
  if(path!=null){const target=blockAt(blocks,path);if(!target)throw new Error('TUTORIAL_INPUT');Object.assign(target,{...block,id:target.id,position:target.position});}
  else blocks.push(block);
  changeContent(state,blocks);
}
export async function handleTutorialMessage(message){
  if(!privateActor(message)||String(message.text||'').trim().startsWith('/'))return false;
  let state=await readTutorial(actor(message));if(!state?.active)return false;
  const locale=await resolveUserLanguage(message.from),c=tutorialCopy(locale);
  const lock=await acquireEditorMutationLock(actor(message));if(!lock)throw new Error('TUTORIAL_BUSY_RETRY');
  try{
    state=await readTutorial(actor(message));if(!state?.active)return false;
    const previous=clone(state),entitlement=await getEditorEntitlement(state.userId);
    if(message.date && Number(message.date)<Number(state.inputStartedAt||0))return true;
    if(Number(message.message_id)<=Number(state.inputFloor||0)||(state.seenInputIds||[]).includes(message.message_id))return true;
    if(state.step!=='input'&&state.step!=='save'){await display(state,locale,entitlement,c.preview);return true;}
    // A reply explicitly targeting a different screen is never consumed.
    if(message.reply_to_message&&Number(message.reply_to_message.message_id)!==Number(state.messageId))return true;
    state.lastInputId=Math.max(state.lastInputId||0,message.message_id);state.seenInputIds=[...(state.seenInputIds||[]),message.message_id].slice(-128);
    if(state.step==='save'){
      const title=String(message.text||'').trim();if(!title||title.length>64)throw new Error('TUTORIAL_NAME');
      state.saveIntent={title,id:'tut_'+blockId(),existingId:state.pageId,revision:state.pageRevision};state.step='save_retry';
      state=await writeTutorial(state,previous); // Intent survives a crash during save.
      const saved=await saveIntent(clone(state));
      state=await writeTutorial(saved,state);
    } else {
      const block=fromInput({...message,from:{...message.from,language_code:locale}},state.pending.type,blockAt(state.blocks,state.pending.path));
      if(['slideshow','collage'].includes(state.pending.type)){
        state.pending.children.push(...block.data.children.map(child=>({...child,tutorialInputId:message.message_id})));state.pending.children.sort((a,b)=>a.tutorialInputId-b.tutorialInputId);orderBlocks(state.pending.children);
        // Check the eventual container including everything already collected.
        const prospective=clone(state);finishInput(prospective,makeBlock(state.pending.type,{children:state.pending.children}));await validate(prospective,entitlement);
      } else finishInput(state,block);
      await validate(state,entitlement);
      tutorialView(state,locale,entitlement);
      state=await writeTutorial(state,previous);
    }
    await display(state,locale,entitlement);
  } catch(error){
    const latest=await readTutorial(actor(message));
    if(latest)await display(latest,locale,await getEditorEntitlement(actor(message)),errorNotice(error,c));
    if(!/^TUTORIAL_|LIMIT|PAGE_/.test(String(error?.message||'')))await logError('tutorial.input',error,{userId:actor(message),chatId:message.chat.id});
  } finally{await releaseEditorMutationLock(lock);}
  return true;
}
