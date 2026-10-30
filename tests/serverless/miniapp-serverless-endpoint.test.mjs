import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

async function bridgeHarness(){
  return harness({extraModules:{miniapp:'lib/miniapp-bridge'}});
}

test('Serverless Mini App endpoint rejects missing Telegram identity',async()=>{
  const h=await bridgeHarness();
  await assert.rejects(
    ()=>h.miniapp.handleMiniAppServerlessEndpoint({action:'pages'},{}),
    error=>error.code==='UNAUTHORIZED',
  );
});

test('page reads use the verified Telegram owner, not a client user_id',async()=>{
  const h=await bridgeHarness();
  h.records.richPages.push(
    {pageId:'owned',ownerId:123,title:'Owned',blocks:[],createdAt:1,updatedAt:2},
    {pageId:'foreign',ownerId:999,title:'Foreign',blocks:[],createdAt:1,updatedAt:2},
  );

  const result=await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'pages',user_id:999},
    {initData:{user:{id:123}}},
  );

  assert.equal(result.user_id,123);
  assert.deepEqual(result.pages.map(page=>page.page_id),['owned']);
});

test('editor profile uses trusted Serverless entitlement without client plan claims',async()=>{
  const h=await bridgeHarness();
  const result=await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'me',plan:'golden',is_developer:true},
    {initData:{user:{id:123}}},
  );

  assert.equal(result.user.id,123);
  assert.equal(result.is_developer,false);
  assert.equal(result.limits.custom_emoji_packs,2);
  assert.equal(result.limits.table_columns,8);
  assert.equal('custom_emoji_packs' in result,false);
});
