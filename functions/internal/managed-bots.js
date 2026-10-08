import {responseJson} from '../_lib/managed-bots.js';
import {requireAdmin} from '../_lib/managed-bot-runtime.js';
import {recoverJobs} from '../_lib/managed-bot-jobs.js';
// No admin registration bypass. Provisioning only accepts trusted Telegram owners.
export async function onRequest(context){
 const denied=requireAdmin(context.request,context.env);if(denied)return denied;
 try{
 if(context.request.method==='POST')return responseJson(await recoverJobs(context));
 if(context.request.method==='GET') {
 const result=await context.env.DB.prepare("SELECT bot_id,job_id,status,error_code,attempts,updated_at FROM managed_bot_jobs WHERE status IN ('uncertain','failed') ORDER BY updated_at DESC LIMIT 100").all();return responseJson({jobs:result.results});
 }
 return responseJson({error:'method_not_allowed'},405);
 }catch{return responseJson({error:'unavailable'},503);}
}
