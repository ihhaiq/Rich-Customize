import { miniAppUser } from '../../_lib/telegram-auth.js';
import { responseJson } from '../../_lib/managed-bots.js';
import { randomHex, encryptToken, decryptToken, telegram, validBotToken } from '../../_lib/managed-bot-runtime.js';

// Private Telegram Mini App entry only; disabled until a trusted entitlement provider is connected.
export async function onRequest(context) {
  const {request,env}=context;
  let user;
  try { user=await miniAppUser(context); } catch { return responseJson({error:'unauthorized'},401); }
  if(!env.DB || !env.MANAGED_BOT_ENCRYPTION_KEY)return responseJson({error:'not_configured'},503);
  const ownerId=String(user.id);
  if(request.method==='GET'){
    const result=await env.DB.prepare('SELECT id,bot_telegram_id,bot_username,status,welcome_text,created_at FROM managed_bots WHERE owner_id=? ORDER BY created_at DESC LIMIT 50').bind(ownerId).all();
    return responseJson({bots:result.results||[]});
  }
  if(request.method!=='POST')return responseJson({error:'method_not_allowed'},405);
  let body;try{body=await request.json();}catch{return responseJson({error:'invalid_json'},400);}
  if(body?.action==='welcome'){
    if(typeof body.id!=='string'||typeof body.text!=='string'||body.text.length>3000)return responseJson({error:'invalid_input'},400);
    const result=await env.DB.prepare('UPDATE managed_bots SET welcome_text=?,updated_at=? WHERE id=? AND owner_id=?').bind(body.text,Date.now(),body.id,ownerId).run();
    return result.meta?.changes?responseJson({ok:true}):responseJson({error:'not_found'},404);
  }
  // Registration and activation remain restricted until the subscription service provides
  // authoritative per-bot licenses. Never use client-provided plan or owner IDs.
  return responseJson({error:'feature_not_enabled'},403);
}
