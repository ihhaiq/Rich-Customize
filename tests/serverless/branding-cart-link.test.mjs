import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const URL_CART='https://t.me/richDonateBot?start=cart_branding';
test('branding beneficiaries see publishing options instead of the removal purchase link',()=>{
  const source=read('tgcloud/lib/editor-block-ui.js');
  const fn=source.slice(source.indexOf('export function buildEditorToolsKeyboard'),source.indexOf('export function buildAddBlockKeyboard')).replace('export ','');
  const build=new Function('editorCopy','t','tr','resolveLanguage',fn+';return buildEditorToolsKeyboard;')(
    ()=>({}),(_,key)=>key,(_,text)=>text,l=>l);
  const hidden=build('ar',{canManage:true,includeBranding:false}).inline_keyboard.flat().find(b=>b.callback_data==='r:branding-toggle:1');
  const visible=build('ar',{canManage:true,includeBranding:true}).inline_keyboard.flat().find(b=>b.callback_data==='r:branding-toggle:0');
  assert.equal(hidden.text,'إظهار الحقوق');
  assert.equal(visible.text,'إخفاء الحقوق');
  assert.equal(hidden.url,undefined);
  assert.equal(visible.url,undefined);
});
test('users without branding benefits still see the removal purchase link',()=>{
  const source=read('tgcloud/lib/editor-block-ui.js');
  const fn=source.slice(source.indexOf('export function buildEditorToolsKeyboard'),source.indexOf('export function buildAddBlockKeyboard')).replace('export ','');
  const build=new Function('editorCopy','t','tr','resolveLanguage',fn+';return buildEditorToolsKeyboard;')(
    ()=>({}),(_,key)=>key,(_,text)=>text,l=>l);
  for(const lang of ['ar','en']){
    const button=build(lang).inline_keyboard.flat().find(b=>b.url===URL_CART);
    assert.ok(button);assert.equal(button.callback_data,undefined);
  }
});
test('legacy branding callbacks show publishing settings to branding beneficiaries',async()=>{
  const {branding,calls,records}=await (await import('./harness.mjs')).harness({extraModules:{branding:'lib/branding'}});
  records.editorSubscriptions.push({userId:100,plan:'plus',status:'active',source:'richdonate:verified',expiresAt:9999999999});
  await branding.handleBrandingCallback({id:'cb',data:'r:branding',from:{id:100,language_code:'ar'}});
  const message=calls.find(call=>call.method==='sendMessage').args;
  const button=message.reply_markup.inline_keyboard.flat().find(item=>item.callback_data?.startsWith('r:branding-toggle:'));
  assert.equal(button.callback_data,'r:branding-toggle:1');
  assert.equal(button.text,'إظهار الحقوق');
});
test('branding selection callbacks remain covered by editor and publish guards',()=>{
  const editorGuard=read('tgcloud/lib/editor-guard.js');
  const requestGuard=read('tgcloud/lib/request-guard.js');
  for(const prefix of ['r:postsettings:','r:postconfirm:','r:postsend:','r:postschedule:']){
    assert.ok(editorGuard.includes("'"+prefix+"'"));
  }
  assert.match(requestGuard,/value === 'r:postsend' \|\| value\.startsWith\('r:postsend:'\)/);
});
test('branding publish callbacks use explicit targets and keep old button meanings',()=>{
  const source=read('tgcloud/lib/publish.js');
  const start=source.indexOf('function brandingFlag');
  const end=source.indexOf('async function brandingOptions',start);
  const parse=new Function(source.slice(start,end)+';return brandingFlag;')();
  assert.equal(parse('r:pt:branding:set:1','r:pt:branding'),true);
  assert.equal(parse('r:pt:branding:set:0','r:pt:branding'),false);
  assert.equal(parse('r:pt:branding:0','r:pt:branding'),true);
  assert.equal(parse('r:pt:branding:1','r:pt:branding'),false);
});
