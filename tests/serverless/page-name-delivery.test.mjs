import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../../tgcloud/lib/page-delivery.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?;\s*/gm, '').replace(/export /g, '');
function delivery(rows) {
  const db = { select: () => ({ from: () => ({ where: condition => ({
    all: async () => rows.filter(p => p[condition.key] === condition.value),
    get: async () => rows.find(p => p[condition.key] === condition.value),
  }) }) }) };
  return new Function('db', 'eq', 'richPages', 'resolveLanguage', source +
    ';return {resolveSavedPageReference,guestPageReference,ambiguousPageQueryResult};')(
    db, (key,value)=>({key,value}), {pageId:'pageId',ownerId:'ownerId'}, l=>l||'en');
}
const rows = [
  {pageId:'one',ownerId:1,title:'دليل المستخدم'},
  {pageId:'two',ownerId:1,title:'دليل المستخدم الجديد'},
  {pageId:'other',ownerId:2,title:'دليل المستخدم'},
  {pageId:'english',ownerId:1,title:'My page'},
];
test('exact multiword own names work, longer names and other owners do not collide', async () => {
  const d=delivery(rows);
  assert.deepEqual(await d.resolveSavedPageReference('دليل المستخدم',1),{status:'found',pageId:'one'});
  assert.deepEqual(await d.resolveSavedPageReference('دليل',1),{status:'missing'});
  assert.deepEqual(await d.resolveSavedPageReference('My page',2),{status:'missing'});
  assert.deepEqual(await d.resolveSavedPageReference('My page',1),{status:'found',pageId:'english'});
});
test('duplicate normalized names refuse selection, codes still select the page', async () => {
  const d=delivery([...rows,{pageId:'duplicate',ownerId:1,title:' دليل  المستخدم '}]);
  assert.deepEqual(await d.resolveSavedPageReference('دليل المستخدم',1),{status:'ambiguous'});
  assert.deepEqual(await d.resolveSavedPageReference('duplicate',1),{status:'found',pageId:'duplicate'});
  assert.equal(d.ambiguousPageQueryResult('ar').input_message_content.message_text.includes('كود'),true);
});
test('shared codes and guest token fallback remain available', async () => {
  const d=delivery(rows);
  assert.deepEqual(await d.resolveSavedPageReference('one',2),{status:'found',pageId:'one'});
  assert.deepEqual(await d.resolveSavedPageReference('send one',2,['send','one']),{status:'found',pageId:'one'});
  assert.deepEqual(await d.resolveSavedPageReference('',1),{status:'missing'});
  assert.equal(d.guestPageReference({text:'@RichCustomizebot دليل المستخدم'}),'دليل المستخدم');
  assert.equal(d.guestPageReference({caption:'دليل المستخدم @RichCustomizebot'}),'دليل المستخدم');
});
