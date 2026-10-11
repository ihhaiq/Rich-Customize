import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../../app/miniapp_static/app.js',import.meta.url),'utf8');
const beginning=code.indexOf('async function restoreOfflineDraft(pages){');
const ending=code.indexOf('\nfunction loadPerfQueue(){',beginning);
assert.ok(beginning>0&&ending>beginning,'offline recovery helper must remain present');

function runner({list=[],draft,fetch=async()=>({page:null}),missingChoice=false,conflictChoice=false}){
  const calls={applied:[],saved:0,notices:[],requests:[],missingPrompt:0,conflictPrompt:0};
  const dependencies=[
    ()=>draft,
    async url=>{calls.requests.push(url);return fetch(url)},
    async()=>{calls.missingPrompt++;return missingChoice},
    async()=>{calls.conflictPrompt++;return conflictChoice},
    value=>calls.applied.push(value),
    ()=>{calls.saved++},
    text=>calls.notices.push(text),
    key=>key,
    {documentElement:{lang:'ar'}},
  ];
  const exec=new Function(
    'readOfflineDraft','api','confirmMissingPageRecovery','confirmOfflineConflict',
    'applyOfflineDraft','persistOfflineDraftNow','toast','mt','document',
    code.slice(beginning,ending)+';return restoreOfflineDraft;',
  )(...dependencies);
  return {execute:()=>exec(list),calls};
}
const draft=()=>({
  page_id:'pageA',title:'النسخة المحلية',base_revision:2,base_updated_at:110,
  blocks:[{type:'animation',data:{file:{file_id:'f'}}}],buttons:[],
});
const notFound=async()=>{const e=new Error('Not found');e.status=404;e.code='PAGE_NOT_FOUND';throw e};

test('missing summary is checked against server before any conversion',async()=>{
  const r=runner({draft:draft(),fetch:async()=>({page:{page_id:'pageA',revision:2,updated_at:110}})});
  assert.equal(await r.execute(),true);
  assert.equal(r.calls.requests.length,1);
  assert.equal(r.calls.missingPrompt,0);
  assert.equal(r.calls.applied[0].page_id,'pageA');
  assert.equal(r.calls.saved,0);
});

test('missing server page requires explicit approval before creating a new one',async()=>{
  const r=runner({draft:draft(),fetch:notFound,missingChoice:true});
  assert.equal(await r.execute(),true);
  assert.equal(r.calls.applied[0].page_id,null);
  assert.equal(r.calls.applied[0].base_revision,0);
  assert.equal(r.calls.applied[0].blocks.length,1);
  assert.equal(r.calls.saved,1);
});

test('declined missing-page recovery never erases the offline draft',async()=>{
  const r=runner({draft:draft(),fetch:notFound,missingChoice:false});
  assert.equal(await r.execute(),false);
  assert.equal(r.calls.applied.length,0);
  assert.equal(r.calls.saved,0);
});

test('transient network errors keep the original page association',async()=>{
  const r=runner({draft:draft(),fetch:async()=>{throw new Error('Network unavailable')}});
  assert.equal(await r.execute(),true);
  assert.equal(r.calls.missingPrompt,0);
  assert.equal(r.calls.applied[0].page_id,'pageA');
});

test('rejecting a newer-server conflict does not discard the draft',async()=>{
  const r=runner({draft:draft(),list:[{page_id:'pageA',revision:4,updated_at:200}],conflictChoice:false});
  assert.equal(await r.execute(),false);
  assert.equal(r.calls.conflictPrompt,1);
  assert.equal(r.calls.applied.length,0);
});

test('scheduled publishing resolves a permission check from an explicit imported symbol',()=>{
  const code=readFileSync(new URL('../../tgcloud/lib/scheduled-publish.js',import.meta.url),'utf8');
  const publish=readFileSync(new URL('../../tgcloud/lib/publish.js',import.meta.url),'utf8');
  assert.match(code,/import\s*\{[^}]*\bcanPublish\b[^}]*\}\s*from\s*'lib\/publish'/);
  assert.match(publish,/export\s+async\s+function\s+canPublish\(/);
  assert.match(code,/if\(!await canPublish\(chatId,userId\)\)/);
});
