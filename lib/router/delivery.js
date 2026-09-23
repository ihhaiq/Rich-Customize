import { api } from 'sdk';
import { normalizePageCode } from 'lib/buttons';
import { getPage } from 'lib/storage/pages';
import { buildInputRichMessage } from 'lib/renderer';
import { prepareMessageButtons } from 'lib/router/support';
import { renderedMessageButtons } from 'lib/ui/keyboards';
import { rememberGuestMessage } from 'lib/registries';

export async function savedPageQueryResult(pageId){
  const page=await getPage(pageId);
  if(!page)return null;
  const prepared=await prepareMessageButtons(page.buttons??[]);
  const rich_message=buildInputRichMessage(page.blocks??[],prepared,{
    buttonsPerRow:Number(page.buttons_per_row??1),
    buttonsAlign:String(page.buttons_align??'center'),
    sourcePageId:pageId,
  });
  const reply_markup=prepared.length?renderedMessageButtons(prepared,{
    buttonsPerRow:Number(page.buttons_per_row??1),
    sourcePageId:pageId,
  }):undefined;
  return {
    type:'article',
    id:'page-'+pageId,
    title:String(page.title??pageId),
    description:'Rich Message · '+pageId,
    input_message_content:{rich_message},
    ...(reply_markup?{reply_markup}:{}),
  };
}
export async function handleInlineQuery(query){
  const raw=String(query?.query??'').trim().split(/\s+/,1)[0]??'';
  const pageId=raw?normalizePageCode(raw):null;
  if(!pageId)return api.answerInlineQuery({inline_query_id:query.id,results:[],cache_time:0,is_personal:true});
  try{
    const result=await savedPageQueryResult(pageId);
    return api.answerInlineQuery({inline_query_id:query.id,results:result?[result]:[],cache_time:0,is_personal:true});
  }catch(error){console.error('inline page render failed',error);return api.answerInlineQuery({inline_query_id:query.id,results:[],cache_time:0,is_personal:true});}
}
export async function handleGuestMessage(message){
  if(!message?.guest_query_id)return null;
  try{
    let result=null;
    for(const token of String(message.text??message.caption??'').split(/\s+/)){
      if(!token||token.startsWith('@'))continue;
      const candidate=normalizePageCode(token.replace(/^[.,،؛:!?؟]+|[.,،؛:!?؟]+$/g,''));
      if(candidate){result=await savedPageQueryResult(candidate);if(result)break;}
    }
    if(!result)return null;
    const sent=await api.answerGuestQuery({guest_query_id:message.guest_query_id,result});
    if(sent?.inline_message_id)await rememberGuestMessage(sent.inline_message_id,message.chat.id,String(message.chat.type??''));
    return sent;
  }catch(error){console.error('guest page render failed',error);return null;}
}
