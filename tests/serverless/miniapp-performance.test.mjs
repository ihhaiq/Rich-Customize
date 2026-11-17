import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../app/miniapp_static/app.js', import.meta.url), 'utf8');

test('overlapping performance flushes share one upload request', async () => {
  const start = source.indexOf('function loadPerfQueue(){');
  const exportStart = source.indexOf('window.RichMiniAppPerf=Object.freeze({', start);
  const exportEnd = source.indexOf('\n});', exportStart);
  const end = exportEnd + '\n});'.length;
  assert.ok(start >= 0 && exportStart > start && exportEnd > exportStart);
  const calls = [];
  let resolveFetch;
  const window = {};
  const context = {
    window,
    localStorage: {
      getItem: () => '[]',
      setItem: () => {},
    },
    navigator: { onLine: true },
    tg: { initData: 'verified-init-data' },
    performance: { now: () => 100 },
    fetch: (...args) => {
      calls.push(args);
      return new Promise(resolve => { resolveFetch = resolve; });
    },
    setTimeout: () => 1,
    clearTimeout: () => {},
    JSON,
    Math,
    Number,
    String,
    Promise,
  };
  vm.runInNewContext(source.slice(start, end), context);
  window.RichMiniAppPerf.record('page_save', 25);

  const firstFlush = window.RichMiniAppPerf.flush();
  const concurrentFlush = window.RichMiniAppPerf.flush();
  await Promise.resolve();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], '/miniapp/api/performance');
  resolveFetch({ ok: true });
  await Promise.all([firstFlush, concurrentFlush]);
});
