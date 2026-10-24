// Authenticated Bot-to-Bot management bridge. The editor remains the only
// owner of gift claims, subscriber entitlements and recipient delivery.
import { api, db, InputFile } from 'sdk';
import { eq } from 'sdk/db';
import { legacyStates } from 'schema';
import { isDeveloper } from 'lib/developer-access';
import { issueGoldenGift } from 'lib/golden-gifts';
import { birthdayCampaignStatus, birthdayReportText, birthdayFailureBreakdown, birthdayFailureText } from 'lib/golden-announcements';
import { audienceAndSubscriptionStats, activeSubscribersPage } from 'lib/admin-stats';
import { subscriptionSnapshot } from 'lib/subscription-status';
import { buildSubscriptionRich } from 'lib/subscription-rich';
import { findUserInfoTarget } from 'lib/user-info';
import { logError } from 'lib/error-log';

const PEER='rich_donate_management_peer';
// Shared with the existing RCB1 relay group configured in scheduled-publish.js.
const MANAGEMENT_GROUP_ID=-1003993506865;
const DONATE_BOT_USERNAME='richdonatebot';
const RE=/^rdm_[a-f0-9]{32}$/;
const MAX_PAYLOAD=1024;
const MAX_RESPONSE_BYTES=1024*1024;
const validId=n=>Number.isSafeInteger(Number(n))&&Number(n)>0;
const validChatId=n=>Number.isSafeInteger(Number(n))&&Number(n)!==0;
const now=()=>Math.floor(Date.now()/1000);

async function logBridgeIssue(stage,message,error) {
  const details=[
    'stage='+String(stage),
    'message_id='+String(message?.message_id??'unknown'),
    'chat_type='+String(message?.chat?.type??'unknown'),
    'sender_username='+String(message?.from?.username??'unknown'),
  ].join('; ');
  try {
    await logError('donate_console.bridge',error instanceof Error?error:new Error(String(stage)),{
      userId:validId(message?.from?.id)?Number(message.from.id):undefined,
      chatId:validChatId(message?.chat?.id)?Number(message.chat.id):undefined,
      extra:details,
    });
  } catch(logFailure) {
    console.error('Could not record donation console bridge diagnostic',stage,logFailure);
  }
}
async function peerIdentity(message) {
  const user=message?.from;
  const chat=message?.chat;
  const inManagementGroup=(chat?.type==='group'||chat?.type==='supergroup')
    &&Number(chat?.id)===MANAGEMENT_GROUP_ID;
  if(!user?.is_bot||String(user.username||'').toLowerCase()!==DONATE_BOT_USERNAME
    ||!inManagementGroup||!validId(user.id))return false;
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
async function sendResult(message,response) {
  const payload=JSON.stringify(response);
  const bytes=new TextEncoder().encode(payload);
  if(!response?.request_id||bytes.byteLength>MAX_RESPONSE_BYTES) {
    throw new Error(bytes.byteLength>MAX_RESPONSE_BYTES?'DONATE_CONSOLE_RESPONSE_TOO_LARGE':'DONATE_CONSOLE_RESPONSE_ID_MISSING');
  }
  const chatId=Number(message?.chat?.id);
  const replyTo=Number(message?.message_id);
  const threadId=Number(message?.message_thread_id);
  return api.sendDocument({
    chat_id:chatId,
    disable_notification:true,
    ...(Number.isSafeInteger(replyTo)&&replyTo>0?{reply_to_message_id:replyTo}:{}),
    ...(Number.isSafeInteger(threadId)&&threadId>0?{message_thread_id:threadId}:{}),
    document:new InputFile(bytes,'rdm-'+String(response.request_id)+'.json',{type:'application/json'}),
    caption:'/rdm_response_file_v1 '+String(response.request_id),
  });
}
function subscriberTable(result) {
  const date=value=>Number(value)>0
    ?new Date(Number(value)*1000).toISOString().slice(0,16).replace('T',' ')+' UTC':'—';
  const cell=(text,header=false)=>({
    text:String(text??'—'),align:'center',valign:'middle',
    ...(header?{is_header:true}:{}),
  });
  const cells=[[
    cell('الاسم',true),cell('رابط الحساب',true),cell('نوع الاشتراك',true),
    cell('بداية الاشتراك (UTC)',true),cell('نهاية الاشتراك (UTC)',true),cell('المعرف',true),
  ]];
  for(const user of result.users) {
    const fullName=[user.first_name,user.last_name].filter(Boolean).join(' ').trim();
    const username=String(user.username||'').replace(/^@/,'');
    const accountUrl=username?'https://t.me/'+username:'tg://user?id='+Number(user.user_id);
    cells.push([
      cell(fullName|| (username?'@'+username:'—')),
      {text:{type:'button',button:{text:username?'@'+username:'فتح الحساب',url:accountUrl}},
        align:'center',valign:'middle'},
      cell(user.plan==='plus'?'Plus':'Golden Ticket'),
      cell(date(user.started_at)),cell(date(user.expires_at)),cell(user.user_id),
    ]);
  }
  return {type:'table',cells,is_bordered:true,is_striped:true,is_compact:false};
}
function subscriberRichMessage(result) {
  const pageCount=result.maxPage+1;
  return {is_rtl:true,blocks:[
    {type:'heading',size:2,text:'🎟 المشتركون النشطون'},
    {type:'paragraph',text:'Plus: '+result.plus+' | Golden Ticket: '+result.golden+
      ' | الإجمالي: '+result.total+' | الصفحة '+(result.page+1)+'/'+pageCount},
    subscriberTable(result),
  ]};
}
async function actionResponse(p) {
  const actor=Number(p.user_id);
  if(p.action==='sup') {
    const snap=await subscriptionSnapshot(actor);
    return {rich_message:buildSubscriptionRich({...snap,locale:p.locale==='en'?'en':'ar'})};
  }
  if(p.action!=='info'&&!isDeveloper(actor))throw new Error('DEVELOPER_ONLY');
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
  if(p.action==='subscribers') {
    const result=await activeSubscribersPage(p.page);
    return {rich_message:subscriberRichMessage(result),page:result.page,
      max_page:result.maxPage};
  }
  if(p.action==='info') {
    const user=await findUserInfoTarget(p.target);
    if(!user)return {text:'لم أجد هذا المستخدم ضمن الحسابات التي سبق أن تفاعلت مع المحرر.'};
    return {text:'اسم المستخدم: '+(user.username?'@'+String(user.username).replace(/^@/,''):'غير متوفر')+
      '\nالمعرف: '+Number(user.id)};
  }
  throw new Error('INVALID_OPERATION');
}
export async function handleDonateConsoleMessage(message) {
  const source=String(message?.text||'').trim();
  if(!/^\/rdm_request_v1(?:@|\s|$)/i.test(source))return false;
  // Group requests must explicitly address this bot so Telegram routes the bot-to-bot update.
  const match=source.match(/^\/rdm_request_v1@richcustomizebot\s+([\s\S]+)$/i);
  if(!match) {
    await logBridgeIssue('REQUEST_COMMAND_NOT_ADDRESSED_TO_EDITOR',message,new Error('REQUEST_COMMAND_NOT_ADDRESSED_TO_EDITOR'));
    return true;
  }
  // Never interpret bridge traffic as ordinary editor input. Requests are accepted only
  // from Rich Donate in the shared management group, not from a private chat or another group.
  if(!await peerIdentity(message)) {
    await logBridgeIssue('REQUEST_PEER_OR_GROUP_REJECTED',message,new Error('REQUEST_PEER_OR_GROUP_REJECTED'));
    return true;
  }
  if(source.length>MAX_PAYLOAD) {
    await logBridgeIssue('REQUEST_PAYLOAD_TOO_LARGE',message,new Error('REQUEST_PAYLOAD_TOO_LARGE'));
    return true;
  }
  let p;
  try{p=JSON.parse(match[1]);}catch(error){
    await logBridgeIssue('REQUEST_JSON_INVALID',message,error);
    return true;
  }
  if(!p||!RE.test(String(p.request_id||''))||
    !(p.action==='info'?validChatId(p.user_id):validId(p.user_id))
    ||!['sup','issue','status','failures','stats','subscribers','info'].includes(p.action)
    ||!Number.isSafeInteger(Number(p.page||0))||Number(p.page||0)<0||Number(p.page||0)>10000) {
    await logBridgeIssue('REQUEST_FIELDS_INVALID',message,new Error('REQUEST_FIELDS_INVALID'));
    return true;
  }
  if(p.action!=='sup'&&p.action!=='info'&&!isDeveloper(p.user_id)) {
    await logBridgeIssue('REQUEST_NOT_AUTHORIZED',message,new Error('DEVELOPER_ONLY'));
    await sendResult(message,{request_id:p.request_id,action:p.action,
      user_id:Number(p.user_id),ok:false,text:'هذا الإجراء متاح للمطوّر فقط.'});
    return true;
  }
  const namespace='donate_console:'+p.request_id;
  const first=await db.insert(legacyStates).values({namespace,
    payload:{status:'processing',user_id:Number(p.user_id),action:p.action},
    updatedAt:now()}).onConflictDoNothing({target:legacyStates.namespace}).returning().run();
  if(!first?.length){
    const old=await db.select().from(legacyStates).where(eq(legacyStates.namespace,namespace)).get();
    if(Number(old?.payload?.user_id)!==Number(p.user_id)||old?.payload?.action!==p.action)return true;
    if(old.payload.status==='done'&&old.payload.response) {
      try { await sendResult(message,old.payload.response); }
      catch(error) {
        await logBridgeIssue('RESPONSE_FILE_RESEND_FAILED',message,error);
        throw error;
      }
    } else {
      // Never reexecute side effects after an uncertain processing crash. Make the
      // stuck state observable instead of silently leaving the caller waiting.
      await logBridgeIssue('DUPLICATE_REQUEST_STILL_PROCESSING',message,
        new Error('DUPLICATE_REQUEST_STILL_PROCESSING'));
      await sendResult(message,{request_id:p.request_id,action:p.action,
        user_id:Number(p.user_id),ok:false,
        text:'الطلب السابق ما زال قيد المعالجة ولم تتم إعادة تنفيذه تلقائياً.'});
    }
    return true;
  }
  let response={request_id:p.request_id,action:p.action,user_id:Number(p.user_id),ok:true};
  try{response={...response,...await actionResponse(p)};}
  catch(error){
    console.warn('Donation console operation failed',p.action,error);
    await logBridgeIssue('ACTION_FAILED_'+p.action,message,error);
    response={...response,ok:false,text:'تعذر تنفيذ الطلب. افحص سجل اتصال البوتين وقاعدة المحرر.'};
  }
  await db.update(legacyStates).set({payload:{
    status:'done',user_id:Number(p.user_id),action:p.action,response},updatedAt:now()})
    .where(eq(legacyStates.namespace,namespace)).run();
  try {
    await sendResult(message,response);
  } catch(error) {
    console.error('Donation console response document could not be sent',{
      request_id:p.request_id,action:p.action,chat_id:message?.chat?.id,
    },error);
    await logBridgeIssue('RESPONSE_FILE_SEND_FAILED_'+p.action,message,error);
    throw error;
  }
  return true;
}
