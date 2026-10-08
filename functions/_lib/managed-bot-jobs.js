import { transferRichMedia } from './managed-bot-media.js';
import { decryptToken,encryptToken,randomHex,telegram,TelegramError } from './managed-bot-runtime.js';
import { fail,ManagedError,licenseFor,lockBot,unlockBot } from './managed-bot-service.js';
import { requestManagedPage,pagePayload,callbackAction } from './managed-bot-pages.js';
export function parseCommand(text,username='') {
 if(typeof text!=='string')return '';
 const command=text.trim().split(/\s+/,1)[0].toLowerCase();
 const [name,target]=command.split('@');
 if(target&&target!==String(username).toLowerCase())return '';
 return name;
}
export async function enqueue(env,bot,jobId,payload) {
 const encrypted=await encryptToken(JSON.stringify(payload),env.MANAGED_BOT_ENCRYPTION_KEY),now=Date.now();
 await env.DB.prepare(`INSERT OR IGNORE INTO managed_bot_jobs(bot_id,job_id,payload_encrypted,status,created_at,updated_at) VALUES(?,?,?,'pending',?,?)`).bind(bot.id,jobId,encrypted,now,now).run();
 const row=await env.DB.prepare('SELECT * FROM managed_bot_jobs WHERE bot_id=? AND job_id=?').bind(bot.id,jobId).first();
 if(row.payload_encrypted && !jobId.startsWith('u:')) {
 const previous=JSON.parse(await decryptToken(row.payload_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY));
 if(JSON.stringify(previous)!==JSON.stringify(payload))fail('idempotency_conflict',409);
 }
 return row;
}
async function setJob(env,job,key,status,error=null,delay=0) {
 await env.DB.prepare('UPDATE managed_bot_jobs SET status=?,error_code=?,next_attempt_at=?,lease_until=0,updated_at=? WHERE bot_id=? AND job_id=? AND lease_key=?')
 .bind(status,error,Date.now()+delay,Date.now(),job.bot_id,job.job_id,key).run();
}
async function canSend(token,bot,chatId) {
 if(String(chatId)===String(bot.owner_id))return;
 const chat=await telegram(token,'getChat',{chat_id:chatId});
 if(!['group','supergroup','channel'].includes(chat.type))fail('destination_not_allowed',403);
 const [self,owner]=await Promise.all([
 telegram(token,'getChatMember',{chat_id:chatId,user_id:Number(bot.bot_telegram_id)}),
 telegram(token,'getChatMember',{chat_id:chatId,user_id:Number(bot.owner_id)})]);
 if(!['administrator','creator'].includes(owner.status))fail('owner_chat_permission_required',403);
 if(chat.type==='channel'&&!(self.status==='creator'||self.status==='administrator'&&self.can_post_messages))fail('bot_chat_permission_required',403);
 if(['left','kicked'].includes(self.status)||self.status==='restricted'&&!self.can_send_messages||self.status==='member'&&chat.permissions?.can_send_messages===false)fail('bot_chat_permission_required',403);
}
async function plan(context,bot,job,payload,token,key) {
 if(payload.kind==='publish') {
 await canSend(token,bot,payload.chat_id);
 const result=await requestManagedPage(context,bot.owner_id,payload.page_id,job.bridge_request_id);
 if(result.pending){await context.env.DB.prepare('UPDATE managed_bot_jobs SET bridge_request_id=? WHERE bot_id=? AND job_id=? AND lease_key=?').bind(result.request_id,bot.id,job.job_id,key).run();return {pending:true};}
 return {method:'sendRichMessage',args:pagePayload(result.page,payload.chat_id),page_id:payload.page_id,page_revision:Number(result.page.updated_at||0)};
 }
 const update=payload.update,cb=update?.callback_query,message=update?.message;
 if(cb?.id) {
 const publication=cb.message&&await context.env.DB.prepare('SELECT page_id,page_revision FROM managed_bot_publications WHERE bot_id=? AND chat_id=? AND message_id=?').bind(bot.id,String(cb.message.chat.id),cb.message.message_id).first();
 if(!publication)return {method:'answerCallbackQuery',args:{callback_query_id:cb.id,text:'هذا الزر غير مرتبط بصفحة متاحة.',show_alert:true}};
 const result=await requestManagedPage(context,bot.owner_id,publication.page_id,job.bridge_request_id);
 if(result.pending){await context.env.DB.prepare('UPDATE managed_bot_jobs SET bridge_request_id=? WHERE bot_id=? AND job_id=? AND lease_key=?').bind(result.request_id,bot.id,job.job_id,key).run();return {pending:true};}
 if(Number(publication.page_revision)!==Number(result.page.updated_at||0))return {method:'answerCallbackQuery',args:{callback_query_id:cb.id,text:'تغيّرت الصفحة. افتح النسخة الجديدة من الرسالة.',show_alert:true}};
 const action=callbackAction(result.page,String(cb.data||''));
 if(action.page_id) {
 // Do not allow a callback to publish into a different chat or impersonate owner commands.
 const next={kind:'navigation',page_id:action.page_id,chat_id:cb.message.chat.id};
 await context.env.DB.prepare('UPDATE managed_bot_jobs SET payload_encrypted=?,bridge_request_id=NULL WHERE bot_id=? AND job_id=? AND lease_key=?').bind(await encryptToken(JSON.stringify(next),context.env.MANAGED_BOT_ENCRYPTION_KEY),bot.id,job.job_id,key).run();
 return {pending:true};
 }
 return {method:'answerCallbackQuery',args:{callback_query_id:cb.id,text:action.text,show_alert:true}};
 }
 if(payload.kind==='navigation') {
 const result=await requestManagedPage(context,bot.owner_id,payload.page_id,job.bridge_request_id);
 if(result.pending){await context.env.DB.prepare('UPDATE managed_bot_jobs SET bridge_request_id=? WHERE bot_id=? AND job_id=? AND lease_key=?').bind(result.request_id,bot.id,job.job_id,key).run();return {pending:true};}
 return {method:'sendRichMessage',args:pagePayload(result.page,payload.chat_id),page_id:payload.page_id,page_revision:Number(result.page.updated_at||0)};
 }
 if(!message||!['private','group','supergroup'].includes(message.chat?.type))return {};
 const cmd=parseCommand(message.text,bot.bot_username);
 let text;
 if(cmd==='/admin')text=String(message.from?.id)===String(bot.owner_id)?'إدارة بوتك: افتح @RichCustomizebot ثم بوتاتي.':'هذا الأمر مخصص لمالك البوت.';
 else if(cmd==='/help')text='استعمل /start لعرض صفحة الترحيب. أمر /admin مخصص لمالك البوت.';
 else if(cmd==='/start') {
 if(bot.welcome_page_id){
 const result=await requestManagedPage(context,bot.owner_id,bot.welcome_page_id,job.bridge_request_id);
 if(result.pending){await context.env.DB.prepare('UPDATE managed_bot_jobs SET bridge_request_id=? WHERE bot_id=? AND job_id=? AND lease_key=?').bind(result.request_id,bot.id,job.job_id,key).run();return {pending:true};}
 return {method:'sendRichMessage',args:pagePayload(result.page,message.chat.id),page_id:bot.welcome_page_id,page_revision:Number(result.page.updated_at||0)};
 }
 text=bot.welcome_text||'أهلاً بيك.';
 }else {
 const configured=JSON.parse(bot.commands_json||'[]').find(c=>'/'+c.command===cmd);
 if(configured)text=configured.description;
 }
 return text?{method:'sendMessage',args:{chat_id:message.chat.id,text:text.slice(0,4000)}}:{};
}
export async function processJob(context,botId,jobId) {
 const {env}=context;
 let bot=await env.DB.prepare('SELECT * FROM managed_bots WHERE id=?').bind(botId).first();
 if(!bot||bot.status!=='active')return {status:'paused'};
 if(!await licenseFor(env,bot)) {
 await env.DB.prepare("UPDATE managed_bots SET status='suspended',last_error='license_expired' WHERE id=?").bind(botId).run();return {status:'suspended'};
 }
 let lock;try{lock=await lockBot(env,bot);}catch(e){if(e.code==='operation_in_progress')return {status:'busy'};throw e;}
 const key=randomHex(16);let sending=false,job;
 try{
 bot=await env.DB.prepare('SELECT * FROM managed_bots WHERE id=?').bind(botId).first();
 if(bot.status!=='active'||!await licenseFor(env,bot))return {status:'paused'};
 job=await env.DB.prepare('SELECT * FROM managed_bot_jobs WHERE bot_id=? AND job_id=?').bind(botId,jobId).first();
 if(!job)return {status:'missing'};
 if(['completed','uncertain','cancelled','failed'].includes(job.status))return {status:job.status};
 if(job.status==='sending')return {status:'uncertain'};
 const claimed=await env.DB.prepare(`UPDATE managed_bot_jobs SET status='processing',lease_key=?,lease_until=?,attempts=attempts+1,updated_at=? WHERE bot_id=? AND job_id=? AND ((status='pending' AND next_attempt_at<=?) OR (status='processing' AND lease_until<?))`)
 .bind(key,Date.now()+90000,Date.now(),botId,jobId,Date.now(),Date.now()).run();
 if(!claimed.meta?.changes)return {status:'busy'};
 const payload=JSON.parse(await decryptToken(job.payload_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY));
 const token=await decryptToken(bot.token_encrypted,env.MANAGED_BOT_ENCRYPTION_KEY);
 const delivery=await plan(context,bot,job,payload,token,key);
 if(delivery.pending){await setJob(env,job,key,'pending',null,1000);return {status:'pending'};}
 if(!delivery.method){await setJob(env,job,key,'completed');return {status:'completed'};}
 if(delivery.method==='sendRichMessage')delivery.args=await transferRichMedia(env,delivery.args);
 // A second check closes cancellation/expiry between rendering and sending.
 if(!await licenseFor(env,bot))fail('license_required',403);
 const fenced=await env.DB.prepare("UPDATE managed_bot_jobs SET status='sending',updated_at=? WHERE bot_id=? AND job_id=? AND lease_key=? AND status='processing' AND lease_until>? AND EXISTS(SELECT 1 FROM managed_bots b WHERE b.id=managed_bot_jobs.bot_id AND b.operation_key=? AND b.status='active')").bind(Date.now(),botId,jobId,key,Date.now(),lock).run();
 if(!fenced.meta?.changes)fail('lease_lost',409);
 sending=true;
 const result=await telegram(token,delivery.method,delivery.args);
 if(['sendMessage','sendRichMessage'].includes(delivery.method)&&!Number.isSafeInteger(result?.message_id))throw Error('invalid_send_receipt');
 const statements=[];
 if(delivery.page_id&&Number.isSafeInteger(result?.message_id))statements.push(env.DB.prepare('INSERT OR IGNORE INTO managed_bot_publications(bot_id,chat_id,message_id,page_id,page_revision,created_at) VALUES(?,?,?,?,?,?)').bind(botId,String(result.chat?.id??(delivery.args instanceof FormData?delivery.args.get('chat_id'):delivery.args.chat_id)),result.message_id,delivery.page_id,delivery.page_revision,Date.now()));
 statements.push(env.DB.prepare("UPDATE managed_bot_jobs SET status='completed',message_id=?,payload_encrypted='',lease_until=0,updated_at=? WHERE bot_id=? AND job_id=? AND lease_key=?").bind(result?.message_id||null,Date.now(),botId,jobId,key));
 await env.DB.batch(statements);
 return {status:'completed'};
 }catch(e){
 if(!job)throw e;
 const uncertain=sending&&(!(e instanceof TelegramError)||e.uncertain);
 const retry=!uncertain&&!(e instanceof ManagedError&&e.status<500)&&(!(e instanceof TelegramError)||e.code===429||e.code>=500||e.code===0)&&job.attempts<8;
 const status=uncertain?'uncertain':retry?'pending':'failed';
 const error=e instanceof ManagedError?e.code:e instanceof TelegramError?'telegram_'+e.code:'processing_failed';
 await setJob(env,job,key,status,error,Math.max((e.retryAfter||0)*1000,Math.min(300000,2000*2**job.attempts))).catch(()=>{});
 await env.DB.prepare('UPDATE managed_bots SET last_error=? WHERE id=?').bind(error,botId).run().catch(()=>{});
 if(e instanceof TelegramError&&[401,404].includes(e.code))await env.DB.prepare("UPDATE managed_bots SET status='needs_relink' WHERE id=?").bind(botId).run().catch(()=>{});
 return {status,error};
 }finally{await unlockBot(env,bot,lock);}
}
export async function recoverJobs(context) {
 const {DB:db}=context.env,now=Date.now();
 // An expired external operation is reconciled, never blindly replayed. Requests
 // have 12s network timeouts; the 5 minute quarantine outlives the 90s job lease.
 await db.batch([
 db.prepare("UPDATE managed_bot_jobs SET status='uncertain',error_code='send_outcome_unknown',updated_at=? WHERE status='sending' AND lease_until<?").bind(now,now),
 db.prepare("UPDATE managed_bots SET operation_key=NULL,operation_at=NULL,status=CASE WHEN status='active' THEN 'suspended' ELSE status END,last_error='stale_operation_review' WHERE operation_at<?").bind(now-300000),
 db.prepare("UPDATE managed_bots SET status='suspended',last_error='license_expired' WHERE status='active' AND NOT EXISTS(SELECT 1 FROM managed_bot_licenses l WHERE l.id=managed_bots.license_id AND l.owner_id=managed_bots.owner_id AND l.status='active' AND l.expires_at>?)").bind(now),
 db.prepare("UPDATE managed_bot_jobs SET status='cancelled',payload_encrypted='',error_code='expired',updated_at=? WHERE status IN ('pending','processing') AND created_at<? AND lease_until<?").bind(now,now-86400000,now),
 db.prepare('DELETE FROM managed_bot_rate_windows WHERE window<?').bind(Math.floor(now/60000)-60)
 ]);
 const jobs=await db.prepare(`SELECT j.bot_id,j.job_id FROM managed_bot_jobs j JOIN managed_bots b ON b.id=j.bot_id WHERE b.status='active' AND ((j.status='pending' AND j.next_attempt_at<=?) OR (j.status='processing' AND j.lease_until<?)) ORDER BY j.updated_at LIMIT 20`).bind(now,now).all();
 const results=[];for(const job of jobs.results)results.push(await processJob(context,job.bot_id,job.job_id));return {ok:true,processed:results.length,results};
}
