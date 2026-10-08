import { isSafeBotKey, safeEqual, validUpdate, responseJson } from '../_lib/managed-bots.js';

// Fail closed: no public registration, no token acceptance, no payment handling.
// D1 schema and trusted secret storage must be provisioned before enabling bots.
export async function onRequestPost({request,env,params}) {
  const botKey=String(params?.botKey || '');
  if (!isSafeBotKey(botKey)) return responseJson({error:'not_found'},404);
  if (!env?.DB) return responseJson({error:'unavailable'},503);
  const bot=await env.DB.prepare(
    'SELECT id, status, webhook_secret FROM managed_bots WHERE webhook_key = ? LIMIT 1'
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
  // No acknowledgement of delivery until durable processing is implemented.
  // 503 causes Telegram to retry rather than silently dropping updates.
  return responseJson({error:'handler_not_enabled'},503);
}
export async function onRequestGet() {
  return responseJson({error:'method_not_allowed'},405);
}
