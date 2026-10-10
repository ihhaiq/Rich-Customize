// Scheduled rich posts live entirely in Telegram Serverless.
// Cloudflare is an ID/time reminder service over the existing RCB1 B2B group.
import { api, db } from 'sdk';
import { and, eq } from 'sdk/db';
import { scheduledPosts, scheduledPostDestinations, editorSessions, richPages } from 'schema';
import { loadEditorSession, updateEditorSession } from 'lib/editor-session';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { isLegacySavedPage, isSavedPageUnchanged } from 'lib/saved-page-policy';
import { validateScheduleRequest } from 'lib/schedule-policy';
import { inspectPublishAccess, sendRichMessageSafe } from 'lib/publish';
import { isDefinitePublishRejection, normalizePublishError } from 'lib/publish-errors';
import { buildInputRichMessage } from 'lib/editor-renderer';
import { prepareMessageButtons, buildMessageButtonsKeyboard } from 'lib/page-buttons';
import { shouldIncludeBranding } from 'lib/branding';
import { logError } from 'lib/error-log';

const CHAT_ID = -1003993506865;
const JOB_RE = /^sch_[a-f0-9]{32}$/;
const B2B = 'Richminiappsbot';
const STATUS_PENDING = new Set(['registering','pending']);

function now(){return Math.floor(Date.now()/1000);}
function newJobId(){
  const data = new Uint8Array(16);
  globalThis.crypto.getRandomValues(data);
  return 'sch_' + Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');
}
export function parseBaghdadDate(value){
  const match=String(value||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if(!match)return null;
  const [y,m,d,h,minute]=match.slice(1).map(Number);
  if(y<2020||m<1||m>12||d<1||d>31||h>23||minute>59)return null;
  const timestamp=Date.UTC(y,m-1,d,h-3,minute,0)/1000;
  const roundTrip=new Date((timestamp+3*3600)*1000);
  if(roundTrip.getUTCFullYear()!==y||roundTrip.getUTCMonth()+1!==m||roundTrip.getUTCDate()!==d||roundTrip.getUTCHours()!==h||roundTrip.getUTCMinutes()!==minute)return null;
  return timestamp;
}
function formatBaghdad(timestamp){
  const d=new Date((Number(timestamp)+3*3600)*1000);
  return d.toISOString().slice(0,16).replace('T',' ')+' (بغداد)';
}
async function relay(action, jobId, revision, extras={}){
  return api.sendMessage({
    chat_id:CHAT_ID,
    disable_notification:true,
    text:'/rcb_schedule_'+action+'@'+B2B+'\n'+JSON.stringify({
      protocol:'RCB1',request_id:'sch_'+action+'_'+jobId+'_'+revision,
      job_id:jobId,revision,...extras,
    }),
  });
}
async function loadJob(jobId){return db.select().from(scheduledPosts).where(eq(scheduledPosts.jobId,jobId)).get();}
async function userTasks(userId){
  const result=await db.select().from(scheduledPosts).where(eq(scheduledPosts.ownerId,Number(userId))).all();
  return result.sort((a,b)=>Number(b.createdAt)-Number(a.createdAt));
}
export async function createScheduledPublish(ownerId, session, selected, runAt){
  const userId=Number(ownerId);
  const entitlement=await getEditorEntitlement(userId);
  const decision=validateScheduleRequest(entitlement,{chatIds:selected,sendAt:runAt});
  if(!decision.allowed)return {ok:false,code:decision.code,limit:decision.limit};
  if(!session || !Array.isArray(session.blocks) || !session.blocks.length)return {ok:false,code:'SCHEDULE_EMPTY'};
  for(const chatId of selected){
    if(!await canPublish(chatId,userId))return {ok:false,code:'SCHEDULE_RIGHTS_MISSING'};
  }
  const page=session.currentPageId
    ? await db.select().from(richPages).where(eq(richPages.pageId,String(session.currentPageId))).get()
    : null;
  const savedPage=page && Number(page.ownerId)===userId?page:null;
  const legacy=Boolean(savedPage && isLegacySavedPage(savedPage,userId,entitlement));
  if(legacy && !isSavedPageUnchanged(savedPage,session)) {
    return {ok:false,code:'LEGACY_PAGE_READ_ONLY'};
  }
  const richMessage=buildInputRichMessage(legacy?savedPage.blocks:session.blocks,{
    userId,sourcePageId:session.currentPageId||null,
    includeBranding:await shouldIncludeBranding(userId),
    entitlement,technicalOnly:legacy,
  });
  const buttons=await prepareMessageButtons(legacy?savedPage.buttons||[]:session.messageButtons||[]);
  const markup=buttons.length?buildMessageButtonsKeyboard(buttons,{
    buttonsPerRow:Number((legacy?savedPage.buttonsPerRow:session.buttonsPerRow)||1),
    sourcePageId:session.currentPageId||null,
  }):null;
  const stamp=now(),jobId=newJobId();
  const snapshot={
    richMessage,replyMarkup:markup,
    silent:Boolean(session.postSilent),protected:Boolean(session.postProtected),
  };
  await db.insert(scheduledPosts).values({
    jobId,ownerId:userId,revision:1,runAt,
    status:'registering',snapshot,leaseUntil:0,
    createdAt:stamp,updatedAt:stamp,
  }).run();
  const targets=selected.map(chatId=>({
    key:jobId+':'+String(chatId),jobId,chatId,
    status:'pending',sentMessageId:null,updatedAt:stamp,
  }));
  try{
    for(const target of targets)await db.insert(scheduledPostDestinations).values(target).run();
  }catch(error){
    await db.update(scheduledPosts).set({status:'failed',updatedAt:now()})
      .where(eq(scheduledPosts.jobId,jobId)).run();
    throw error;
  }
  // Preserve task even if transport outcome is uncertain; never claim confirmed
  // registration until the relay sends a verified SCHEDULE_REGISTERED ACK.
  try{await relay('register',jobId,1,{run_at:runAt});}
  catch(error){
    await logError('schedule.registration',error,{userId,extra:'job='+jobId});
  }
  return {ok:true,jobId,status:'registering',runAt};
}

export async function handleScheduledTimeMessage(message){
  if(String(message?.chat?.type||'')!=='private')return false;
  const id=Number(message?.from?.id);
  const session=await loadEditorSession(id,{touch:false});
  if(!session?.postSchedulePending)return false;
  const content=String(message?.text||'').trim();
  if(content==='/cancel'||content==='إلغاء'){
    await updateEditorSession(id,{postSchedulePending:0});
    await api.sendMessage({chat_id:id,text:'تم إلغاء إدخال موعد الجدولة.'});
    return true;
  }
  const runAt=parseBaghdadDate(content);
  if(runAt==null){
    await api.sendMessage({chat_id:id,text:'أرسل الموعد بهذه الصيغة: 2026-10-12 18:00\nالتوقيت حسب بغداد (UTC+3)، أو أرسل /cancel.'});
    return true;
  }
  const targets=(session.postSelectedChatIds||[]).map(Number);
  let outcome;
  try {
    outcome=await createScheduledPublish(id,session,targets,runAt);
  } catch (error) {
    await logError('schedule.create',error,{userId:id});
    await api.sendMessage({chat_id:id,text:'تعذر حفظ طلب الجدولة مؤقتاً. حاول مجدداً. لم يتم تأكيد جدولة المنشور.'});
    return true;
  }
  if(!outcome.ok){
    const text=outcome.code==='SCHEDULE_PLAN_LIMIT'
      ?'وصلت حد الجدولة لباقتك: '+outcome.limit+' محادثات لكل منشور مجدول. قلل الوجهات أو راجع الباقات.'
      :outcome.code?.startsWith('SCHEDULE_DATE_')
        ?'اختر موعداً بعد دقيقة على الأقل وخلال ٤ أيام من الآن.'
        :'تعذر الجدولة: تحقق من المحادثات، وصلاحيات النشر، ومحتوى الرسالة.';
    await api.sendMessage({chat_id:id,text,reply_markup:{inline_keyboard:[[{text:'عرض الباقات',url:'https://t.me/richDonateBot?start=rich_plans_limits'}]]}});
    return true;
  }
  await updateEditorSession(id,{postSchedulePending:0});
  await api.sendMessage({chat_id:id,text:'تم إنشاء طلب جدولة المنشور.\nالموعد: '+formatBaghdad(runAt)+'\nالمحادثات: '+targets.length+'\nالمعرف: '+outcome.jobId+'\nالحالة: بانتظار تأكيد Cloudflare.\n/scheduled لإدارة مهامك.'});
  return true;
}
export async function showScheduledPosts(message){
  const ownerId=Number(message?.from?.id);
  const jobs=(await userTasks(ownerId)).slice(0,10);
  if(!jobs.length){
    await api.sendMessage({chat_id:message.chat.id,text:'ما عندك منشورات مجدولة.'});
    return;
  }
  const lines=['منشوراتي المجدولة',''];
  const keys=[];
  for(const job of jobs){
    lines.push('• '+formatBaghdad(job.runAt)+' — '+job.status+'\n  '+job.jobId);
    if(STATUS_PENDING.has(job.status))keys.push([{
      text:'إلغاء '+job.jobId.slice(-8),callback_data:'r:schedule:cancel:'+job.jobId,
    }]);
  }
  await api.sendMessage({chat_id:message.chat.id,text:lines.join('\n'),
    ...(keys.length?{reply_markup:{inline_keyboard:keys}}:{})});
}
export async function handleScheduleCancelCallback(query){
  const data=String(query?.data||'');
  if(!data.startsWith('r:schedule:cancel:'))return false;
  const jobId=data.slice('r:schedule:cancel:'.length);
  const ownerId=Number(query?.from?.id);
  const job=JOB_RE.test(jobId)?await loadJob(jobId):null;
  if(!job||Number(job.ownerId)!==ownerId||!STATUS_PENDING.has(job.status)){
    await api.answerCallbackQuery({callback_query_id:query.id,text:'المهمة غير متاحة للإلغاء.',show_alert:true});
    return true;
  }
  const stamp=now();
  const changed=await db.update(scheduledPosts)
    .set({status:'canceled',revision:Number(job.revision)+1,updatedAt:stamp})
    .where(and(eq(scheduledPosts.jobId,jobId),eq(scheduledPosts.ownerId,ownerId),
      eq(scheduledPosts.revision,Number(job.revision)),eq(scheduledPosts.status,job.status)))
    .returning({jobId:scheduledPosts.jobId}).run();
  if(!Array.isArray(changed)||!changed.length){
    await api.answerCallbackQuery({callback_query_id:query.id,text:'تغيرت حالة المهمة.',show_alert:true});
    return true;
  }
  try{await relay('cancel',jobId,Number(job.revision)+1);}
  catch(error){await logError('schedule.cancel_relay',error,{userId:ownerId,extra:'job='+jobId});}
  await api.answerCallbackQuery({callback_query_id:query.id,text:'تم إلغاء المهمة في المحرر.'});
  return true;
}

async function finalizeJob(job,rows){
  const succeeded=rows.filter(row=>row.status==='sent').length;
  const uncertain=rows.filter(row=>row.status==='uncertain').length;
  const final=uncertain?'uncertain':succeeded===rows.length?'sent':succeeded?'partially_sent':'failed';
  const stamp=now();
  await db.update(scheduledPosts).set({status:final,leaseUntil:0,updatedAt:stamp})
    .where(and(eq(scheduledPosts.jobId,job.jobId),eq(scheduledPosts.revision,Number(job.revision)))).run();
  await relay('result',job.jobId,Number(job.revision),{status:final});
  try{await api.sendMessage({chat_id:job.ownerId,text:'نتيجة الجدولة '+job.jobId+'\nنجح: '+succeeded+' / '+rows.length+'\nالحالة: '+final});}catch{}
}
export async function executeScheduledDue(jobId,revision){
  if(!JOB_RE.test(String(jobId))||!Number.isSafeInteger(revision))return;
  const job=await loadJob(jobId);
  if(!job||Number(job.revision)!==revision)return;
  if(job.status==='canceled'){
    await relay('result',jobId,revision,{status:'canceled'});return;
  }
  if(['sent','partially_sent','failed','uncertain'].includes(job.status)){
    await relay('result',jobId,revision,{status:job.status});return;
  }
  const stamp=now();
  if(Number(job.runAt)>stamp||!['registering','pending','running'].includes(job.status))return;
  // CAS lease: two reminders cannot run the same job concurrently.
  if(job.status==='running'&&Number(job.leaseUntil||0)>stamp)return;
  const claimed=await db.update(scheduledPosts)
    .set({status:'running',leaseUntil:stamp+120,updatedAt:stamp})
    .where(and(eq(scheduledPosts.jobId,jobId),eq(scheduledPosts.revision,revision),
      eq(scheduledPosts.status,job.status),eq(scheduledPosts.leaseUntil,Number(job.leaseUntil||0))))
    .returning({jobId:scheduledPosts.jobId}).run();
  if(!Array.isArray(claimed)||!claimed.length)return;
  const destinations=await db.select().from(scheduledPostDestinations)
    .where(eq(scheduledPostDestinations.jobId,jobId)).all();
  for(const target of destinations){
    if(target.status==='sending'){
      await db.update(scheduledPostDestinations).set({status:'uncertain',updatedAt:now()})
        .where(eq(scheduledPostDestinations.key,target.key)).run();
      continue;
    }
    if(target.status!=='pending')continue;
    const grabbed=await db.update(scheduledPostDestinations).set({status:'sending',updatedAt:now()})
      .where(and(eq(scheduledPostDestinations.key,target.key),eq(scheduledPostDestinations.status,'pending')))
      .returning({key:scheduledPostDestinations.key}).run();
    if(!Array.isArray(grabbed)||!grabbed.length)continue;
    try{
      const access=await inspectPublishAccess(target.chatId,job.ownerId);
      if(!access.ok){
        if(access.reason==='rights'){
          const denied=new Error('Publishing permissions missing');
          denied.code='PUBLISH_RIGHTS_MISSING';
          throw denied;
        }
        throw access.error || new Error('Could not verify destination access');
      }
      const result=await sendRichMessageSafe({
        chat_id:target.chatId,rich_message:job.snapshot.richMessage,
        ...(job.snapshot.replyMarkup?{reply_markup:job.snapshot.replyMarkup}:{}),
        disable_notification:job.snapshot.silent,
        protect_content:job.snapshot.protected,
      });
      await db.update(scheduledPostDestinations).set({
        status:'sent',sentMessageId:Number(result?.message_id||0)||null,updatedAt:now(),
      }).where(eq(scheduledPostDestinations.key,target.key)).run();
    }catch(error){
      // Once a network send may have started, outcome cannot always be proven.
      // Never retry an ambiguous send automatically and risk duplicates.
      const definite=isDefinitePublishRejection(error);
      const normalized=normalizePublishError(error,{kind:'chat'});
      await db.update(scheduledPostDestinations).set({
        status:definite?'failed':'uncertain',updatedAt:now(),
      }).where(eq(scheduledPostDestinations.key,target.key)).run();
      await logError('schedule.delivery',error,{
        userId:job.ownerId,chatId:target.chatId,
        extra:'job='+jobId+'; classification='+String(normalized.code||'PUBLISH_FAILED')
          +'; outcome='+(definite?'failed':'uncertain'),
      });
    }
  }
  const results=await db.select().from(scheduledPostDestinations)
    .where(eq(scheduledPostDestinations.jobId,jobId)).all();
  await finalizeJob(job,results);
}
export async function receiveScheduleRelayControl(source){
  const match=String(source||'').trim().match(/^\/rcb_schedule_(ack|due)@richcustomizebot\s+([\s\S]+)$/i);
  if(!match)return false;
  let data;
  try{data=JSON.parse(match[2]);}catch{return true;}
  if(data?.protocol!=='RCB1'||!JOB_RE.test(String(data.job_id||''))||
    !Number.isSafeInteger(data.revision)||data.revision<1)return true;
  if(match[1].toLowerCase()==='due'){
    await executeScheduledDue(data.job_id,data.revision);
    return true;
  }
  const job=await loadJob(data.job_id);
  if(!job||Number(job.revision)!==data.revision)return true;
  if(data.status==='SCHEDULE_REGISTERED'&&job.status==='registering'){
    const changed=await db.update(scheduledPosts).set({status:'pending',updatedAt:now()})
      .where(and(eq(scheduledPosts.jobId,job.jobId),eq(scheduledPosts.status,'registering'),
        eq(scheduledPosts.revision,data.revision)))
      .returning({jobId:scheduledPosts.jobId}).run();
    if(Array.isArray(changed)&&changed.length){
      try{await api.sendMessage({chat_id:job.ownerId,text:'تم تأكيد جدولة المنشور.\n'+formatBaghdad(job.runAt)+'\n'+job.jobId});}catch{}
    }
  }
  if(data.status==='SCHEDULE_REJECTED'&&job.status==='registering'){
    await db.update(scheduledPosts).set({status:'failed',updatedAt:now()})
      .where(and(eq(scheduledPosts.jobId,job.jobId),eq(scheduledPosts.status,'registering'))).run();
    try{await api.sendMessage({chat_id:job.ownerId,text:'تعذر اعتماد موعد المهمة '+job.jobId+' لدى خدمة التذكير. لم تنشر الرسالة.'});}catch{}
  }
  return true;
}
