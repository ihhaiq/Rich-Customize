import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const owner=710001;
const record=(rev,n)=>({
  pageId:'abc12345',ownerId:owner,title:'Page '+rev,
  blocks:[{id:'text',type:'paragraph',position:0,data:{text:'x'.repeat(n)}}],
  buttons:[],buttonsPerRow:1,buttonsAlign:'center',revision:rev,
  updatedAt:rev*100,createdAt:100,syncSeq:rev,
});
function subscribe(h,plan='plus') {
  h.records.editorSubscriptions.push({
    userId:owner,plan,status:'active',source:'richdonate:verified',
    startedAt:1,expiresAt:Math.floor(Date.now()/1000)+86400,updatedAt:1,
  });
}

test('paid editor entitlement requires trusted billing source and future expiry',async()=>{
  const h=await harness({extraModules:{subs:'lib/editor-subscriptions'}});
  h.records.editorSubscriptions.push({
    userId:owner,plan:'golden',status:'active',source:'client',
    startedAt:1,expiresAt:Math.floor(Date.now()/1000)+86400,updatedAt:1,
  });
  assert.equal((await h.subs.getEditorEntitlement(owner)).plan,'free');
  h.records.editorSubscriptions[0].source='richdonate:verified';
  assert.equal((await h.subs.getEditorEntitlement(owner)).plan,'golden');
  assert.equal(await h.subs.hasGoldenEarlyAccess(owner),true);
  h.records.editorSubscriptions[0].expiresAt=1;
  assert.equal((await h.subs.getEditorEntitlement(owner)).plan,'free');
  h.records.editorSubscriptions[0].expiresAt=Math.floor(Date.now()/1000)+86400;
  h.records.editorSubscriptions[0].status='inactive';
  assert.equal((await h.subs.getEditorEntitlement(owner)).plan,'free');
});

test('history archives previous version, respects owner, skips duplicates and prunes Plus to 5',async()=>{
  const h=await harness({extraModules:{history:'lib/page-version-history'}});
  subscribe(h);
  const initial=record(1,5);
  h.records.richPages.push(record(2,7));
  assert.equal(await h.history.archivePreviousPageVersion(owner,initial,h.records.richPages[0]),true);
  assert.equal(await h.history.archivePreviousPageVersion(owner,initial,h.records.richPages[0]),true);
  assert.equal(h.records.editorPageVersions.length,1);
  assert.equal((await h.history.listSavedPageVersions(999,'abc12345')).status,'missing');
  assert.equal((await h.history.listSavedPageVersions(owner,'abc12345')).versions[0].revision,1);
  for(let rev=2;rev<10;rev++){
    await h.history.archivePreviousPageVersion(owner,record(rev,rev),record(rev+1,rev+1));
  }
  const versions=await h.history.listSavedPageVersions(owner,'abc12345');
  assert.equal(versions.versions.length,5);
  assert.deepEqual(versions.versions.map(v=>v.revision),[9,8,7,6,5]);
  h.records.editorSubscriptions[0].expiresAt=1;
  assert.equal((await h.history.listSavedPageVersions(owner,'abc12345')).status,'upgrade_required');
  assert.equal(h.records.editorPageVersions.length,5); // downgrade never destroys snapshots
});

test('free users cannot create history and stale restore never edits page',async()=>{
  const h=await harness({extraModules:{history:'lib/page-version-history'}});
  h.records.richPages.push(record(5,10));
  assert.equal(await h.history.archivePreviousPageVersion(owner,record(4,5),h.records.richPages[0]),false);
  assert.equal(h.records.editorPageVersions.length,0);
  subscribe(h);
  assert.equal((await h.history.restoreSavedPageVersion(owner,'abc12345',4,3)).status,'conflict');
  assert.equal(h.records.richPages[0].revision,5);
  assert.equal((await h.history.restoreSavedPageVersion(999,'abc12345',4,5)).status,'missing');
  assert.equal(h.records.richPages[0].blocks[0].data.text.length,10);
});
