import { isSafeBotKey, safeEqual, validUpdate, responseJson } from '../_lib/managed-bots.js';
import { decryptToken, telegram } from '../_lib/managed-bot-runtime.js';

// Fail closed: no public registration, no token acceptance, no payment handling.
// D1 schema and trusted secret storage must be provisioned before enabling bots.
export async function onRequestPost({request,env,params}) {
  const botKey=String(params?.botKey || '');
  if (!isSafeBotKey(botKey)) return responseJson({error:'not_found'},404);
  if (!env?.DB) return responseJson({error:'unavailable'},503);
  const bot=await env.DB.prepare(
    'SELECT id, owner_id, status, webhook_secret, token_encrypted, welcome_text FROM managed_bots WHERE webhook_key = ? LIMIT 1'
  ).bind(botKey).first().catch(()=>null);
  if (!bot || bot.status !== 'active') return responseJson({error:'not_found'},404);
  const secret=request.headers.get('X-Telegram-Bot-Api-Secret-Token');
  if (!secret || !safeEqual(secret,String(bot.webhook_secret || ''))) return responseJson({error:'unauthorized'},401);
  const size=Number(request.headers.get('content-length') || 0);
  if (size > 262144) return responseJson({error:'too_large'},413);
  let update;
  try {
    const raw=await request.text();
    if (raw.length > 262144) return responseJson({error:'too_large'},413);
    update=JSON.parse(raw);
  } catch { return responseJson({error:'invalid_json'},400); }
  if (!validUpdate(update)) return responseJson({error:'invalid_update'},400);
  if (!env.MANAGED_BOT_ENCRYPTION_KEY) return responseJson({error:'unavailable'},503);
  const message=update.message;
  // Only recognized private-chat commands are handled; other updates are acknowledged.
  // A failed send is retried by Telegram. Completed updates are deduplicated in D1.
  const existing=await env.DB.prepare('SELECT status FROM managed_bot_updates WHERE bot_id=? AND update_id=?')
    .bind(bot.id,update.update_id).first();
  if (existing?.status==='completed') return responseJson({ok:true,duplicate:true});
  if (message?.chat?.type==='private' && typeof message.text==='string') {
    const cmd=message.text.trim().split(/\\s+/)[0].split('@')[0].toLowerCase();
    let reply=null;
    if(cmd==='/start')reply=String(bot.welcome_text||'أهلاً بيك. هذا بوت مُدار بواسطة Rich Customize.');
    if(cmd==='/admin')reply=String(message.from?.id)===String(bot.owner_id)
      ? 'إدارة البوت حالياً من لوحة المشرف المركزية.':'هذا الأمر مخصص لمالك البوت.';
    if(reply){
      try{
        const token=await decryptToken(bot.token_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY);
        await telegram(token,'sendMessage',{chat_id:message.chat.id,text:reply.slice(0,4000)});
      }catch{return responseJson({error:'delivery_failed'},503);}
    }
  }
  try{
    await env.DB.prepare("INSERT INTO managed_bot_updates(bot_id,update_id,status,received_at) VALUES(?,?,'completed',?) ON CONFLICT(bot_id,update_id) DO UPDATE SET status='completed'")
      .bind(bot.id,update.update_id,Date.now()).run();
  }catch{return responseJson({error:'persistence_failed'},503);}
  return responseJson({ok:true});
}
export async function onRequestGet() {
  return responseJson({error:'method_not_allowed'},405);
}
