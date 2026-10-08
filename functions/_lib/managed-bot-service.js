import { randomHex, encryptToken, decryptToken, telegram, validBotToken } from './managed-bot-runtime.js';
export class ManagedError extends Error {
 constructor(code, status=400) { super(code); this.code=code; this.status=status; }
}
export const fail=(code,status=400)=>{throw new ManagedError(code,status);};
export async function rateLimit(db,key,limit=30) {
 const window=Math.floor(Date.now()/60000);
 const row=await db.prepare(`INSERT INTO managed_bot_rate_windows(key,window,hits) VALUES(?,?,1)
 ON CONFLICT(key) DO UPDATE SET window=excluded.window,hits=CASE WHEN window=excluded.window THEN hits+1 ELSE 1 END RETURNING hits`).bind(key,window).first();
 if(row.hits>limit)fail('rate_limited',429);
}
export async function ownedBot(env,owner,id) {
 const row=await env.DB.prepare('SELECT * FROM managed_bots WHERE id=? AND owner_id=?').bind(String(id||''),String(owner)).first();
 if(!row)fail('not_found',404); return row;
}
export async function licenseFor(env,bot) {
 return env.DB.prepare("SELECT * FROM managed_bot_licenses WHERE id=? AND owner_id=? AND status='active' AND expires_at>?")
 .bind(bot.license_id,String(bot.owner_id),Date.now()).first();
}
export async function requireLicense(env,bot) { if(!await licenseFor(env,bot))fail('license_required',403); }
export function webhookUrl(env,bot) {
 let origin;try{origin=new URL(env.MANAGED_BOTS_PUBLIC_ORIGIN);}catch{fail('not_configured',503);}
 if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)fail('not_configured',503);
 return origin.origin+'/managed-bots/'+bot.webhook_key;
}
export async function lockBot(env,bot) {
 const key=randomHex(16);
 const r=await env.DB.prepare('UPDATE managed_bots SET operation_key=?,operation_at=? WHERE id=? AND owner_id=? AND operation_key IS NULL')
 .bind(key,Date.now(),bot.id,String(bot.owner_id)).run();
 if(!r.meta?.changes)fail('operation_in_progress',409); return key;
}
export async function unlockBot(env,bot,key) {
 await env.DB.prepare('UPDATE managed_bots SET operation_key=NULL,operation_at=NULL WHERE id=? AND operation_key=?').bind(bot.id,key).run();
}
export function publicBot(b) {
 return Object.fromEntries(['id','bot_telegram_id','bot_username','bot_name','status','welcome_text','welcome_page_id','license_id','expires_at','license_status','last_error','created_at','commands_json'].map(k=>[k,b[k]??null]));
}
export async function listBots(env,owner) {
 const rows=await env.DB.prepare(`SELECT b.*,l.expires_at,l.status AS license_status FROM managed_bots b LEFT JOIN managed_bot_licenses l ON l.id=b.license_id AND l.owner_id=b.owner_id WHERE b.owner_id=? ORDER BY b.created_at DESC`).bind(String(owner)).all();
 const licenses=await env.DB.prepare(`SELECT l.id,l.expires_at FROM managed_bot_licenses l WHERE owner_id=? AND status='active' AND expires_at>? AND NOT EXISTS(SELECT 1 FROM managed_bots b WHERE b.license_id=l.id)`).bind(String(owner),Date.now()).all();
 return {bots:rows.results.map(b=>publicBot({...b,status:b.status==='active'&&(!(b.expires_at>Date.now())||b.license_status!=='active')?'suspended':b.status})),licenses:licenses.results,registration_enabled:env.MANAGED_BOTS_REGISTRATION_ENABLED!=='false'};
}
async function verifyToken(env,token) {
 if(!validBotToken(token))fail('invalid_token');
 let me;try{me=await telegram(token,'getMe',{});}catch{fail('invalid_token');}
 if(!me?.is_bot||!Number.isSafeInteger(me.id)||String(me.id)!==token.split(':')[0])fail('invalid_token');
 const names=new Set(['richcustomizebot','richdonatebot','richminiappsbot',...String(env.MANAGED_BOTS_RESERVED_USERNAMES||'').toLowerCase().split(',').map(x=>x.trim().replace(/^@/,''))]);
 const ids=String(env.MANAGED_BOTS_RESERVED_IDS||'').split(',').map(x=>x.trim());
 for(const key of ['BOT_TOKEN','B2B_BOT_TOKEN','RELAY_BOT_TOKEN','SUBSCRIPTION_BOT_TOKEN'])if(env[key])ids.push(String(env[key]).split(':')[0]);
 if(names.has(String(me.username||'').toLowerCase())||ids.includes(String(me.id)))fail('reserved_bot',409);
 return me;
}
export async function registerBot(env,owner,input) {
 if(env.MANAGED_BOTS_REGISTRATION_ENABLED==='false')fail('registration_closed',403);
 const licenseId=String(input.license_id||'');
 await requireLicense(env,{license_id:licenseId,owner_id:owner});
 const me=await verifyToken(env,input.token);
 const encrypted=await encryptToken(input.token,env.MANAGED_BOT_ENCRYPTION_KEY);
 const id=randomHex(16), now=Date.now();
 try {
 const r=await env.DB.prepare(`INSERT INTO managed_bots(id,owner_id,bot_telegram_id,bot_username,bot_name,webhook_key,webhook_secret,token_encrypted,status,license_id,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,?,'disabled',?,?,? WHERE EXISTS(SELECT 1 FROM managed_bot_licenses WHERE id=? AND owner_id=? AND status='active' AND expires_at>?)`)
 .bind(id,String(owner),String(me.id),String(me.username||''),String(me.first_name||''),randomHex(24),randomHex(24),encrypted,licenseId,now,now,licenseId,String(owner),now).run();
 if(!r.meta?.changes)fail('license_required',403);
 }catch(e){if(e instanceof ManagedError)throw e;fail('bot_or_license_already_linked',409);}
 return {ok:true,bot:publicBot(await ownedBot(env,owner,id))};
}
export async function manageBot(env,owner,input) {
 let bot=await ownedBot(env,owner,input.id);
 const key=await lockBot(env,bot);
 try {
 bot=await ownedBot(env,owner,input.id);
 if(input.action==='welcome') {
 if(typeof input.text!=='string'||input.text.length>3000)fail('invalid_input');
 await env.DB.prepare('UPDATE managed_bots SET welcome_text=?,welcome_page_id=NULL,updated_at=? WHERE id=? AND owner_id=?').bind(input.text,Date.now(),bot.id,String(owner)).run();
 return {ok:true};
 }
 if(input.action==='activate') {
 await requireLicense(env,bot);
 const token=await decryptToken(bot.token_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY);
 const me=await telegram(token,'getMe',{});if(String(me.id)!==bot.bot_telegram_id)fail('identity_mismatch');
 const current=await telegram(token,'getWebhookInfo',{}), url=webhookUrl(env,bot);
 if(input.confirm!==true) return {ok:false,confirmation_required:true,existing_webhook:Boolean(current.url),external_webhook:Boolean(current.url&&current.url!==url)};
 if(current.url&&current.url!==url&&input.confirmWebhookTakeover!==true)fail('webhook_takeover_confirmation_required',409);
 // Stop local dispatch before any external mutation; an uncertain operation stays suspended.
 await env.DB.prepare("UPDATE managed_bots SET status='suspended',last_error='activation_pending' WHERE id=?").bind(bot.id).run();
 await telegram(token,'setWebhook',{url,secret_token:bot.webhook_secret,drop_pending_updates:false,allowed_updates:['message','callback_query','my_chat_member','channel_post']});
 await requireLicense(env,bot);
 await env.DB.prepare("UPDATE managed_bots SET status='active',last_error=NULL,updated_at=? WHERE id=? AND owner_id=?").bind(Date.now(),bot.id,String(owner)).run();
 }else if(['disable','unlink'].includes(input.action)) {
 if(input.confirm!==true)fail('confirmation_required');
 await env.DB.prepare("UPDATE managed_bots SET status='disabled',updated_at=? WHERE id=? AND owner_id=?").bind(Date.now(),bot.id,String(owner)).run();
 const token=await decryptToken(bot.token_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY);
 const current=await telegram(token,'getWebhookInfo',{});
 // Never remove a webhook that now belongs to another service.
 if(current.url===webhookUrl(env,bot))await telegram(token,'deleteWebhook',{drop_pending_updates:false});
 if(input.action==='unlink') {
 await env.DB.batch([
 env.DB.prepare("UPDATE managed_bot_jobs SET status='cancelled',payload_encrypted='',updated_at=? WHERE bot_id=? AND status NOT IN ('completed','uncertain')").bind(Date.now(),bot.id),
 env.DB.prepare('DELETE FROM managed_bot_updates WHERE bot_id=?').bind(bot.id),
 env.DB.prepare('DELETE FROM managed_bot_publications WHERE bot_id=?').bind(bot.id),
 env.DB.prepare('DELETE FROM managed_bots WHERE id=? AND owner_id=?').bind(bot.id,String(owner))]);
 }
 }else if(input.action==='rotate_token') {
 if(input.confirm!==true)fail('confirmation_required');
 const me=await verifyToken(env,input.token);if(String(me.id)!==bot.bot_telegram_id)fail('identity_mismatch');
 const encrypted=await encryptToken(input.token,env.MANAGED_BOT_ENCRYPTION_KEY);
 // Explicit activation is required again, preserving any existing external webhook.
 await env.DB.prepare("UPDATE managed_bots SET token_encrypted=?,webhook_secret=?,status='disabled',last_error=NULL,updated_at=? WHERE id=? AND owner_id=?")
 .bind(encrypted,randomHex(24),Date.now(),bot.id,String(owner)).run();
 }else if(input.action==='commands') {
 if(!Array.isArray(input.commands)||input.commands.length>20||input.commands.some(c=>!/^\/[a-z][a-z0-9_]{0,30}$/.test(c.command)||typeof c.description!=='string'||!c.description.length||c.description.length>256))fail('invalid_commands');
 await requireLicense(env,bot);
 const commands=[{command:'start',description:'الترحيب'},{command:'help',description:'المساعدة'},{command:'admin',description:'إدارة البوت للمالك'},...input.commands.filter(c=>!['/start','/help','/admin'].includes(c.command)).map(c=>({command:c.command.slice(1),description:c.description}))];
 await telegram(await decryptToken(bot.token_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY),'setMyCommands',{commands});
 await env.DB.prepare('UPDATE managed_bots SET commands_json=?,updated_at=? WHERE id=? AND owner_id=?').bind(JSON.stringify(commands),Date.now(),bot.id,String(owner)).run();
 }else fail('invalid_action');
 return {ok:true};
 }catch(e){
 await env.DB.prepare('UPDATE managed_bots SET last_error=? WHERE id=? AND owner_id=?').bind(e instanceof ManagedError?e.code:'connection_failed',bot.id,String(owner)).run().catch(()=>{});throw e;
 }finally{await unlockBot(env,bot,key);}
}
