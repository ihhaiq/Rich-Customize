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

test('Serverless page CRUD does not send saved page documents to Cloudflare',async()=>{
  const h=await bridgeHarness();
  const context={initData:{user:{id:123}}};
  const created=await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'create',
    request_id:'create-local-page',
    title:'Serverless page',
    blocks:[{type:'paragraph',data:{text:'Saved in Serverless'}}],
    buttons:[],
  },context);

  assert.equal(created.ok,true);
  assert.equal(created.revision,1);
  assert.equal(created.sync_seq,0);
  assert.equal(h.records.richPages.length,1);
  assert.equal(h.records.richPages[0].syncSeq,0);
  assert.equal(h.records.miniappSyncOutbox.length,0);
  assert.equal(h.calls.some(call=>call.method==='sendDocument'),false);

  const saved=await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'save',
    request_id:'save-local-page',
    page_id:created.page_id,
    base_revision:created.revision,
    title:'Serverless page',
    blocks:[{type:'paragraph',data:{text:'Updated in Serverless'}}],
    buttons:[],
  },context);

  assert.equal(saved.ok,true);
  assert.equal(saved.revision,2);
  assert.equal(saved.sync_seq,0);
  assert.equal(h.records.richPages[0].blocks[0].data.text,'Updated in Serverless');
  assert.equal(h.records.richPages[0].syncSeq,0);
  assert.equal(h.records.miniappSyncOutbox.length,0);
  assert.equal(h.calls.some(call=>call.method==='sendDocument'),false);
});

test('Serverless Mini App endpoint does not expose a full-sync action',async()=>{
  const h=await bridgeHarness();
  await assert.rejects(
    ()=>h.miniapp.handleMiniAppServerlessEndpoint(
      {action:'full_sync'},
      {initData:{user:{id:123}}},
    ),
    error=>error.code==='UNKNOWN_ACTION',
  );
  assert.equal(h.calls.some(call=>call.method==='sendDocument'),false);
});

test('editor profile uses trusted Serverless entitlement without client plan claims',async()=>{
  const h=await bridgeHarness();
  const result=await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'me',plan:'golden',is_developer:true},
    {initData:{user:{id:123}}},
  );

  assert.equal(result.user.id,123);
  assert.equal(result.is_developer,false);
  assert.equal(result.plan,'free');
  assert.equal(result.limits.text,20000);
  assert.equal(result.limits.emoji_packs,2);
  assert.equal(result.limits.saved_pages,12);
  assert.equal(result.limits.blocks,50);
  assert.equal(result.limits.nesting_depth,4);
  assert.equal(result.limits.media_attachments,10);
  assert.equal(result.limits.custom_emoji_packs,2);
  assert.equal(result.limits.table_columns,8);
  assert.equal(result.limits.table_rows,26);
  assert.equal('custom_emoji_packs' in result,false);
});
