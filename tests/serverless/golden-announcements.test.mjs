import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';
const developer=8997225441;
async function fixture(count=3){
 const h=await harness({extraModules:{gifts:'lib/golden-gifts',birthday:'lib/golden-announcements',branding:'lib/branding',subscriptions:'lib/editor-subscriptions'}});
 const now=Math.floor(Date.now()/1000);
 for(let i=1;i<=count;i++)h.records.usageUsers.push({userId:i,firstSeen:now-100,languageCode:i===1?'ar':'ru'});
 await h.gifts.issueGoldenGift(developer,now);
 return {...h,now};
}
test('Arabic vs other languages: native cake, inline rich activation, English H1/footer',async()=>{
 const h=await fixture();
 for(const lang of ['ar','ar-IQ','en','ru',null]){
  const rich=h.birthday.birthdayAnnouncement(lang),arabic=String(lang).startsWith('ar');
  const texts=rich.blocks.flatMap(b=>b.text);
  assert.equal(texts.find(t=>t?.type==='custom_emoji').custom_emoji_id,'5427201480740321598');
  const button=texts.find(t=>t?.type==='button').button;
  assert.equal(button.callback_data,'gift:activate');
  assert.equal(button.text,arabic?'فعلها':'Active');
  if(!arabic){assert.equal(rich.blocks[0].type,'heading');assert.equal(rich.blocks[0].size,1);assert.equal(rich.blocks[1].type,'footer');}
 }
});
test('one announcement per eligible user, concurrent reminders do not duplicate, no auto activation',async()=>{
 const h=await fixture();
 h.records.usageUsers.push({userId:99,firstSeen:h.now+100});
 const job=h.records.goldenBroadcasts[0];
 await Promise.all([h.birthday.runBirthdayBatch(job.jobId,1),h.birthday.runBirthdayBatch(job.jobId,1)]);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,3);
 assert.equal(h.records.goldenClaims.length,0);
 assert.equal(job.status,'done');
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,3);
 assert.equal(h.records.goldenAnnouncements.filter(r=>r.status==='sent').length,3);
});
test('batches persist progress and continue only via the next reminder revision',async()=>{
 const h=await fixture(25),job=h.records.goldenBroadcasts[0];
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,20);
 assert.equal(job.cursor,20);assert.equal(job.revision,2);assert.equal(job.status,'pending');
 job.runAt=h.now;
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,20);
 await h.birthday.runBirthdayBatch(job.jobId,2);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,25);
 assert.equal(job.status,'done');
});
test('blocked and uncertain sends do not halt other users; ambiguous send is not retried',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.apiState.richSendErrors={'1':new Error('BotApiError [403]: bot was blocked by the user'),'2':new Error('Network timeout')};
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.deepEqual(h.records.goldenAnnouncements.map(r=>r.status),['failed','uncertain','sent']);
 assert.equal(job.status,'done');
});
test('Telegram flood wait leaves recipient retryable, preserving cursor and delay',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.apiState.richSendErrors={'1':new Error('BotApiError [429]: retry after 90')};
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(job.cursor,0);assert.equal(job.revision,2);assert.ok(job.runAt>=h.now+90);
 assert.equal(h.records.goldenAnnouncements[0].status,'retry');
 h.apiState.richSendErrors={};job.runAt=h.now;
 await h.birthday.runBirthdayBatch(job.jobId,2);
 assert.equal(h.records.goldenAnnouncements[0].status,'sent');assert.equal(job.status,'done');
});
test('expired campaign never sends an advertisement with an unusable activation',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.records.goldenCampaigns[0].claimUntil=h.now-1;
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,0);
 assert.equal(job.status,'done');
});
test('gift branding ends for Free; current Plus and permanent purchased removal survive',async()=>{
 const h=await fixture();
 for(const id of [1,2,3]) await h.gifts.activateGoldenGift(id,h.now);
 h.records.editorSubscriptions.push({userId:2,plan:'plus',status:'active',source:'richdonate:verified',expiresAt:h.now+40*86400});
 h.records.brandingEntitlements.push({userId:3,rightsRemoved:1});
 assert.equal(await h.branding.shouldIncludeBranding(1),false);
 for(const row of h.records.goldenClaims)row.expiresAt=h.now-1;
 assert.equal(await h.branding.shouldIncludeBranding(1),true);
 assert.equal((await h.subscriptions.getEditorEntitlement(2)).plan,'plus');
 assert.equal(await h.branding.shouldIncludeBranding(2),false);
 assert.equal(await h.branding.shouldIncludeBranding(3),false);
});

test('developer preview sends one private rich gift announcement with inert activation and no broadcast',async()=>{
 const h=await harness({extraModules:{birthday:'lib/golden-announcements'}});
 await assert.rejects(h.birthday.sendBirthdayAnnouncementTest(101,'ar'),/Developer access required/);
 assert.equal(h.calls.length,0,'unauthorized preview must never send');
 const result=await h.birthday.sendBirthdayAnnouncementTest(developer,'ar');
 assert.ok(result);
 const sends=h.calls.filter(c=>c.method==='sendRichMessage');
 assert.equal(sends.length,1,'preview sends only one message');
 assert.equal(sends[0].args.chat_id,developer,'recipient is the authorized developer');
 assert.deepEqual(sends[0].args.rich_message,h.birthday.birthdayAnnouncement('ar',{preview:true}));
 const previewButton=sends[0].args.rich_message.blocks.flatMap(b=>b.text)
   .find(item=>item?.type==='button')?.button;
 assert.equal(previewButton?.callback_data,'dev:golden:preview:activate');
 const liveButton=h.birthday.birthdayAnnouncement('ar').blocks.flatMap(b=>b.text)
   .find(item=>item?.type==='button')?.button;
 assert.equal(liveButton?.callback_data,'gift:activate','normal gift announcement remains functional');
 assert.equal(h.records.goldenCampaigns.length,0,'preview must not issue a campaign');
 assert.equal(h.records.goldenClaims.length,0,'preview must not activate a gift');
 assert.equal(h.records.goldenBroadcasts.length,0,'preview must not schedule a broadcast');
 assert.equal(h.records.goldenAnnouncements.length,0,'preview must not persist deliveries');
 assert.equal(h.calls.filter(c=>c.method==='sendMessage').length,0,'preview does not use a relay');
});

test('welcome never includes the gift button; developer panel offers distinct live and preview actions',async()=>{
 const fs=await import('node:fs');
 const welcome=fs.readFileSync(new URL('../../tgcloud/lib/welcome.js',import.meta.url),'utf8');
 const dev=fs.readFileSync(new URL('../../tgcloud/lib/developer.js',import.meta.url),'utf8');
 assert.doesNotMatch(welcome,/callback_data:\s*['"]gift:show['"]/);
 assert.match(welcome,/callback_data:\s*['"]r:starteditor['"]/);
 assert.match(dev,/🎁 إهداء \(مرة بالشهر\)/);
 assert.match(dev,/🧪 اختبار الإهداء/);
 assert.match(dev,/callback_data:\s*'dev:golden:preview'/);
 assert.match(dev,/await sendBirthdayAnnouncementTest\(query\.from\.id, query\.from\.language_code\)/);
 const guard=dev.indexOf("!isDeveloper(query.from?.id)");
 const preview=dev.indexOf("if (data === 'dev:golden:preview')");
 assert.ok(guard>=0 && preview>guard,'developer-only authentication precedes preview');
 assert.match(dev,/dev:golden:preview:activate/);
});
