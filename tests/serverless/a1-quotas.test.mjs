import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';
import { validatePagePayload } from '../../functions/_lib/pages.js';
import { DEVELOPER_IDS } from '../../tgcloud/lib/developer-access.js';
import { quotaSafeMirrorBaseline } from '../../functions/_lib/quota-baseline.js';

const ordinary=123;
const text=n=>[{id:'a',type:'paragraph',position:0,data:{text:'x'.repeat(n)}}];

test('A1 Free text is 20k at the Serverless authority, not at Cloudflare transport',async()=>{
  const h=await harness();
  assert.equal(h.blocks.validateEditorLimits(text(20000),ordinary).ok,true);
  assert.equal(h.blocks.validateEditorLimits(text(20001),ordinary).code,'characters');
  assert.doesNotThrow(()=>validatePagePayload({blocks:text(20000)},null,ordinary));
  // Cloudflare cannot infer verified Plus/Golden from browser claims. It only
  // enforces the 32,768-character technical ceiling; Serverless checks plans.
  assert.doesNotThrow(()=>validatePagePayload({blocks:text(20001),is_developer:true},null,ordinary));
  assert.throws(()=>validatePagePayload({blocks:text(32769)},null,ordinary),/characters/);
  assert.throws(()=>h.renderer.buildInputRichMessage(text(20001),{userId:ordinary}),/EDITOR_LIMIT:characters/);
  assert.equal(h.renderer.buildInputRichMessage(text(20000),{userId:ordinary}).blocks.length,1);
});

test('A1 legacy pages remain unchanged and publish-only; previousBlocks cannot grant editing',async()=>{
  const h=await harness({extraModules:{legacy:'lib/saved-page-policy'}});
  const original=text(24000);
  const row={pageId:'legacy',ownerId:ordinary,quotaVersion:1,blocks:original,
    buttons:[],buttonsPerRow:1,buttonsAlign:'center'};
  assert.equal(h.legacy.isLegacySavedPage(row,ordinary),true);
  assert.throws(()=>h.legacy.assertWritableSavedPage(row,ordinary),/LEGACY_PAGE_READ_ONLY/);
  for(const size of [20000,23000,24000]){
    const result=h.blocks.validateEditorLimits(text(size),ordinary,{previousBlocks:original});
    assert.equal(result.ok,size<=20000,'previous snapshot never increases writable Free quota');
    // Gateway accepts payloads within Telegram's technical ceiling; it cannot
    // decide whether a page is legacy or whether its revision is authoritative.
    assert.doesNotThrow(()=>validatePagePayload({blocks:text(size)}, {blocks:original},ordinary));
  }
  assert.equal(h.blocks.validateEditorLimits(text(24001),ordinary,{previousBlocks:original}).code,'characters');
  assert.equal(h.legacy.legacyPagePublishOptions(row,ordinary).technicalOnly,true);
  assert.doesNotThrow(()=>h.renderer.buildInputRichMessage(original,{
    userId:ordinary,technicalOnly:true,
  }));
  assert.throws(()=>h.renderer.buildInputRichMessage(original,{userId:ordinary}),/EDITOR_LIMIT:characters/);
});

test('developer product exemptions never bypass the Telegram transport ceiling',async()=>{
  const h=await harness();
  const developer=DEVELOPER_IDS[0];
  assert.equal(h.blocks.validateEditorLimits(text(30000),developer).ok,true);
  assert.doesNotThrow(()=>validatePagePayload({blocks:text(30000)},null,developer));
  assert.equal(h.blocks.validateEditorLimits(text(30000),ordinary).code,'characters');
  assert.doesNotThrow(()=>validatePagePayload({blocks:text(30000),
    user_id:developer,is_developer:true},null,ordinary));
  assert.equal(h.blocks.validateEditorLimits(text(32769),developer).code,'characters');
  assert.throws(()=>validatePagePayload({blocks:text(32769)},null,developer),/characters/);
});

test('nested and native rich text are counted at the Serverless authority',async()=>{
  const h=await harness();
  const blocks=[{id:'nested',type:'details',data:{summary_text:'heading',children:[{
    id:'n',type:'paragraph',data:{text:'x'.repeat(19994)}
  }]}}];
  assert.equal(h.blocks.visibleCharacterCount(blocks),20001);
  assert.equal(h.blocks.validateEditorLimits(blocks,ordinary).code,'characters');
  // Gateway transport checks do not convert a browser-provided plan to Plus.
  assert.doesNotThrow(()=>validatePagePayload({blocks},null,ordinary));
  assert.throws(()=>h.renderer.buildInputRichMessage(blocks,{userId:ordinary}),/EDITOR_LIMIT:characters/);
});

test('Cloudflare cached revision is advisory, owner-scoped and cannot authorize over-quota content',async()=>{
  const h=await harness();
  const saved={revision:7,updated_at:300,blocks:text(23000)};
  const service={ready:async()=>true,getPage:async(db,owner,id)=>
    owner===ordinary&&id==='p' ? saved : null};
  for(const body of [{base_revision:6},{base_revision:8},{base_updated_at:299}]){
    const baseline=await quotaSafeMirrorBaseline({},ordinary,'p',body,service);
    assert.equal(baseline,null);
    assert.doesNotThrow(()=>validatePagePayload({blocks:text(23000)},baseline,ordinary));
    assert.equal(h.blocks.validateEditorLimits(text(23000),ordinary).code,'characters');
  }
  const verified=await quotaSafeMirrorBaseline({},ordinary,'p',{base_revision:7},service);
  assert.ok(verified);
  assert.doesNotThrow(()=>validatePagePayload({blocks:text(22000)},verified,ordinary));
  assert.equal(h.blocks.validateEditorLimits(text(22000),ordinary,{previousBlocks:verified.blocks}).code,'characters');
  const missing=await quotaSafeMirrorBaseline({},ordinary,'p',{base_revision:7},{
    ...service,ready:async()=>false,
  });
  assert.equal(missing,null);
  assert.equal(await quotaSafeMirrorBaseline({},999,'p',{base_revision:7},service),null);
});
