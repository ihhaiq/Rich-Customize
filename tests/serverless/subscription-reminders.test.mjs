import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

const DAY=86400;
const NOW=1900000000;

async function reminderHarness() {
  return harness({
    extraModules:{
      reminders:'lib/subscription-reminders',
      subscriptions:'lib/editor-subscriptions',
      branding:'lib/branding',
    },
  });
}

test('subscription notice stages cover one daily five-day window and a post-expiry window',async()=>{
  const h=await reminderHarness();
  assert.equal(h.reminders.subscriptionReminderStage(NOW+5*DAY,NOW),'before');
  assert.equal(h.reminders.subscriptionReminderStage(NOW+4*DAY,NOW),'before');
  assert.equal(h.reminders.subscriptionReminderStage(NOW+4*DAY-1,NOW),'');
  assert.equal(h.reminders.subscriptionReminderStage(NOW,NOW),'expired');
  assert.equal(h.reminders.subscriptionReminderStage(NOW-7*DAY,NOW),'');
});

test('daily scan sends an expiry notice with a localized renewal cart button once',async()=>{
  const h=await reminderHarness();
  h.records.editorSubscriptions.push({
    userId:123,plan:'golden',status:'active',source:'richdonate:verified',
    startedAt:NOW-30*DAY,expiresAt:NOW-60,updatedAt:NOW-60,
  });
  h.records.usageUsers.push({userId:123,languageCode:'ar-IQ'});

  await h.reminders.runSubscriptionReminderTick(NOW);
  const sends=h.calls.filter(call=>call.method==='sendRichMessage'&&call.args.chat_id===123);
  assert.equal(sends.length,1);
  assert.ok(sends[0].args.rich_message.blocks.some(block=>block.text==='انتهى اشتراكك'));
  assert.deepEqual(sends[0].args.reply_markup.inline_keyboard[0][0],{
    text:'إعادة الاشتراك',
    url:'https://t.me/RichDonateBot?start=buyGT',
  });

  await h.reminders.runSubscriptionReminderTick(NOW);
  assert.equal(h.calls.filter(call=>call.method==='sendRichMessage'&&call.args.chat_id===123).length,1);
});

test('Plus expiry notice links to the Plus-only cart',async()=>{
  const h=await reminderHarness();
  h.records.editorSubscriptions.push({
    userId:234,plan:'plus',status:'active',source:'richdonate:verified',
    startedAt:NOW-30*DAY,expiresAt:NOW-60,updatedAt:NOW-60,
  });
  h.records.usageUsers.push({userId:234,languageCode:'en'});

  await h.reminders.runSubscriptionReminderTick(NOW);
  const send=h.calls.find(call=>call.method==='sendRichMessage'&&call.args.chat_id===234);
  assert.equal(send.args.reply_markup.inline_keyboard[0][0].url,
    'https://t.me/RichDonateBot?start=buyPlus');
});

test('Golden expiry notice avoids bundling branding for an existing permanent-rights holder',async()=>{
  const h=await reminderHarness();
  h.records.editorSubscriptions.push({
    userId:345,plan:'golden',status:'active',source:'richdonate:verified',
    startedAt:NOW-30*DAY,expiresAt:NOW-60,updatedAt:NOW-60,
  });
  h.records.brandingEntitlements.push({userId:345,rightsRemoved:1});

  await h.reminders.runSubscriptionReminderTick(NOW);
  const send=h.calls.find(call=>call.method==='sendRichMessage'&&call.args.chat_id===345);
  assert.equal(send.args.reply_markup.inline_keyboard[0][0].url,
    'https://t.me/RichDonateBot');
});

test('gifted Golden expiry avoids the branding cart for a permanent-rights holder',async()=>{
  const h=await reminderHarness();
  h.records.goldenClaims.push({
    key:'gift_346',userId:346,jobId:'job_346',
    activatedAt:NOW-30*DAY,expiresAt:NOW-60,reminderReady:0,
  });
  h.records.brandingEntitlements.push({userId:346,rightsRemoved:1});

  await h.reminders.runSubscriptionReminderTick(NOW);
  const send=h.calls.find(call=>call.method==='sendRichMessage'&&call.args.chat_id===346);
  assert.ok(send);
  assert.equal(send.args.reply_markup.inline_keyboard[0][0].url,
    'https://t.me/RichDonateBot');
});

test('five-day notice is sent only once and has no expiry renewal button',async()=>{
  const h=await reminderHarness();
  h.records.editorSubscriptions.push({
    userId:456,plan:'plus',status:'active',source:'richdonate:verified',
    startedAt:NOW-25*DAY,expiresAt:NOW+4*DAY+12*3600,updatedAt:NOW,
  });
  h.records.usageUsers.push({userId:456,languageCode:'en'});

  await h.reminders.runSubscriptionReminderTick(NOW);
  const sends=h.calls.filter(call=>call.method==='sendRichMessage'&&call.args.chat_id===456);
  assert.equal(sends.length,1);
  assert.ok(sends[0].args.rich_message.blocks.some(block=>block.text==='Your subscription is ending soon'));
  assert.equal('reply_markup' in sends[0].args,false);
});

test('an active gift extending beyond a paid expiry suppresses the obsolete notice',async()=>{
  const h=await reminderHarness();
  h.records.editorSubscriptions.push({
    userId:789,plan:'plus',status:'active',source:'richdonate:verified',
    startedAt:NOW-25*DAY,expiresAt:NOW-60,updatedAt:NOW-60,
  });
  h.records.goldenClaims.push({
    key:'gift_789',userId:789,jobId:'job_789',
    activatedAt:NOW-20*DAY,expiresAt:NOW+10*DAY,reminderReady:0,
  });
  await h.reminders.runSubscriptionReminderTick(NOW);
  assert.equal(h.calls.filter(call=>call.method==='sendRichMessage'&&call.args.chat_id===789).length,0);
});

test('manually granted subscriptions receive the same expiry notification',async()=>{
  const h=await reminderHarness();
  h.records.editorGiftEntitlements.push({
    requestId:'gift_manual_1',actorId:8997225441,userId:987,plan:'plus',months:1,
    startedAt:NOW-30*DAY,expiresAt:NOW-60,createdAt:NOW-30*DAY,
  });
  h.records.usageUsers.push({userId:987,languageCode:'en'});
  const effective=await h.subscriptions.getEditorSubscriptionState(987,{now:NOW-61});
  assert.equal(effective.plan,'plus');
  assert.equal(effective.expiresAt,NOW-60);
  assert.equal(effective.active,true);

  await h.reminders.runSubscriptionReminderTick(NOW);
  const sends=h.calls.filter(call=>call.method==='sendRichMessage'&&call.args.chat_id===987);
  assert.equal(sends.length,1);
  assert.ok(sends[0].args.rich_message.blocks.some(block=>block.text==='Your subscription has expired'));
});

test('expiry test command is developer-only and sends the same renewal notice',async()=>{
  const h=await reminderHarness();
  const denied=await h.reminders.sendSubscriptionExpiryTest({
    chat:{id:123,type:'private'},from:{id:123},
  },'en');
  assert.equal(denied,false);
  assert.equal(h.calls.length,0);

  const sent=await h.reminders.sendSubscriptionExpiryTest({
    chat:{id:8997225441,type:'private'},from:{id:8997225441},
  },'en');
  assert.equal(sent,true);
  const notice=h.calls.find(call=>call.method==='sendRichMessage');
  assert.equal(notice.args.chat_id,8997225441);
  assert.equal(notice.args.reply_markup.inline_keyboard[0][0].url,
    'https://t.me/RichDonateBot?start=buyGT');
});

test('expiry test command omits the branding cart for a developer with permanent rights',async()=>{
  const h=await reminderHarness();
  h.records.brandingEntitlements.push({userId:8997225441,rightsRemoved:1});
  await h.reminders.sendSubscriptionExpiryTest({
    chat:{id:8997225441,type:'private'},from:{id:8997225441},
  },'en');
  const notice=h.calls.find(call=>call.method==='sendRichMessage');
  assert.equal(notice.args.reply_markup.inline_keyboard[0][0].url,
    'https://t.me/RichDonateBot');
});
