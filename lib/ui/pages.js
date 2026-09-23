import { api, BotApiError } from 'sdk';
import { t } from 'lib/i18n';
export function buildPagesRichMessage(text,pages,pageIndex=0,language='en'){
  const blocks=[{type:'paragraph',text}];
  if(!pages?.length)return {blocks};
  const rows=[[{text:'🗑️',align:'center',valign:'middle',is_header:true},{text:'✏️',align:'center',valign:'middle',is_header:true},{text:t('pages.copy_code',{language}),align:'center',valign:'middle',is_header:true},{text:t('pages.sort_title',{language}),align:'right',valign:'middle',is_header:true}]];
  for(const page of pages){const id=String(page.page_id);rows.push([
    {text:{type:'button',button:{text:'🗑️',callback_data:'r:pdelete:'+id+':'+pageIndex,style:'danger'}},align:'center',valign:'middle'},
    {text:{type:'button',button:{text:'✏️',callback_data:'r:prename:'+id+':'+pageIndex}},align:'center',valign:'middle'},
    {text:{type:'button',button:{text:t('pages.copy_code',{language}),copy_text:{text:id}}},align:'center',valign:'middle'},
    {text:{type:'button',button:{text:String(page.title??id),callback_data:'r:pageopen:'+id,style:'primary'}},align:'right',valign:'middle'},
  ]);}
  blocks.push({type:'divider'},{type:'table',cells:rows,is_bordered:true,is_compact:true},{type:'divider'});
  return {blocks};
}
export async function editRichUi(chatId,messageId,richMessage,replyMarkup){
  try{return await api.editMessageText({chat_id:chatId,message_id:messageId,rich_message:richMessage,reply_markup:replyMarkup});}
  catch(error){if(error instanceof BotApiError&&String(error.description??'').toLowerCase().includes('message is not modified'))return null;throw error;}
}
