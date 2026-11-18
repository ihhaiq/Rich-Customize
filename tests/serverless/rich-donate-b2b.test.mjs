import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harness } from './harness.mjs';

const BOT_ID = 987654321;
const USER_ID = 246810;
const DAY = 86400;
const ORDER_A = 'rd_' + 'a'.repeat(32);
const ORDER_B = 'rd_' + 'b'.repeat(32);
const BRIDGE_CHAT_ID = -1003993506865;
const RELAY_BOT_ID = 1122334455;

function helloAck() {
  return {
    from: { id: BOT_ID, is_bot: true, username: 'RichDonateBot' },
    chat: { id: BRIDGE_CHAT_ID, type: 'supergroup' },
    text: `/rdb_hello_ack_v1@RichCustomizebot ${BOT_ID} v1`,
  };
}

function eventMessage(event, overrides = {}) {
  return {
    from: { id: BOT_ID, is_bot: true, username: 'RichDonateBot' },
    chat: { id: BRIDGE_CHAT_ID, type: 'supergroup' },
    text: '/rdb_event_v1@RichCustomizebot ' + JSON.stringify(event),
    ...overrides,
  };
}

function event({
  orderId = ORDER_A,
  kind = 'purchase',
  plan = 'plus',
  permanentBranding = false,
  amount = plan === 'plus' ? 150 : 350,
  eventId = `${kind}:${orderId}`,
  paidAt,
  userId = USER_ID,
  chargeId = `charge-${orderId}`,
} = {}) {
  return {
    protocol: 'rich-donate/1',
    event_id: eventId,
    kind,
    order_id: orderId,
    user_id: userId,
    plan,
    permanent_branding: permanentBranding,
    amount,
    currency: 'XTR',
    charge_id: chargeId,
    paid_at: paidAt,
  };
}

async function setup() {
  const h = await harness({
    extraModules: {
      b2b: 'lib/editor-subscriptions',
      subscriptions: 'lib/editor-subscriptions',
      status: 'lib/subscription-status',
      branding: 'lib/branding',
      miniapp: 'lib/miniapp-bridge',
    },
  });
  return h;
}

async function pin(h, now) {
  await h.b2b.handleRichDonateB2BMessage(helloAck(), { now });
}

test('only the pinned-group bot hello acknowledgment can pin Rich Donate identity', async () => {
  const h = await setup();
  const now = 2_000_000_000;
  assert.equal(await h.b2b.handleRichDonateB2BMessage({
    ...helloAck(),
    from: { id: BOT_ID, is_bot: false, username: 'RichDonateBot' },
  }, { now }), true);
  assert.equal(await h.b2b.handleRichDonateB2BMessage({
    ...helloAck(),
    chat: { id: -1001, type: 'supergroup' },
  }, { now }), true);
  assert.equal(await h.b2b.handleRichDonateB2BMessage({
    ...helloAck(),
    forward_origin: { type: 'user' },
  }, { now }), true);
  assert.equal(h.records.richDonateBridge.length, 0);

  await pin(h, now);
  assert.deepEqual(h.records.richDonateBridge, [{
    key: 'richdonate-b2b-v1',
    botId: BOT_ID,
    pinnedAt: now,
  }]);

  await h.b2b.handleRichDonateB2BMessage({
    ...helloAck(),
    from: { id: BOT_ID + 1, is_bot: true, username: 'RichDonateBot' },
    text: `/rdb_hello_ack_v1@RichCustomizebot ${BOT_ID + 1} v1`,
  }, { now: now + 1 });
  assert.equal(h.records.richDonateBridge[0].botId, BOT_ID);
});

test('periodic trigger sends hello until pinned, then sync, never READY', async () => {
  const h = await setup();
  await h.b2b.runRichDonateB2BTick();
  assert.deepEqual(h.calls.at(-1).args, {
    chat_id: BRIDGE_CHAT_ID,
    text: '/rdb_hello_v1@RichDonateBot',
    disable_notification: true,
  });

  await pin(h, 2_000_000_000);
  await h.b2b.runRichDonateB2BTick();
  assert.equal(h.calls.at(-1).args.text, '/rdb_sync_v1@RichDonateBot');
  assert.ok(h.calls.some(call => call.method === 'deleteMessage'
    && call.args.message_id === 100));
  assert.equal(h.calls.some(call => /rdb_ready_v1/i.test(call.args.text || '')), false);
});

test('only an authenticated RCB1 relay tick can start the group-based RDB exchange', async () => {
  const h = await harness({
    extraModules: {
      b2b: 'lib/editor-subscriptions',
      bridge: 'lib/miniapp-bridge',
    },
  });
  h.records.legacyStates.push({
    namespace: 'miniapp_bridge_config',
    payload: { bot_id: RELAY_BOT_ID },
    updatedAt: 2_000_000_000,
  });
  const minute = Math.floor(Date.now() / 60000);
  const message = {
    from: { id: RELAY_BOT_ID, is_bot: true, username: 'RichMiniAppsBot' },
    chat: { id: BRIDGE_CHAT_ID, type: 'supergroup' },
    message_id: 77,
    text: '/rcb_rdb_tick@RichCustomizebot\n' + JSON.stringify({
      protocol: 'RCB1',
      kind: 'richdonate_sync',
      minute,
    }),
  };

  await assert.rejects(h.bridge.handleMiniAppBridgeMessage({
    ...message,
    from: { ...message.from, id: RELAY_BOT_ID + 1 },
  }), error => error?.code === 'UNAUTHORIZED_BOT');
  assert.equal(h.calls.length, 0);
  assert.equal(await h.bridge.handleMiniAppBridgeMessage(message), true);
  assert.equal(h.calls.find(call => call.method === 'sendMessage').args.text, '/rdb_hello_v1@RichDonateBot');
  assert.ok(h.calls.some(call => call.method === 'deleteMessage'
    && call.args.message_id === message.message_id));
});

test('broadcast Cron tick requires the pinned relay and a fresh RCB1 minute signal', async () => {
  const ticks = [];
  const h = await harness({
    extraModules: { bridge: 'lib/miniapp-bridge' },
    moduleMocks: {
      'lib/developer': {
        runDeveloperBroadcastTick: async minute => ticks.push(minute),
      },
    },
  });
  h.records.legacyStates.push({
    namespace: 'miniapp_bridge_config',
    payload: { bot_id: RELAY_BOT_ID },
    updatedAt: 2_000_000_000,
  });
  const minute = Math.floor(Date.now() / 60000);
  const message = {
    from: { id: RELAY_BOT_ID, is_bot: true, username: 'RichMiniAppsBot' },
    chat: { id: BRIDGE_CHAT_ID, type: 'supergroup' },
    message_id: 78,
    text: '/rcb_broadcast_tick@RichCustomizebot\n' + JSON.stringify({
      protocol: 'RCB1',
      kind: 'broadcast',
      minute,
    }),
  };

  await assert.rejects(h.bridge.handleMiniAppBridgeMessage({
    ...message,
    from: { ...message.from, id: RELAY_BOT_ID + 1 },
  }), error => error?.code === 'UNAUTHORIZED_BOT');
  assert.equal(await h.bridge.handleMiniAppBridgeMessage({
    ...message,
    forward_origin: { type: 'user' },
  }), true);
  assert.deepEqual(ticks, []);

  assert.equal(await h.bridge.handleMiniAppBridgeMessage(message), true);
  assert.deepEqual(ticks, [minute]);
  assert.ok(h.calls.some(call => call.method === 'deleteMessage'
    && call.args.message_id === message.message_id));
  assert.equal(await h.bridge.handleMiniAppBridgeMessage({
    ...message,
    text: '/rcb_broadcast_tick@RichCustomizebot\n' + JSON.stringify({
      protocol: 'RCB1',
      kind: 'broadcast',
      minute: minute - 10,
    }),
  }), true);
  assert.deepEqual(ticks, [minute]);
});

test('message handler routes B2B commands before ordinary bot-message guards', () => {
  const source = readFileSync(new URL('../../tgcloud/handlers/message.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('handleRichDonateB2BMessage(message)')
    < source.indexOf('handleDonateConsoleMessage(message)'));
  assert.ok(source.indexOf('handleRichDonateB2BMessage(message)')
    < source.indexOf('allowMessageRequest(message)'));
});

test('verified purchases are durable, idempotent and reflected in /sup', async () => {
  const h = await setup();
  const now = Math.floor(Date.now() / 1000);
  await pin(h, now);
  const plusPaidAt = now - 20 * DAY;
  const first = event({ paidAt: plusPaidAt });
  assert.equal(await h.b2b.handleRichDonateB2BMessage(eventMessage(first), { now }), true);
  assert.equal(h.records.editorEntitlementEvents.length, 1);
  assert.equal(h.calls.at(-1).args.text, `/rdb_ack_v1@RichDonateBot ${first.event_id} applied`);

  const second = event({
    orderId: ORDER_B,
    plan: 'golden',
    amount: 350,
    paidAt: now,
  });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(second), { now });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(second), { now });
  assert.equal(h.records.editorEntitlementEvents.length, 2);
  assert.equal(h.calls.at(-1).args.text, `/rdb_ack_v1@RichDonateBot ${second.event_id} duplicate`);

  const state = await h.status.subscriptionSnapshot(USER_ID, now);
  assert.equal(state.plan, 'golden');
  assert.equal(state.expiresAt, now + 40 * DAY);
  assert.equal(await h.subscriptions.getEditorEntitlement(USER_ID, { now }).then(row => row.plan), 'golden');
  const me = await h.miniapp.handleMiniAppServerlessEndpoint(
    { action: 'me' },
    { initData: { user: { id: USER_ID } } },
  );
  assert.equal(me.plan,'golden');
  assert.equal(me.limits.text,32768);
  assert.equal(me.limits.emoji_packs,50);
  assert.equal(me.limits.custom_emoji_packs,50);
  assert.equal(me.limits.saved_pages,150);
  assert.equal(me.limits.blocks,500);
  assert.equal(me.limits.nesting_depth,16);
  assert.equal(me.limits.media_attachments,50);
  assert.equal(me.limits.table_columns,20);
});

test('a new paid plan adds 30 days to a trusted legacy balance and switches immediately', async () => {
  const h = await setup();
  const now = 2_000_000_000;
  await pin(h, now);
  h.records.editorSubscriptions.push({
    userId: USER_ID,
    plan: 'plus',
    status: 'active',
    source: 'richdonate:verified',
    startedAt: now - 20 * DAY,
    expiresAt: now + 10 * DAY,
    updatedAt: now,
  });
  const golden = event({
    plan: 'golden',
    amount: 350,
    paidAt: now,
  });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(golden), { now });

  const state = await h.status.subscriptionSnapshot(USER_ID, now);
  assert.equal(state.plan, 'golden');
  assert.equal(state.expiresAt, now + 40 * DAY);
});

test('a reused Telegram charge cannot create a second paid order', async () => {
  const h = await setup();
  const now = 2_000_000_000;
  await pin(h, now);
  const first = event({ paidAt: now, chargeId: 'unique-charge' });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(first), { now });
  const second = event({
    orderId: ORDER_B,
    paidAt: now,
    chargeId: 'unique-charge',
  });

  await assert.rejects(
    h.b2b.handleRichDonateB2BMessage(eventMessage(second), { now }),
    /RDB_PURCHASE_IDENTITY_CONFLICT/,
  );
  assert.equal(h.records.editorEntitlementEvents.length, 1);
  assert.equal(h.calls.at(-1).args.text, `/rdb_ack_v1@RichDonateBot ${first.event_id} applied`);
});

test('rejects invalid event identity, pricing, fields and non-pinned senders without ACK', async () => {
  const h = await setup();
  const now = 2_000_000_000;
  await pin(h, now);
  const valid = event({ paidAt: now });
  const invalidEvents = [
    { ...valid, amount: 149 },
    { ...valid, user_id: 0 },
    { ...valid, extra: 'unexpected' },
    { ...valid, event_id: `refund:${ORDER_A}` },
    { ...valid, paid_at: now + 301 },
  ];
  for (const invalid of invalidEvents) {
    await h.b2b.handleRichDonateB2BMessage(eventMessage(invalid), { now });
  }
  await h.b2b.handleRichDonateB2BMessage(eventMessage(valid, {
    text: '/rdb_event_v1 ' + JSON.stringify(valid),
  }), { now });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(valid, {
    from: { id: BOT_ID + 1, is_bot: true, username: 'RichDonateBot' },
    chat: { id: BOT_ID + 1, type: 'private' },
  }), { now });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(valid, {
    forward_origin: { type: 'user' },
  }), { now });

  assert.equal(h.records.editorEntitlementEvents.length, 0);
  assert.equal(h.calls.filter(call => call.method === 'sendMessage').length, 0);
});

test('refund tombstones take precedence over delayed purchase events', async () => {
  const h = await setup();
  const now = 2_000_000_000;
  await pin(h, now);
  const paidAt = now - 5 * DAY;
  const purchase = event({
    orderId: ORDER_A,
    plan: 'golden',
    permanentBranding: true,
    amount: 449,
    paidAt,
  });
  const refund = event({
    orderId: ORDER_A,
    kind: 'refund',
    plan: 'golden',
    permanentBranding: true,
    amount: 449,
    paidAt,
    chargeId: purchase.charge_id,
  });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(refund), { now });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(purchase), { now });

  const state = await h.b2b.getRichDonateSubscriptionState(USER_ID, { now });
  assert.equal(state.active, false);
  assert.equal(await h.b2b.hasPermanentRichDonateBranding(USER_ID), false);
  assert.equal(h.records.editorEntitlementEvents.length, 2);
  assert.equal(h.calls.at(-1).args.text, `/rdb_ack_v1@RichDonateBot ${purchase.event_id} applied`);
});

test('refund removes only the refunded purchase while preserving earlier paid time', async () => {
  const h = await setup();
  const now = 2_000_000_000;
  await pin(h, now);
  const earlier = event({ paidAt: now - 20 * DAY });
  const later = event({
    orderId: ORDER_B,
    plan: 'golden',
    permanentBranding: true,
    amount: 449,
    paidAt: now,
  });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(earlier), { now });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(later), { now });
  await h.b2b.handleRichDonateB2BMessage(eventMessage(event({
    orderId: ORDER_B,
    kind: 'refund',
    plan: 'golden',
    permanentBranding: true,
    amount: 449,
    paidAt: now,
    chargeId: later.charge_id,
  })), { now });

  const state = await h.b2b.getRichDonateSubscriptionState(USER_ID, { now });
  assert.equal(state.plan, 'plus');
  assert.equal(state.expiresAt, now + 10 * DAY);
  assert.equal(await h.branding.isBrandingRemoved(USER_ID), false);
});
