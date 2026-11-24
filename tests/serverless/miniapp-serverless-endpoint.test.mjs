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

test('Serverless page creation and saves restrict login URL buttons to the configured developer',async()=>{
  const h=await bridgeHarness();
  const buttons=[{
    id:'login',
    text:'Sign in',
    type:'login_url',
    value:'https://example.com/login',
    url:'https://example.com/login',
  }];
  await assert.rejects(
    ()=>h.miniapp.handleMiniAppServerlessEndpoint({
      action:'create',
      request_id:'create-login-regular',
      title:'Regular page',
      blocks:[{type:'paragraph',data:{text:'Page content'}}],
      buttons,
    },{initData:{user:{id:123,language_code:'ar'}}}),
    error=>error.code==='LOGIN_URL_FORBIDDEN'
      && error.message==='زر تسجيل الدخول غير متاح, لانك لست مخول لاستعماله',
  );
  assert.equal(h.records.richPages.length,0);

  const regularPage=await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'create',
    request_id:'create-login-plain',
    title:'Regular page',
    blocks:[{type:'paragraph',data:{text:'Page content'}}],
    buttons:[],
  },{initData:{user:{id:123}}});
  await assert.rejects(
    ()=>h.miniapp.handleMiniAppServerlessEndpoint({
      action:'save',
      request_id:'save-login-regular',
      page_id:regularPage.page_id,
      base_revision:regularPage.revision,
      title:'Regular page',
      blocks:[{type:'paragraph',data:{text:'Updated page content'}}],
      buttons,
    },{initData:{user:{id:123}}}),
    error=>error.code==='LOGIN_URL_FORBIDDEN',
  );
  assert.deepEqual(h.records.richPages[0].buttons,[]);

  const developerId=8997225441;
  const result=await h.miniapp.handleMiniAppServerlessEndpoint({
    action:'create',
    request_id:'create-login-developer',
    title:'Developer page',
    blocks:[{type:'paragraph',data:{text:'Page content'}}],
    buttons,
  },{initData:{user:{id:developerId}}});
  assert.equal(result.ok,true);
  assert.equal(h.records.richPages.at(-1).ownerId,developerId);
  assert.equal(h.records.richPages.at(-1).buttons[0].type,'login_url');
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
