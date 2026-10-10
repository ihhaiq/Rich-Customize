import test from 'node:test';
import assert from 'node:assert/strict';
import { parseScheduleBridgeEvent, scheduleDueCommand, JOB_ID_RE, SCHEDULE_REMINDER_MAX_AHEAD } from '../../functions/_lib/scheduling-reminders.js';

const jobId='sch_'+'a'.repeat(32);
const base={protocol:'RCB1',job_id:jobId,revision:1,run_at:1800000123};
const event=(command,payload=base)=>'/'+command+'@Richminiappsbot\n'+JSON.stringify(payload);

test('register parses only an exact authenticated bridge command shape',()=>{
  assert.deepEqual(parseScheduleBridgeEvent(event('rcb_schedule_register')),{type:'register',jobId,revision:1,runAt:1800000123,status:undefined});
  assert.equal(parseScheduleBridgeEvent(event('rcb_schedule_register',{...base,job_id:'../../bad'})),null);
  assert.equal(parseScheduleBridgeEvent(event('rcb_schedule_register',{...base,revision:0})),null);
  assert.equal(parseScheduleBridgeEvent(event('rcb_schedule_register',{...base,run_at:'tomorrow'})),null);
  assert.equal(parseScheduleBridgeEvent(event('rcb_schedule_register').replace('@Richminiappsbot','@SomeoneElse')),null);
});
test('cancel and result events validate status and version',()=>{
  assert.equal(parseScheduleBridgeEvent(event('rcb_schedule_cancel'))?.type,'cancel');
  assert.equal(parseScheduleBridgeEvent(event('rcb_schedule_result',{...base,status:'sent'}))?.status,'sent');
  assert.equal(parseScheduleBridgeEvent(event('rcb_schedule_result',{...base,status:'pending'})),null);
});
test('due message contains no content or target-chat list',()=>{
  const due=scheduleDueCommand(jobId,2,3);
  assert.ok(due.startsWith('/rcb_schedule_due@RichCustomizebot\n'));
  const payload=JSON.parse(due.split('\n')[1]);
  assert.equal(payload.job_id,jobId);
  assert.equal(payload.revision,2);
  assert.deepEqual(Object.keys(payload).sort(),['job_id','protocol','request_id','revision'].sort());
  assert.equal(SCHEDULE_REMINDER_MAX_AHEAD,4*86400);
  assert.equal(JOB_ID_RE.test(jobId),true);
  assert.throws(()=>scheduleDueCommand('wrong',1,1));
});
