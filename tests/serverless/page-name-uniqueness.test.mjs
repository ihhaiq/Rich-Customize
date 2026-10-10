import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL('../../'+p,import.meta.url),'utf8');
const source=read('tgcloud/lib/page-names.js').replace(/^import[\s\S]*?;\s*/gm,'').replace(/export /g,'');
function fixture(rows) {
  const locks=new Map();
  const db={
    select:()=>({from:()=>({where:cond=>({all:async()=>rows.filter(r=>r[cond.key]===cond.value)})})}),
    delete:()=>({where:()=>({run:async()=>{}})}),
    insert:()=>({values:v=>({onConflictDoNothing:()=>({returning:()=>({run:async()=>{
      if(locks.has(v.name))return [];locks.set(v.name,v);return [{name:v.name}];
    }})})})}),
  };
  return new Function('db','eq','and','lt','richPages','maintenanceLocks',source+';return {assertUniquePageTitle,acquireOwnerPageLock,normalizePageTitle};')(
    db,(key,value)=>({key,value}),(...x)=>x,(...x)=>x,{ownerId:'ownerId'},{name:'name',expiresAt:'expiresAt'});
}
const rows=[{ownerId:1,pageId:'a',title:'دليل المستخدم'},{ownerId:2,pageId:'b',title:'دليل المستخدم'}];
test('saving duplicate or whitespace variant is rejected',async()=>{
  const f=fixture(rows);
  await assert.rejects(f.assertUniquePageTitle(1,' دليل  المستخدم '),e=>e.code==='PAGE_NAME_EXISTS');
});
test('current page and different owner are allowed; exact names only',async()=>{
  const f=fixture(rows);
  await f.assertUniquePageTitle(1,'دليل المستخدم','a');
  await f.assertUniquePageTitle(3,'دليل المستخدم');
  await f.assertUniquePageTitle(1,'دليل المستخدم الجديد');
});
test('unicode equivalent names cannot bypass duplicate detection',async()=>{
  const f=fixture([{ownerId:1,pageId:'a',title:'Café'}]);
  await assert.rejects(f.assertUniquePageTitle(1,'Cafe\u0301'),e=>e.pageNameExists);
});
test('owner lock serializes simultaneous bot and miniapp mutations',async()=>{
  const f=fixture([]);
  const locks=await Promise.all([f.acquireOwnerPageLock(1),f.acquireOwnerPageLock(1)]);
  assert.equal(locks.filter(Boolean).length,1);
});
test('bot save rejects before any persistence and keeps the same error code',async()=>{
  const full=read('tgcloud/lib/editor-pages.js');
  const persist=full.slice(full.indexOf('async function persistPage'),full.indexOf('async function restorePage'));
  let released=false;
  const f=fixture(rows);
  const persistPage=new Function('acquireOwnerPageLock','releaseOwnerPageLock','assertUniquePageTitle',persist+';return persistPage;')(
    async()=>({name:'lock'}),async()=>{released=true;},f.assertUniquePageTitle);
  await assert.rejects(persistPage(1,'دليل المستخدم',{blocks:[]}),e=>e.code==='PAGE_NAME_EXISTS');
  assert.equal(released,true);
});
test('rename, restore and bridge create/save use the shared guard; content sync cannot rename',()=>{
  const bot=read('tgcloud/lib/editor-pages.js'), bridge=read('tgcloud/lib/miniapp-bridge.js');
  assert.ok(bot.includes('await assertUniquePageTitle(userId, title, pageId)'));
  assert.ok(bot.includes('await assertUniquePageTitle(userId, String(snapshot.title'));
  assert.ok(bridge.includes('await assertUniquePageTitle(input.ownerId, input.title);'));
  assert.ok(bridge.includes('await assertUniquePageTitle(input.ownerId, input.title, input.pageId);'));
  assert.ok(!read('tgcloud/lib/editor-session.js').includes('    title,\n    blocks: clone(session.blocks'));
});
