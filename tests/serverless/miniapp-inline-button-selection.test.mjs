import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../../app/miniapp_static/inline_text_tools.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../../app/miniapp_static/editor.html',import.meta.url),'utf8');
const start=source.indexOf('function insertTokenAtRange(');
const end=source.indexOf('\n  function ensureEditorForInlineButton(',start);
assert.ok(start>=0&&end>start,'inline button insertion helper must remain present');
const ensureStart=end+1;
const ensureEnd=source.indexOf('\n  function createInlineButton(',ensureStart);
assert.ok(ensureStart>0&&ensureEnd>ensureStart,'inline button editor setup helper must remain present');

function insertToken(preserveSelectedText){
  const calls=[];
  const spacer={};
  const token={after(node){calls.push(['after',node])}};
  const selection={removeAllRanges(){calls.push(['removeAllRanges'])},addRange(range){calls.push(['addRange',range])}};
  const range={
    collapse(toEnd){calls.push(['collapse',toEnd])},
    deleteContents(){calls.push(['deleteContents'])},
    insertNode(node){calls.push(['insertNode',node])},
    setStartAfter(node){calls.push(['setStartAfter',node])},
    collapseToCaret(){calls.push(['caretCollapse',true])},
  };
  const caret={setStartAfter(node){calls.push(['caretStartAfter',node])},collapse(value){calls.push(['caretCollapse',value])}};
  const editor={};
  const context={
    editor,
    range,
    makeToken:()=>token,
    markerFor:info=>info,
    document:{createTextNode:()=>spacer,createRange:()=>caret},
    window:{getSelection:()=>selection},
    syncEditor:()=>calls.push(['syncEditor']),
    markDirty:()=>calls.push(['markDirty']),
    pushHistory:()=>calls.push(['pushHistory']),
    hideSelectionToolbar:()=>calls.push(['hideSelectionToolbar']),
  };
  vm.runInNewContext(`${source.slice(start,end)}; insertTokenAtRange(editor, range, {}, ${preserveSelectedText});`,context);
  return calls.map(([name])=>name);
}

function ensureEditor({composerText='',active=null,commitResult=false}={}){
  const calls=[];
  const editor={isConnected:true,isContentEditable:true};
  const context={
    slashInput:{value:composerText},
    activeEditor:active,
    commitPendingComposerText:()=>{
      calls.push('commit');
      context.slashInput.value='';
      context.selectedBlockId='text-block';
      return commitResult;
    },
    requestAnimationFrame:callback=>callback(),
    blocksEl:{querySelector:selector=>{
      calls.push(selector);
      return editor;
    }},
    selectedBlockId:'',
    callback:value=>calls.push(value),
    addBlock:type=>calls.push(`add:${type}`),
  };
  vm.runInNewContext(`${source.slice(ensureStart,ensureEnd)}; ensureEditorForInlineButton(callback);`,context);
  return {calls,editor};
}

test('creating a button from selected paragraph text inserts after it without deleting the text',()=>{
  const calls=insertToken(true);
  assert.ok(calls.includes('collapse'));
  assert.ok(!calls.includes('deleteContents'));
  assert.ok(calls.includes('insertNode'));
});

test('inserting a button at the caret keeps its existing replacement semantics',()=>{
  const calls=insertToken(false);
  assert.ok(calls.includes('deleteContents'));
  assert.ok(!calls.includes('collapse'));
});

test('composer text is committed as a paragraph before creating a button',()=>{
  const {calls,editor}=ensureEditor({composerText:'1. ادواتي',commitResult:true});
  assert.deepEqual(calls,['commit','.block[data-id="text-block"] .rich-inline-editor',editor]);
});

test('button creation without composer text keeps using the active paragraph editor',()=>{
  const active={isConnected:true,isContentEditable:true};
  const {calls}=ensureEditor({active});
  assert.deepEqual(calls,[active]);
});

test('editor serves the updated inline text tool asset',()=>{
  assert.match(html,/inline_text_tools\.js\?v=0\.3\.75/);
});
