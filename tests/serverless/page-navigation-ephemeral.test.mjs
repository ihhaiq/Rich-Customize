import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

test('guest page buttons open the target as an ephemeral response without private-chat delivery', async () => {
  const h = await harness({ extraModules: { navigation: 'lib/page-navigation' } });
  h.records.richPages.push({
    pageId: 'target',
    ownerId: 123,
    title: 'Target page',
    blocks: [{ type: 'paragraph', data: { text: 'Guest page' } }],
    buttons: [],
  });

  await h.navigation.handlePageNavigationCallback({
    id: 'guest-page-callback',
    from: { id: 456, language_code: 'en' },
    inline_message_id: 'guest-inline-message',
    data: 'r:page:target',
  });

  const sent = h.calls.find(call => call.method === 'sendRichMessage');
  assert.ok(sent);
  assert.equal(sent.args.chat_id, undefined);
  assert.deepEqual(sent.args.ephemeral_message_parameters, {
    callback_query_id: 'guest-page-callback',
    replace_callback_query_message: true,
  });
  assert.match(JSON.stringify(sent.args.rich_message), /Guest page/);
  assert.equal(h.calls.some(call =>
    call.method === 'sendRichMessage' && Number(call.args.chat_id) === 456,
  ), false);
});

test('page owner and another group member each receive their own ephemeral page', async () => {
  const h = await harness({ extraModules: { navigation: 'lib/page-navigation' } });
  h.records.richPages.push({
    pageId: 'target',
    ownerId: 123,
    title: 'Target page',
    blocks: [{ type: 'paragraph', data: { text: 'Group page' } }],
    buttons: [],
  });
  const message = {
    message_id: 50,
    chat: { id: -10012345, type: 'supergroup' },
  };

  for (const [userId, callbackId] of [[123, 'owner-click'], [456, 'member-click']]) {
    await h.navigation.handlePageNavigationCallback({
      id: callbackId,
      from: { id: userId, language_code: 'en' },
      message,
      data: 'r:page:target',
    });
  }

  const sent = h.calls.filter(call => call.method === 'sendRichMessage');
  assert.equal(sent.length, 2);
  for (const [index, call] of sent.entries()) {
    assert.equal(call.args.chat_id, undefined);
    assert.deepEqual(call.args.ephemeral_message_parameters, {
      callback_query_id: index === 0 ? 'owner-click' : 'member-click',
      replace_callback_query_message: true,
    });
    assert.match(JSON.stringify(call.args.rich_message), /Group page/);
  }
});
