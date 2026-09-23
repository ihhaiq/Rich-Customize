import { api } from 'sdk';
import { getPage, queryPagesForUser, deletePage, restorePage } from 'lib/storage/pages';
import { loadDraft, saveDraft } from 'lib/editor/draft';
import { remember } from 'lib/editor/history';
import { loadSession, patchSession, STATE } from 'lib/editor/session';
import { buildPagesRichMessage, editRichUi } from 'lib/ui/pages';
import { pagesKeyboard, pageSortKeyboard, pageDeleteKeyboard, pageRestoreKeyboard, renderedMessageButtons } from 'lib/ui/keyboards';
import { t, languageForUser } from 'lib/i18n';
import { answerCallback, editCallback, isChatSubscriber, pageRichPayload, renderEditor } from 'lib/router/support';
import {
  getGuestMessage, navigatePage, navigationBack, navigationHome,
  commitNavigationBack, rollbackNavigationBack, finishNavigation,
} from 'lib/registries';

const PAGES_PER_SCREEN=4;
function language(callback){return languageForUser(callback?.from);}
function parts(data){return String(data??'').split(':');}
async function pageScreen(callback,storageKey,requested=0){
  const session=await loadSession(storageKey),query=String(session.data.pages_search_query??''),sortMode=String(session.data.pages_sort_mode??'updated');
  const all=await queryPagesForUser(callback.from.id,{query,sortMode});
  const totalPages=Math.max(1,Math.ceil(all.filteredTotal/PAGES_PER_SCREEN));
  const index=Math.min(Math.max(0,Number(requested)||0),totalPages-1);
  const visible=all.pages.slice(index*PAGES_PER_SCREEN,(index+1)*PAGES_PER_SCREEN);
  const lang=language(callback);
  let text=query?t('pages.search_results',{language:lang,query}):t('pages.saved_title',{language:lang});
  if(!visible.length&&query)text=t('pages.search_none',{language:lang,query});
  const rich=buildPagesRichMessage(text,visible,index,lang);
  const markup=pagesKeyboard({showControls:all.ownedTotal>1,showPager:all.filteredTotal>PAGES_PER_SCREEN,pageIndex:index,totalPages,prefix:query?'r:presults':'r:pages',language:lang});
  await editCallback(callback,{richMessage:rich,replyMarkup:markup});
  await patchSession(storageKey,{pages_page_index:index},{state:STATE.MANAGING});
  return true;
}
async function renderNavigation(callback,pageId,navigation){
  const page=await getPage(pageId);
  if(!page){await answerCallback(callback,'هذه الصفحة لم تعد موجودة أو انتهت صلاحيتها.',true);return false;}
  const payload=await pageRichPayload(page,pageId,navigation,language(callback));
  const message=callback.message;
  try{
    if(message?.ephemeral_message_id){
      await api.editEphemeralMessageText({
        chat_id:message.chat.id,receiver_user_id:callback.from.id,
        ephemeral_message_id:message.ephemeral_message_id,
        rich_message:payload.richMessage,...(payload.replyMarkup?{reply_markup:payload.replyMarkup}:{})
      });
    }else if(message){
      await api.sendRichMessage({chat_id:message.chat.id,rich_message:payload.richMessage,...(payload.replyMarkup?{reply_markup:payload.replyMarkup}:{})});
    }else return false;
    return true;
  }catch(error){console.error('navigation render failed',error);await answerCallback(callback,'تعذر فتح الصفحة.',true);return false;}
}
async function restoreRoot(callback,navigation){
  const message=callback.message;
  if(message?.ephemeral_message_id){
    await api.deleteEphemeralMessage({chat_id:message.chat.id,receiver_user_id:callback.from.id,ephemeral_message_id:message.ephemeral_message_id});
    return true;
  }
  if(navigation.root_page_id){
    const root={...navigation,stack:[navigation.root_page_id],external_root:false,can_go_back:false,can_go_home:false,is_at_root:true};
    return renderNavigation(callback,navigation.root_page_id,root);
  }
  await answerCallback(callback,t('navigation.original_above',{language:language(callback)}),true);
  return false;
}

export async function handlePageCallback(callback,storageKey,data){
  const lang=language(callback);
  if(data==='r:savepage'){
    const draft=await loadDraft(storageKey);
    if(!draft.blocks.length){await answerCallback(callback,'لا توجد أجزاء لحفظها.',true);return true;}
    if(draft.current_page_id){
      const existing=await getPage(draft.current_page_id);
      if(existing){
        try{
          const { savePage }=await import('lib/storage/pages');
          await savePage({ownerId:callback.from.id,title:draft.current_page_title??existing.title,blocks:draft.blocks,buttons:draft.message_buttons,buttonsPerRow:draft.buttons_per_row,buttonsAlign:draft.buttons_align,pageId:draft.current_page_id});
          await answerCallback(callback,'✅ تم حفظ التعديلات بنفس الكود');await renderEditor(callback,storageKey);return true;
        }catch(error){await answerCallback(callback,String(error?.message??error).slice(0,180),true);return true;}
      }
    }
    await patchSession(storageKey,{}, {state:STATE.SAVING_PAGE_NAME});
    await api.sendMessage({chat_id:callback.message.chat.id,text:'أرسل اسم الصفحة.'});
    await answerCallback(callback);return true;
  }
  if(data==='r:pages'||data.startsWith('r:pages:')||data.startsWith('r:presults:')){
    const raw=data.split(':').at(-1),index=(data==='r:pages'?0:Math.max(0,Number.parseInt(raw,10)||0));
    await pageScreen(callback,storageKey,index);await answerCallback(callback);return true;
  }
  if(data==='r:psearch'){
    await patchSession(storageKey,{}, {state:STATE.SEARCHING_PAGE});
    await api.sendMessage({chat_id:callback.message.chat.id,text:t('pages.search_prompt',{language:lang})});
    await answerCallback(callback);return true;
  }
  if(data==='r:psort'){
    const session=await loadSession(storageKey);
    await editCallback(callback,{text:t('pages.sort_text',{language:lang}),replyMarkup:pageSortKeyboard(String(session.data.pages_sort_mode??'updated'),lang)});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:psortset:')){
    const mode=data.slice('r:psortset:'.length);
    if(!['updated','newest','oldest','title'].includes(mode)){await answerCallback(callback,t('invalid',{language:lang}),true);return true;}
    await patchSession(storageKey,{pages_sort_mode:mode},{state:STATE.MANAGING});
    await pageScreen(callback,storageKey,0);await answerCallback(callback,t('pages.sort_done',{language:lang}));return true;
  }
  if(data.startsWith('r:pageopen:')){
    const id=data.slice('r:pageopen:'.length),page=await getPage(id);
    if(!page||Number(page.owner_id)!==Number(callback.from.id)){await answerCallback(callback,'الصفحة محذوفة أو لا تخصك.',true);return true;}
    const draft=await loadDraft(storageKey);await remember(storageKey);draft.blocks=page.blocks??[];draft.message_buttons=page.buttons??[];draft.buttons_per_row=page.buttons_per_row??1;draft.buttons_align=page.buttons_align??'center';draft.current_page_id=id;draft.current_page_title=page.title??id;await saveDraft(storageKey,draft);
    await patchSession(storageKey,{current_block_id:null,block_scroll_offset:0},{state:STATE.MANAGING});
    await renderEditor(callback,storageKey);await answerCallback(callback,'تم فتح الصفحة');return true;
  }
  if(data.startsWith('r:prename:')){
    const p=parts(data),id=p[2]??'',index=Math.max(0,Number.parseInt(p[3]??'0',10)||0),page=await getPage(id);
    if(!page||Number(page.owner_id)!==Number(callback.from.id)){await answerCallback(callback,'الصفحة محذوفة أو لا تخصك.',true);return true;}
    await patchSession(storageKey,{rename_page_id:id,pages_page_index:index},{state:STATE.RENAMING_PAGE});
    await api.sendMessage({chat_id:callback.message.chat.id,text:t('pages.rename_prompt',{language:lang,title:page.title??id})});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:pdelete:')){
    const p=parts(data),id=p[2]??'',index=Math.max(0,Number.parseInt(p[3]??'0',10)||0),page=await getPage(id);
    if(!page||Number(page.owner_id)!==Number(callback.from.id)){await answerCallback(callback,'الصفحة محذوفة أو لا تخصك.',true);return true;}
    await editCallback(callback,{text:t('pages.delete_confirm',{language:lang,title:page.title??id}),replyMarkup:pageDeleteKeyboard(id,index,lang)});
    await answerCallback(callback);return true;
  }
  if(data.startsWith('r:pdeleteok:')){
    const p=parts(data),id=p[2]??'',index=Math.max(0,Number.parseInt(p[3]??'0',10)||0),page=await getPage(id);
    if(!page||Number(page.owner_id)!==Number(callback.from.id)){await answerCallback(callback,'الصفحة محذوفة أو لا تخصك.',true);return true;}
    const draft=await loadDraft(storageKey);
    if(!await deletePage(id,callback.from.id)){await answerCallback(callback,'الصفحة محذوفة أو لا تخصك.',true);return true;}
    await patchSession(storageKey,{deleted_page_id:id,deleted_page_snapshot:page,deleted_page_index:index,deleted_page_was_current:draft.current_page_id===id},{state:STATE.MANAGING});
    if(draft.current_page_id===id){draft.current_page_id=null;draft.current_page_title=null;await saveDraft(storageKey,draft);}
    await editCallback(callback,{text:t('ux.pages.deleted_recoverable',{language:lang}),replyMarkup:pageRestoreKeyboard(index,lang)});
    await answerCallback(callback,t('pages.deleted',{language:lang}));return true;
  }
  if(data==='r:prestore'){
    const session=await loadSession(storageKey),id=String(session.data.deleted_page_id??''),snapshot=session.data.deleted_page_snapshot;
    if(!id||!snapshot){await answerCallback(callback,t('ux.pages.restore_unavailable',{language:lang}),true);return true;}
    if(!await restorePage(id,callback.from.id,snapshot)){await answerCallback(callback,t('ux.pages.restore_unavailable',{language:lang}),true);return true;}
    const draft=await loadDraft(storageKey);
    if(session.data.deleted_page_was_current){draft.current_page_id=id;draft.current_page_title=snapshot.title??id;await saveDraft(storageKey,draft);}
    const index=Number(session.data.deleted_page_index??0);
    await patchSession(storageKey,{deleted_page_id:null,deleted_page_snapshot:null,deleted_page_index:null,deleted_page_was_current:null},{state:STATE.MANAGING});
    await pageScreen(callback,storageKey,index);await answerCallback(callback,t('ux.pages.restored',{language:lang}));return true;
  }
  if(data.startsWith('r:page:')||data.startsWith('r:spage:')){
    const gated=data.startsWith('r:spage:'),p=parts(data),target=p[2]??'',source=p[3]||null,token=p[4]||null;
    let chatId=callback.message?.chat?.id,chatType=callback.message?.chat?.type;
    if(!callback.message&&callback.inline_message_id){const guest=await getGuestMessage(callback.inline_message_id);chatId=guest?.chat_id;chatType=guest?.chat_type;}
    if(!chatId){await answerCallback(callback,'تعذر تحديد محادثة الرسالة.',true);return true;}
    if(gated&&!await isChatSubscriber(chatId,callback.from.id)){await answerCallback(callback,'انت مو من المقربين ابتعد عني .... ',true);return true;}
    const page=await getPage(target);if(!page){await answerCallback(callback,'هذه الصفحة لم تعد موجودة أو انتهت صلاحيتها.',true);return true;}
    const nav=await navigatePage(callback.from.id,source,target,token),payload=await pageRichPayload(page,target,nav,lang);
    try{
      if(callback.message?.ephemeral_message_id){
        await api.editEphemeralMessageText({chat_id:chatId,receiver_user_id:callback.from.id,ephemeral_message_id:callback.message.ephemeral_message_id,rich_message:payload.richMessage,...(payload.replyMarkup?{reply_markup:payload.replyMarkup}:{})});
      }else if(['group','supergroup','channel'].includes(String(chatType))){
        await api.sendRichMessage({chat_id:chatId,rich_message:payload.richMessage,...(payload.replyMarkup?{reply_markup:payload.replyMarkup}:{}),ephemeral_message_parameters:{receiver_user_id:callback.from.id,callback_query_id:callback.id,replace_callback_query_message:true}});
      }else{
        await api.sendRichMessage({chat_id:callback.from.id,rich_message:payload.richMessage,...(payload.replyMarkup?{reply_markup:payload.replyMarkup}:{})});
      }
      await answerCallback(callback);
    }catch(error){console.error('open page link failed',error);await answerCallback(callback,'تعذر فتح الصفحة.',true);}
    return true;
  }
  if(data.startsWith('r:pback:')){
    const token=data.split(':').at(-1),nav=await navigationBack(token,callback.from.id);
    if(!nav){await answerCallback(callback,t('navigation.expired',{language:lang}),true);return true;}
    let ok=false;
    try{if(nav.is_at_root)ok=await restoreRoot(callback,nav);else ok=await renderNavigation(callback,nav.stack.at(-1),nav);}
    catch(error){console.error(error);ok=false;}
    if(ok){if(nav.is_at_root)await finishNavigation(token);else await commitNavigationBack(token,callback.from.id);await answerCallback(callback);}
    else await rollbackNavigationBack(token,callback.from.id);
    return true;
  }
  if(data.startsWith('r:phome:')){
    const token=data.split(':').at(-1),nav=await navigationHome(token,callback.from.id);
    if(!nav){await answerCallback(callback,t('navigation.expired',{language:lang}),true);return true;}
    if(await restoreRoot(callback,nav)){await finishNavigation(token);await answerCallback(callback);}
    return true;
  }
  if(data==='r:ephemeral:restore'){
    const message=callback.message;
    if(!message?.ephemeral_message_id){await answerCallback(callback,'الرسالة الأصلية غير متاحة.',true);return true;}
    try{await api.deleteEphemeralMessage({chat_id:message.chat.id,receiver_user_id:callback.from.id,ephemeral_message_id:message.ephemeral_message_id});await answerCallback(callback);}
    catch(error){console.error(error);await answerCallback(callback,'تعذر الرجوع إلى الرسالة الأصلية.',true);}
    return true;
  }
  return false;
}
