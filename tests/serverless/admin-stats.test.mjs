import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './harness.mjs';

test('developer audience stats distinguish estimated reachability from verified Telegram acceptance',async()=>{
  const h=await harness({extraModules:{analytics:'lib/admin-stats'}});
  const result=h.analytics.normalizeAudienceStats([
    {tier:'free',total:9},{tier:'plus',total:3},{tier:'golden',total:2},
    {tier:'gift',total:4},{tier:'developer',total:1},
  ],{known:19,unreachable:2,confirmed:7},19);
  assert.equal(result.known,19);
  assert.equal(result.activePlans,9);
  assert.equal(result.goldenTotal,6);
  assert.equal(result.estimatedAvailable,17);
  assert.equal(result.unavailable,2);
  assert.equal(result.confirmedReachable,7);
  assert.equal(result.unverified,10);
  assert.deepEqual(JSON.parse(JSON.stringify(result.tiers)),{
    free:9,plus:3,golden:2,gift:4,developer:1,
  });
  const dedup=h.analytics.normalizeAudienceStats([], {unreachable:100,confirmed:100},5);
  assert.equal(dedup.estimatedAvailable,0);
  assert.equal(dedup.confirmedReachable,0);
  assert.equal(dedup.unverified,0);
});

test('verified paid cohorts are checked against Serverless billing source and active gift precedence',()=>{
 const source=readFileSync(new URL('../../tgcloud/lib/admin-stats.js',import.meta.url),'utf8');
 const panel=readFileSync(new URL('../../tgcloud/lib/developer.js',import.meta.url),'utf8');
 assert.match(source,/s\.source='richdonate:verified'/);
 assert.match(source,/s\.status='active'/);
 assert.match(source,/s\.expires_at>/);
 assert.match(source,/g\.expires_at>/);
 assert.ok(source.indexOf("THEN 'gift'")<source.indexOf('THEN s.plan'),
  'currently active gifts override verified paid tiers, so recipients are counted once');
 assert.match(source,/ROW_NUMBER\(\) OVER\(PARTITION BY user_id/);
 assert.match(source,/a\.updated_at>=u\.last_seen/);
 assert.match(source,/a\.status='unavailable'/);
 assert.match(panel,/المتاحون تقديرياً/);
 assert.match(panel,/Golden Ticket/);
 assert.match(panel,/dev:stats:subscribers:0/);
 assert.match(panel,/dev:golden:status/);
});
