// A bounded per-minute Serverless scan, prompted by the existing Cloudflare
// reminder Worker via the authenticated RCB1 bot-to-bot bridge.
// Only Serverless reads subscriber identities and entitlements.
import { api, db } from 'sdk';
import { and, asc, eq, gt, lte } from 'sdk/db';
import { editorSubscriptions, goldenClaims, usageUsers,
  subscriptionReminderScans, subscriptionReminderDeliveries } from 'schema';
import { verifiedSubscriptionRow } from 'lib/editor-subscriptions';
import { buildSubscriptionRich } from 'lib/subscription-rich.js';
import { isDefinitePublishRejection, normalizePublishError } from 'lib/publish-errors';
const WINDOW=5*86400;
const BATCH=10;
const stamp=()=>Math.floor(Date.now()/1000);
const today=(now)=>Math.floor(now/86400);
export const subscriptionReminderWindow=(expiresAt,now)=>Number(expiresAt)>now&&Number(expiresAt)<=now+WINDOW;
export const subscriptionReminderKey=(source,userId,expiresAt,now)=>
  [source,userId,expiresAt,today(now)].join(':');

async function showReminder(source,row,now) {
  const id=Number(row.userId),end=Number(row.expiresAt);
  if(!subscriptionReminderWindow(end,now))return;
  if(source==='paid' && !verifiedSubscriptionRow(row,now))return;
  if(source==='gift') {
    // A newer overlapping gift supersedes an older expiry notice.
    const claims=await db.select().from(goldenClaims).where(eq(goldenClaims.userId,id)).all();
    if(Math.max(0,...claims.map(c=>Number(c.expiresAt)||0))!==end)return;
  }
  const key=subscriptionReminderKey(source,id,end,now);
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
  let state='sent',nextAttemptAt=0;
  try {
    await api.sendRichMessage({chat_id:delivery.userId,rich_message:buildSubscriptionRich({
      plan:delivery.source==='gift'?'golden':row.plan,gift:delivery.source==='gift',
      expiresAt:delivery.expiresAt,now,locale:user?.languageCode||'en',reminder:true,
    })});
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
async function retryDue(now) {
  const pending=await db.select().from(subscriptionReminderDeliveries)
    .where(and(eq(subscriptionReminderDeliveries.status,'retry'),
      lte(subscriptionReminderDeliveries.nextAttemptAt,now))).limit(2).all();
  for(const item of pending) {
    let row=null;
    if(item.day===today(now)&&subscriptionReminderWindow(item.expiresAt,now)){
      if(item.source==='paid'){
        row=await db.select().from(editorSubscriptions)
          .where(eq(editorSubscriptions.userId,item.userId)).get();
        if(!verifiedSubscriptionRow(row,now)||Number(row.expiresAt)!==item.expiresAt)row=null;
      }else if(item.source==='gift'){
        const claims=await db.select().from(goldenClaims)
          .where(eq(goldenClaims.userId,item.userId)).all();
        const newest=Math.max(0,...claims.map(c=>Number(c.expiresAt)||0));
        if(newest===item.expiresAt)row=claims.find(c=>Number(c.expiresAt)===newest);
      }
    }
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

async function scan(source,now) {
  const day=today(now);
  await db.insert(subscriptionReminderScans).values({
    id:source,day,cursor:'0',leaseUntil:0,
  }).onConflictDoNothing({target:subscriptionReminderScans.id}).run();
  let old=await db.select().from(subscriptionReminderScans)
    .where(eq(subscriptionReminderScans.id,source)).get();
  if(old.day!==day){
    await db.update(subscriptionReminderScans).set({day,cursor:'0',leaseUntil:0})
      .where(and(eq(subscriptionReminderScans.id,source),
        eq(subscriptionReminderScans.day,old.day))).run();
    old=await db.select().from(subscriptionReminderScans)
      .where(eq(subscriptionReminderScans.id,source)).get();
  }
  if(old.day!==day||old.cursor==='DONE'||old.leaseUntil>now)return;
  const lease=now+100;
  const claimed=await db.update(subscriptionReminderScans).set({leaseUntil:lease})
    .where(and(eq(subscriptionReminderScans.id,source),eq(subscriptionReminderScans.day,day),
      eq(subscriptionReminderScans.cursor,old.cursor),lte(subscriptionReminderScans.leaseUntil,now)))
    .returning().run();
  if(!claimed?.length)return;
  let cursor=old.cursor;
  try{
    const table=source==='paid'?editorSubscriptions:goldenClaims;
    const field=source==='paid'?table.userId:table.key;
    const where=source==='paid'
      ?and(gt(table.userId,Number(cursor)),eq(table.status,'active'),
        gt(table.expiresAt,now),lte(table.expiresAt,now+WINDOW))
      :and(gt(table.key,cursor),gt(table.expiresAt,now),lte(table.expiresAt,now+WINDOW));
    const results=await db.select().from(table).where(where).orderBy(asc(field)).limit(BATCH).all();
    for(const row of results){
      await showReminder(source,row,now);
      cursor=String(source==='paid'?row.userId:row.key);
    }
    if(results.length<BATCH)cursor='DONE';
  }finally{
    await db.update(subscriptionReminderScans).set({cursor,leaseUntil:0})
      .where(and(eq(subscriptionReminderScans.id,source),eq(subscriptionReminderScans.day,day),
        eq(subscriptionReminderScans.leaseUntil,lease))).run();
  }
}
export async function runSubscriptionReminderTick(now=stamp()) {
  // The bridge has already authenticated sender, chat and target before this call.
  await retryDue(now);
  await scan('paid',now);
  await scan('gift',now);
  return true;
}
