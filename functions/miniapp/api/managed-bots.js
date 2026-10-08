import { miniAppUser } from '../../_lib/telegram-auth.js';
import { responseJson } from '../../_lib/managed-bots.js';
import { ManagedError,fail,rateLimit,listBots,registerBot,manageBot,ownedBot,requireLicense,lockBot,unlockBot } from '../../_lib/managed-bot-service.js';
import { requestManagedPage,portablePage } from '../../_lib/managed-bot-pages.js';
import { enqueue,processJob } from '../../_lib/managed-bot-jobs.js';
import { queueTextBridgeRequest } from '../../_lib/b2b-bridge.js';
export async function onRequest(context) {
 const {request,env}=context;
 let user;try{user=await miniAppUser(context);}catch{return responseJson({error:'unauthorized'},401);}
 try{
 if(!env.DB||!env.MANAGED_BOT_ENCRYPTION_KEY)fail('not_configured',503);
 const owner=String(user.id);await rateLimit(env.DB,'owner:'+owner,60);
 if(request.method==='GET'){
  const result=await listBots(env,owner);
  let licenseSyncRequestId=null;
  try{licenseSyncRequestId=await queueTextBridgeRequest(context,{action:'licenses',userId:user.id});}catch(error){console.warn('managed license bridge sync unavailable',error);}
  return responseJson({...result,license_sync_request_id:licenseSyncRequestId});
 }
 if(request.method!=='POST')return responseJson({error:'method_not_allowed'},405);
 const raw=await request.text();if(raw.length>16384)fail('too_large',413);
 let input;try{input=JSON.parse(raw);}catch{fail('invalid_json');}if(!input||typeof input!=='object')fail('invalid_input');
 if(input.action==='register')return responseJson(await registerBot(env,owner,input),201);
 if(input.action==='pages')return responseJson({pending:true,request_id:await queueTextBridgeRequest(context,{action:'pages',userId:user.id})},202);
 const bot=await ownedBot(env,owner,input.id);
 if(input.action==='jobs') {
 const rows=await env.DB.prepare('SELECT job_id,status,error_code,message_id,updated_at FROM managed_bot_jobs WHERE bot_id=? ORDER BY updated_at DESC LIMIT 20').bind(bot.id).all();return responseJson({jobs:rows.results});
 }
 if(input.action==='bind_page') {
 await requireLicense(env,bot);
 const result=await requestManagedPage(context,owner,input.page_id,input.request_id);
 if(result.pending)return responseJson(result,202);
 portablePage(result.page);
 const lock=await lockBot(env,bot);
 try{await requireLicense(env,bot);await env.DB.prepare('UPDATE managed_bots SET welcome_page_id=?,updated_at=? WHERE id=? AND owner_id=?').bind(result.page.page_id,Date.now(),bot.id,owner).run();}finally{await unlockBot(env,bot,lock);}
 return responseJson({ok:true});
 }
 if(input.action==='publish') {
 await requireLicense(env,bot);if(bot.status!=='active')fail('bot_not_active',409);
 if(!/^[a-zA-Z0-9_-]{16,80}$/.test(input.request_id||'')||!Number.isSafeInteger(Number(input.chat_id))||!Number(input.chat_id)||typeof input.page_id!=='string'||input.page_id.length>100)fail('invalid_input');
 const job=await enqueue(env,bot,'p:'+input.request_id,{kind:'publish',page_id:input.page_id,chat_id:Number(input.chat_id)});
 return responseJson({ok:true,job_id:job.job_id,...await processJob(context,bot.id,job.job_id)},202);
 }
 if(input.action==='job') {
 const job=await env.DB.prepare('SELECT job_id,status,error_code,message_id FROM managed_bot_jobs WHERE bot_id=? AND job_id=?').bind(bot.id,String(input.job_id||'')).first();if(!job)fail('not_found',404);
 if(['pending','processing'].includes(job.status))return responseJson({...job,...await processJob(context,bot.id,job.job_id)});
 return responseJson(job);
 }
 return responseJson(await manageBot(env,owner,input));
 }catch(e){return responseJson({error:e instanceof ManagedError?e.code:'unavailable'},e instanceof ManagedError?e.status:503);}
}
