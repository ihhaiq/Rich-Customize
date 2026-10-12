import { ensureBirthdayBroadcast } from 'lib/golden-announcements';
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { goldenCampaigns, goldenClaims, usageUsers } from 'schema';
import { isDeveloper } from 'lib/developer-access';

export const GIFT_DURATION = 30 * 86400;
// claimUntil=0 means no activation deadline; old deadlines are no longer enforced.
export const CLAIM_WINDOW = 0;
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
    claimUntil:0,duration:GIFT_DURATION,reminderReady:0})
    .onConflictDoNothing({target:goldenCampaigns.month}).returning().run();
  const campaign=await db.select().from(goldenCampaigns).where(eq(goldenCampaigns.month,month)).get();

  let announcementQueued=true;
  try { await ensureBirthdayBroadcast(campaign,actor); }
  catch { announcementQueued=false; console.warn('Birthday announcement queue registration pending',campaign.month); }
  return {created:Boolean(rows?.length),campaign,announcementQueued};
}
export async function activeGoldenGift(userId, now=stamp()) {
  const rows=await db.select().from(goldenClaims).where(eq(goldenClaims.userId,Number(userId))).all();
  return rows.some(row=>Number(row.expiresAt)>now);
}
export async function goldenGiftStatus(userId, now=stamp(), targetMonth=null) {
  const id=Number(userId);
  if(!Number.isSafeInteger(id)||id<=0) return {Golden_ticket:false,expires_at:0,available:false};
  const claims=await db.select().from(goldenClaims).where(eq(goldenClaims.userId,id)).all();
  const expiresAt=Math.max(0,...claims.map(r=>Number(r.expiresAt)));
  for(const row of claims) if(row.expiresAt>now) await register(row,row.expiresAt);
  const user=await db.select().from(usageUsers).where(eq(usageUsers.userId,id)).get();
  const campaigns=user?(await db.select().from(goldenCampaigns).all())
    .filter(row=>user.firstSeen<=row.issuedAt)
    .sort((a,b)=>a.issuedAt-b.issuedAt||a.month.localeCompare(b.month)):[];
  // Every campaign issued while a gift was still unclaimed represents a
  // reminder of that pending gift, not another stackable month. Activation
  // consumes all offers issued up to that instant without rewriting old claims.
  const lastActivation=Math.max(0,...claims.map(r=>Number(r.activatedAt)||0));
  const target=targetMonth==='legacy'?campaigns[0]:targetMonth?campaigns.find(r=>r.month===targetMonth):null;
  const allowed=!targetMonth||Boolean(target);
  const campaign=allowed && expiresAt<=now ? campaigns.find(row=>
    row.issuedAt>lastActivation && (!target||row.issuedAt<=target.issuedAt)
    && !claims.some(c=>c.key===row.month+':'+id)) : null;
  return {Golden_ticket:expiresAt>now,expires_at:expiresAt,remaining_seconds:Math.max(0,expiresAt-now),
    available:Boolean(campaign),claim_until:0,campaign:campaign?.month||null};
}
export async function activateGoldenGift(userId, now=stamp(), targetMonth=null) {
  const state=await goldenGiftStatus(userId,now,targetMonth);
  if(!state.available) return state;
  const campaign=await db.select().from(goldenCampaigns).where(eq(goldenCampaigns.month,state.campaign)).get();
  // Concurrent clicks on old/new notifications resolve to the same earliest
  // outstanding campaign and share its primary key. Never update expiry.
  await db.insert(goldenClaims).values({key:campaign.month+':'+Number(userId),userId:Number(userId),
    jobId:newId(),activatedAt:now,expiresAt:now+campaign.duration,reminderReady:0})
    .onConflictDoNothing({target:goldenClaims.key}).run();
  return goldenGiftStatus(userId,now,targetMonth);
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
    if(match[1].toLowerCase()==='due' && (table===goldenCampaigns || stamp()>=row[endField])) await relay('result',row);
    return true;
  }
  return true;
}
export async function handleGoldenGiftCallback(query) {
  const match=String(query?.data||'').match(/^gift:(show|activate)(?::(\d{4}-\d{2}))?$/);
  if(!match)return false;
  const target=match[2]||'legacy';
  const state=match[1]==='activate'?await activateGoldenGift(query.from.id,stamp(),target):await goldenGiftStatus(query.from.id,stamp(),target);
  await api.answerCallbackQuery({callback_query_id:query.id});
  const arabic=/^ar(?:[-_]|$)/i.test(String(query.from?.language_code||''));
  const date=value=>new Date(value*1000).toISOString().replace('T',' ')+' (UTC)';
  const text=state.Golden_ticket
    ? (arabic?'🎟 قسيمتك الذهبية مفعّلة حتى ':'🎟 Your Golden Ticket is active until ')+date(state.expires_at)
    : state.available
      ? (arabic?'🎁 هدية قسيمة ذهبية لمدة ٣٠ يوماً من أول تفعيل. تقدر تفعّلها بأي وقت؛ تكرار الإشعار لا يضيف مدة أخرى.':'🎁 A Golden Ticket for 30 days from first activation. Activate any time; repeated reminders do not add another month.')
      : (arabic?'لا توجد قسيمة متاحة للتفعيل حالياً.':'No gift is available to activate right now.');
  await api.sendMessage({chat_id:query.from.id,text,...(state.available?{reply_markup:{inline_keyboard:[[{text:arabic?'🎟 تفعيل القسيمة الذهبية':'🎟 Activate Golden Ticket',callback_data:'gift:activate:'+state.campaign}]]}}:{})});
  return true;
}
