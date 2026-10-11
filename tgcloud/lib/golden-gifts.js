import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { goldenCampaigns, goldenClaims, usageUsers } from 'schema';
import { isDeveloper } from 'lib/developer-access';

export const GIFT_DURATION = 30 * 86400;
export const CLAIM_WINDOW = 12 * 3600;
const stamp = () => Math.floor(Date.now()/1000);
export function giftMonth(now) { return new Date((now+10800)*1000).toISOString().slice(0,7); }
function newId() {
  const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
  return 'gft_' + Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
async function relay(action, row, runAt) {
  await api.sendMessage({chat_id:-1003993506865,disable_notification:true,
    text:'/rcb_schedule_'+action+'@Richminiappsbot\n'+JSON.stringify({
      protocol:'RCB1',request_id:'gift_'+action+'_'+row.jobId,
      job_id:row.jobId,revision:1,...(action==='register'?{run_at:runAt}:{status:'sent'}),
    })});
}
async function register(row, runAt) {
  if(row.reminderReady || runAt<=stamp()) return;
  // Registration is replayable until a verified ACK arrives. Failure never
  // extends the entitlement; absolute server timestamps always enforce expiry.
  try { await relay('register',row,runAt); }
  catch { console.warn('Golden gift reminder registration pending',row.jobId); }
}
export async function issueGoldenGift(actor, now=stamp()) {
  if(!isDeveloper(actor)) throw new Error('Developer access required');
  const month=giftMonth(now);
  const rows=await db.insert(goldenCampaigns).values({month,jobId:newId(),issuedAt:now,
    claimUntil:now+CLAIM_WINDOW,duration:GIFT_DURATION,reminderReady:0})
    .onConflictDoNothing({target:goldenCampaigns.month}).returning().run();
  const campaign=await db.select().from(goldenCampaigns).where(eq(goldenCampaigns.month,month)).get();
  await register(campaign,campaign.claimUntil);
  return {created:Boolean(rows?.length),campaign};
}
export async function activeGoldenGift(userId, now=stamp()) {
  const rows=await db.select().from(goldenClaims).where(eq(goldenClaims.userId,Number(userId))).all();
  return rows.some(row=>Number(row.expiresAt)>now);
}
export async function goldenGiftStatus(userId, now=stamp()) {
  const id=Number(userId);
  if(!Number.isSafeInteger(id)||id<=0) return {Golden_ticket:false,expires_at:0,available:false};
  const claims=await db.select().from(goldenClaims).where(eq(goldenClaims.userId,id)).all();
  const expiresAt=Math.max(0,...claims.map(r=>Number(r.expiresAt)));
  for(const row of claims) if(row.expiresAt>now) await register(row,row.expiresAt);
  // Include the previous month's still-open campaign at a month boundary.
  const months=[giftMonth(now),giftMonth(now-CLAIM_WINDOW)];
  let campaign=null;
  const user=await db.select().from(usageUsers).where(eq(usageUsers.userId,id)).get();
  for(const month of new Set(months)) {
    const row=await db.select().from(goldenCampaigns).where(eq(goldenCampaigns.month,month)).get();
    if(row && now<row.claimUntil && user && user.firstSeen<=row.issuedAt &&
       !claims.some(c=>c.key===month+':'+id)) { campaign=row; break; }
  }
  if(campaign) await register(campaign,campaign.claimUntil);
  return {Golden_ticket:expiresAt>now,expires_at:expiresAt,remaining_seconds:Math.max(0,expiresAt-now),
    available:Boolean(campaign),claim_until:campaign?.claimUntil||0,campaign:campaign?.month||null};
}
export async function activateGoldenGift(userId, now=stamp()) {
  const state=await goldenGiftStatus(userId,now);
  if(!state.available) return state;
  const campaign=await db.select().from(goldenCampaigns).where(eq(goldenCampaigns.month,state.campaign)).get();
  // Recheck after reads: the 12-hour window may have closed during processing.
  if(stamp()>=campaign.claimUntil) return goldenGiftStatus(userId);
  await db.insert(goldenClaims).values({key:campaign.month+':'+Number(userId),userId:Number(userId),
    jobId:newId(),activatedAt:now,expiresAt:now+campaign.duration,reminderReady:0})
    .onConflictDoNothing({target:goldenClaims.key}).run();
  return goldenGiftStatus(userId,now);
}
export async function receiveGiftReminder(source) {
  const match=String(source).match(/^\/rcb_schedule_(ack|due)@richcustomizebot\s+([\s\S]+)$/i);
  if(!match) return false;
  let data; try {data=JSON.parse(match[2]);} catch {return false;}
  if(!/^gft_[a-f0-9]{32}$/.test(data?.job_id||'')) return false;
  if(data.protocol!=='RCB1'||data.revision!==1) return true;
  for(const [table,endField] of [[goldenCampaigns,'claimUntil'],[goldenClaims,'expiresAt']]) {
    const row=await db.select().from(table).where(eq(table.jobId,data.job_id)).get();
    if(!row) continue;
    if(match[1].toLowerCase()==='ack' && data.status==='SCHEDULE_REGISTERED')
      await db.update(table).set({reminderReady:1}).where(eq(table.jobId,data.job_id)).run();
    if(match[1].toLowerCase()==='due' && stamp()>=row[endField]) await relay('result',row);
    return true;
  }
  return true;
}
export async function handleGoldenGiftCallback(query) {
  if(!['gift:show','gift:activate'].includes(query?.data)) return false;
  const state=query.data==='gift:activate'?await activateGoldenGift(query.from.id):await goldenGiftStatus(query.from.id);
  await api.answerCallbackQuery({callback_query_id:query.id});
  const text=state.Golden_ticket
    ? '🎟 قسيمتك الذهبية مفعّلة حتى '+new Date(state.expires_at*1000).toISOString().replace('T',' ')+' (UTC)'
    : state.available?'🎁 هدية قسيمة ذهبية لمدة ٣٠ يوماً من لحظة التفعيل. فعّلها قبل '+new Date(state.claim_until*1000).toISOString():'لا توجد قسيمة متاحة للتفعيل حالياً.';
  await api.sendMessage({chat_id:query.from.id,text,...(state.available?{reply_markup:{inline_keyboard:[[{text:'🎟 تفعيل القسيمة الذهبية',callback_data:'gift:activate'}]]}}:{})});
  return true;
}
