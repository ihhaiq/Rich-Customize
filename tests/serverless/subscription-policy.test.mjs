import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, resolveEditorEntitlement, resolveCloneEntitlement, checkApprovedQuota, checkEditorTextQuota, planBenefit, PLAN_PRICES_STARS } from '../../tgcloud/lib/subscription-policy.js';

test('approved pack quotas are 2, 8, 50', () => {
  assert.equal(PLAN_LIMITS.free.emojiPacks, 2);
  assert.equal(PLAN_LIMITS.plus.emojiPacks, 8);
  assert.equal(PLAN_LIMITS.golden.emojiPacks, 50);
});
test('approved text quotas are 20k, 25k, 32k', () => {
  assert.deepEqual(['free','plus','golden'].map(x => PLAN_LIMITS[x].text), [20000,25000,32000]);
});
test('paid tier requires trusted active entitlement', () => {
  assert.equal(resolveEditorEntitlement({plan:'golden'}).plan, 'free');
  assert.equal(resolveEditorEntitlement({plan:'plus',active:true}).plan, 'plus');
  assert.equal(resolveEditorEntitlement({plan:'bogus',active:true}).plan, 'free');
});
test('clone is always free tier', () => {
  assert.equal(resolveCloneEntitlement().plan, 'free');
});
test('developer exempt from product quotas only', () => {
  assert.equal(checkApprovedQuota(resolveEditorEntitlement({developer:true}), 'emojiPacks', 500).allowed, true);
});
test('limits reject first excess value', () => {
  for (const [plan, max] of [['free',2],['plus',8],['golden',50]]) {
    const e=resolveEditorEntitlement({plan,active:true});
    assert.equal(checkApprovedQuota(e,'emojiPacks',max).allowed,true);
    assert.equal(checkApprovedQuota(e,'emojiPacks',max+1).allowed,false);
  }
});
test('approved paid page/block quotas require a verified active entitlement', () => {
  const free=resolveCloneEntitlement();
  assert.equal(checkApprovedQuota(free,'pages',12).allowed,true);
  assert.equal(checkApprovedQuota(free,'pages',13).allowed,false);
  assert.equal(checkApprovedQuota(free,'blocks',31).allowed,false);
  for(const [plan,pages,blocks] of [['plus',50,60],['golden',150,120]]) {
    const inactive=resolveEditorEntitlement({plan});
    const active=resolveEditorEntitlement({plan,active:true});
    assert.equal(checkApprovedQuota(inactive,'pages',13).allowed,false);
    assert.equal(checkApprovedQuota(active,'pages',pages).allowed,true);
    assert.equal(checkApprovedQuota(active,'pages',pages+1).allowed,false);
    assert.equal(checkApprovedQuota(active,'blocks',blocks).allowed,true);
    assert.equal(checkApprovedQuota(active,'blocks',blocks+1).allowed,false);
  }
  assert.deepEqual(PLAN_PRICES_STARS,{free:0,plus:150,golden:350});
  assert.equal(planBenefit(free,'brandingIncluded'),false);
  assert.equal(planBenefit(resolveEditorEntitlement({plan:'plus',active:true}),'brandingIncluded'),true);
  assert.equal(planBenefit(resolveEditorEntitlement({plan:'golden',active:true}),'earlyAccess'),true);
  assert.equal(planBenefit(resolveEditorEntitlement({plan:'plus',active:true}),'earlyAccess'),false);
  assert.throws(()=>checkApprovedQuota(free,'templates',1));
});

test('legacy pages may keep or reduce original verified text but not grow it', () => {
  const free=resolveEditorEntitlement();
  assert.equal(checkEditorTextQuota(free,20000).allowed,true);
  assert.equal(checkEditorTextQuota(free,20001).allowed,false);
  assert.equal(checkEditorTextQuota(free,24500,{previousCount:25000}).allowed,true);
  assert.equal(checkEditorTextQuota(free,25000,{previousCount:25000}).allowed,true);
  assert.equal(checkEditorTextQuota(free,25001,{previousCount:25000}).allowed,false);
  assert.equal(checkEditorTextQuota(free,24001,{previousCount:24000}).allowed,false);
  assert.equal(checkEditorTextQuota(free,21000,{previousCount:20000}).allowed,false);
  assert.equal(checkEditorTextQuota(resolveEditorEntitlement({developer:true}),40000).allowed,true);
  for (const [plan,limit] of [['plus',25000],['golden',32000]]) {
    const entitlement=resolveEditorEntitlement({plan,active:true});
    assert.equal(checkEditorTextQuota(entitlement,limit).allowed,true);
    assert.equal(checkEditorTextQuota(entitlement,limit+1).allowed,false);
  }
  assert.throws(()=>checkEditorTextQuota(free,-1));
});
