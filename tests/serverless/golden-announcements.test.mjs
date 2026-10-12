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
test('all languages use H1 birthday heading and footer with native cake and inline activation',async()=>{
 const h=await fixture();
 for(const lang of ['ar','ar-IQ','en','ru',null]){
  const rich=h.birthday.birthdayAnnouncement(lang),arabic=String(lang).startsWith('ar');
  const texts=rich.blocks.flatMap(b=>b.text);
  assert.equal(texts.find(t=>t?.type==='custom_emoji').custom_emoji_id,'5427201480740321598');
  const button=texts.find(t=>t?.type==='button').button;
  assert.equal(button.callback_data,'gift:activate');
  assert.equal(button.text,arabic?'فعلها':'Active');
  assert.equal(rich.blocks.length,2);
  assert.equal(rich.blocks[0].type,'heading');
  assert.equal(rich.blocks[0].size,1);
  assert.equal(rich.blocks[1].type,'footer');
  assert.equal(rich.blocks[0].text.some(t=>t?.type==='custom_emoji'),true,'cake belongs to H1');
  assert.equal(rich.blocks[1].text.some(t=>t?.type==='button'),true,'activation belongs to footer');
  assert.equal(rich.blocks[0].text[0],arabic?'عيد ميلادي اليوم ':"It's my BIRTHDAY ");
  if(arabic) assert.equal(rich.is_rtl,true);
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
 const reports=h.calls.filter(c=>c.method==='sendMessage'&&c.args.chat_id==='@richDonateBot'
  &&c.args.text?.includes('🎁 تقرير إهداء القسيمة'));
 assert.equal(reports.length,1,'developer must receive exactly one completion report');
 assert.match(reports[0].args.text,/قبله تليكرام: 3/);
 assert.match(reports[0].args.text,/المؤهلون: 3/);
 assert.equal(h.records.legacyStates.filter(r=>r.namespace.includes('golden_notice:')).length,1);
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
 assert.deepEqual(h.records.goldenAnnouncements.map(r=>r.status),['unavailable','uncertain','sent']);
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
test('old campaign deadline no longer stops a usable gift announcement',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.records.goldenCampaigns[0].claimUntil=h.now-1;
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,3);
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
 assert.deepEqual(sends[0].args.rich_message,JSON.parse(JSON.stringify(h.birthday.birthdayAnnouncement('ar',{preview:true}))));
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

test('editor panel moves gift operations to donation bot',async()=>{
  const fs=await import('node:fs');
  const welcome=fs.readFileSync(new URL('../../tgcloud/lib/welcome.js',import.meta.url),'utf8');
  const dev=fs.readFileSync(new URL('../../tgcloud/lib/developer.js',import.meta.url),'utf8');
  assert.ok(!welcome.includes("callback_data: 'gift:show'"));
  assert.ok(!dev.includes("callback_data: 'dev:golden:gift'"));
  assert.ok(!dev.includes("callback_data: 'dev:golden:preview'"));
  assert.match(dev,/@richDonateBot/);
});
test('broadcast status is visible and reports definitive and uncertain failures without double counting',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.apiState.richSendErrors={'1':new Error('BotApiError [403]: bot was blocked by the user'),'2':new Error('Network timeout')};
 await h.birthday.runBirthdayBatch(job.jobId,1);
 const report=await h.birthday.birthdayCampaignStatus();
 assert.equal(report.eligible,3);
 assert.equal(report.counts.sent,1);
 assert.equal(report.counts.unavailable,1);
 assert.equal(report.counts.uncertain,1);
 const text=h.birthday.birthdayReportText(report);
 assert.match(text,/المؤهلون: 3/);
 assert.match(text,/تعذر إيصالها: 1/);
 assert.match(text,/غير مؤكد: 1/);
 assert.match(text,/لم تُرسل بهذه الجولة: 0/);
 const completion=h.calls.filter(c=>c.method==='sendMessage' && c.args.chat_id==='@richDonateBot'
   &&c.args.text?.includes('🎁 تقرير'));
 assert.equal(completion.length,1);
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(h.calls.filter(c=>c.method==='sendMessage'
   &&c.args.chat_id==='@richDonateBot' && c.args.text?.includes('🎁 تقرير')).length,1);
});

 test('completion notification retries a definite rejection before acknowledging the Cloudflare job',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.apiState.messageSendErrors={'@richDonateBot':new Error('BotApiError [429]: retry after 90'),[developer]:new Error('BotApiError [429]: retry after 90')};
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(job.status,'done');
 const notice=h.records.legacyStates.find(r=>r.namespace.endsWith(':complete'));
 assert.equal(notice.payload.status,'retry');
 const completions=()=>h.calls.filter(c=>c.args.text?.startsWith('/rcb_schedule_result')&&c.args.text.includes(job.jobId));
 assert.equal(completions().length,0);
 h.apiState.messageSendErrors={};notice.payload.retryAt=0;
 await Promise.all([h.birthday.runBirthdayBatch(job.jobId,1),h.birthday.runBirthdayBatch(job.jobId,1)]);
 assert.equal(notice.payload.status,'sent');
 assert.ok(completions().length>0);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,3);
 assert.equal(h.calls.filter(c=>c.args.chat_id==='@richDonateBot'&&c.args.text?.includes('انتهت عملية الإرسال')).length,2);
 });
 test('crashed recipient and crashed completion are classified without duplicate delivery',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.records.goldenAnnouncements.push({key:job.month+':1',month:job.month,userId:1,status:'sending',updatedAt:h.now-200});
 h.records.legacyStates.push({namespace:'golden_notice:'+job.month+':complete',payload:{status:'sending'},updatedAt:h.now-200});
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(h.records.goldenAnnouncements[0].status,'uncertain');
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,2);
 assert.equal(h.records.legacyStates[0].payload.status,'uncertain');
 });

test('definite rich formatting rejection falls back to text with activation; blocked user does not stop the batch',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.apiState.richSendErrors={'1':new Error('BotApiError [400]: RICH_MESSAGE_EMOJI_INVALID'),'2':new Error('BotApiError [403]: bot was blocked by the user')};
 await h.birthday.runBirthdayBatch(job.jobId,1);
 const fallback=h.calls.filter(c=>c.method==='sendMessage'&&c.args.chat_id===1);
 assert.equal(fallback.length,1);
 assert.equal(fallback[0].args.reply_markup.inline_keyboard[0][0].callback_data,'gift:activate:'+job.month);
 assert.deepEqual(h.records.goldenAnnouncements.map(r=>r.status),['sent','unavailable','sent']);
});
test('ambiguous network failure never sends a duplicate text fallback',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.apiState.richSendErrors={'1':new Error('Network timeout')};
 await h.birthday.runBirthdayBatch(job.jobId,1);
 assert.equal(h.calls.filter(c=>c.method==='sendMessage'&&c.args.chat_id===1).length,0);
 assert.equal(h.records.goldenAnnouncements[0].status,'uncertain');
});
test('old deadline report confirms the full recipient pass continues',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 h.records.goldenCampaigns[0].claimUntil=h.now-1;
 await h.birthday.runBirthdayBatch(job.jobId,1);
 const report=h.birthday.birthdayReportText(await h.birthday.birthdayCampaignStatus());
 assert.match(report,/لم تُرسل بهذه الجولة: 0/);
});

test('repeat developer issue starts one new reminder round, skips activated users and never extends expiry',async()=>{
 const h=await fixture(),job=h.records.goldenBroadcasts[0];
 await h.birthday.runBirthdayBatch(job.jobId,1);
 const firstButton=h.calls.find(c=>c.method==='sendRichMessage').args.rich_message.blocks[1].text.find(t=>t?.type==='button').button.callback_data;
 await h.gifts.activateGoldenGift(1,h.now,job.month);
 const expiry=h.records.goldenClaims[0].expiresAt;
 await Promise.all([h.gifts.issueGoldenGift(developer,h.now),h.gifts.issueGoldenGift(developer,h.now)]);
 assert.equal(job.round,2);assert.equal(h.records.goldenCampaigns.length,1);
 assert.equal(job.status,'pending');
 await h.birthday.runBirthdayBatch(job.jobId,job.revision);
 const round2=await h.birthday.birthdayCampaignStatus();
 assert.equal(round2.counts.sent,2);assert.equal(round2.counts.skipped,1);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,5);
 assert.equal(h.records.goldenClaims[0].expiresAt,expiry);
 assert.equal(firstButton,'gift:activate:'+job.month);
 const notices=h.calls.filter(c=>c.args.chat_id==='@richDonateBot'&&c.args.text?.includes('انتهت عملية الإرسال'));
 assert.equal(notices.length,2);
});
test('pressing issue during an active batch resumes it without a duplicate round',async()=>{
 const h=await fixture(25),job=h.records.goldenBroadcasts[0];
 await h.birthday.runBirthdayBatch(job.jobId,1);
 await h.gifts.issueGoldenGift(developer,h.now);
 assert.equal(job.round,1);assert.equal(job.cursor,20);
 job.runAt=h.now;
 await h.birthday.runBirthdayBatch(job.jobId,job.revision);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,25);
});

test('golden delivery reasons are structured without raw Telegram error strings',async()=>{
  const h=await fixture(),job=h.records.goldenBroadcasts[0];
  h.apiState.richSendErrors={'1':new Error('BotApiError [403]: bot was blocked by the user'),
    '2':new Error('Network timeout')};
  await h.birthday.runBirthdayBatch(job.jobId,1);
  assert.equal(h.birthday.giftDeliveryReason(new Error('BotApiError [403]: bot was blocked by the user')),'BOT_BLOCKED');
  const logs=h.records.legacyStates.filter(r=>r.namespace.startsWith('golden_delivery:'));
  assert.equal(logs.length,2);
  assert.deepEqual(logs.map(x=>x.payload.code),['BOT_BLOCKED','UNCONFIRMED_OTHER']);
  assert.ok(logs.every(r=>!JSON.stringify(r).includes('BotApiError')));
});
