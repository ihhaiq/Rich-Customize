import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { harness } from './harness.mjs';

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE legacy_states(namespace TEXT PRIMARY KEY,payload TEXT,updated_at INTEGER);
    CREATE TABLE marketing_campaign_attribution(user_id INTEGER PRIMARY KEY,source TEXT,first_publish_at INTEGER);`);
  const source = readFileSync('tgcloud/lib/marketing-campaign.js', 'utf8').replace(/^import .*;$/gm, '').replace(/export /g, '');
  const metrics = new Function('db', 'sql', source + ';return {tutorialFunnelRows,tutorialFunnelBlock};')(
    { all: async query => sqlite.prepare(query).all() }, { raw: query => query },
  );
  const state = (namespace, payload) => sqlite.prepare('INSERT INTO legacy_states VALUES(?,?,1)').run(namespace, JSON.stringify(payload));
  return { sqlite, metrics, state };
}

test('funnel aggregates optional stages, real publishes and seven-day return without exposing drafts', async t => {
  const { sqlite, metrics, state } = fixture(t);
  for (let id = 1; id <= 5; id++) state('tutorial:v1:' + id, { version: 1, userId: id, blocks: [{ text: 'private content' }], events: { started: 100, ...(id === 1 ? { first_block: 110, template: 110, saved: 120, completed: 120 } : {}) } });
  state('tutorial:v1:6', { version: 1, userId: 6, events: {} });
  state('tutorial:v1:7', { version: 1, userId: 777, events: { started: 100 } });
  state('unrelated', { private: 'not a tutorial' });
  sqlite.exec("INSERT INTO marketing_campaign_attribution VALUES(1,'ad_a',130),(2,'ad_a',90),(3,'ad_b',NULL),(4,'ad_c',150);");
  state('tutorial-publish:v1:1', { firstPublishAt: 130 });
  state('tutorial-return:v1:1', { returnedAt: 130 + 604800 });
  state('tutorial-publish:v1:2', { firstPublishAt: 140 });
  state('tutorial-return:v1:2', { returnedAt: 140 + 604801 });
  const rows = await metrics.tutorialFunnelRows();
  const a = rows.find(row => row.source === 'ad_a');
  assert.equal(a.started, 2);
  assert.equal(a.saved, 1);
  assert.equal(a.first_block, 1);
  assert.equal(a.published, 2, 'a pre-guide campaign publish does not hide a later confirmed tutorial publish');
  assert.equal(a.returned, 1, 'return window includes day seven but not the next second');
  assert.equal(rows.find(row => row.source === 'ad_b').published, 0, 'a visit/preview is not a publish');
  assert.equal(rows.find(row => row.source === 'ad_c').published, 1, 'backfill only real post-start campaign timestamps');
  assert.equal(rows.find(row => row.source === 'direct').started, 1);
  assert.doesNotMatch(JSON.stringify(rows), /private|user_id|blocks/);
  const view = metrics.tutorialFunnelBlock(rows);
  assert.equal(view.blocks[1].cells[1].at(-1).text, '5');
  sqlite.exec('DELETE FROM legacy_states');
  const empty = metrics.tutorialFunnelBlock(await metrics.tutorialFunnelRows());
  assert.equal(empty.blocks[1].cells[1].at(-1).text, '0');
});

test('publish receipts deduplicate deliveries and preserve tutorial draft CAS', async () => {
  const h = await harness({ extraModules: { metrics: 'lib/marketing-campaign' } });
  h.records.legacyStates.push({ namespace: 'tutorial:v1:42', payload: { version: 1, userId: 42, events: { started: 100 }, revision: 9, blocks: [] }, updatedAt: 999 });
  const before = h.clone(h.records.legacyStates[0]);
  assert.equal(await h.metrics.recordTutorialPublish(42, null, 101), false);
  assert.equal(await h.metrics.recordTutorialPublish(99, '-1001:10', 101), false);
  assert.equal(await h.metrics.recordTutorialPublish(42, '-1001:10', 99), false);
  assert.equal(await h.metrics.recordTutorialPublish(42, '-1001:10', 101), true);
  assert.equal(await h.metrics.recordTutorialPublish(42, '-1001:10', 102), false);
  assert.equal(h.records.legacyStates.some(row => row.namespace === 'tutorial-return:v1:42'), false);
  assert.equal(await h.metrics.recordTutorialPublish(42, '-1001:11', 102), false, 'same-day fan-out is not a return visit');
  assert.equal(await h.metrics.recordTutorialPublish(42, '-1001:12', 86500), true);
  assert.equal(await h.metrics.recordTutorialPublish(42, '-1001:13', 86501), false);
  assert.equal(h.records.legacyStates.length, 3);
  assert.deepEqual(h.records.legacyStates[0], before);
  assert.equal(h.records.legacyStates.find(row => row.namespace === 'tutorial-publish:v1:42').payload.firstPublishAt, 101);
});


test('bridge conversion is recorded only after Telegram success; telemetry failure cannot fail a send', async () => {
  const h = await harness({ extraModules: { publish: 'lib/publish' } });
  const ownerId = 555;
  h.records.legacyStates.push({ namespace: 'tutorial:v1:' + ownerId, payload: { version: 1, userId: ownerId, events: { started: 1 } }, updatedAt: 1 });
  const blocks = [{ id: 'one', type: 'paragraph', position: 0, data: { text: 'A real post' } }];
  h.apiState.richSendError = 'Bad Request: CHAT_WRITE_FORBIDDEN';
  await assert.rejects(() => h.publish.publishPageContentFromBridge({ ownerId, blocks }));
  assert.equal(h.records.legacyStates.length, 1);
  h.apiState.richSendError = null;
  await h.publish.publishPageContentFromBridge({ ownerId, blocks });
  assert.ok(h.records.legacyStates.some(row => row.namespace === 'tutorial-publish:v1:' + ownerId));
  const other = 556;
  h.records.legacyStates.push({ namespace: 'tutorial:v1:' + other, get payload() { throw new Error('simulated telemetry read failure'); } });
  const result = await h.publish.publishPageContentFromBridge({ ownerId: other, blocks });
  assert.equal(result.message_id, 100);
  assert.equal(h.calls.filter(call => call.method === 'sendRichMessage' && call.args.chat_id === other).length, 1);
});
