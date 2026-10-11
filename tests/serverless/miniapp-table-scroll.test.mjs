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
      tag, children, dataset:{}, attributes:{},
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
  assert.match(interactions,/target\.closest\?\.\("\.table-preview"\)\)return null/);
  assert.ok(css.includes('table-pan-active')&&css.includes('translate3d(var(--table-pan-x'));
  assert.match(css,/color-mix\(in srgb, var\(--panel, #192b3d\) 86%, transparent\)/);
  assert.match(app,/function syncTableHeaderPan\(viewport = null\)/);
  assert.match(app,/const oldScroll=new Map\(\)/);
  assert.match(app,/viewport\.scrollLeft=previous\.left;viewport\.scrollTop=previous\.top/);
});

test('header and upper tools share the active table horizontal displacement',()=>{
  const source=read('app.js');
  const start=source.indexOf('function syncTableHeaderPan(viewport = null){');
  const end=source.indexOf('\n}',start);
  assert.ok(start>=0&&end>start);
  const style={};
  const classes=new Set();
  const header={
    style:{setProperty:(key,value)=>{style[key]=value}},
    classList:{toggle:(key,enabled)=>{if(enabled)classes.add(key);else classes.delete(key)}},
  };
  const document={querySelector:selector=>selector==='.editor-head'?header:null};
  const update=new Function('document',source.slice(start,end+2)+';return syncTableHeaderPan;')(document);
  update({scrollLeft:-145});
  assert.equal(style['--table-pan-x'],'145px');
  assert.equal(classes.has('table-pan-active'),true);
  update({scrollLeft:0});
  assert.equal(style['--table-pan-x'],'0px');
  assert.equal(classes.has('table-pan-active'),false);
  update();
  assert.equal(style['--table-pan-x'],'0px');
});
