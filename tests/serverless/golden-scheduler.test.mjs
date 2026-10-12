import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { dispatchDueReminders, handleScheduleBridgeEvent } from '../../functions/_lib/scheduling-reminders.js';
function fixture(t) {
 const sql=new DatabaseSync(':memory:');t.after(()=>sql.close());
 sql.exec(`CREATE TABLE schedule_reminders(job_id TEXT PRIMARY KEY,revision INTEGER,run_at INTEGER,status TEXT,next_attempt_at INTEGER,updated_at INTEGER,attempts INTEGER DEFAULT 0)`);
 const db={prepare(query){return {bind(...args){return {
 async run(){return {meta:{changes:sql.prepare(query).run(...args).changes}};},
 async all(){return {results:sql.prepare(query).all(...args)};},
 };}};}};
 const id=prefix=>prefix+'_'+ 'a'.repeat(32);
 const insert=(prefix,status,attempts)=>sql.prepare('INSERT INTO schedule_reminders VALUES(?,1,100,?,100,100,?)').run(id(prefix),status,attempts);
 const row=prefix=>sql.prepare('SELECT * FROM schedule_reminders WHERE job_id=?').get(id(prefix));
 return {db,id,insert,row};
}
test('Cloudflare resumes exhausted Golden jobs and retries after Serverless fails to acknowledge',async t=>{
 const h=fixture(t);h.insert('gfb','exhausted',8);h.insert('sch','awaiting_ack',8);
 const sent=[];
 await dispatchDueReminders(h.db,async cmd=>sent.push(cmd),1000);
 assert.equal(sent.length,1);assert.ok(sent[0].includes(h.id('gfb')));
 assert.equal(h.row('gfb').attempts,9);assert.equal(h.row('sch').status,'exhausted');
 await dispatchDueReminders(h.db,async cmd=>sent.push(cmd),1900);
 assert.equal(sent.length,2);
 await handleScheduleBridgeEvent(h.db,{type:'result',jobId:h.id('gfb'),revision:1,status:'sent'},1901);
 await dispatchDueReminders(h.db,async cmd=>sent.push(cmd),3000);
 assert.equal(sent.length,2,'acknowledged jobs never restart');
});
test('relay rejection and a crash during the final dispatch remain recoverable for Golden',async t=>{
 const h=fixture(t);h.insert('gfb','dispatching',8);
 await dispatchDueReminders(h.db,async()=>{throw new Error('test relay outage');},1000);
 assert.equal(h.row('gfb').status,'pending');
 assert.ok(h.row('gfb').next_attempt_at>1000);
 await dispatchDueReminders(h.db,async()=>{},2000);
 assert.equal(h.row('gfb').status,'awaiting_ack');
});
