import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
const source=readFileSync('tgcloud/lib/admin-stats.js','utf8').replace(/^import .*;$/gm,'').replace(/export /g,'');
function fixture(t){
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(`CREATE TABLE golden_claims(user_id INTEGER,expires_at INTEGER);
 CREATE TABLE editor_subscriptions(user_id INTEGER PRIMARY KEY,plan TEXT,status TEXT,source TEXT,expires_at INTEGER);`);
 const db={all:async query=>sql.prepare(query).all()};
 const module=new Function('db','sql','DEVELOPER_IDS',source+';return {activeSubscribersPage};')(db,{raw:q=>q},[99]);
 return {sql,module};
}
test('subscriber list includes only active verified Plus and Golden; gifts deduplicate and developers are excluded',async t=>{
 const {sql,module}=fixture(t);
 sql.exec(`INSERT INTO editor_subscriptions VALUES
 (1,'plus','active','richdonate:verified',2000),
 (2,'plus','active','richdonate:verified',2000),
 (3,'golden','active','richdonate:verified',2000),
 (4,'plus','active','untrusted',2000),
 (5,'golden','active','richdonate:verified',1000),
 (6,'golden','canceled','richdonate:verified',2000),
 (99,'plus','active','richdonate:verified',2000);
 INSERT INTO golden_claims VALUES(2,1800),(2,1700),(7,1500),(8,1000),(99,1500);`);
 const result=await module.activeSubscribersPage(0,1000);
 assert.equal(result.total,4);assert.equal(result.plus,1);assert.equal(result.golden,3);
 assert.deepEqual(result.users.map(r=>[r.user_id,r.plan,r.expires_at]),[[1,'plus',2000],[2,'golden',1800],[3,'golden',2000],[7,'golden',1500]]);
});
test('subscriber pages are bounded, ordered and clamped even without usage profiles',async t=>{
 const {sql,module}=fixture(t);
 for(let id=1;id<=23;id++)sql.prepare('INSERT INTO golden_claims VALUES(?,2000)').run(id);
 const first=await module.activeSubscribersPage(-1,1000),last=await module.activeSubscribersPage(999,1000);
 assert.equal(first.page,0);assert.equal(first.users.length,10);
 assert.equal(last.page,2);assert.deepEqual(last.users.map(r=>r.user_id),[21,22,23]);
 const empty=await module.activeSubscribersPage(999,2000);
 assert.equal(empty.total,0);assert.equal(empty.page,0);assert.equal(empty.users.length,0);
});
