import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const forumChat={id:-1005006007008,title:'منتدى المحرر',type:'supergroup',is_forum:true};
const actor={id:123456,language_code:'ar'};
const topicMessage=(thread,body='/default',extra={})=>({
  chat:forumChat,from:actor,text:body,threadId:thread,
  message_id:991,message_thread_id:thread,is_topic_message:true,...extra,
});
async function fixture(){
  const h=await harness({extraModules:{
    forum:'lib/forum-topics',errors:'lib/publish-errors',
  }});
  h.apiState.chats={[String(forumChat.id)]:forumChat};
  h.apiState.members={[String(actor.id)]:{status:'administrator'}};
  h.apiState.me={id:9001,username:'RichCustomizebot'};
  return h;
}

test('/default: a group admin saves the current topic for every publisher',async()=>{
  const h=await fixture();
  assert.equal(await h.forum.handleDefaultTopicCommand(topicMessage(77)),true);
  assert.equal(h.records.forumTopicDefaults.length,1);
  assert.equal(h.records.forumTopicDefaults[0].chatId,forumChat.id);
  assert.equal(h.records.forumTopicDefaults[0].threadId,77);
  assert.deepEqual(JSON.parse(JSON.stringify(
    await h.forum.resolveForumDeliveryOptions(forumChat.id,forumChat)
  )),{message_thread_id:77});
  assert.equal(h.calls.at(-1).method,'sendMessage');
  assert.equal(h.calls.at(-1).args.message_thread_id,77);
  assert.match(h.calls.at(-1).args.text,/تم تعيين/);

  assert.equal(await h.forum.handleDefaultTopicCommand(topicMessage(88)),true);
  assert.equal(h.records.forumTopicDefaults.length,1,'last admin assignment replaces group default');
  assert.equal(h.records.forumTopicDefaults[0].threadId,88);
});

test('only group admins (including genuinely anonymous group admins) may use /default',async()=>{
  const h=await fixture();
  h.apiState.members[String(actor.id)]={status:'member'};
  assert.equal(await h.forum.handleDefaultTopicCommand(topicMessage(99)),true);
  assert.equal(h.records.forumTopicDefaults.length,0);
  assert.match(h.calls.at(-1).args.text,/مسؤوليها/);
  const anonymous=topicMessage(45,'/default',{sender_chat:{id:forumChat.id},from:{id:1087968824,is_bot:true}});
  assert.equal(await h.forum.handleDefaultTopicCommand(anonymous),true);
  assert.equal(h.records.forumTopicDefaults[0].threadId,45);
  assert.equal(h.records.forumTopicDefaults[0].updatedBy,0);
  const fake=topicMessage(55,'/default',{sender_chat:{id:-100222},from:actor});
  assert.equal(await h.forum.handleDefaultTopicCommand(fake),true);
  assert.equal(h.records.forumTopicDefaults[0].threadId,45);
});

test('/default status and clear report state, and clearing disables forum delivery',async()=>{
  const h=await fixture();
  await h.forum.handleDefaultTopicCommand(topicMessage(5));
  await h.forum.handleDefaultTopicCommand(topicMessage(5,'/default status'));
  assert.match(h.calls.at(-1).args.text,/رقم الموضوع: 5/);
  await h.forum.handleDefaultTopicCommand(topicMessage(5,'/default clear'));
  assert.equal(h.records.forumTopicDefaults.length,0);
  await assert.rejects(h.forum.resolveForumDeliveryOptions(forumChat.id,forumChat),
    error=>error.code==='PUBLISH_TOPIC_NOT_SET');
  const ordinary={...forumChat,is_forum:false};
  assert.deepEqual(JSON.parse(JSON.stringify(await h.forum.resolveForumDeliveryOptions(forumChat.id,ordinary))),{});
});

test('/default in General is explicit; never route there as an implicit fallback',async()=>{
  const h=await fixture();
  const noThread=topicMessage(null,'/default',{message_thread_id:undefined,is_topic_message:false});
  assert.equal(await h.forum.handleDefaultTopicCommand(noThread),true);
  assert.equal(h.records.forumTopicDefaults[0].threadId,0);
  assert.deepEqual(JSON.parse(JSON.stringify(
    await h.forum.resolveForumDeliveryOptions(forumChat.id,forumChat))),{});
  await h.forum.handleDefaultTopicCommand(topicMessage(2,'/default@SomeOtherBot'));
  assert.equal(h.records.forumTopicDefaults[0].threadId,0);
  assert.equal(await h.forum.handleDefaultTopicCommand(topicMessage(3,'/default@RichCustomizebot')),true);
  assert.equal(h.records.forumTopicDefaults[0].threadId,3);
});

test('closed/deleted forum topics produce specific errors and never trigger a General fallback',async()=>{
  const h=await fixture();
  for(const [telegramCode,publishCode] of [
    ['BotApiError [400]: Bad Request: TOPIC_CLOSED','PUBLISH_TOPIC_CLOSED'],
    ['Bad Request: TOPIC_DELETED','PUBLISH_TOPIC_DELETED'],
    ['Bad Request: MESSAGE_THREAD_ID_INVALID','PUBLISH_THREAD_INVALID'],
  ]){
    const e=h.errors.normalizePublishError(new Error(telegramCode),{kind:'chat'});
    assert.equal(e.code,publishCode);
    assert.ok(h.errors.EXPECTED_PUBLISH_FAILURES.has(publishCode));
    assert.notEqual(h.errors.publishFailureMessage(e,'ar'),'');
  }
  const missing=h.errors.publishFailureMessage({code:'PUBLISH_TOPIC_NOT_SET'},'ar');
  assert.match(missing,/\/default/);
});

test('manual, scheduled and Mini App send paths use the same saved default topic',async()=>{
  const fs=await import('node:fs');
  const read=path=>fs.readFileSync(new URL('../../tgcloud/'+path,import.meta.url),'utf8');
  const publish=read('lib/publish.js'),schedule=read('lib/scheduled-publish.js'),message=read('handlers/message.js');
  assert.match(publish,/resolveForumDeliveryOptions\(chatId,access\.chat\)/);
  assert.match(publish,/resolveForumDeliveryOptions\(requested, access\.chat\)/);
  assert.match(publish,/chat_id:chatId,\.\.\.topicOptions/);
  assert.match(publish,/chat_id: targetChatId,\s*\.\.\.topicOptions/);
  assert.match(schedule,/resolveForumDeliveryOptions\(target\.chatId,access\.chat\)/);
  assert.match(schedule,/chat_id:target\.chatId,\.\.\.topicOptions/);
  assert.match(message,/handleDefaultTopicCommand\(message\)/);
});
