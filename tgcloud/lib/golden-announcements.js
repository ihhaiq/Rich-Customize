import { api, db } from 'sdk';
import { normalizePublishError, isDefinitePublishRejection } from 'lib/publish-errors';
import { and, asc, eq, gt, lt, lte } from 'sdk/db';
import { goldenCampaigns, goldenBroadcasts, goldenAnnouncements, usageUsers } from 'schema';
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
export async function runBirthdayBatch(jobId, revision) {
  const row=await db.select().from(goldenBroadcasts).where(eq(goldenBroadcasts.jobId,jobId)).get();
  if(!row) return;
  if(row.status==='done') { await complete(row); return; }
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
    if(finished) await complete(row); else await register(next);
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
