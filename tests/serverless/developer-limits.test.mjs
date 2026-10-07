import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';
import { DEVELOPER_IDS } from '../../lib/developer-access.js';
import { validatePagePayload } from '../../functions/_lib/pages.js';

const developer = DEVELOPER_IDS[0];
const regular = 123;
const paragraph = text => ({ id: crypto.randomUUID(), type: 'paragraph', position: 0, data: { text } });
const table = (rows, cols) => ({ id: 'table', type: 'table', data: { rows: Array.from({length: rows}, () => Array.from({length: cols}, () => ({text:'x'}))) } });
const cases = [
  ['blocks', Array.from({length:31}, () => paragraph('x'))],
  ['characters', [paragraph('x'.repeat(25001))]],
  ['table_rows', [table(51, 1)]],
  ['table_columns', [table(1, 26)]],
  ['table_rows', [{id:'nested', type:'details', data:{summary_text:'Details', children:[table(51, 1)]}}]],
];

test('bot and Mini App apply owner quotas consistently; missing or forged identity stays limited', async () => {
  const h = await harness();
  for (const [code, blocks] of cases) {
    for (const id of [null, regular]) {
      assert.equal(h.blocks.validateEditorLimits(blocks, id).code, code);
      assert.throws(() => validatePagePayload({blocks, is_developer:true, user_id:developer}, null, id), /editor limit exceeded/);
      assert.throws(() => h.renderer.buildInputRichMessage(blocks, {userId:id}), /EDITOR_LIMIT/);
    }
    assert.equal(h.blocks.validateEditorLimits(blocks, developer).ok, true);
    assert.deepEqual(validatePagePayload({blocks}, null, developer).blocks, blocks);
    assert.ok(h.renderer.buildInputRichMessage(blocks, {userId:developer}).blocks.length);
  }
  assert.throws(() => validatePagePayload({blocks:[null]}, null, developer), /list of objects/);
  assert.throws(() => h.renderer.buildInputRichMessage([], {userId:developer}), /no blocks/);
});

test('regular users may reach the exact existing thresholds', async () => {
  const h = await harness();
  for (const blocks of [Array.from({length:30},()=>paragraph('x')), [paragraph('x'.repeat(25000))], [table(50,25)]]) {
    assert.equal(h.blocks.validateEditorLimits(blocks, regular).ok, true);
    assert.doesNotThrow(() => validatePagePayload({blocks}, null, regular));
  }
});

test('large developer pages survive sync, inline delivery and block management previews', async () => {
  const h = await harness({extraModules:{sync:'lib/miniapp-sync', delivery:'lib/page-delivery'}});
  const blocks = Array.from({length:31},()=>paragraph('x'.repeat(900)));
  h.records.richPages.push({pageId:'large', ownerId:developer, blocks, title:'Large'});
  const event = h.sync.buildPageUpsertSync(h.records.richPages[0]);
  assert.equal(event.page.blocks.length,31);
  assert.equal(JSON.stringify(event.page.blocks),JSON.stringify(blocks));
  const result = await h.delivery.savedPageQueryResult('large');
  assert.ok(result.input_message_content.rich_message.blocks.length >= 31);
  const preview = h.ui.blockEditorRichMessage(table(51,1), [table(51,1)], 'en', developer);
  assert.ok(preview.blocks.some(block=>block.type==='table' && block.cells?.length===51));
});

test('developer repeated editor actions bypass per-user windows; ordinary users remain limited', async () => {
  const h = await harness({extraModules:{requests:'lib/request-guard'}});
  const stamp = Date.now();
  h.records.requestWindows.push({key:'editor:'+regular,timestamps:Array(30).fill(stamp),version:1,expiresAt:Math.floor(stamp/1000)+20});
  for (let i=0;i<35;i++) assert.equal(await h.requests.allowCallbackRequest({id:String(i),from:{id:developer},data:'r:addmenu'}),true);
  assert.equal(await h.requests.allowCallbackRequest({id:'blocked',from:{id:regular,language_code:'en'},data:'r:addmenu'}),false);
});

test('developer slideshow Add more remains available after fifty media', async () => {
  const h = await harness({extraModules:{extra:'lib/editor-extra-blocks'}});
  for (const id of [developer, regular]) {
    await h.session.createEditorSession(id,id,100);
    await h.session.updateEditorSession(id,{state:'adding_block',pendingAddType:'slideshow',addPayload:{slideshow:{token:'test',children:Array.from({length:50},()=>({type:'photo',data:{file_id:'photo'}}))}}});
    const session = await h.session.loadEditorSession(id);
    const before=h.calls.length;
    await h.extra.handleExtraBlockCallback({id:'more',from:{id,language_code:'en'},message:{chat:{id,type:'private'},message_id:100},data:'r:slides:more:test'},session);
    const calls=h.calls.slice(before);
    if(id===developer) assert.ok(calls.some(c=>JSON.stringify(c.args.reply_markup).includes('r:slides:more:test')));
    else assert.ok(calls.some(c=>c.method==='answerCallbackQuery' && c.args.show_alert));
  }
});

test('bridge publishing accepts developer content and blocks ordinary over-quota content before sending', async () => {
  const h = await harness({extraModules:{publish:'lib/publish'}});
  const blocks=Array.from({length:31},()=>paragraph('x'));
  await h.publish.publishPageContentFromBridge({ownerId:developer,blocks});
  assert.ok(h.calls.some(call=>call.method==='sendRichMessage' && call.args.rich_message.blocks.length>=31));
  const sends=h.calls.filter(call=>call.method==='sendRichMessage').length;
  await assert.rejects(()=>h.publish.publishPageContentFromBridge({ownerId:regular,blocks}),/EDITOR_LIMIT/);
  assert.equal(h.calls.filter(call=>call.method==='sendRichMessage').length,sends);
});

test('saving an existing developer page preserves over-quota content', async () => {
  const h = await harness({extraModules:{pages:'lib/editor-pages'}});
  const blocks=Array.from({length:31},()=>paragraph('x'));
  h.records.richPages.push({pageId:'large',ownerId:developer,blocks:[],title:'Old',revision:1,updatedAt:1});
  await h.session.createEditorSession(developer,developer,100);
  await h.session.updateEditorSession(developer,{state:'saving_page_name',currentPageId:'large',blocks});
  await h.pages.handleEditorPageMessage({from:{id:developer,language_code:'en'},chat:{id:developer,type:'private'},message_id:101,text:'Large page'});
  assert.equal(h.records.richPages[0].blocks.length,31);
  assert.equal(h.records.richPages[0].title,'Large page');
});
