// Daily expiry-notice campaign: one Cloudflare Cron start signal per UTC day.
// Large campaigns and temporary 429s continue via existing RCB1 scheduled jobs
// rather than empty per-minute subscription heartbeats.
// Only Serverless reads subscriber identities and entitlements.
import { api, db } from 'sdk';
import { and, asc, eq, gt, gte, lte } from 'sdk/db';
import { editorGiftEntitlements, editorSubscriptions, goldenClaims, usageUsers,
  subscriptionReminderScans, subscriptionReminderDeliveries } from 'schema';
import { getEditorSubscriptionState, verifiedSubscriptionRow } from 'lib/editor-subscriptions';
import { buildSubscriptionRich } from 'lib/subscription-rich';
import { isDefinitePublishRejection, normalizePublishError } from 'lib/publish-errors';
import { isDeveloper } from 'lib/developer-access';
import { subscriptionLocale, subscriptionText } from 'lib/subscription-copy';
import { isBrandingRemoved } from 'lib/branding';
const DAY=86400;
const WINDOW=5*DAY;
const EXPIRED_WINDOW=7*DAY;
const BATCH=10;
const stamp=()=>Math.floor(Date.now()/1000);
const today=(now)=>Math.floor(now/86400);
const RENEWAL_CART_URLS=Object.freeze({
  plus:'https://t.me/RichDonateBot?start=buyPlus',
  golden:'https://t.me/RichDonateBot?start=buyGT',
  goldenWithoutBranding:'https://t.me/RichDonateBot',
});
const trustedPaidRow=row=>row?.status==='active'
  &&row?.source==='richdonate:verified'
  &&['plus','golden'].includes(String(row?.plan||''));
export function subscriptionReminderStage(expiresAt,now) {
  const end=Number(expiresAt);
  if(end>=now+4*DAY&&end<=now+WINDOW)return 'before';
  if(end<=now&&end>now-EXPIRED_WINDOW)return 'expired';
  return '';
}
export const subscriptionReminderWindow=(expiresAt,now)=>
  subscriptionReminderStage(expiresAt,now)==='before';
export const subscriptionReminderKey=(_source,userId,expiresAt,stage)=>
  [userId,expiresAt,stage].join(':');
const renewalMarkup=(locale,plan,brandingRemoved=false)=>({
  inline_keyboard:[[{text:subscriptionText(locale,'renew'),url:
    plan==='plus'?RENEWAL_CART_URLS.plus
      :brandingRemoved?RENEWAL_CART_URLS.goldenWithoutBranding:RENEWAL_CART_URLS.golden}]],
});

async function entitlementExtendsBeyond(userId,expiresAt) {
  const claims=await db.select().from(goldenClaims)
    .where(eq(goldenClaims.userId,userId)).all();
  if(Math.max(0,...claims.map(item=>Number(item.expiresAt)||0))>expiresAt)return true;
  const state=await getEditorSubscriptionState(userId,{now:expiresAt});
  return state.active&&Number(state.expiresAt)>expiresAt;
}

async function showReminder(source,row,now,stage) {
  const id=Number(row.userId),end=Number(row.expiresAt);
  if(subscriptionReminderStage(end,now)!==stage)return;
  if(source==='paid' && (stage==='before'
      ? !verifiedSubscriptionRow(row,now)
      : !trustedPaidRow(row)))return;
  if(source==='manual_gift'&&(!['plus','golden'].includes(String(row.plan||''))
    ||Number(row.startedAt)>now))return;
  if(source==='gift') {
    // A newer overlapping gift supersedes an older expiry notice.
    const claims=await db.select().from(goldenClaims).where(eq(goldenClaims.userId,id)).all();
    if(Math.max(0,...claims.map(c=>Number(c.expiresAt)||0))!==end)return;
  } else {
    const claims=await db.select().from(goldenClaims).where(eq(goldenClaims.userId,id)).all();
    if(claims.some(c=>Number(c.expiresAt)===end))return;
    const effective=await getEditorSubscriptionState(id,{now:end-1});
    if(!effective.active||Number(effective.expiresAt)!==end
      ||effective.plan!==row.plan)return;
  }
  if(await entitlementExtendsBeyond(id,end))return;
  const key=subscriptionReminderKey(source,id,end,stage);
  const inserted=await db.insert(subscriptionReminderDeliveries).values({
    key,userId:id,source,expiresAt:end,day:today(now),status:'sending',
    attempts:1,nextAttemptAt:0,updatedAt:now,
  }).onConflictDoNothing({target:subscriptionReminderDeliveries.key}).returning().run();
  if(!inserted?.length)return; // Includes ambiguous outcomes: never resend blindly.
  await deliverReminder({key,userId:id,source,expiresAt:end,attempts:1},row,now);
}
async function deliverReminder(delivery,row,now) {
  const user=await db.select().from(usageUsers)
    .where(eq(usageUsers.userId,delivery.userId)).get();
  const expired=delivery.key.endsWith(':expired');
  const locale=user?.languageCode||'en';
  const plan=delivery.source==='gift'?'golden':row.plan;
  const brandingRemoved=expired&&plan==='golden'
    ?await isBrandingRemoved(delivery.userId):false;
  let state='sent',nextAttemptAt=0;
  try {
    await api.sendRichMessage({
      chat_id:delivery.userId,
      rich_message:buildSubscriptionRich({
        plan,
        gift:delivery.source!=='paid',
        expiresAt:delivery.expiresAt,now,locale,
        reminder:!expired,expired,
      }),
      ...(expired?{reply_markup:renewalMarkup(locale,row.plan,brandingRemoved)}:{}),
    });
  } catch(error) {
    const normalized=normalizePublishError(error);
    if(normalized.code==='PUBLISH_RATE_LIMITED'&&delivery.attempts<5){
      state='retry';
      nextAttemptAt=now+Math.max(60,Math.min(3600,Number(normalized.retry_after)||60));
    }else state=isDefinitePublishRejection(error)?'failed':'uncertain';
    console.warn('Subscription reminder not confirmed',delivery.source,delivery.userId,state);
  }
  await db.update(subscriptionReminderDeliveries).set({
    status:state,nextAttemptAt,updatedAt:stamp(),
  }).where(and(eq(subscriptionReminderDeliveries.key,delivery.key),
    eq(subscriptionReminderDeliveries.status,'sending'))).run();
}
export async function sendSubscriptionExpiryTest(message,locale='en') {
  if(message?.chat?.type!=='private'||!isDeveloper(message?.from?.id))return false;
  const now=stamp(),language=subscriptionLocale(locale||message?.from?.language_code);
  const brandingRemoved=await isBrandingRemoved(message.from.id);
  await api.sendRichMessage({
    chat_id:message.chat.id,
    rich_message:buildSubscriptionRich({
      plan:'golden',expiresAt:now-1,now,locale:language,expired:true,
    }),
    reply_markup:renewalMarkup(language,'golden',brandingRemoved),
  });
  return true;
}
async function retryDue(now) {
  const pending=await db.select().from(subscriptionReminderDeliveries)
    .where(and(eq(subscriptionReminderDeliveries.status,'retry'),
      lte(subscriptionReminderDeliveries.nextAttemptAt,now))).limit(2).all();
  for(const item of pending) {
    let row=null;
    const stage=item.key.endsWith(':expired')?'expired':'before';
    const eligible=subscriptionReminderStage(item.expiresAt,now);
    if(item.day===today(now)&&eligible===stage){
      if(item.source==='paid'){
        row=await db.select().from(editorSubscriptions)
          .where(eq(editorSubscriptions.userId,item.userId)).get();
        if((stage==='before'?!verifiedSubscriptionRow(row,now):!trustedPaidRow(row))
          ||Number(row.expiresAt)!==item.expiresAt)row=null;
      }else if(item.source==='gift'){
        const claims=await db.select().from(goldenClaims)
          .where(eq(goldenClaims.userId,item.userId)).all();
        const newest=Math.max(0,...claims.map(c=>Number(c.expiresAt)||0));
        if(newest===item.expiresAt)row=claims.find(c=>Number(c.expiresAt)===newest);
      }else if(item.source==='manual_gift'){
        const gifts=await db.select().from(editorGiftEntitlements)
          .where(eq(editorGiftEntitlements.userId,item.userId)).all();
        row=gifts.find(gift=>Number(gift.expiresAt)===item.expiresAt
          &&Number(gift.startedAt)<=now);
      }
    }
    if(row&&item.source!=='gift') {
      const effective=await getEditorSubscriptionState(item.userId,{now:item.expiresAt-1});
      if(!effective.active||Number(effective.expiresAt)!==item.expiresAt
        ||effective.plan!==row.plan)row=null;
    }
    if(row&&await entitlementExtendsBeyond(item.userId,item.expiresAt))row=null;
    if(!row){
      await db.update(subscriptionReminderDeliveries).set({status:'canceled',updatedAt:now})
        .where(and(eq(subscriptionReminderDeliveries.key,item.key),
          eq(subscriptionReminderDeliveries.status,'retry'))).run();
      continue;
    }
    const acquired=await db.update(subscriptionReminderDeliveries)
      .set({status:'sending',attempts:item.attempts+1,updatedAt:now})
      .where(and(eq(subscriptionReminderDeliveries.key,item.key),
        eq(subscriptionReminderDeliveries.status,'retry'))).returning().run();
    if(acquired?.length)await deliverReminder({...item,attempts:item.attempts+1},row,now);
  }
}

async function scan(source,now,stage) {
  const scanId=source+':'+stage;
  const day=today(now);
  await db.insert(subscriptionReminderScans).values({
    id:scanId,day,cursor:'0',leaseUntil:0,
  }).onConflictDoNothing({target:subscriptionReminderScans.id}).run();
  let old=await db.select().from(subscriptionReminderScans)
    .where(eq(subscriptionReminderScans.id,scanId)).get();
  if(old.day!==day){
    await db.update(subscriptionReminderScans).set({day,cursor:'0',leaseUntil:0})
      .where(and(eq(subscriptionReminderScans.id,scanId),
        eq(subscriptionReminderScans.day,old.day))).run();
    old=await db.select().from(subscriptionReminderScans)
      .where(eq(subscriptionReminderScans.id,scanId)).get();
  }
  if(old.day!==day||old.cursor==='DONE'||old.leaseUntil>now)return;
  const lease=now+100;
  const claimed=await db.update(subscriptionReminderScans).set({leaseUntil:lease})
    .where(and(eq(subscriptionReminderScans.id,scanId),eq(subscriptionReminderScans.day,day),
      eq(subscriptionReminderScans.cursor,old.cursor),lte(subscriptionReminderScans.leaseUntil,now)))
    .returning().run();
  if(!claimed?.length)return;
  let cursor=old.cursor;
  try{
    const table=source==='paid'?editorSubscriptions
      :source==='gift'?goldenClaims:editorGiftEntitlements;
    const field=source==='paid'?table.userId
      :source==='gift'?table.key:table.requestId;
    const expiryWhere=stage==='before'
      ?and(gte(table.expiresAt,now+4*DAY),lte(table.expiresAt,now+WINDOW))
      :and(gt(table.expiresAt,now-EXPIRED_WINDOW),lte(table.expiresAt,now));
    const where=source==='paid'
      ?and(gt(table.userId,Number(cursor)),eq(table.status,'active'),expiryWhere)
      :source==='gift'
        ?and(gt(table.key,cursor),expiryWhere)
        :and(gt(table.requestId,cursor),lte(table.startedAt,now),expiryWhere);
    const results=await db.select().from(table).where(where).orderBy(asc(field)).limit(BATCH).all();
    for(const row of results){
      await showReminder(source,row,now,stage);
      cursor=String(source==='paid'?row.userId
        :source==='gift'?row.key:row.requestId);
    }
    if(results.length<BATCH)cursor='DONE';
  }finally{
    await db.update(subscriptionReminderScans).set({cursor,leaseUntil:0})
      .where(and(eq(subscriptionReminderScans.id,scanId),eq(subscriptionReminderScans.day,day),
        eq(subscriptionReminderScans.leaseUntil,lease))).run();
  }
}
// A single daily scan can exceed Telegram Serverless invocation limits.
// Reuse the existing D1 schedule-reminders relay for resumable 10+10 batches.
// The job ID is stable per UTC day and the revision advances after every batch.
// A separate Serverless cycle lease avoids parallel/duplicate executions.
const CYCLE_ID='subscription_daily_cycle';
const NEXT_BATCH_DELAY=75; // Telegram and the RCB1 scheduler get time to settle.
export const subscriptionCycleJobId=(day)=>
  'sub_'+Number(day).toString(16).padStart(32,'0');
async function cycleControl(action,day,revision,extra={}) {
  await api.sendMessage({
    chat_id:-1003993506865,disable_notification:true,
    text:'/rcb_schedule_'+action+'@Richminiappsbot\n'+JSON.stringify({
      protocol:'RCB1',
      tag:'#اشتراكات',
      request_id:'subscription_'+action+'_'+day+'_'+revision,
      job_id:subscriptionCycleJobId(day),
      revision,...extra,
    }),
  });
}
async function readCycle(now) {
  const day=today(now);
  await db.insert(subscriptionReminderScans).values({
    id:CYCLE_ID,day,cursor:'0',leaseUntil:0,
  }).onConflictDoNothing({target:subscriptionReminderScans.id}).run();
  let row=await db.select().from(subscriptionReminderScans)
    .where(eq(subscriptionReminderScans.id,CYCLE_ID)).get();
  if(row.day!==day) {
    await db.update(subscriptionReminderScans).set({day,cursor:'0',leaseUntil:0})
      .where(and(eq(subscriptionReminderScans.id,CYCLE_ID),
        eq(subscriptionReminderScans.day,row.day))).run();
    row=await db.select().from(subscriptionReminderScans)
      .where(eq(subscriptionReminderScans.id,CYCLE_ID)).get();
  }
  return row;
}
async function unfinishedScan(source,stage,day) {
  const row=await db.select().from(subscriptionReminderScans)
    .where(eq(subscriptionReminderScans.id,source+':'+stage)).get();
  return !row || row.day!==day || row.cursor!=='DONE';
}
async function nextRetry(day) {
  const due=await db.select().from(subscriptionReminderDeliveries)
    .where(and(eq(subscriptionReminderDeliveries.day,day),
      eq(subscriptionReminderDeliveries.status,'retry')))
    .orderBy(asc(subscriptionReminderDeliveries.nextAttemptAt)).limit(1).all();
  return due[0]?.nextAttemptAt||0;
}
export async function runSubscriptionReminderTick(now=stamp(),options={}) {
  // The authenticated bridge calls this once daily; due jobs advance the same
  // daily campaign only while unfinished. No subscriber data leaves Serverless.
  const day=today(now),isDue=options.jobId!=null;
  if(isDue && (options.jobId!==subscriptionCycleJobId(day)
    || !Number.isSafeInteger(options.revision) || options.revision<1))return false;
  const row=await readCycle(now);
  if(!isDue) {
    // Before any sends, register a replayable seed due job. If this first
    // Serverless invocation is interrupted, the next minute can resume it.
    if(row.day!==day||row.cursor!=='0'||row.leaseUntil>now)return false;
    const seedLease=now+120;
    const owned=await db.update(subscriptionReminderScans).set({leaseUntil:seedLease})
      .where(and(eq(subscriptionReminderScans.id,CYCLE_ID),
        eq(subscriptionReminderScans.day,day),
        eq(subscriptionReminderScans.cursor,'0'),
        lte(subscriptionReminderScans.leaseUntil,now))).returning().run();
    if(!owned?.length)return false;
    try {
      await cycleControl('register',day,1,{run_at:now+NEXT_BATCH_DELAY});
      const updated=await db.update(subscriptionReminderScans)
        .set({cursor:'1',leaseUntil:0})
        .where(and(eq(subscriptionReminderScans.id,CYCLE_ID),
          eq(subscriptionReminderScans.day,day),
          eq(subscriptionReminderScans.cursor,'0'),
          eq(subscriptionReminderScans.leaseUntil,seedLease))).returning().run();
      if(!updated?.length)throw new Error('Subscription daily cycle seed lost');
    } finally {
      await db.update(subscriptionReminderScans).set({leaseUntil:0})
        .where(and(eq(subscriptionReminderScans.id,CYCLE_ID),
          eq(subscriptionReminderScans.day,day),
          eq(subscriptionReminderScans.leaseUntil,seedLease))).run();
    }
    return runSubscriptionReminderTick(now,{jobId:subscriptionCycleJobId(day),revision:1});
  }
  const expected=String(options.revision);
  // A completed batch may be redelivered when its result packet was lost.
  // Re-ack it without re-sending any subscriber notices.
  if(row.day===day&&row.cursor==='DONE'){
    await cycleControl('result',day,options.revision,{status:'sent'});
    return true;
  }
  if(row.day!==day||row.cursor!==expected||row.leaseUntil>now)return false;
  const lease=now+120;
  const claimed=await db.update(subscriptionReminderScans).set({leaseUntil:lease})
    .where(and(eq(subscriptionReminderScans.id,CYCLE_ID),
      eq(subscriptionReminderScans.day,day),
      eq(subscriptionReminderScans.cursor,expected),
      lte(subscriptionReminderScans.leaseUntil,now))).returning().run();
  if(!claimed?.length)return false;
  try {
    await retryDue(now);
    await scan('paid',now,'before');
    await scan('gift',now,'before');
    await scan('paid',now,'expired');
    await scan('gift',now,'expired');
    await scan('manual_gift',now,'before');
    await scan('manual_gift',now,'expired');
    const needsScan=(await Promise.all([
      ['paid','before'],['gift','before'],['paid','expired'],['gift','expired'],
    ].map(([source,stage])=>unfinishedScan(source,stage,day)))).some(Boolean);
    const retryAt=await nextRetry(day);
    const unfinished=needsScan||Boolean(retryAt);
    const earliest=now+NEXT_BATCH_DELAY;
    const runAt=needsScan?earliest:Math.max(earliest,retryAt);
    // Each UTC day is independent. Never resume yesterday's notices tomorrow.
    if(unfinished && runAt<(day+1)*86400) {
      const nextRevision=Number(expected)+1;
      // Register before advancing the cursor: a definitive relay failure then
      // leaves the prior D1 due revision retryable (daily-start failures log).
      await cycleControl('register',day,nextRevision,{run_at:runAt});
      await db.update(subscriptionReminderScans)
        .set({cursor:String(nextRevision),leaseUntil:0})
        .where(and(eq(subscriptionReminderScans.id,CYCLE_ID),
          eq(subscriptionReminderScans.day,day),
          eq(subscriptionReminderScans.cursor,expected),
          eq(subscriptionReminderScans.leaseUntil,lease))).run();
    } else {
      await db.update(subscriptionReminderScans).set({cursor:'DONE',leaseUntil:0})
        .where(and(eq(subscriptionReminderScans.id,CYCLE_ID),
          eq(subscriptionReminderScans.day,day),
          eq(subscriptionReminderScans.cursor,expected),
          eq(subscriptionReminderScans.leaseUntil,lease))).run();
      if(isDue)await cycleControl('result',day,options.revision,{status:'sent'});
    }
  } finally {
    await db.update(subscriptionReminderScans).set({leaseUntil:0})
      .where(and(eq(subscriptionReminderScans.id,CYCLE_ID),
        eq(subscriptionReminderScans.day,day),
        eq(subscriptionReminderScans.leaseUntil,lease))).run();
  }
  return true;
}
export async function receiveSubscriptionReminderSchedule(source) {
  const match=String(source||'').trim()
    .match(/^\/rcb_schedule_(ack|due)@richcustomizebot\s+([\s\S]+)$/i);
  if(!match)return false;
  let data;try{data=JSON.parse(match[2]);}catch{return false;}
  if(!/^sub_[a-f0-9]{32}$/.test(String(data?.job_id||'')))return false;
  if(data.protocol!=='RCB1'||!Number.isSafeInteger(data.revision)||data.revision<1)return true;
  if(match[1].toLowerCase()==='due') {
    const day=today(stamp());
    if(data.job_id!==subscriptionCycleJobId(day)) {
      // This is a stale batch from a previous UTC day.
      await cycleControl('result',parseInt(data.job_id.slice(4),16),data.revision,
        {status:'canceled'});
    } else await runSubscriptionReminderTick(stamp(),{jobId:data.job_id,revision:data.revision});
  }
  return true;
}
