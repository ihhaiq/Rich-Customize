import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, resolveEditorEntitlement, resolveCloneEntitlement, checkApprovedQuota } from '../../lib/subscription-policy.js';

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
