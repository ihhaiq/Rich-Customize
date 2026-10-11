import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SUBSCRIPTION_LOCALES,subscriptionLocale,subscriptionText}
  from '../../tgcloud/lib/subscription-copy.js';
import {buildSubscriptionRich,buildSubscriptionPlain,subscriptionRemaining}
  from '../../tgcloud/lib/subscription-rich.js';
import {PLAN_LIMITS} from '../../tgcloud/lib/subscription-policy.js';
const base='tgcloud/';
test('all 20 subscription languages are complete with Arabic RTL and regional locale matching',()=>{
  assert.equal(SUBSCRIPTION_LOCALES.length,20);
  for(const locale of SUBSCRIPTION_LOCALES)
    assert.ok(subscriptionText(locale,'benefits'));
  assert.equal(subscriptionText('ar-IQ','benefits'),'مميزات اشتراكك');
  assert.equal(subscriptionLocale('zh-TW'),'zh-hant');
  assert.equal(subscriptionLocale('fr'),'en');
});
test('/sup blocks have exact rich types and policy-backed benefits',()=>{
  for(const plan of ['free','plus','golden','developer']){
    const msg=buildSubscriptionRich({plan,locale:'ar',expiresAt:plan==='free'?0:1800000000,now:1799900000});
    assert.equal(msg.blocks[0].type,'heading');
    assert.equal(msg.blocks[0].size,1);
    assert.equal(msg.blocks[1].type,'details');
    assert.equal(msg.blocks[1].summary,'مميزات اشتراكك');
    assert.equal(msg.blocks.at(-1).type,'footer');
    assert.equal(msg.is_rtl,true);
    assert.ok(msg.blocks[1].blocks.length>=7);
    assert.match(buildSubscriptionPlain({plan,locale:'en'}),/Your subscription benefits/);
  }
  assert.equal(PLAN_LIMITS.free.pages,12);
  assert.equal(PLAN_LIMITS.plus.pages,50);
  assert.equal(PLAN_LIMITS.golden.pages,150);
});
test('gift expiry and day/hour formatting are computed per person',()=>{
  const msg=buildSubscriptionRich({plan:'golden',gift:true,locale:'en',now:100,
    expiresAt:100+4*86400+3600,reminder:true});
  assert.match(msg.blocks.at(-1).text,/4 days · 1 hours/);
  assert.equal(msg.blocks[0].text,'Golden Ticket · Gift');
  assert.equal(subscriptionRemaining(0,100,'ar'),'بدون انتهاء');
});
test('trusted bridge and private-only /sup routing are wired',()=>{
  const message=readFileSync(base+'handlers/message.js','utf8');
  const bridge=readFileSync(base+'lib/miniapp-bridge.js','utf8');
  const worker=readFileSync('workers/schedule-reminders/worker.js','utf8');
  assert.match(message,/sendSubscriptionStatus/);
  assert.match(bridge,/rcb_subscription_tick@richcustomizebot/);
  assert.match(worker,/rcb_subscription_tick@RichCustomizebot/);
});
