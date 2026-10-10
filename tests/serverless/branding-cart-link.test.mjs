import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const URL_CART='https://t.me/richDonateBot?start=cart_branding';
test('editor branding button opens the preselected donation cart in both languages',()=>{
  const source=read('tgcloud/lib/editor-block-ui.js');
  const fn=source.slice(source.indexOf('export function buildEditorToolsKeyboard'),source.indexOf('export function buildAddBlockKeyboard')).replace('export ','');
  const build=new Function('editorCopy','t','tr','resolveLanguage',fn+';return buildEditorToolsKeyboard;')(
    ()=>({}),(_,key)=>key,(_,text)=>text,l=>l);
  for(const lang of ['ar','en']){
    const button=build(lang).inline_keyboard.flat().find(b=>b.url===URL_CART);
    assert.ok(button);assert.equal(button.callback_data,undefined);
  }
});
test('legacy editor branding callback redirects without generating a new invoice',async()=>{
  const source=read('tgcloud/lib/branding.js');
  const fn=source.slice(source.indexOf('export async function handleBrandingCallback')).replace('export ','');
  const calls=[];
  const api={sendMessage:async args=>calls.push(args),answerCallbackQuery:async()=>{},
    createInvoiceLink:async()=>{throw Error('Must not generate an editor invoice');}};
  const handle=new Function('api','isBrandingRemoved',fn+';return handleBrandingCallback;')(api,async()=>false);
  await handle({id:'cb',data:'r:branding',from:{id:100}});
  assert.equal(calls[0].reply_markup.inline_keyboard[0][0].url,URL_CART);
});
