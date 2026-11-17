import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../../app/miniapp_static/app.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../app/miniapp_static/editor.html',import.meta.url),'utf8');
const i18n=readFileSync(new URL('../../app/miniapp_static/miniapp_i18n.js',import.meta.url),'utf8');

function savablePageContent(current){
  const start=app.indexOf('function hasSavablePageContent(){');
  const end=app.indexOf('\nfunction emptyPageSaveError()',start);
  assert.ok(start>=0&&end>start,'save-content guard must remain present');
  const context={current,blockText:block=>block?.data?.text??block?.data?.quote_text??''};
  return vm.runInNewContext(`${app.slice(start,end)}; hasSavablePageContent()`,context);
}

test('fresh drafts start with an empty paragraph and do not count as saveable content',()=>{
  const start=app.indexOf('function newDraft(');
  const end=app.indexOf('\nfunction captureBlockLayout()',start);
  assert.ok(start>=0&&end>start,'new-draft initializer must remain present');
  assert.match(app.slice(start,end),/blocks:\[defaultBlock\("paragraph"\)\]/);
  assert.equal(savablePageContent({page_id:null,blocks:[{type:'paragraph',data:{text:''}}]}),false);
});

test('empty startup paragraph remains unsavable, while user content and saved pages remain saveable',()=>{
  assert.equal(savablePageContent({page_id:null,blocks:[{type:'paragraph',data:{text:'  '}}]}),false);
  assert.equal(savablePageContent({page_id:null,blocks:[{type:'paragraph',data:{text:'hello'}}]}),true);
  assert.equal(savablePageContent({page_id:null,blocks:[{type:'divider',data:{}}]}),true);
  assert.equal(savablePageContent({page_id:'saved-page',blocks:[{type:'paragraph',data:{text:''}}]}),true);
});

test('composer keeps the localized text-or-slash placeholder',()=>{
  assert.match(html,/id="slashInput"[^>]*data-i18n-placeholder="editor\.input_placeholder"/);
  assert.ok(i18n.includes('"editor.input_placeholder":"اكتب نصًا، أو / للأوامر"'));
});
