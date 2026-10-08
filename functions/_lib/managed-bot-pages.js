import { queueTextBridgeRequest, bridgeRequestRow, downloadBridgeJson } from './b2b-bridge.js';
import { fail } from './managed-bot-service.js';
export async function requestManagedPage(context,owner,pageId,requestId=null) {
 if(typeof pageId!=='string'||!pageId.length||pageId.length>100)fail('invalid_page');
 if(!requestId)return {pending:true,request_id:await queueTextBridgeRequest(context,{action:'managed_page',userId:Number(owner),pageId})};
 const row=await bridgeRequestRow(context.env.DB,requestId,Number(owner));
 if(!row||row.action!=='managed_page'||row.page_id!==pageId)fail('invalid_page_request');
 if(row.status==='pending')return {pending:true,request_id:requestId};
 if(row.status!=='ready'||row.response_kind!=='document')fail('page_unavailable',503);
 const p=await downloadBridgeJson(context.env,row.response_file_id);
 if(p.protocol!=='RCB1'||p.request_id!==requestId||p.action!=='managed_page'||String(p.owner_id)!==String(owner)||String(p.user_id)!==String(owner)||p.page_id!==pageId||!p.rich_message?.blocks?.length)fail('invalid_page_response',502);
 return {page:p};
}
// Native source objects are never forwarded. Renderer-produced media IDs are
// transferred into multipart attachments before the managed bot sends them.
export function portablePage(page) {
 const visit=value=>{
  if(!value||typeof value!=='object')return;
  for(const [k,v] of Object.entries(value)) {
   if(k==='file_id'||k==='file_unique_id'||(typeof v==='string'&&['photo','video','audio','animation','document','voice_note'].includes(k)&&!/^https:\/\//i.test(v)))fail('media_reupload_required');
   if(typeof v==='string'&&/(?:tg:\/\/document|attach:\/\/)/i.test(v))fail('media_reupload_required');
   visit(v);
  }
 };
 visit(page.rich_message);return page;
}
// Callbacks keep their exact value; authorization is based on the publication's
// bot/chat/message tuple and a fresh owner-scoped page response, never its payload alone.
export function pagePayload(page,chatId) {
 portablePage(page);
 const rows=[];let row=[];
 for(const b of page.buttons||[]) {
 const type=b.type||'url',v=String(b.value??b.url??''),button={text:String(b.text||'—')};
 if(['primary','success','danger'].includes(b.style))button.style=b.style;
 if(type==='url')button.url=v;
 else if(type==='copy')button.copy_text={text:v};
 else if(type==='callback_data')button.callback_data=v;
 else if(type==='page'&&b.audience!=='subscribers')button.callback_data='r:page:'+v;
 else if(type==='popup')button.callback_data='mb:popup:'+String((page.buttons||[]).indexOf(b));
 else {button.disabled={};}
 row.push(button);if(b.row_end||row.length>=Math.max(1,Math.min(8,page.buttons_per_row||1))){rows.push(row);row=[];}
 }
 if(row.length)rows.push(row);
 return {chat_id:chatId,rich_message:page.rich_message,...(rows.length?{reply_markup:{inline_keyboard:rows}}:{})};
}
export function callbackAction(page,data) {
 for(let i=0;i<(page.buttons||[]).length;i++){
  const b=page.buttons[i],v=String(b.value??b.url??'');
  if(b.type==='popup'&&data==='mb:popup:'+i)return {text:v.slice(0,200)};
  if(b.type==='page'&&b.audience!=='subscribers'&&data==='r:page:'+v)return {page_id:v};
  if(b.type==='callback_data'&&data===v)return {text:'تم استلام طلبك.'};
 }
 let found=false;
 const walk=v=>{if(!v||typeof v!=='object')return;for(const [k,x]of Object.entries(v)){if(k==='callback_data'&&x===data)found=true;walk(x);}};walk(page.rich_message);
 if(found){if(data.startsWith('r:page:'))return {page_id:data.split(':')[2]};return {text:'تم استلام طلبك.'};}
 return {text:'هذا الزر لم يعد متاحاً.'};
}
