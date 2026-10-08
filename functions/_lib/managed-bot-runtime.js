import { responseJson, safeEqual } from './managed-bots.js';
const utf8=new TextEncoder();
const decoder=new TextDecoder();
function hex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function randomHex(bytes=24){const a=new Uint8Array(bytes);crypto.getRandomValues(a);return hex(a);}
async function keyFromSecret(secret){
 if(typeof secret!=='string'||secret.length<32)throw Error('MANAGED_BOT_ENCRYPTION_KEY missing or too short');
 const digest=await crypto.subtle.digest('SHA-256',utf8.encode(secret));
 return crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt','decrypt']);
}
export async function encryptToken(token,secret){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},await keyFromSecret(secret),utf8.encode(token));
 return JSON.stringify({v:1,iv:hex(iv),data:hex(new Uint8Array(encrypted))});
}
function fromHex(str){if(!/^(?:[a-f0-9]{2})+$/i.test(str))throw Error('bad encrypted data');return new Uint8Array(str.match(/../g).map(x=>parseInt(x,16)));}
export async function decryptToken(value,secret){
 const record=JSON.parse(value);
 if(record.v!==1)throw Error('unknown token format');
 return decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:fromHex(record.iv)},await keyFromSecret(secret),fromHex(record.data)));
}
export class TelegramError extends Error {
 constructor(code, uncertain=false, retryAfter=0) { super('telegram_failed'); this.code=code; this.uncertain=uncertain; this.retryAfter=retryAfter; }
}
export async function telegram(token,method,payload){
 try {
  const multipart=payload instanceof FormData;
  const res=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',...(multipart?{}:{headers:{'content-type':'application/json'}}),body:multipart?payload:JSON.stringify(payload),signal:AbortSignal.timeout(12000)});
  let data;try{data=await res.json();}catch{throw new TelegramError(res.status,true);}
  if(!res.ok||data.ok!==true)throw new TelegramError(Number(data.error_code||res.status),res.status>=500,Math.min(3600,Number(data.parameters?.retry_after)||0));
  return data.result;
 }catch(error){if(error instanceof TelegramError)throw error;throw new TelegramError(0,true);}
}
export function adminAuthorized(request,env){
 const bearer=request.headers.get('authorization')||'';
 return typeof env.MANAGED_BOTS_ADMIN_KEY==='string'&&env.MANAGED_BOTS_ADMIN_KEY.length>=32&&safeEqual(bearer,'Bearer '+env.MANAGED_BOTS_ADMIN_KEY);
}
export function requireAdmin(request,env){
 return adminAuthorized(request,env)?null:responseJson({error:'unauthorized'},401);
}
export function validBotToken(token){return typeof token==='string'&&/^\d{5,20}:[A-Za-z0-9_-]{30,100}$/.test(token);}
