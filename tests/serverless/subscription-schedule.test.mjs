import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Load the actual Cloudflare Worker with fake dependencies. No Telegram API,
// remote database, or production bot is touched by these tests.
const workerSource=readFileSync('workers/schedule-reminders/worker.js','utf8');
const schedulerSource=readFileSync('functions/_lib/scheduling-reminders.js','utf8');
const serverlessSource=readFileSync('tgcloud/lib/subscription-reminders.js','utf8');
const bridgeSource=readFileSync('tgcloud/lib/miniapp-bridge.js','utf8');
const wrangler=readFileSync('workers/schedule-reminders/wrangler.toml','utf8');

function fakeWorker(sent,stats) {
  const source=workerSource.replace(/^import\s+[^\n]+;?$/gm,'')
    .replace('export default {','return {');
  const build=new Function('dispatchDueReminders','reserveBridgeSlot','fetch',
    'console','Response',source);
  return build(
    async (_db,deliver)=>{
      stats.minute++;
      await deliver('/rcb_schedule_due@RichCustomizebot\n{"protocol":"RCB1"}');
      return {claimed:1,delivered:1};
    },
    async()=>{stats.reserved++;},
    async (_url,options)=>{
      sent.push(JSON.parse(options.body));
      return {ok:true,status:200,json:async()=>({ok:true})};
    },
    {log:()=>{}},
    Response,
  );
}

test('Cloudflare Cron: minute runs scheduled jobs only; daily starts subscriptions only',async()=>{
  const sent=[],stats={minute:0,reserved:0};
  const worker=fakeWorker(sent,stats);
  const env={DB:{},B2B_BOT_TOKEN:'test-only-token'};
  await worker.scheduled({cron:'* * * * *'},env,{});
  assert.equal(stats.minute,1);
  assert.equal(sent.length,1);
  assert.match(sent[0].text,/^\/rcb_schedule_due@RichCustomizebot/);
  assert.doesNotMatch(sent[0].text,/rcb_subscription_tick/);

  await worker.scheduled({cron:'0 9 * * *'},env,{});
  assert.equal(stats.minute,1);
  assert.equal(stats.reserved,2);
  assert.equal(sent.length,2);
  assert.match(sent[1].text,/^\/rcb_subscription_tick@RichCustomizebot\n/);
  const body=JSON.parse(sent[1].text.split('\n')[1]);
  assert.equal(body.protocol,'RCB1');
  assert.equal(body.kind,'daily');
  assert.equal(typeof body.minute,'number');
  await assert.rejects(worker.scheduled({cron:'0 3 * * *'},env,{}),/Unknown schedule trigger/);
});

test('new daily and minute Cron expressions are both deployed by wrangler',()=>{
  assert.match(wrangler,/crons\s*=\s*\["\* \* \* \* \*",\s*"0 9 \* \* \*"\]/);
  assert.match(bridgeSource,/data\.kind!=='daily'/);
  assert.match(bridgeSource,/receiveSubscriptionReminderSchedule\(scheduleSource\)/);
});

test('daily subscription batch has a single idempotent per-day cycle and bounded continuation',()=>{
  assert.match(serverlessSource,/CYCLE_ID='subscription_daily_cycle'/);
  assert.match(serverlessSource,/subscriptionCycleJobId=\(day\)/);
  assert.match(serverlessSource,/const NEXT_BATCH_DELAY=75/);
  assert.match(serverlessSource,/await cycleControl\('register',day,nextRevision/);
  assert.match(serverlessSource,/await cycleControl\('result',day,options\.revision/);
  assert.match(serverlessSource,/eq\(subscriptionReminderScans\.cursor,expected\)/);
  assert.match(serverlessSource,/await scan\('paid',now\)/);
  assert.match(serverlessSource,/await scan\('gift',now\)/);
  const source=schedulerSource.replace(/\bexport\s+/g,'');
  const parse=new Function(source+';return {parseScheduleBridgeEvent,scheduleDueCommand,JOB_ID_RE};')();
  const jobId='sub_'+(20800).toString(16).padStart(32,'0');
  assert.equal(parse.JOB_ID_RE.test(jobId),true);
  const cmd=parse.scheduleDueCommand(jobId,3,1);
  assert.ok(cmd.includes(jobId));
  const event=parse.parseScheduleBridgeEvent('/rcb_schedule_register@richminiappsbot\n'+
    JSON.stringify({protocol:'RCB1',job_id:jobId,revision:3,run_at:1800000000}));
  assert.equal(event.jobId,jobId);
});
