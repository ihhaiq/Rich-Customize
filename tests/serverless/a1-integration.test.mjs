import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './harness.mjs';
import { validatePagePayload } from '../../functions/_lib/pages.js';
import { quotaSafeMirrorBaseline } from '../../functions/_lib/quota-baseline.js';

const userId=123;
const blocks=n=>[{id:'txt',position:0,type:'paragraph',data:{text:'x'.repeat(n)}}];
const page=(n=24000)=>({pageId:'legacy',ownerId:userId,blocks:blocks(n),
  buttons:[],title:'Legacy page',revision:7,updatedAt:300});

test('A1 Cloudflare PUT never trusts a missing or stale mirror baseline',async()=>{
  const stored=page();
  const gateway={ready:async()=>true,getPage:async(_,owner,id)=>
    owner===userId&&id==='legacy'
      ? {blocks:stored.blocks,revision:7,updated_at:300} : null};
  const unchanged=await quotaSafeMirrorBaseline({},userId,'legacy',{base_revision:7},gateway);
  assert.ok(unchanged);
  assert.doesNotThrow(()=>validatePagePayload({blocks:blocks(23000)},unchanged,userId));
  assert.throws(()=>validatePagePayload({blocks:blocks(24001)},unchanged,userId),/characters/);
  for(const bad of [
    {base_revision:8},{base_updated_at:301},{},
  ]){
    const previous=await quotaSafeMirrorBaseline({},userId,'legacy',bad,gateway);
    assert.equal(previous,null);
    assert.throws(()=>validatePagePayload({blocks:blocks(22000)},previous,userId),/characters/);
  }
  assert.equal(await quotaSafeMirrorBaseline({},999,'legacy',{base_revision:7},gateway),null);
});

test('A1 new pages and unsaved direct publishing cannot claim legacy text allowance',async()=>{
  const h=await harness({extraModules:{publish:'lib/publish'}});
  assert.throws(()=>validatePagePayload({blocks:blocks(24000)},null,userId),/characters/);
  await assert.rejects(
    ()=>h.publish.publishPageContentFromBridge({ownerId:userId,blocks:blocks(24000)}),
    /EDITOR_LIMIT/,
  );
  assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,0);
});

test('A1 saved legacy page can still be delivered with content unchanged',async()=>{
  const h=await harness({extraModules:{delivery:'lib/page-delivery'}});
  h.records.richPages.push(page());
  const result=await h.delivery.savedPageQueryResult('legacy');
  assert.ok(result?.input_message_content?.rich_message?.blocks?.length);
  assert.equal(h.records.richPages[0].blocks[0].data.text.length,24000);
  assert.equal(h.records.richPages[0].revision,7);
});

test('A1 editor baseline is scoped to the actual owner, not the draft',async()=>{
  const h=await harness();
  const draft={currentPageId:'legacy',blocks:blocks(24000)};
  assert.equal(await h.session.trustedEditorQuotaBaseline(userId,draft),null);
  h.records.richPages.push(page());
  const baseline=await h.session.trustedEditorQuotaBaseline(userId,draft);
  assert.equal(h.blocks.visibleCharacterCount(baseline),24000);
  assert.equal(h.blocks.validateEditorLimits(blocks(24001),userId,{previousBlocks:baseline}).code,'characters');
  assert.equal(await h.session.trustedEditorQuotaBaseline(999,draft),null);
});

test('A1 avoids blind last-writer-wins updates on saved pages',()=>{
  const root=new URL('../../tgcloud/lib/',import.meta.url);
  const manual=readFileSync(new URL('editor-pages.js',root),'utf8');
  const sync=readFileSync(new URL('editor-session.js',root),'utf8');
  const route=readFileSync(new URL('../../functions/miniapp/api/pages/[page_id].js',import.meta.url),'utf8');
  assert.match(manual,/eq\(richPages\.revision, Number\(existing\.revision \|\| 1\)\)/);
  assert.match(sync,/eq\(richPages\.revision, Number\(page\.revision \|\| 1\)\)/);
  assert.match(route,/quotaSafeMirrorBaseline/);
  assert.doesNotMatch(route,/relayLegacyUpdate/);
});
