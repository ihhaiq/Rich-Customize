import { api, db } from 'sdk';
import { normalizePublishError, isDefinitePublishRejection } from 'lib/publish-errors';
import { and, asc, desc, eq, gt, lt, lte } from 'sdk/db';
import { goldenCampaigns, goldenBroadcasts, goldenAnnouncements, legacyStates, usageUsers } from 'schema';
import { logError } from 'lib/error-log';
import { isDeveloper } from 'lib/developer-access';

const now = () => Math.floor(Date.now()/1000);
const BATCH_SIZE = 20;
const CAKE = {type:'custom_emoji',custom_emoji_id:'5427201480740321598',alternative_text:'🎂'};
export function birthdayAnnouncement(languageCode, { preview=false }={}) {
  const arabic=/^ar(?:[-_]|$)/i.test(String(languageCode||''));
  // The test looks identical, but its button can never activate a real coupon.
  const activate={type:'button',button:{text:arabic?'فعلها':'Active',
    callback_data:preview?'dev:golden:preview:activate':'gift:activate'}};
  return arabic ? {is_rtl:true,blocks:[
    {type:'heading',size:1,text:['عيد ميلادي اليوم ',CAKE,'!']},
    {type:'footer',text:['وصلت الك باقة golden ticket ',activate,'.']},
  ]} : {blocks:[
    {type:'heading',size:1,text:["It's my BIRTHDAY ",CAKE,',']},
    {type:'footer',text:["Here's a gold ticket as a gift from me. ",activate,' it and wish me a happy new year.']},
  ]};
}
// Developer-only, single-recipient preview. Never creates a campaign, claim,
// broadcast, scheduler job or recipient list; callback is deliberately inert.
export async function sendBirthdayAnnouncementTest(userId, languageCode) {
  const recipient=Number(userId);
  if (!isDeveloper(recipient)) throw new Error('Developer access required');
  return api.sendRichMessage({
    chat_id:recipient,
    rich_message:birthdayAnnouncement(languageCode,{preview:true}),
  });
}

async function register(row) {
  await api.sendMessage({chat_id:-1003993506865,disable_notification:true,
    text:'/rcb_schedule_register@Richminiappsbot\n'+JSON.stringify({protocol:'RCB1',
      request_id:'birthday_'+row.jobId+'_'+row.revision,job_id:row.jobId,revision:row.revision,run_at:row.runAt})});
}
async function complete(row) {
  await api.sendMessage({chat_id:-1003993506865,disable_notification:true,
    text:'/rcb_schedule_result@Richminiappsbot\n'+JSON.stringify({protocol:'RCB1',
      request_id:'birthday_done_'+row.jobId+'_'+row.revision,job_id:row.jobId,revision:row.revision,status:'sent'})});
}
export async function ensureBirthdayBroadcast(campaign, actorId) {
  if(now()>=campaign.claimUntil) return;
  await db.insert(goldenBroadcasts).values({month:campaign.month,
    jobId:campaign.jobId.replace('gft_','gfb_'),actorId:Number(actorId),revision:1,cursor:0,
    runAt:now(),leaseUntil:0,status:'pending'})
    .onConflictDoNothing({target:goldenBroadcasts.month}).run();
  const row=await db.select().from(goldenBroadcasts).where(eq(goldenBroadcasts.month,campaign.month)).get();
  if(row.status==='pending') {
    // Replays repair an uncertain registration without issuing another gift.
    const refreshed={...row,runAt:Math.max(now(),row.runAt)};
    await db.update(goldenBroadcasts).set({runAt:refreshed.runAt}).where(and(
      eq(goldenBroadcasts.month,row.month),eq(goldenBroadcasts.revision,row.revision))).run();
    await register(refreshed);
  }
}
const DELIVERY_STATES=['sent','failed','unavailable','uncertain','retry','sending'];
async function deliveryCounts(month) {
  const counts={sent:0,failed:0,unavailable:0,uncertain:0,retry:0,sending:0};
  for(const status of DELIVERY_STATES) {
    counts[status]=await db.$count(goldenAnnouncements,and(
      eq(goldenAnnouncements.month,month),eq(goldenAnnouncements.status,status)));
  }
  return counts;
}
async function campaignSnapshot(row) {
  if(!row)return null;
  const campaign=await db.select().from(goldenCampaigns).where(eq(goldenCampaigns.month,row.month)).get();
  const eligible=campaign?await db.$count(usageUsers,lte(usageUsers.firstSeen,campaign.issuedAt)):0;
  return {month:row.month,status:row.status,revision:row.revision,
    updatedAt:row.runAt,claimUntil:Number(campaign?.claimUntil)||0,
    eligible,counts:await deliveryCounts(row.month)};
}
export async function birthdayCampaignStatus() {
  const rows=await db.select().from(goldenBroadcasts).orderBy(desc(goldenBroadcasts.month)).limit(1).all();
  return campaignSnapshot(rows[0]||null);
}
export function birthdayReportText(snapshot, {error=false}={}) {
  if(!snapshot)return '🎁 ماكو حملة إهداء مسجلة بعد.';
  const c=snapshot.counts;
  const handled=c.sent+c.failed+c.unavailable+c.uncertain+c.sending;
  const pending=Math.max(0,snapshot.eligible-handled);
  const phase=snapshot.status==='done'
    ? (snapshot.claimUntil<=now()?'انتهت المهلة':'انتهى المرور على المستلمين')
    : (snapshot.status==='pending'?'قيد الانتظار / الإرسال':'حالة '+snapshot.status);
  return (error?'⚠️ تنبيه تعثر الإهداء':'🎁 تقرير إهداء القسيمة')+'\n'
    +'الحملة: '+snapshot.month+'\n'
    +'الحالة: '+phase+'\n'
    +'المؤهلون: '+snapshot.eligible+'\n'
    +'قبله تليكرام: '+c.sent+'\n'
    +'تعذر إيصالها: '+(c.failed+c.unavailable)+'\n'
    +'غير مؤكد: '+(c.uncertain+c.sending)+'\n'
    +'بانتظار الإرسال أو إعادة المحاولة: '+pending+'\n'
    +'منها بانتظار رفع تقييد تليكرام: '+c.retry+'\n'
    +'القبول من تليكرام مو دليل قراءة الرسالة.';
}
async function notifyOnce(row,type,body) {
  const namespace='golden_notice:'+row.month+':'+type;
  const claimed=await db.insert(legacyStates).values({
    namespace,payload:{actor_id:row.actorId},updatedAt:now(),
  }).onConflictDoNothing({target:legacyStates.namespace}).returning().run();
  if(!claimed?.length)return false;
  try {await api.sendMessage({chat_id:row.actorId,text:body});return true;}
  catch(error){console.warn('Golden campaign notice not delivered',type,row.month);return false;}
}
async function notifyCompleted(row) {
  try{
    const snapshot=await campaignSnapshot(row);
    await notifyOnce(row,'complete',birthdayReportText({...snapshot,status:'done'}));
  }catch(error){console.warn('Could not send golden campaign summary',row.month);await logError('golden.broadcast.report',error,{userId:row.actorId});}
}
async function notifyCriticalFailure(row,error) {
  try {
    await notifyOnce(row,'failure',
      '⚠️ تعثر إرسال حملة الإهداء '+row.month+' بسبب مشكلة تشغيلية.\n'
      +'افتح /dev ← حالة الإهداء للتحقق.\n'
      +'ماكو إعادة إرسال جماعية تلقائية من هذا التنبيه.');
  }catch(noticeError){console.warn('Could not notify developer about broadcast issue',row.month);}
  await logError('golden.broadcast.batch',error,{userId:row.actorId});
}

export async function runBirthdayBatch(jobId, revision) {
  const row=await db.select().from(goldenBroadcasts).where(eq(goldenBroadcasts.jobId,jobId)).get();
  if(!row) return;
  if(row.status==='done') { await notifyCompleted(row); await complete(row); return; }
  if(revision!==row.revision) { if(revision<row.revision) await register({...row,runAt:Math.max(now(),row.runAt)}); return; }
  if(row.runAt>now()) return;
  const campaign=await db.select().from(goldenCampaigns).where(eq(goldenCampaigns.month,row.month)).get();
  if(!campaign) return;
  const lease=now()+120;
  const locked=await db.update(goldenBroadcasts).set({leaseUntil:lease}).where(and(
    eq(goldenBroadcasts.month,row.month),eq(goldenBroadcasts.revision,revision),
    eq(goldenBroadcasts.status,'pending'),lt(goldenBroadcasts.leaseUntil,now())))
    .returning().run();
  if(!locked?.length) return;
  let cursor=row.cursor,delay=1,finished=now()>=campaign.claimUntil;
  try {
    const users=finished?[]:await db.select().from(usageUsers).where(and(
      gt(usageUsers.userId,cursor),lte(usageUsers.firstSeen,campaign.issuedAt)))
      .orderBy(asc(usageUsers.userId)).limit(BATCH_SIZE).all();
    const started=Date.now();
    for(const user of users) {
      if(now()>=campaign.claimUntil) {finished=true;break;}
      if(Date.now()-started>8000) break;
      const key=row.month+':'+user.userId;
      const inserted=await db.insert(goldenAnnouncements).values({key,month:row.month,
        userId:user.userId,status:'sending',updatedAt:now()})
        .onConflictDoNothing({target:goldenAnnouncements.key}).returning().run();
      const existing=inserted?.length?null:await db.select().from(goldenAnnouncements).where(eq(goldenAnnouncements.key,key)).get();
      if(existing && existing.status!=='retry') {
        // A process may die after Telegram accepted a send. Never blindly resend
        // an ambiguous result: retain an explicit uncertain record for review.
        if(existing.status==='sending') await db.update(goldenAnnouncements).set({status:'uncertain',updatedAt:now()}).where(eq(goldenAnnouncements.key,key)).run();
        cursor=user.userId;continue;
      }
      if(existing) await db.update(goldenAnnouncements).set({status:'sending',updatedAt:now()}).where(eq(goldenAnnouncements.key,key)).run();
      let status='sent';
      try { await api.sendRichMessage({chat_id:user.userId,rich_message:birthdayAnnouncement(user.languageCode)}); }
      catch(error) {
        const failure=normalizePublishError(error);
        if(failure.code==='PUBLISH_RATE_LIMITED') { status='retry';delay=Math.max(5,Number(failure.retry_after)||60); }
        else if(['PUBLISH_BOT_BLOCKED','PUBLISH_PRIVATE_UNAVAILABLE'].includes(failure.code)) status='unavailable';
        else status=isDefinitePublishRejection(error)?'failed':'uncertain';
      }
      await db.update(goldenAnnouncements).set({status,updatedAt:now()}).where(eq(goldenAnnouncements.key,key)).run();
      if(status==='retry') break;
      cursor=user.userId;
    }
    finished=finished || (users.length<BATCH_SIZE && (users.length===0 || cursor===users.at(-1).userId));
    const next={...row,cursor,revision:finished?revision:revision+1,runAt:now()+delay,leaseUntil:0,status:finished?'done':'pending'};
    await db.update(goldenBroadcasts).set({cursor:next.cursor,revision:next.revision,runAt:next.runAt,leaseUntil:0,status:next.status})
      .where(and(eq(goldenBroadcasts.month,row.month),eq(goldenBroadcasts.revision,revision),eq(goldenBroadcasts.leaseUntil,lease))).run();
    if(finished) {
      try {await complete(row);}
      finally {await notifyCompleted(row);}
    } else await register(next);
  } catch (error) {
    await notifyCriticalFailure(row,error);
    throw error;
  } finally {
    await db.update(goldenBroadcasts).set({leaseUntil:0}).where(and(
      eq(goldenBroadcasts.month,row.month),eq(goldenBroadcasts.revision,revision),eq(goldenBroadcasts.leaseUntil,lease))).run();
  }
}
export async function receiveBirthdayReminder(source) {
  const match=String(source).match(/^\/rcb_schedule_(ack|due)@richcustomizebot\s+([\s\S]+)$/i);
  if(!match) return false;
  let data;try{data=JSON.parse(match[2]);}catch{return false;}
  if(!/^gfb_[a-f0-9]{32}$/.test(data?.job_id||'')) return false;
  if(data.protocol!=='RCB1'||!Number.isSafeInteger(data.revision)||data.revision<1)return true;
  if(match[1].toLowerCase()==='due') await runBirthdayBatch(data.job_id,data.revision);
  return true;
}
