import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, resolveEditorEntitlement, resolveCloneEntitlement, checkApprovedQuota, checkEditorTextQuota } from '../../tgcloud/lib/subscription-policy.js';

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
test('unapproved quotas are not enforceable', () => {
  assert.throws(()=>checkApprovedQuota(resolveCloneEntitlement(),'pages',13));
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
