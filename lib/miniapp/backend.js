import { api, InputFile } from 'sdk';
import { getPage, listPagesForUser, savePage, deletePage } from 'lib/storage/pages';
import { managedChatsForUser } from 'lib/registries';
import { sendRichMessagePost } from 'lib/renderer';
import { validateEditorLimits } from 'lib/editor/limits';
import { MAX_BUTTONS } from 'lib/buttons';

export const BETA_VERSION='serverless';
function assertPageContent(payload,current={}){
  const blocks=payload?.blocks;
  const buttons=payload?.buttons??current.buttons??[];
  if(!Array.isArray(blocks)||blocks.some(x=>!x||typeof x!=='object'))throw new Error('blocks must be a list');
  validateEditorLimits(blocks);
  if(!Array.isArray(buttons)||buttons.length>MAX_BUTTONS||buttons.some(x=>!x||typeof x!=='object'))throw new Error('buttons invalid');
  const perRow=Number.parseInt(payload?.buttons_per_row??current.buttons_per_row??1,10);
  if(!Number.isInteger(perRow)||perRow<1||perRow>8)throw new Error('buttons_per_row invalid');
  const align=String(payload?.buttons_align??current.buttons_align??'center');
  if(!['left','center','right'].includes(align))throw new Error('buttons_align invalid');
  return {blocks,buttons,buttonsPerRow:perRow,buttonsAlign:align};
}
export async function miniappOperation(user,request){
  const action=String(request?.action??'');
  const userId=Number(user?.id);
  if(!Number.isSafeInteger(userId))throw new Error('invalid user');
  if(action==='me')return {ok:true,user,beta:BETA_VERSION};
  if(action==='pages'){const pages=await listPagesForUser(userId);return {ok:true,beta:BETA_VERSION,pages:pages.map(p=>({page_id:p.page_id,title:p.title??p.page_id,updated_at:p.updated_at,block_count:(p.blocks??[]).length}))};}
  if(action==='page'){const page=await getPage(String(request.page_id??''));if(!page||page.owner_id!==userId)throw new Error('page_not_found');return {ok:true,page:{page_id:String(request.page_id),...page}};}
  if(action==='create_page'){const c=assertPageContent(request);const title=String(request.title??'Untitled').slice(0,64);const page_id=await savePage({ownerId:userId,title,blocks:c.blocks,buttons:c.buttons,buttonsPerRow:c.buttonsPerRow,buttonsAlign:c.buttonsAlign});return {ok:true,page_id,title};}
  if(action==='save_page'){const id=String(request.page_id??''),current=await getPage(id);if(!current||current.owner_id!==userId)throw new Error('page_not_found');const c=assertPageContent(request,current),title=String(request.title??current.title??id).slice(0,64);await savePage({ownerId:userId,title,blocks:c.blocks,buttons:c.buttons,buttonsPerRow:c.buttonsPerRow,buttonsAlign:c.buttonsAlign,pageId:id});return {ok:true,page_id:id,title};}
  if(action==='discard'){const id=String(request.page_id??'');if(!id)return {ok:true,deleted:false};return {ok:true,deleted:await deletePage(id,userId)};}
  if(action==='destinations'){const chats=await managedChatsForUser(userId);return {ok:true,destinations:[{kind:'private',chat_id:userId,title:user.first_name??user.username??String(userId),type:'private'},...chats.map(x=>({kind:'chat',...x}))]};}
  if(action==='send_page'){const id=String(request.page_id??''),page=await getPage(id);if(!page||page.owner_id!==userId)throw new Error('page_not_found');const chatId=request.kind==='private'?userId:Number(request.chat_id);await sendRichMessagePost(chatId,page.blocks??[],page.buttons??[],{buttonsPerRow:page.buttons_per_row??1,buttonsAlign:page.buttons_align??'center',sourcePageId:id});return {ok:true,chat_id:chatId};}
  throw new Error('unsupported_action');
}
export async function handleWebAppData(message){
  let request;try{request=JSON.parse(String(message?.web_app_data?.data??''));}catch{return null;}
  try{const result=await miniappOperation(message.from,request);return api.sendMessage({chat_id:message.chat.id,text:JSON.stringify(result)});}
  catch(error){return api.sendMessage({chat_id:message.chat.id,text:JSON.stringify({ok:false,error:String(error?.message??error)})});}
}
export async function uploadBytesToTelegram(userId,kind,bytes,name='upload.bin',mime='application/octet-stream'){
  const file=new InputFile(bytes,name,{type:mime});
  if(kind==='photo')return api.sendPhoto({chat_id:userId,photo:file});
  if(kind==='video')return api.sendVideo({chat_id:userId,video:file});
  if(kind==='animation')return api.sendAnimation({chat_id:userId,animation:file});
  if(kind==='audio')return api.sendAudio({chat_id:userId,audio:file});
  if(kind==='voice')return api.sendVoice({chat_id:userId,voice:file});
  return api.sendDocument({chat_id:userId,document:file});
}
