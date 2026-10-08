import {responseJson} from '../_lib/managed-bots.js';
import {randomHex,encryptToken,decryptToken,telegram,requireAdmin,validBotToken} from '../_lib/managed-bot-runtime.js';
export async function onRequest({request,env}){
 const denied=requireAdmin(request,env);if(denied)return denied;
 if(!env.DB||!env.MANAGED_BOT_ENCRYPTION_KEY)return responseJson({error:'not_configured'},503);
 if(request.method==='GET'){
  const rows=await env.DB.prepare('SELECT id,owner_id,bot_telegram_id,bot_username,status,welcome_text,created_at FROM managed_bots ORDER BY created_at DESC LIMIT 100').all();
  return responseJson({bots:rows.results||[]});
 }
 if(request.method!=='POST')return responseJson({error:'method_not_allowed'},405);
 let input;try{input=await request.json();}catch{return responseJson({error:'invalid_json'},400);}
 if(input?.action==='activate'){
  if(typeof input.id!=='string'||input.confirmWebhookTakeover!==true)return responseJson({error:'confirmation_required'},400);
  const bot=await env.DB.prepare('SELECT id,webhook_key,webhook_secret,token_encrypted,status FROM managed_bots WHERE id=?').bind(input.id).first();
  if(!bot)return responseJson({error:'not_found'},404);
  const origin=String(env.MANAGED_BOTS_PUBLIC_ORIGIN||'').replace(/\/$/,'');
  if(!/^https:\/\/[^/]+$/.test(origin))return responseJson({error:'https_required'},400);
  try{
    const token=await decryptToken(bot.token_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY);
    const current=await telegram(token,'getWebhookInfo',{});
    if(current?.url && !input.confirmWebhookTakeover)return responseJson({error:'existing_webhook'},409);
    await telegram(token,'setWebhook',{url:origin+'/managed-bots/'+bot.webhook_key,secret_token:bot.webhook_secret,drop_pending_updates:false,allowed_updates:['message']});
    await env.DB.prepare("UPDATE managed_bots SET status='active',updated_at=? WHERE id=?").bind(Date.now(),bot.id).run();
    return responseJson({ok:true,status:'active'});
  }catch{return responseJson({error:'activation_failed'},503);}
 }
 if(input?.action==='disable'){
  if(typeof input.id!=='string')return responseJson({error:'invalid_id'},400);
  const row=await env.DB.prepare('SELECT id,token_encrypted FROM managed_bots WHERE id=?').bind(input.id).first();
  if(!row)return responseJson({error:'not_found'},404);
  try { const token=await decryptToken(row.token_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY); await telegram(token,'deleteWebhook',{drop_pending_updates:false}); }
  catch { return responseJson({error:'webhook_removal_failed'},503); }
  await env.DB.prepare("UPDATE managed_bots SET status='disabled',updated_at=? WHERE id=?").bind(Date.now(),input.id).run();
  return responseJson({ok:true,status:'disabled'});
 }
 if(input?.action==='welcome'){
  if(typeof input.id!=='string'||typeof input.text!=='string'||input.text.length>3000)return responseJson({error:'invalid_input'},400);
  const result=await env.DB.prepare('UPDATE managed_bots SET welcome_text=?,updated_at=? WHERE id=?').bind(input.text,Date.now(),input.id).run();
  return result.meta?.changes ? responseJson({ok:true}) : responseJson({error:'not_found'},404);
 }
 if(input?.action!=='register'||!validBotToken(input.token)||!/^\d{1,20}$/.test(String(input.ownerId||'')))return responseJson({error:'invalid_input'},400);
 let me;try{me=await telegram(input.token,'getMe',{});}catch{return responseJson({error:'invalid_token'},400);}
 if(!me?.is_bot||!Number.isSafeInteger(me.id))return responseJson({error:'invalid_bot'},400);
 if(String(me.username||'').toLowerCase()==='richcustomizebot')return responseJson({error:'reserved_bot'},409);
 const existing=await env.DB.prepare('SELECT id FROM managed_bots WHERE bot_telegram_id=?').bind(String(me.id)).first();
 if(existing)return responseJson({error:'already_registered'},409);
 const id=randomHex(16),webhookKey=randomHex(24),webhookSecret=randomHex(24),now=Date.now();
 const tokenEncrypted=await encryptToken(input.token,env.MANAGED_BOT_ENCRYPTION_KEY);
 // No webhook is set until explicit activation. Registration cannot disrupt an existing bot.
 await env.DB.prepare('INSERT INTO managed_bots (id,owner_id,bot_telegram_id,bot_username,webhook_key,webhook_secret,token_encrypted,status,welcome_text,created_at,updated_at) VALUES (?,?,?,?,?,?,?,\'disabled\',?,?,?)')
 .bind(id,String(input.ownerId),String(me.id),String(me.username||''),webhookKey,webhookSecret,tokenEncrypted,'',now,now).run().catch(async()=>{throw Error('registration_failed');});
 return responseJson({ok:true,id,username:me.username,status:'disabled',requiresActivation:true},201);
}
