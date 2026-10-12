// Authenticated Bot-to-Bot management bridge. The editor remains the only
// owner of gift claims, subscriber entitlements and recipient delivery.
import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { legacyStates } from 'schema';
import { isDeveloper } from 'lib/developer-access';
import { issueGoldenGift } from 'lib/golden-gifts';
import { birthdayCampaignStatus, birthdayReportText, birthdayFailureBreakdown, birthdayFailureText } from 'lib/golden-announcements';
import { audienceAndSubscriptionStats, activeSubscribersPage } from 'lib/admin-stats';
import { subscriptionSnapshot } from 'lib/subscription-status';
import { buildSubscriptionRich } from 'lib/subscription-rich';

const PEER='rich_donate_management_peer';
const RE=/^rdm_[a-f0-9]{32}$/;
const MAX_PAYLOAD=1024;
const validId=n=>Number.isSafeInteger(Number(n))&&Number(n)>0;
const now=()=>Math.floor(Date.now()/1000);

async function peerIdentity(message) {
  const user=message?.from;
  if(!user?.is_bot||String(user.username||'').toLowerCase()!=='richdonatebot'
    ||message.chat?.type!=='private'||Number(message.chat.id)!==Number(user.id)
    ||!validId(user.id))return false;
  const pinned=await db.select().from(legacyStates).where(eq(legacyStates.namespace,PEER)).get();
  if(pinned && Number(pinned.payload?.bot_id)!==Number(user.id))return false;
  if(!pinned) {
    await db.insert(legacyStates).values({namespace:PEER,payload:{bot_id:Number(user.id)},updatedAt:now()})
      .onConflictDoNothing({target:legacyStates.namespace}).run();
    const current=await db.select().from(legacyStates).where(eq(legacyStates.namespace,PEER)).get();
    if(Number(current?.payload?.bot_id)!==Number(user.id))return false;
  }
  return true;
}
async function sendResult(peerId,response) {
  return api.sendMessage({chat_id:peerId,disable_notification:true,
    text:'/rdm_response_v1 '+JSON.stringify(response)});
}
function subscriberText(result) {
  const rows=result.users.map(u=>
    String(u.user_id)+' — '+(u.plan==='plus'?'Plus':'Golden Ticket')+
    ' — '+new Date(Number(u.expires_at)*1000).toISOString().slice(0,16)+' UTC');
  return '🎟 المشتركون وباقاتهم\nPlus: '+result.plus+' | Golden Ticket: '+result.golden+
    '\nالمجموع: '+result.total+' · الصفحة '+(result.page+1)+'/'+(result.maxPage+1)+
    '\n\n'+(rows.join('\n')||'لا يوجد مشتركون نشطون.');
}
async function actionResponse(p) {
  const actor=Number(p.user_id);
  if(p.action==='sup') {
    const snap=await subscriptionSnapshot(actor);
    return {rich_message:buildSubscriptionRich({...snap,locale:p.locale==='en'?'en':'ar'})};
  }
  if(!isDeveloper(actor))throw new Error('DEVELOPER_ONLY');
  if(p.action==='issue') {
    const result=await issueGoldenGift(actor);
    return {text:result.announcementQueued
      ?(result.created?'تم إنشاء حملة الإهداء وإرسال طلب الجدولة.':'تم طلب استئناف الإرسال أو إعادة تذكير غير المفعّلين.')+
        '\nتابع الحالة من زر «حالة الإهداء».'
      :'لم يتم تأكيد تسجيل مهمة الإهداء. افحص جسر RCB1 قبل إعادة المحاولة.'};
  }
  if(p.action==='status')return {text:birthdayReportText(await birthdayCampaignStatus())};
  if(p.action==='failures')return {text:birthdayFailureText(await birthdayFailureBreakdown())};
  if(p.action==='stats'){
    const summary=await audienceAndSubscriptionStats();
    return {text:'📊 إحصائيات الاشتراكات\nالمستخدمون المعروفون: '+summary.known+
      '\nالمتاحون تقديرياً: '+summary.estimatedAvailable+
      '\nحظر/تعذر مؤكد: '+summary.unavailable+
      '\nPlus: '+summary.tiers.plus+
      '\nGolden Ticket (مدفوع): '+summary.tiers.golden+
      '\nGolden Ticket (هدية): '+summary.tiers.gift+
      '\nGolden Ticket (المجموع): '+summary.goldenTotal+
      '\nالمتاحون تقديرياً ليسوا تأكيداً لوصول الإشعارات.'};
  }
  if(p.action==='subscribers')return {text:subscriberText(await activeSubscribersPage(p.page))};
  throw new Error('INVALID_OPERATION');
}
export async function handleDonateConsoleMessage(message) {
  const source=String(message?.text||'');
  if(!source.startsWith('/rdm_request_v1 '))return false;
  // Never interpret bot bridge traffic as ordinary editor input.
  if(!await peerIdentity(message))return true;
  if(source.length>MAX_PAYLOAD)return true;
  let p;
  try{p=JSON.parse(source.slice('/rdm_request_v1 '.length));}catch{return true;}
  if(!p||!RE.test(String(p.request_id||''))||!validId(p.user_id)
    ||!['sup','issue','status','failures','stats','subscribers'].includes(p.action)
    ||!Number.isSafeInteger(Number(p.page||0))||Number(p.page||0)<0||Number(p.page||0)>10000)return true;
  if(p.action!=='sup'&&!isDeveloper(p.user_id))return true;
  const namespace='donate_console:'+p.request_id;
  const first=await db.insert(legacyStates).values({namespace,
    payload:{status:'processing',user_id:Number(p.user_id),action:p.action},
    updatedAt:now()}).onConflictDoNothing({target:legacyStates.namespace}).returning().run();
  if(!first?.length){
    const old=await db.select().from(legacyStates).where(eq(legacyStates.namespace,namespace)).get();
    if(Number(old?.payload?.user_id)!==Number(p.user_id)||old?.payload?.action!==p.action)return true;
    if(old.payload.status==='done'&&old.payload.response)await sendResult(message.from.id,old.payload.response);
    // Never reexecute side effects after an uncertain processing crash.
    return true;
  }
  let response={request_id:p.request_id,action:p.action,user_id:Number(p.user_id),ok:true};
  try{response={...response,...await actionResponse(p)};}
  catch(error){console.warn('Donation console operation failed',p.action,error);
    response={...response,ok:false,text:'تعذر تنفيذ الطلب. افحص اتصال البوتين وقاعدة المحرر.'};}
  await db.update(legacyStates).set({payload:{
    status:'done',user_id:Number(p.user_id),action:p.action,response},updatedAt:now()})
    .where(eq(legacyStates.namespace,namespace)).run();
  await sendResult(message.from.id,response);
  return true;
}
