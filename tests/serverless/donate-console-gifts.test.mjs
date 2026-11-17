import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';
import { buildSubscriptionRich } from '../../tgcloud/lib/subscription-rich.js';

const ACTOR_ID=8997225441;
const DONATE_BOT_ID=9988776655;
const TARGET_ID=123456789;
const REQUEST_ID='rdm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DAY=86400;

async function fixture({plan='plus',months=1,remainingDays=0,sendFailure=false}={}) {
  const h=await harness({extraModules:{
    donateConsole:'lib/donate-console',
    subscriptionStatus:'lib/subscription-status',
  }});
  const now=Math.floor(Date.now()/1000);
  h.records.legacyStates.push({
    namespace:'rich_donate_management_peer',
    payload:{bot_id:DONATE_BOT_ID},
    updatedAt:now,
  });
  h.records.usageUsers.push({
    userId:TARGET_ID,username:'knownuser',firstName:'Known',lastName:'',
    firstSeen:now-365*DAY,lastSeen:now,
  });
  if(remainingDays) {
    h.records.editorSubscriptions.push({
      userId:TARGET_ID,plan:'plus',status:'active',source:'richdonate:verified',
      startedAt:now-20*DAY,expiresAt:now+remainingDays*DAY,updatedAt:now,
    });
  }
  if(sendFailure)h.apiState.messageSendErrors=Object.create(null);
  const payload={
    request_id:REQUEST_ID,action:'gift_subscription',user_id:ACTOR_ID,
    target:String(TARGET_ID),plan,months,entitlement_status:'paid',
    recipient_message:'مبروك وصلت لك هدية الاشتراك 🎁\nالباقة: Plus\nالمدة: 1 شهر',
    page:0,locale:'ar',
  };
  const message={
    from:{id:DONATE_BOT_ID,is_bot:true,username:'richDonateBot'},
    chat:{id:-1003993506865,type:'supergroup'},
    message_id:1467,
    text:'/rdm_request_v1@RichCustomizebot '+JSON.stringify(payload),
  };
  return {h,payload,message,now};
}

test('the current Rich Donate gift request is accepted and adds its duration after the active period',async()=>{
  const {h,message,now}=await fixture({plan:'plus',remainingDays:10});
  assert.equal(await h.donateConsole.handleDonateConsoleMessage(message),true);
  const gift=h.records.editorGiftEntitlements[0];
  assert.equal(gift.plan,'plus');
  assert.equal(gift.startedAt,now+10*DAY);
  assert.equal(gift.expiresAt,now+40*DAY);
  assert.equal(gift.notificationStatus,'sent');
  const visibleNow=await h.subscriptionStatus.subscriptionSnapshot(TARGET_ID,now);
  const visibleAfterCurrent=await h.subscriptionStatus.subscriptionSnapshot(TARGET_ID,now+11*DAY);
  assert.deepEqual(JSON.parse(JSON.stringify(visibleNow.queuedGift)),{
    plan:'plus',startsAt:now+10*DAY,expiresAt:now+40*DAY,
  });
  const status=buildSubscriptionRich({...visibleNow,locale:'en',now});
  assert.ok(status.blocks.some(block=>block.type==='paragraph'
    &&block.text.includes('40 days')));
  assert.equal(visibleNow.plan,'plus');
  assert.equal(visibleNow.expiresAt,now+10*DAY);
  assert.equal(visibleAfterCurrent.plan,'plus');
  assert.equal(visibleAfterCurrent.expiresAt,now+40*DAY);
  assert.equal(h.calls.filter(call=>call.method==='sendMessage'
    &&call.args.chat_id===TARGET_ID).length,1);
  const responseFile=h.calls.find(call=>call.method==='sendDocument').args.document;
  const response=JSON.parse(new TextDecoder().decode(
    Uint8Array.from(Object.values(responseFile.data))));
  assert.deepEqual({
    request_id:response.request_id,action:response.action,user_id:response.user_id,
    target:response.target,plan:response.plan,months:response.months,
    entitlement_status:response.entitlement_status,ok:response.ok,
    entitlement_applied:response.entitlement_applied,
    notification_sent:response.notification_sent,
  },{
    request_id:REQUEST_ID,action:'gift_subscription',user_id:ACTOR_ID,
    target:String(TARGET_ID),plan:'plus',months:1,entitlement_status:'paid',
    ok:true,entitlement_applied:true,notification_sent:true,
  });
});

test('Golden gift activates after an existing Plus period and remains visible to subscription checks',async()=>{
  const {h,message,now}=await fixture({plan:'golden',remainingDays:10});
  await h.donateConsole.handleDonateConsoleMessage(message);
  const afterCurrent=await h.subscriptionStatus.subscriptionSnapshot(TARGET_ID,now+11*DAY);
  assert.equal(afterCurrent.plan,'golden');
  assert.equal(afterCurrent.expiresAt,now+40*DAY);
});

test('an expired or absent subscription starts the gift at the current time',async()=>{
  const {h,message,now}=await fixture({plan:'golden'});
  await h.donateConsole.handleDonateConsoleMessage(message);
  const gift=h.records.editorGiftEntitlements[0];
  assert.ok(Math.abs(gift.startedAt-now)<2);
  assert.equal(gift.expiresAt-gift.startedAt,30*DAY);
});

test('replaying the same gift request does not extend entitlement or resend a completed notification',async()=>{
  const {h,message}=await fixture({remainingDays:10});
  await h.donateConsole.handleDonateConsoleMessage(message);
  const expiry=h.records.editorGiftEntitlements[0].expiresAt;
  await h.donateConsole.handleDonateConsoleMessage(message);
  assert.equal(h.records.editorGiftEntitlements.length,1);
  assert.equal(h.records.editorGiftEntitlements[0].expiresAt,expiry);
  assert.equal(h.calls.filter(call=>call.method==='sendMessage'
    &&call.args.chat_id===TARGET_ID).length,1);
});

test('a failed gift notification is retried without granting another duration',async()=>{
  const {h,message}=await fixture({remainingDays:10});
  h.apiState.messageSendErrors={ [String(TARGET_ID)]:new Error('temporary Telegram failure') };
  await h.donateConsole.handleDonateConsoleMessage(message);
  const expiry=h.records.editorGiftEntitlements[0].expiresAt;
  assert.equal(h.records.editorGiftEntitlements[0].notificationStatus,'pending');
  delete h.apiState.messageSendErrors[String(TARGET_ID)];
  await h.donateConsole.handleDonateConsoleMessage(message);
  assert.equal(h.records.editorGiftEntitlements[0].expiresAt,expiry);
  assert.equal(h.records.editorGiftEntitlements[0].notificationStatus,'sent');
  assert.equal(h.calls.filter(call=>call.method==='sendMessage'
    &&call.args.chat_id===TARGET_ID).length,2);
});

test('invalid gift fields and unknown users do not create an entitlement',async()=>{
  const invalid=await fixture({months:0});
  await invalid.h.donateConsole.handleDonateConsoleMessage(invalid.message);
  assert.equal(invalid.h.records.editorGiftEntitlements.length,0);

  const unknown=await fixture();
  unknown.h.records.usageUsers.length=0;
  await unknown.h.donateConsole.handleDonateConsoleMessage(unknown.message);
  assert.equal(unknown.h.records.editorGiftEntitlements.length,0);
});

test('a non-developer cannot issue a gift even through the authenticated peer',async()=>{
  const {h,message,payload}=await fixture();
  payload.user_id=1234;
  message.text='/rdm_request_v1@RichCustomizebot '+JSON.stringify(payload);
  await h.donateConsole.handleDonateConsoleMessage(message);
  assert.equal(h.records.editorGiftEntitlements.length,0);
  const responseFile=h.calls.find(call=>call.method==='sendDocument').args.document;
  const response=JSON.parse(new TextDecoder().decode(
    Uint8Array.from(Object.values(responseFile.data))));
  assert.equal(response.ok,false);
  assert.equal(response.entitlement_status,'paid');
  assert.equal(response.notification_sent,false);
  assert.equal(response.target,String(TARGET_ID));
});

test('a username-only spoof or different bot ID cannot issue a gift',async()=>{
  const spoof=await fixture();
  spoof.message.from.is_bot=false;
  await spoof.h.donateConsole.handleDonateConsoleMessage(spoof.message);
  assert.equal(spoof.h.records.editorGiftEntitlements.length,0);

  const wrongPeer=await fixture();
  wrongPeer.message.from.id=DONATE_BOT_ID+1;
  await wrongPeer.h.donateConsole.handleDonateConsoleMessage(wrongPeer.message);
  assert.equal(wrongPeer.h.records.editorGiftEntitlements.length,0);
});
