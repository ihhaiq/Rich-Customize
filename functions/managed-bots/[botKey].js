import { isSafeBotKey,safeEqual,validUpdate,responseJson } from '../_lib/managed-bots.js';
import { enqueue,processJob } from '../_lib/managed-bot-jobs.js';
import { rateLimit,licenseFor,ManagedError } from '../_lib/managed-bot-service.js';
export async function onRequestPost(context) {
 const {request,env,params}=context;
 try {
 if(!isSafeBotKey(String(params?.botKey||'')))return responseJson({error:'not_found'},404);
 if(!env.DB||!env.MANAGED_BOT_ENCRYPTION_KEY)return responseJson({error:'unavailable'},503);
 const bot=await env.DB.prepare('SELECT * FROM managed_bots WHERE webhook_key=?').bind(params.botKey).first();
 if(!bot)return responseJson({error:'not_found'},404);
 if(!safeEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token')||'',bot.webhook_secret))return responseJson({error:'unauthorized'},401);
 if(bot.status!=='active'||!await licenseFor(env,bot))return responseJson({ok:true,paused:true});
 await rateLimit(env.DB,'webhook:'+bot.id,120);
 if(Number(request.headers.get('content-length'))>262144)return responseJson({error:'too_large'},413);
 const raw=await request.text();if(new TextEncoder().encode(raw).length>262144)return responseJson({error:'too_large'},413);
 let update;try{update=JSON.parse(raw);}catch{return responseJson({error:'invalid_json'},400);}
 if(!validUpdate(update))return responseJson({error:'invalid_update'},400);
 const job=await enqueue(env,bot,'u:'+update.update_id,{kind:'update',update});
 const result=await processJob(context,bot.id,job.job_id);
 return responseJson({ok:!['pending','busy'].includes(result.status),...result},['pending','busy'].includes(result.status)?503:200);
 }catch(e){return responseJson({error:e instanceof ManagedError?e.code:'unavailable'},e instanceof ManagedError?e.status:503);}
}
export async function onRequestGet(){return responseJson({error:'method_not_allowed'},405);}
