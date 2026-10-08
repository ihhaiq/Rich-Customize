import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';
import { validatePagePayload } from '../../functions/_lib/pages.js';
import { DEVELOPER_IDS } from '../../tgcloud/lib/developer-access.js';

const ordinary=123;
const text=n=>[{id:'a',type:'paragraph',position:0,data:{text:'x'.repeat(n)}}];

test('A1 new content has matching free text quota at 20k in bot and miniapp',async()=>{
  const h=await harness();
  assert.equal(h.blocks.validateEditorLimits(text(20000),ordinary).ok,true);
  assert.deepEqual(validatePagePayload({blocks:text(20000)},null,ordinary).blocks,text(20000));
  assert.equal(h.blocks.validateEditorLimits(text(20001),ordinary).code,'characters');
  assert.throws(()=>validatePagePayload({blocks:text(20001)},null,ordinary),/characters/);
  assert.throws(()=>h.renderer.buildInputRichMessage(text(20001),{userId:ordinary}),/EDITOR_LIMIT:characters/);
  assert.equal(h.renderer.buildInputRichMessage(text(20000),{userId:ordinary}).blocks.length,1);
});

test('A1 uses verified saved page baseline to allow unchanged/reduced overage',async()=>{
  const h=await harness();
  const original=text(24000);
  for(const size of [20000,23000,24000]){
    assert.equal(h.blocks.validateEditorLimits(text(size),ordinary,{previousBlocks:original}).ok,true);
    assert.doesNotThrow(()=>validatePagePayload({blocks:text(size)}, {blocks:original},ordinary));
    assert.doesNotThrow(()=>h.renderer.buildInputRichMessage(text(size),{userId:ordinary,previousBlocks:original}));
  }
  assert.equal(h.blocks.validateEditorLimits(text(24001),ordinary,{previousBlocks:original}).code,'characters');
  assert.throws(()=>validatePagePayload({blocks:text(24001)}, {blocks:original},ordinary),/characters/);
  assert.throws(()=>validatePagePayload({blocks:text(23000)}, null,ordinary),/characters/);
  assert.doesNotThrow(()=>validatePagePayload({blocks:text(23000)}, null,ordinary,{relayLegacyUpdate:true}));
  assert.throws(()=>validatePagePayload({blocks:text(25001)}, null,ordinary,{relayLegacyUpdate:true}),/characters/);
});

test('developer quota exceptions come only from authenticated identity',async()=>{
  const h=await harness();
  const developer=DEVELOPER_IDS[0];
  assert.equal(h.blocks.validateEditorLimits(text(35000),developer).ok,true);
  assert.doesNotThrow(()=>validatePagePayload({blocks:text(35000)},null,developer));
  assert.throws(()=>validatePagePayload({blocks:text(35000),user_id:developer,is_developer:true},null,ordinary),/characters/);
});

test('nested and native rich text is counted consistently in two validators',async()=>{
  const h=await harness();
  const blocks=[{id:'nested',type:'details',data:{summary_text:'heading',children:[{
    id:'n',type:'paragraph',data:{text:'x'.repeat(19994)}
  }]}}];
  const local=h.blocks.visibleCharacterCount(blocks);
  assert.equal(local,20001);
  assert.equal(h.blocks.validateEditorLimits(blocks,ordinary).code,'characters');
  assert.throws(()=>validatePagePayload({blocks},null,ordinary),/characters/);
});
