import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app = readFileSync(new URL('../../app/miniapp_static/app.js', import.meta.url), 'utf8');
const sessionGuard = readFileSync(new URL('../../app/miniapp_static/session_guard.js', import.meta.url), 'utf8');
const offlineStart = app.indexOf('function offlineDraftKey(){');
const offlineEnd = app.indexOf('function offlineDraftPayload(){', offlineStart);
const persistStart = app.indexOf('function persistOfflineDraftNow(){');
const persistEnd = app.indexOf('function scheduleOfflineDraft(){', persistStart);
const readStart = app.indexOf('function readOfflineDraft(){');
const readEnd = app.indexOf('function confirmOfflineConflict(){', readStart);
assert.ok(offlineStart >= 0 && offlineEnd > offlineStart);
assert.ok(persistStart >= 0 && persistEnd > persistStart);
assert.ok(readStart >= 0 && readEnd > readStart);
const offlineDraftFunctions = app.slice(offlineStart, offlineEnd);
const persistFunction = app.slice(persistStart, persistEnd);
const readFunction = app.slice(readStart, readEnd);

function runDraftFlow({discard = false, failRemoval = false} = {}) {
  const key = 'rich_customize_offline_draft_v1:42';
  const values = new Map([[key, '{"old":"draft"}']]);
  const metrics = {writes:0, removals:0, reports:0};
  const context = vm.createContext({
    currentUserId:42,
    current:{blocks:[{type:'paragraph'}]},
    dirty:true,
    offlineDraftDiscarded:false,
    offlineDraftTimer:123,
    OFFLINE_DRAFT_TTL_MS:7 * 24 * 60 * 60 * 1000,
    clearTimeout(){},
    hasSavablePageContent:()=>true,
    offlineDraftPayload:()=>({
      version:1,
      user_id:42,
      updated_at:Date.now(),
      blocks:[{type:'paragraph'}],
      composer_text:'',
    }),
    localStorage:{
      getItem(name){return values.get(name) ?? null},
      removeItem(name){
        metrics.removals+=1;
        if(failRemoval)throw new Error('Storage unavailable');
        values.delete(name);
      },
      setItem(name,value){metrics.writes+=1;values.set(name,value)},
    },
    window:{RichMiniAppErrors:{report(){metrics.reports+=1}}},
    values,
    metrics,
  });
  const discardCall = discard ? 'discardOfflineDraftForSession();' : '';
  vm.runInContext(
    `${offlineDraftFunctions}\n${persistFunction}\n${readFunction}\n${discardCall}persistOfflineDraftNow();restoredDraft=readOfflineDraft();`,
    context,
  );
  return {context,values,metrics,key};
}

test('trash removes the offline draft and pagehide cannot recreate it', () => {
  const {context,values,metrics,key} = runDraftFlow({discard:true});
  assert.equal(values.has(key), false);
  assert.equal(context.restoredDraft, null);
  assert.equal(metrics.writes, 0);
  assert.equal(context.offlineDraftDiscarded, true);
  assert.match(sessionGuard, /if \(!discardOfflineDraftForSession\(\)\)/);
});

test('offline drafts still persist during an ordinary editing session', () => {
  const {values,metrics,key} = runDraftFlow();
  assert.equal(values.has(key), true);
  assert.equal(metrics.writes, 1);
});

test('failed local removal is reported and does not claim the draft was discarded', () => {
  const {context,values,metrics,key} = runDraftFlow({discard:true,failRemoval:true});
  assert.equal(values.has(key), true);
  assert.equal(context.offlineDraftDiscarded, false);
  assert.notEqual(context.restoredDraft, null);
  assert.equal(metrics.reports, 1);
  assert.equal(metrics.writes, 1);
});
