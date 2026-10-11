import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';
import { parseScheduleBridgeEvent, handleScheduleBridgeEvent, scheduleDueCommand } from '../../functions/_lib/scheduling-reminders.js';
import { goldenGiftAccess } from '../../functions/_lib/golden-gift-access.js';
const developer=8997225441;
async function fixture(){
  const h=await harness({extraModules:{gifts:'lib/golden-gifts',subscriptions:'lib/editor-subscriptions'}});
  const now=Math.floor(Date.now()/1000);
  h.records.usageUsers.push({userId:101,firstSeen:now-500},{userId:102,firstSeen:now-500});
  return {...h,now};
}
test('developer-only issue is one atomic campaign per Baghdad calendar month',async()=>{
  const h=await fixture();
  await assert.rejects(h.gifts.issueGoldenGift(101,h.now),/Developer/);
  const results=await Promise.all([h.gifts.issueGoldenGift(developer,h.now),h.gifts.issueGoldenGift(developer,h.now)]);
  assert.equal(results.filter(r=>r.created).length,1);
  assert.equal(h.records.goldenCampaigns.length,1);
  assert.equal(h.records.goldenClaims.length,0,'issue must not activate users');
  assert.equal((await h.gifts.goldenGiftStatus(101,h.now)).available,true);
  assert.equal((await h.gifts.goldenGiftStatus(999,h.now)).available,false);
  h.records.usageUsers.push({userId:999,firstSeen:h.now+1});
  assert.equal((await h.gifts.goldenGiftStatus(999,h.now+1)).available,false);
});
test('manual claims are idempotent, expire individually, and do not overwrite paid subscriptions',async()=>{
  const h=await fixture(); await h.gifts.issueGoldenGift(developer,h.now);
  h.records.editorSubscriptions.push({userId:101,plan:'plus',status:'active',source:'richdonate:verified',expiresAt:h.now+40*86400});
  await Promise.all([h.gifts.activateGoldenGift(101,h.now),h.gifts.activateGoldenGift(101,h.now)]);
  await h.gifts.activateGoldenGift(102,h.now+60);
  assert.equal(h.records.goldenClaims.length,2);
  assert.equal(h.records.goldenClaims[1].expiresAt-h.records.goldenClaims[0].expiresAt,60);
  assert.equal((await h.subscriptions.getEditorEntitlement(101,{now:h.now})).plan,'golden');
  assert.equal((await h.subscriptions.getEditorEntitlement(101,{now:h.now+30*86400})).plan,'plus');
  assert.equal((await h.subscriptions.getEditorEntitlement(102,{now:h.now+30*86400+60})).plan,'free');
  assert.equal(h.records.editorSubscriptions[0].plan,'plus');
});
test('unclaimed coupon expires at exact 12-hour boundary and survives month rollover',async()=>{
  const h=await fixture();
  await h.gifts.issueGoldenGift(developer,h.now);
  assert.equal((await h.gifts.goldenGiftStatus(101,h.now+43200-1)).available,true);
  assert.equal((await h.gifts.goldenGiftStatus(101,h.now+43200)).available,false);
  const boundary=Date.parse('2026-11-01T00:00:00+03:00')/1000;
  h.records.goldenCampaigns.length=0;
  h.records.usageUsers[0].firstSeen=boundary-10000;
  await h.gifts.issueGoldenGift(developer,boundary-3600);
  assert.equal((await h.gifts.goldenGiftStatus(101,boundary+1)).available,true);
});
test('gift reminder ACK is persisted, early reminders do not expire access, repeated due is safe',async()=>{
  const h=await fixture(); await h.gifts.issueGoldenGift(developer,h.now);
  await h.gifts.activateGoldenGift(101,h.now);
  const row=h.records.goldenClaims[0];
  const command=(kind,extra={})=>'/rcb_schedule_'+kind+'@RichCustomizebot\n'+JSON.stringify({protocol:'RCB1',job_id:row.jobId,revision:1,...extra});
  await h.gifts.receiveGiftReminder(command('ack',{status:'SCHEDULE_REGISTERED'}));
  assert.equal(row.reminderReady,1);
  h.calls.length=0;
  await h.gifts.receiveGiftReminder(command('due'));
  assert.equal(h.calls.length,0);
  row.expiresAt=h.now-1;
  await h.gifts.receiveGiftReminder(command('due'));
  await h.gifts.receiveGiftReminder(command('due'));
  assert.equal(h.calls.length,2);
  assert.equal(await h.gifts.activeGoldenGift(101,h.now),false);
});
test('Cloudflare gift reminder accepts thirty days while post reminders stay capped at four',async()=>{
  const now=1800000000,jobId='gft_'+'a'.repeat(32);
  const event=parseScheduleBridgeEvent('/rcb_schedule_register@Richminiappsbot\n'+JSON.stringify({protocol:'RCB1',job_id:jobId,revision:1,run_at:now+30*86400}));
  const db={prepare(){return {bind(){return this;},async run(){return {};}};}};
  assert.equal((await handleScheduleBridgeEvent(db,event,now)).ok,true);
  assert.equal((await handleScheduleBridgeEvent(db,{...event,jobId:'sch_'+'a'.repeat(32)},now)).ok,false);
  assert.match(scheduleDueCommand(jobId,1,1),/gft_/);
});
test('Cloudflare access is server-owned, expires without a reminder and fails closed',async()=>{
  const env={DB:{prepare(){return {bind(){return this;},async first(){return {expires_at:100};}};}}};
  assert.equal((await goldenGiftAccess(env,101,99)).Golden_ticket,true);
  assert.equal((await goldenGiftAccess(env,101,100)).Golden_ticket,false);
  assert.equal((await goldenGiftAccess({},101,99)).Golden_ticket,false);
});
