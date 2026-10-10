import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const row = count => Array.from({ length: count }, (_, n) => ({ text: String(n) }));
const table = (h, columns, rows=1) => h.blocks.makeBlock('table', {
  rows:Array.from({ length: rows }, () => row(columns)),
});
const text = (h, size=1) => h.blocks.makeBlock('paragraph', { text:'x'.repeat(size) });
const entitlement = (h, plan) => h.policy.resolveEditorEntitlement({plan,active:true});

test('quota policies match the approved Free, Plus and Golden tiers', async () => {
  const h = await harness({extraModules:{policy:'lib/subscription-policy'}});
  assert.equal(h.policy.PLAN_LIMITS.free.blocks, 50);
  assert.equal(h.policy.PLAN_LIMITS.plus.blocks, 200);
  assert.equal(h.policy.PLAN_LIMITS.golden.blocks, 500);
  assert.equal(h.policy.PLAN_LIMITS.golden.text, 32768);
  for(const [plan, columns, blocks, nested, media] of [
    ['free',8,50,4,10], ['plus',12,200,8,25], ['golden',20,500,16,50],
  ]) {
    const limits=h.policy.PLAN_LIMITS[plan];
    assert.equal(limits.tableColumns,columns);
    assert.equal(limits.blocks,blocks);
    assert.equal(limits.nestingDepth,nested);
    assert.equal(limits.mediaAttachments,media);
  }
});

test('table rows consume the message block budget, but cells do not', async () => {
  const h = await harness();
  const full = table(h,8,26);
  assert.equal(h.blocks.editorQuotaUsage([full]).blocks,27);
  assert.equal(h.blocks.validateEditorLimits([full],999999).ok,true);
  const three = [full,table(h,8,26)];
  const over=h.blocks.validateEditorLimits(three,999999);
  assert.equal(over.code,'blocks');
  assert.equal(over.limit,50);
});

test('media and nested details are counted across every child block', async () => {
  const h=await harness();
  const media=Array.from({length:11},()=>h.blocks.makeBlock('photo',{file:{file_id:'test'}}));
  const collage=h.blocks.makeBlock('collage',{children:media});
  const exceeded=h.blocks.validateEditorLimits([collage],999999);
  assert.equal(exceeded.code,'media_attachments');
  assert.equal(exceeded.limit,10);
  const nested=(levels)=>{
    let inner=text(h);
    for(let i=1;i<levels;i++)inner=h.blocks.makeBlock('details',{summary_text:'title',children:[inner]});
    return inner;
  };
  assert.equal(h.blocks.validateEditorLimits([nested(4)],999999).ok,true);
  assert.equal(h.blocks.validateEditorLimits([nested(5)],999999).code,'nesting_depth');
});

test('user cannot avoid plan quotas via bulk session changes or undo/redo', async () => {
  const h=await harness();
  await h.session.createEditorSession(999999,999999,100);
  const bulk=Array.from({length:51},()=>text(h));
  await assert.rejects(
    h.session.updateEditorSession(999999,{blocks:bulk}),
    /EDITOR_LIMIT:blocks:51:50/,
  );
  assert.equal(h.records.editorSessions[0].blocks.length,0);
  const tooLarge=[text(h,20001)];
  await assert.rejects(
    h.session.updateEditorSession(999999,{blocks:tooLarge}),
    /EDITOR_LIMIT:characters:20001:20000/,
  );
});

test('legacy page hydration is allowed, but all subsequent content edits are rejected', async () => {
  const h=await harness({extraModules:{legacy:'lib/saved-page-policy'}});
  await h.session.createEditorSession(999999,999999,100);
  const saved=table(h,12,2);
  const record={
    pageId:'old-page',ownerId:999999,title:'Old',blocks:[saved],buttons:[],
    buttonsPerRow:1,buttonsAlign:'center',revision:1,updatedAt:1234,
  };
  h.records.richPages.push(record);
  const options={blocks:[saved],messageButtons:[],buttonsPerRow:1,buttonsAlign:'center',
    currentPageId:'old-page',currentPageTitle:'Old'};
  assert.equal(h.legacy.isLegacySavedPage(record,999999),true);
  await h.session.updateEditorSession(999999,options);
  await assert.rejects(
    h.session.updateEditorSession(999999,{blocks:[table(h,8,2)]}),
    /LEGACY_PAGE_READ_ONLY/,
  );
  await assert.rejects(
    h.session.updateEditorSession(999999,{messageButtons:[{text:'changed'}]}),
    /LEGACY_PAGE_READ_ONLY/,
  );
  assert.equal(h.records.richPages[0].blocks[0].data.rows[0].length,12);
  assert.equal(h.legacy.isSavedPageUnchanged(record,options),true);
  assert.equal(h.legacy.isSavedPageUnchanged(record,{...options,messageButtons:[{text:'changed'}]}),false);
});

test('only a trusted persisted legacy page receives the technical-only publish path', async () => {
  const h=await harness({extraModules:{legacy:'lib/saved-page-policy'}});
  const existing={pageId:'x',ownerId:999999,title:'Old',blocks:[table(h,12,30)],
    buttons:[],buttonsPerRow:1,buttonsAlign:'center'};
  const flags=h.legacy.legacyPagePublishOptions(existing,999999);
  assert.equal(flags.technicalOnly,true);
  assert.equal(h.blocks.validateEditorLimits(existing.blocks,999999).ok,false);
  assert.equal(h.blocks.validateEditorLimits(existing.blocks,999999,{...flags}).ok,true);
  assert.doesNotThrow(()=>h.renderer.buildInputRichMessage(existing.blocks,{
    userId:999999,...flags,
  }));
  assert.throws(()=>h.renderer.buildInputRichMessage(existing.blocks,{userId:999999}),/EDITOR_LIMIT:/);
  assert.throws(()=>h.legacy.legacyPagePublishOptions(existing,123456));
  assert.throws(()=>h.renderer.buildInputRichMessage(
    [table(h,21)],{userId:999999,technicalOnly:true},
  ),/EDITOR_LIMIT:table_columns/);
});

test('unverified plan claims remain Free', async () => {
  const h=await harness({extraModules:{policy:'lib/subscription-policy'}});
  const claimed=h.policy.resolveEditorEntitlement({plan:'golden',active:false});
  const result=h.blocks.validateEditorLimits([table(h,9)],999999,{entitlement:claimed});
  assert.equal(result.code,'table_columns');
  assert.equal(result.limit,8);
  const verified=h.policy.resolveEditorEntitlement({plan:'plus',active:true});
  assert.equal(h.blocks.validateEditorLimits([table(h,12)],999999,{entitlement:verified}).ok,true);
  assert.equal(h.blocks.validateEditorLimits([table(h,13)],999999,{entitlement:verified}).limit,12);
});
