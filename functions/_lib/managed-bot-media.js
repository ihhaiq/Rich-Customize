import {telegram,TelegramError} from './managed-bot-runtime.js';
import {fail} from './managed-bot-service.js';
const PER_FILE=20*1024*1024,TOTAL=40*1024*1024;
// Download only through Telegram's fixed origin. Neither the client nor a page
// controls the credential or host. File bytes exist only for this invocation.
async function downloadFile(env,fileId) {
 const tokens=[...new Set([env.BOT_TOKEN,env.B2B_BOT_TOKEN].filter(Boolean))];
 let file,source;
 for(const token of tokens){try{file=await telegram(token,'getFile',{file_id:fileId});source=token;break;}catch(e){if(!(e instanceof TelegramError)||e.uncertain)fail('media_temporarily_unavailable',503);}}
 if(!file?.file_path)fail('media_reupload_required');
 if(file.file_size>PER_FILE)fail('media_too_large');
 const path=String(file.file_path);
 if(!/^[a-zA-Z0-9_./-]+$/.test(path)||path.split('/').some(p=>p==='..'||p==='.')||path.startsWith('/'))fail('invalid_media_path');
 let response;try{response=await fetch('https://api.telegram.org/file/bot'+source+'/'+path,{signal:AbortSignal.timeout(12000)});}catch{fail('media_temporarily_unavailable',503);}
 if(!response.ok||!response.body)fail('media_temporarily_unavailable',503);
 if(Number(response.headers.get('content-length'))>PER_FILE)fail('media_too_large');
 const reader=response.body.getReader(),chunks=[];let size=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>PER_FILE){await reader.cancel();fail('media_too_large');}chunks.push(value);}}
 catch(e){if(e.code)throw e;fail('media_temporarily_unavailable',503);}
 return {blob:new Blob(chunks,{type:response.headers.get('content-type')||'application/octet-stream'}),name:path.split('/').at(-1),size};
}
export async function transferRichMedia(env,args) {
 const payload=structuredClone(args),refs=new Map();
 function visit(value){if(!value||typeof value!=='object')return;for(const [k,v] of Object.entries(value)){
  if(k==='media'&&typeof v==='string'&&!/^https:\/\//i.test(v)){
   if(!/^[a-zA-Z0-9_-]{5,512}$/.test(v))fail('media_reupload_required');
   if(!refs.has(v))refs.set(v,{name:'managed_media_'+refs.size,slots:[]});refs.get(v).slots.push(value);
  }else visit(v);
 }}visit(payload.rich_message);
 if(!refs.size)return payload;
 if(refs.size>20)fail('too_many_media');
 const form=new FormData();let total=0;
 for(const [id,ref] of refs){const file=await downloadFile(env,id);total+=file.size;if(total>TOTAL)fail('media_too_large');form.append(ref.name,file.blob,file.name);for(const slot of ref.slots)slot.media='attach://'+ref.name;}
 for(const [key,value] of Object.entries(payload))form.append(key,typeof value==='object'?JSON.stringify(value):String(value));
 return form;
}
