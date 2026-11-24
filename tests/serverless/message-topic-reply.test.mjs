import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

test('forum /start opens the group editor in its source topic, including its text fallback', async () => {
  const h = await harness({ extraModules:{ message:'handlers/message' } });
  const chatId = -1003102264071;
  const userId = 5134669938;
  h.apiState.members[`${chatId}:${userId}`] = { status:'administrator' };
  const message = {
    message_id:431288314,
    from:{ id:userId, first_name:'User', language_code:'en' },
    chat:{ id:chatId, type:'supergroup', is_forum:true },
    message_thread_id:77,
    is_topic_message:true,
    text:'/start',
  };

  await h.message.default(message, { update:{ update_id:431288314 } });
  const richEditor = h.calls.find(call => call.method === 'sendRichMessage');
  assert.equal(richEditor.args.message_thread_id, 77);

  h.apiState.richSendErrors = {
    [String(chatId)]: [new Error('Bad Request: rich message is invalid')],
  };
  await h.message.default(message, { update:{ update_id:431288315 } });
  const textFallback = h.calls.filter(call => call.method === 'sendMessage'
    && call.args.chat_id === chatId).at(-1);
  assert.ok(textFallback);
  assert.equal(textFallback.args.message_thread_id, 77);

  h.apiState.richSendErrors = {
    [String(chatId)]: [new Error('Bad Request: Rich Message rejected')],
  };
  h.apiState.messageSendErrors = {
    [String(chatId)]: new Error('Bad Request: TOPIC_CLOSED'),
  };
  await assert.doesNotReject(
    h.message.default(message, { update:{ update_id:431288316 } }),
  );
  const fallbacks = h.calls.filter(call => call.method === 'sendMessage'
    && call.args.chat_id === chatId);
  assert.equal(fallbacks.length, 2);
  const topicClosedFallback = fallbacks.at(-1);
  assert.ok(topicClosedFallback);
  assert.equal(topicClosedFallback.args.message_thread_id, 77);
});
