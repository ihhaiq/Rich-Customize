import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = file => readFileSync(new URL('../../app/miniapp_static/' + file, import.meta.url), 'utf8');

function fakeDocument(){
  let focused = null;
  function element(tag){
    const classNames = new Set();
    const listeners = new Map();
    const children = [];
    let className = '';
    const el = {
      tag, children, dataset:{}, attributes:{}, style:{},
      get className(){ return className; },
      set className(v){
        className = String(v);
        classNames.clear();
        for (const c of className.split(/\s+/).filter(Boolean)) classNames.add(c);
      },
      classList:{
        add(name){ classNames.add(name); },
        remove(name){ classNames.delete(name); },
        contains(name){ return classNames.has(name); },
      },
      append(...nodes){ children.push(...nodes); },
      appendChild(node){ children.push(node); },
      setAttribute(key,value){ el.attributes[key] = value; },
      addEventListener(name,listener){
        if (!listeners.has(name)) listeners.set(name,[]);
        listeners.get(name).push(listener);
      },
      dispatch(name, values={}){
        for (const callback of listeners.get(name) || []) callback({...values,target:values.target || el});
      },
      focus(){ focused=el; el.dispatch('focus'); },
      blur(){ if(focused===el) focused=null; el.dispatch('blur'); },
      contains(node){ return el===node || children.some(child=>child.contains?.(node)); },
      querySelector(selector){
        if(selector !== '.table-edit-cell.is-selected')return null;
        const find = node => {
          if(node.classList?.contains('table-edit-cell')&&node.classList.contains('is-selected'))return node;
          for(const child of node.children||[]) {const found=find(child);if(found)return found;}
          return null;
        };
        return find(el);
      },
    };
    return el;
  }
  return {
    document:{ documentElement:{lang:'ar'}, createElement:element, get activeElement(){return focused;} },
  };
}

function buildTableEditor(){
  const source = read('app.js');
  const from = source.indexOf('function tableEditor(block){');
  const to = source.indexOf('\nfunction mediaEditor(block)',from);
  assert.ok(from >= 0 && to > from, 'tableEditor function is present');
  const isolated = source.slice(from,to);
  const mock=fakeDocument();
  const events={selected:0,rebuilt:0,dirty:0,panned:0};
  const build = new Function(
    'document','selectBlock','rebuildTableHtml','markDirty',
    'selectedTableCell','activeTablePanId','syncTableHeaderPan',
    isolated+';return tableEditor;')(
      mock.document,
      ()=>events.selected++,
      ()=>events.rebuilt++,
      ()=>events.dirty++,
      null,
      null,
      ()=>events.panned++,
    );
  return {build,events};
}

const large = {
  id:'table-1',
  data:{ rows:Array.from({length:26},(_,ri)=>
    Array.from({length:20},(_,ci)=>String(ri+1)+':'+String(ci+1))) },
};

test('26-row, 20-column editor renders a separately scrollable table with a header row',()=>{
  const {build}=buildTableEditor();
  const surface=build(structuredClone(large));
  const viewport=surface.children[0];
  const grid=viewport.children[0];
  assert.equal(viewport.className,'table-preview');
  assert.equal(viewport.dataset.blockId,large.id);
  assert.equal(viewport.tabIndex,0);
  assert.equal(grid.children[0].tag,'thead');
  assert.equal(grid.children[0].children.length,1);
  assert.equal(grid.children[1].children.length,25);
  assert.equal(grid.children[0].children[0].children.length,20);
  assert.equal(grid.children[0].children[0].children[0].tag,'th');
  assert.match(surface.children[1].textContent,/اسحب للتمرير/);
});

test('gesture swipes never focus cells; deliberate taps edit, and scrolling leaves edit mode',()=>{
  const {build,events}=buildTableEditor();
  const block=structuredClone(large);
  const viewport=build(block).children[0];
  const cell=viewport.children[0].children[0].children[0].children[0];
  const input=cell.children[0];
  cell.dispatch('pointerdown',{clientX:10,clientY:10});
  cell.dispatch('pointermove',{clientX:40,clientY:12});
  cell.dispatch('click',{target:cell});
  assert.equal(events.selected,0,'swipe must not focus/edit');
  cell.dispatch('pointerdown',{clientX:10,clientY:10});
  cell.dispatch('click',{target:cell});
  assert.equal(events.selected,1,'first tap selects the cell');
  assert.equal(cell.classList.contains('is-selected'),true);
  assert.equal(cell.classList.contains('is-editing'),false,'first tap must not open keyboard');
  cell.dispatch('pointerdown',{clientX:10,clientY:10});
  cell.dispatch('click',{target:cell});
  assert.equal(events.selected,2,'second tap focuses the input and keeps the block selected');
  assert.equal(cell.classList.contains('is-editing'),true,'second tap opens edit mode');
  input.value='changed';
  input.dispatch('input');
  assert.equal(block.data.rows[0][0],'changed');
  assert.equal(events.dirty,1);
  assert.equal(events.rebuilt,1);
  viewport.dispatch('scroll');
  assert.equal(cell.classList.contains('is-editing'),false);
  assert.equal(events.panned,1,'horizontal pan must update the top header');
});

test('gesture CSS overrides previous overflow and block long-press handlers',()=>{
  const css=read('table_touch_scroll.css');
  const html=read('editor.html');
  const interactions=read('interactions.js');
  const app=read('app.js');
  assert.match(css,/overflow-x:\s*auto\s*!important/);
  assert.match(css,/overflow-y:\s*auto\s*!important/);
  assert.match(css,/position:\s*sticky\s*!important/);
  assert.match(css,/touch-action:\s*pan-x pan-y/);
  assert.ok(html.indexOf('table_touch_scroll.css')>html.indexOf('liquid_glass_transparent.css'));
  assert.match(interactions,/target\.closest\?\.\("\.table-preview,\.telegram-table-contextual"\)\)return null/);
  assert.ok(!css.includes('translate3d(var(--table-pan-x'),'toolbar must not move offscreen with the table');
  assert.match(css,/color-mix\(in srgb, var\(--panel, #192b3d\) 86%, transparent\)/);
  assert.match(app,/function syncTableHeaderPan\(\)/);
  assert.match(app,/const oldScroll=new Map\(\)/);
  assert.match(app,/viewport\.scrollLeft=previous\.left;viewport\.scrollTop=previous\.top/);
});

test('header stays anchored while the table pans horizontally',()=>{
  const source=read('app.js');
  const css=read('table_touch_scroll.css');
  const start=source.indexOf('function syncTableHeaderPan(){');
  const end=source.indexOf('\n}',start);
  assert.ok(start>=0&&end>start);
  const removed=[];
  const header={
    style:{removeProperty(key){removed.push(key);}},
    classList:{remove(key){removed.push(key);}},
  };
  const document={querySelector:selector=>selector==='.editor-head'?header:null};
  const reset=new Function('document',source.slice(start,end+2)+';return syncTableHeaderPan;')(document);
  reset();
  assert.ok(removed.includes('--table-pan-x'));
  assert.ok(removed.includes('table-pan-active'));
  assert.match(css,/\.editor-head[\s\S]*?position:\s*sticky\s*!important/);
  assert.ok(!css.includes('translate3d(var(--table-pan-x'));
});

function isolateLiveTouchPan(){
  const source=read('live_preview.js');
  const start=source.indexOf('  function attachTablePan(viewport, block) {');
  const end=source.indexOf('\n  function enhancedTableEditor(block){',start);
  assert.ok(start>=0 && end>start, 'live Rich table touch handlers are present');
  const block={id:'rich-table-1'};
  const callbacks={};
  const viewport={
    scrollLeft:120,scrollTop:80,
    addEventListener(name,handler){(callbacks[name]||=[]).push(handler);},
    contains(){return false;},
    fire(name,values={}){
      for(const handler of callbacks[name]||[])handler(values);
    },
  };
  let panCalls=0;
  const pan=new Function('document','activeTablePanId','syncTableHeaderPan',
    source.slice(start,end)+';return attachTablePan;')(
      {activeElement:null},null,()=>panCalls++,
    );
  pan(viewport,block);
  return {viewport,block,get panCalls(){return panCalls;}};
}

test('real live Rich table drags horizontally while vertical swipes remain page gestures',()=>{
  const h=isolateLiveTouchPan();
  let prevented=0;
  const finger={identifier:1,clientX:200,clientY:160};
  const start=()=>h.viewport.fire('touchstart',{touches:[finger],target:{closest(){return null}}});
  start();
  h.viewport.fire('touchmove',{
    touches:[{identifier:1,clientX:120,clientY:140}],
    cancelable:true,preventDefault(){prevented++},
  });
  assert.equal(h.viewport.scrollLeft,200,'horizontal drag changes the table offset');
  assert.equal(h.viewport.scrollTop,80,'horizontal drag does not change page vertical position');
  assert.equal(prevented,1,'table handles only horizontal panning');
  assert.equal(h.panCalls,0,'toolbar must not move horizontally');
  h.viewport.fire('touchend',{cancelable:true,preventDefault(){prevented++;}});
  let clicked=false;
  h.viewport.fire('click',{preventDefault(){clicked=true},stopImmediatePropagation(){}});
  assert.equal(clicked,true,'ghost click after horizontal swipe suppressed');
  start();
  const preventedBefore=prevented;
  h.viewport.fire('touchmove',{
    touches:[{identifier:1,clientX:190,clientY:60}],
    cancelable:true,preventDefault(){prevented++},
  });
  assert.equal(prevented,preventedBefore,'vertical swipe is left for native page scrolling');
  assert.equal(h.viewport.scrollLeft,200);
  assert.equal(h.viewport.scrollTop,80);
});
test('real live Rich table uses two taps and restores swipe position on rerender',()=>{
  const source=read('live_preview.js'),css=read('table_touch_scroll.css');
  const interactions=read('interactions.js'),html=read('editor.html');
  assert.match(source,/window\.RichLiveRenderer\.table=enhancedTableEditor/);
  assert.match(source,/editor\.contentEditable="false"/);
  assert.match(source,/if\(td\.classList\.contains\("table-cell-editing"\)\)return/);
  assert.match(source,/if\(state\.blockId===String\(block\.id\).*startEdit|const edit=\(\)=>/s);
  assert.ok(!source.includes('onPointerDown:()=>selectCell(block,td,ri,ci)'),
    'touchstart must not select cells');
  assert.match(source,/scrollPositions\.set\(viewport\.dataset\.blockId/);
  assert.match(source,/viewport\.scrollLeft=stored/);
  assert.match(source,/wrap\.setAttribute\("dir","ltr"\)/);
  assert.match(source,/table\.setAttribute\("dir",rtl\?"rtl":"ltr"\)/);
  assert.match(css,/\.telegram-table\.telegram-table-contextual/);
  assert.match(css,/touch-action:\s*pan-y pinch-zoom\s*!important/);
  assert.match(css,/rich-table-cell-editor\[contenteditable="false"\]/);
  assert.match(interactions,/\.table-preview,\.telegram-table-contextual/);
  assert.ok(html.includes('live_preview.js'));
});


test('visible enhancedTableEditor selects once and edits only on the next tap',()=>{
  const source=read('live_preview.js');
  const start=source.indexOf('  function enhancedTableEditor(block){');
  const end=source.indexOf('\n  window.RichLiveRenderer=window.RichLiveRenderer||{};',start);
  assert.ok(start>=0&&end>start);
  const mock=fakeDocument(),state={blockId:null,row:-1,col:-1};
  let chosen=0,selected=0;
  const document=mock.document;
  const createRichTableCellEditor=()=>{
    const div=document.createElement('div');
    div.className='rich-table-cell-editor';
    return div;
  };
  const selectCell=(block,td,ri,ci)=>{
    state.blockId=String(block.id);state.row=ri;state.col=ci;chosen++;
    td.classList.add('table-cell-selected');
  };
  const fakePan=()=>{};
  const make=new Function(
    'document','state','cellObject','createRichTableCellEditor',
    'selectCell','selectBlock','attachTablePan','current',
    source.slice(start,end)+';return enhancedTableEditor;',
  )(document,state,raw=>typeof raw==='object'?raw:{text:String(raw)},
    createRichTableCellEditor,selectCell,()=>selected++,fakePan,{legacy_read_only:false});
  const viewport=make({id:'table-1',data:{rows:[[{text:'A'},{text:'B'}]]}});
  const td=viewport.children[0].children[0].children[0].children[0];
  const editor=td.children[0];
  assert.equal(editor.contentEditable,'false');
  td.dispatch('click',{target:td,stopPropagation(){}});
  assert.equal(chosen,1);
  assert.equal(editor.contentEditable,'false','first tap must not focus rich-text');
  assert.equal(td.classList.contains('table-cell-selected'),true);
  td.dispatch('click',{target:td,stopPropagation(){}});
  assert.equal(editor.contentEditable,'true','second tap starts rich-text editing');
  assert.equal(td.classList.contains('table-cell-editing'),true);
  editor.blur();
  assert.equal(editor.contentEditable,'false','leaving focus restores pan mode');
});

test('real table is in document flow and editor chrome remains width constrained',()=>{
  const css=read('table_touch_scroll.css'),html=read('editor.html');
  const liveCss=css.slice(css.indexOf('/* Rich live-preview tables are part of the document'));
  assert.match(liveCss,/max-height:\s*none\s*!important/);
  assert.match(liveCss,/height:\s*auto\s*!important/);
  assert.match(liveCss,/overflow-x:\s*auto\s*!important/);
  assert.match(liveCss,/overflow-y:\s*visible\s*!important/);
  assert.match(liveCss,/border:\s*0\s*!important/);
  assert.match(css,/max-width:\s*720px\s*!important/);
  assert.ok(!css.includes('translate3d(var(--table-pan-x'));
  assert.ok(html.includes('table_touch_scroll.css'));
});

test('main app retains the only renderer entry points',()=>{
  const app=read('app.js'),live=read('live_preview.js');
  assert.match(app,/function renderBlocks\(\)\{[\s\S]*?RichLiveRenderer\?\.render/);
  assert.match(app,/function tableEditor\(block\)\{[\s\S]*?RichLiveRenderer\?\.table/);
  assert.match(live,/window\.RichLiveRenderer\.render=renderRichBlocks/);
  assert.match(live,/window\.RichLiveRenderer\.table=enhancedTableEditor/);
  assert.ok(!/\brenderBlocks\s*=\s*function/.test(live),'Rich layer must not replace the renderer');
  assert.ok(!/\btableEditor\s*=\s*enhancedTableEditor/.test(live),'Rich layer must not replace tableEditor');
});
