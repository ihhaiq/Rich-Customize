import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBroadcastControl,
  persistBroadcastControl,
} from '../../functions/_lib/broadcast-control.js';
import { onRequestPost } from '../../functions/miniapp/api/bridge/webhook.js';
import { broadcastTickEnabled } from '../../workers/schedule-reminders/worker.js';

function command(status, version = 1) {
  return '/rcb_broadcast_control@Richminiappsbot\n' + JSON.stringify({
    protocol: 'RCB1',
    kind: 'broadcast_control',
    tag: '#بث',
    status,
    version,
  });
}

test('broadcast control parser accepts only valid RCB1 state changes', () => {
  assert.deepEqual(parseBroadcastControl(command('active')), {
    active: 1,
    version: 1,
  });
  assert.deepEqual(parseBroadcastControl(command('inactive', 2)), {
    active: 0,
    version: 2,
  });
  assert.equal(parseBroadcastControl('/rcb_broadcast_control@Richminiappsbot\n{}'), null);
  assert.equal(parseBroadcastControl(command('other', 3)), null);
  assert.equal(parseBroadcastControl(command('active', 0)), null);
  assert.equal(parseBroadcastControl('/rcb_broadcast_control@OtherBot\n{}'), null);
});

test('broadcast control persistence ignores stale status messages', async () => {
  const statements = [];
  let state = null;
  const db = {
    prepare(query) {
      if (query.startsWith('SELECT')) {
        return { async first() { return state; } };
      }
      return {
        bind(...values) {
          return {
            async run() {
              statements.push({ query, values });
              const [active, version, updatedAt] = values;
              if (!state || version > state.version) {
                state = { active, version, updated_at: updatedAt };
              }
            },
          };
        },
      };
    },
  };

  const active = await persistBroadcastControl(db, { active: 1, version: 10 });
  const stale = await persistBroadcastControl(db, { active: 1, version: 9 });
  assert.equal(active.active, 1);
  assert.equal(stale.version, 10);
  assert.match(statements[0].query, /WHERE excluded\.version > broadcast_tick_control\.version/);
});

test('active broadcast state enables Worker ticks and completion disables them', async () => {
  let state = null;
  const db = {
    prepare(query) {
      if (query.startsWith('SELECT')) {
        return { async first() { return state; } };
      }
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async run() {
          const [active, version, updatedAt] = values;
          if (!state || version > state.version) {
            state = { active, version, updated_at: updatedAt };
          }
        },
      };
      return statement;
    },
  };

  await persistBroadcastControl(db, { active: 1, version: 10 });
  assert.equal(await broadcastTickEnabled(db), true);
  await persistBroadcastControl(db, { active: 0, version: 11 });
  assert.equal(await broadcastTickEnabled(db), false);
});

test('bridge webhook applies control only from its authenticated bot in the exact group', async () => {
  const state = { identity: null, control: null, deletedMessageId: null };
  const db = {
    prepare(query) {
      let values = [];
      const statement = {
        bind(...args) {
          values = args;
          return statement;
        },
        async run() {
          if (query.startsWith('INSERT INTO miniapp_bridge_identity')) {
            state.identity = { value: String(values[0]) };
          } else if (query.startsWith('INSERT INTO broadcast_tick_control')) {
            if (!state.control || values[1] > state.control.version) {
              state.control = {
                active: values[0],
                version: values[1],
                updated_at: values[2],
              };
            }
          } else if (query.startsWith('DELETE FROM')) {
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
        async first() {
          if (query.includes('SELECT value FROM miniapp_bridge_identity')) return state.identity;
          if (query.includes('SELECT active, version FROM broadcast_tick_control')) return state.control;
          return null;
        },
      };
      return statement;
    },
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    result: true,
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  const request = (message, secret = 'webhook-secret') => new Request('https://bridge.example/miniapp/api/bridge/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secret,
    },
    body: JSON.stringify({ message }),
  });
  const env = {
    DB: db,
    B2B_BOT_TOKEN: 'test-token',
    B2B_WEBHOOK_SECRET: 'webhook-secret',
  };
  const controlMessage = {
    message_id: 44,
    chat: { id: -1003993506865, type: 'supergroup' },
    from: { id: 12345, is_bot: true, username: 'RichCustomizebot' },
    text: command('active', 1),
  };

  try {
    const unauthorized = await onRequestPost({
      request: request(controlMessage, 'wrong-secret'),
      env,
    });
    assert.equal(unauthorized.status, 401);
    assert.equal(state.control, null);

    const response = await onRequestPost({ request: request(controlMessage), env });
    assert.equal(response.status, 200);
    assert.deepEqual(state.control && {
      active: state.control.active,
      version: state.control.version,
    }, { active: 1, version: 1 });

    await onRequestPost({
      request: request({
        ...controlMessage,
        message_id: 45,
        from: { id: 12346, is_bot: false, username: 'RichCustomizebot' },
        text: command('inactive', 2),
      }),
      env,
    });
    assert.equal(state.control.active, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('broadcast Cron is disabled unless D1 has an active campaign', async () => {
  for (const row of [null, { active: 0 }, { active: '0' }]) {
    const enabled = await broadcastTickEnabled({
      prepare() {
        return { async first() { return row; } };
      },
    });
    assert.equal(enabled, false);
  }

  assert.equal(await broadcastTickEnabled({
    prepare() {
      return { async first() { return { active: 1 }; } };
    },
  }), true);
});
