import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const userId = 48123;
const botId = 9001;
const channelId = -1001234567890;

function forwardedMessage(overrides = {}) {
  return {
    message_id:501,
    from:{id:userId,language_code:'ar'},
    chat:{id:userId,type:'private'},
    forward_origin:{
      type:'channel',
      chat:{id:channelId,type:'channel',title:'News'},
      message_id:77,
      date:1792110000,
    },
    rich_message:{blocks:[{type:'paragraph',text:'Channel post text'}]},
    ...overrides,
  };
}

async function fixture() {
  const h = await harness({extraModules:{core:'lib/editor-core'}});
  h.apiState.me = {id:botId,username:'RichCustomizebot'};
  h.apiState.members = {
    [String(botId)]:{status:'administrator',can_edit_messages:true},
    [String(userId)]:{status:'administrator',can_edit_messages:true},
  };
  await h.session.createEditorSession(userId,userId,900);
  return h;
}

function callback(data, messageId = 900) {
  return {
    id:'callback-' + data,
    from:{id:userId,language_code:'ar'},
    message:{chat:{id:userId,type:'private'},message_id:messageId},
    data,
  };
}

test('forwarded channel post offers edit/import and confirms editing the original message',async()=>{
  const h=await fixture();
  assert.equal(await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true}),true);
  let session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.pendingUserState.kind,'channel_post_choice');
  assert.equal(session.pendingUserState.target.chatId,channelId);
  const choiceMessageId=session.pendingUserState.choiceMessageId;
  assert.equal(h.calls.at(-1).method,'sendMessage');
  const choiceMessage=h.calls.at(-1);
  assert.equal(choiceMessage.args.reply_markup.inline_keyboard[0][0].callback_data,'r:channel:edit');
  assert.equal(choiceMessage.args.reply_markup.inline_keyboard[0][1].callback_data,'r:channel:import');

  await h.core.handleEditorChannelPostCallback(callback(
    'r:channel:edit',
    session.pendingUserState.choiceMessageId,
  ));
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.channelPostTarget.chatId,channelId);
  assert.equal(session.channelPostTarget.messageId,77);
  assert.equal(session.blocks.length,1);
  assert.equal(session.pendingUserState,null);
  assert.ok(h.calls.some(call =>
    call.method==='deleteMessage'
    && Number(call.args.chat_id)===userId
    && Number(call.args.message_id)===choiceMessageId));

  await h.core.handleEditorChannelPostCallback(callback('r:channel:confirm'));
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.pendingUserState.kind,'channel_post_confirmation');
  assert.match(h.calls.at(-2).args.text,/تغيّر/);

  await h.core.handleEditorChannelPostCallback(callback('r:channel:apply'));
  const edit = h.calls.findLast(call =>
    call.method==='editMessageText'
    && Number(call.args.chat_id)===channelId
    && Number(call.args.message_id)===77);
  assert.ok(edit);
  assert.equal(edit.args.rich_message.blocks[0].text,'Channel post text');
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.channelPostTarget.chatId,channelId);
  assert.equal(session.channelPostTarget.messageId,77);
  assert.equal(session.pendingUserState,null);
  assert.equal(h.calls.at(-1).args.text,'تم تعديل منشور القناة.');
  const editorUpdate=h.calls.findLast(call =>
    call.method==='editMessageText'
    && Number(call.args.chat_id)===userId
    && Number(call.args.message_id)===900);
  const pageActions=editorUpdate.args.rich_message.blocks.find(block =>
    block.type==='buttons' && block.buttons?.some(button =>
      button.callback_data==='r:channel:confirm'));
  assert.ok(pageActions);
  assert.ok(pageActions.buttons.some(button =>
    button.callback_data==='r:channel:confirm'
    && button.text.includes('تعديل المنشور')));
});

test('channel-post context survives ordinary pending-state resets and clears on page switch',async()=>{
  const h=await fixture();
  const target={chatId:channelId,messageId:77,originDate:1792110000};
  await h.session.updateEditorSession(userId,{channelPostTarget:target,pendingUserState:null});
  await h.session.updateEditorSession(userId,{pendingUserState:{kind:'temporary-action'}});
  await h.session.updateEditorSession(userId,{pendingUserState:null});
  let session=await h.session.loadEditorSession(userId,{touch:false});
  assert.deepEqual(JSON.parse(JSON.stringify(session.channelPostTarget)),target);
  assert.equal(session.pendingUserState,null);

  await h.session.updateEditorSession(userId,{currentPageId:'saved-page'});
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.channelPostTarget,null);
});

test('channel choice stays until an existing-draft replacement is confirmed',async()=>{
  const h=await fixture();
  await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true});
  let session=await h.session.loadEditorSession(userId,{touch:false});
  const choiceMessageId=session.pendingUserState.choiceMessageId;
  await h.session.updateEditorSession(userId,{
    blocks:[h.blocks.makeBlock('paragraph',{text:'Existing draft'},0,null,'existing')],
  });

  await h.core.handleEditorChannelPostCallback(callback('r:channel:edit',choiceMessageId));
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.pendingUserState.kind,'rich_import_replace');
  assert.equal(h.calls.some(call =>
    call.method==='deleteMessage'
    && Number(call.args.message_id)===choiceMessageId),false);

  await h.core.handleEditorImportCallback(callback('r:import:confirm'));
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.pendingUserState,null);
  assert.ok(h.calls.some(call =>
    call.method==='deleteMessage'
    && Number(call.args.chat_id)===userId
    && Number(call.args.message_id)===choiceMessageId));
});

test('unsaved page action shows Save with the requested custom emoji and saved pages show Sync',async()=>{
  const h=await harness();
  const pageAction=dashboard=>{
    const block=dashboard.blocks.find(item=>
      item.type==='buttons'
      && item.buttons?.some(button=>button.callback_data==='r:syncpage'));
    return block.buttons.find(button=>button.callback_data==='r:syncpage');
  };

  const unsaved=pageAction(h.ui.editorDashboardRichMessage({
    blocks:[{id:'b1',type:'paragraph',text:'Draft'}],
    currentPageId:null,
  },'ar'));
  assert.deepEqual(JSON.parse(JSON.stringify(unsaved.text)),[
    'حفظ ',
    {
      type:'custom_emoji',
      custom_emoji_id:'5188563846415014158',
      alternative_text:'⬇️',
    },
  ]);

  const saved=pageAction(h.ui.editorDashboardRichMessage({
    blocks:[{id:'b1',type:'paragraph',text:'Draft'}],
    currentPageId:'page-code',
  },'ar'));
  assert.equal(saved.text,'مزامنة الصفحة 🔄');
});

test('a forwarded channel post without edit rights keeps the existing import-only path',async()=>{
  const h=await fixture();
  h.apiState.members[String(userId)]={status:'member'};
  assert.equal(await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true}),true);
  let session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.channelPostTarget,null);
  assert.equal(session.pendingUserState,null);
  assert.equal(session.blocks.length,1);
  assert.equal(h.calls.some(call =>
    call.method==='editMessageText'
    && call.args.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data==='r:channel:edit'),false);
});

test('the bot itself must have permission to edit channel messages',async()=>{
  const h=await fixture();
  h.apiState.members[String(botId)]={status:'administrator',can_edit_messages:false};
  assert.equal(await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true}),true);
  const session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.channelPostTarget,null);
  assert.equal(session.pendingUserState,null);
  assert.equal(session.blocks.length,1);
});

test('a stale edit prompt is rejected after channel-edit permission is revoked',async()=>{
  const h=await fixture();
  await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true});
  let session=await h.session.loadEditorSession(userId,{touch:false});
  await h.core.handleEditorChannelPostCallback(callback(
    'r:channel:edit',
    session.pendingUserState.choiceMessageId,
  ));
  await h.core.handleEditorChannelPostCallback(callback('r:channel:confirm'));
  h.apiState.members[String(userId)]={status:'member'};
  await h.core.handleEditorChannelPostCallback(callback('r:channel:apply'));
  assert.equal(h.calls.some(call =>
    call.method==='editMessageText'
    && Number(call.args.chat_id)===channelId
    && Number(call.args.message_id)===77),false);
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.channelPostTarget,null);
});

test('cancelling the final warning preserves the edit target without changing the channel',async()=>{
  const h=await fixture();
  await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true});
  let session=await h.session.loadEditorSession(userId,{touch:false});
  await h.core.handleEditorChannelPostCallback(callback(
    'r:channel:edit',
    session.pendingUserState.choiceMessageId,
  ));
  await h.core.handleEditorChannelPostCallback(callback('r:channel:confirm'));
  await h.core.handleEditorChannelPostCallback(callback('r:channel:cancel'));
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.channelPostTarget.messageId,77);
  assert.equal(session.pendingUserState,null);
  assert.equal(h.calls.some(call =>
    call.method==='editMessageText'
    && Number(call.args.chat_id)===channelId
    && Number(call.args.message_id)===77),false);
});

test('an active editor requires confirmation before being closed and sends a fresh channel choice',async()=>{
  const h=await fixture();
  await h.session.updateEditorSession(userId,{
    state:'editing_block',
    blocks:[{id:'draft-block',type:'paragraph',text:'Unsaved draft'}],
    currentPageId:'saved-page',
    currentPageTitle:'Saved page',
    addPromptChatId:userId,
    addPromptMessageId:901,
  });
  assert.equal(await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true}),true);
  let session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.pendingUserState.kind,'channel_post_close_warning');
  const warning=h.calls.findLast(call=>call.method==='sendMessage');
  const warningMessageId=session.pendingUserState.promptMessageId;
  assert.match(warning.args.text,/غير المحفوظ/);
  assert.equal(warning.args.reply_markup.inline_keyboard[0][0].callback_data,'r:channel:close');

  await h.core.handleEditorChannelPostCallback(callback(
    'r:channel:close',
    session.pendingUserState.promptMessageId,
  ));
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.deepEqual(session.blocks,[]);
  assert.equal(session.currentPageId,null);
  assert.equal(session.managementMessageId,null);
  assert.equal(session.pendingUserState.kind,'channel_post_choice');
  assert.equal(h.calls.filter(call=>call.method==='sendMessage').length,2);
  assert.ok(h.calls.some(call =>
    call.method==='deleteMessage'
    && Number(call.args.message_id)===900));
  assert.ok(h.calls.some(call =>
    call.method==='deleteMessage'
    && Number(call.args.message_id)===warningMessageId));

  await h.core.handleEditorChannelPostCallback(callback(
    'r:channel:import',
    session.pendingUserState.choiceMessageId,
  ));
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.match(JSON.stringify(session.blocks),/Channel post text/);
  assert.equal(session.channelPostTarget,null);
  assert.equal(h.calls.some(call =>
    call.method==='editMessageText'
    && Number(call.args.chat_id)===channelId
    && Number(call.args.message_id)===77),false);
});

test('declining to close the editor preserves its draft and returns to the previous editor state',async()=>{
  const h=await fixture();
  const priorPending={kind:'block_edit',blockId:'draft-block'};
  await h.session.updateEditorSession(userId,{
    state:'editing_block',
    blocks:[{id:'draft-block',type:'paragraph',text:'Keep this draft'}],
    pendingUserState:priorPending,
  });
  await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true});
  let session=await h.session.loadEditorSession(userId,{touch:false});
  const warningMessageId=session.pendingUserState.promptMessageId;
  await h.core.handleEditorChannelPostCallback(callback(
    'r:channel:stay',
    session.pendingUserState.promptMessageId,
  ));
  session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.blocks[0].text,'Keep this draft');
  assert.deepEqual(session.pendingUserState,priorPending);
  assert.equal(session.state,'editing_block');
  assert.equal(h.calls.some(call =>
    call.method==='deleteMessage'
    && Number(call.args.message_id)===900),false);
  assert.ok(h.calls.some(call =>
    call.method==='deleteMessage'
    && Number(call.args.message_id)===warningMessageId));
});

test('channel post translations cover choice, warning, permissions and completion in every locale',async()=>{
  const h=await harness();
  for(const locale of h.i18n.supportedLocales()){
    const texts=[
      h.i18n.t(locale,'channel_post.choice'),
      h.i18n.t(locale,'channel_post.edit'),
      h.i18n.t(locale,'channel_post.import'),
      h.i18n.t(locale,'channel_post.warning'),
      h.i18n.t(locale,'channel_post.confirm'),
      h.i18n.t(locale,'channel_post.success'),
      h.i18n.t(locale,'channel_post.no_access'),
      h.i18n.t(locale,'channel_post.expired'),
      h.i18n.t(locale,'channel_post.busy'),
      h.i18n.t(locale,'channel_post.close_editor_warning'),
      h.i18n.t(locale,'channel_post.close_editor_confirm'),
    ];
    for(const text of texts){
      assert.ok(text.trim(),locale);
      assert.doesNotMatch(text,/\{[A-Za-z0-9_]+\}/,locale);
    }
    if(locale!=='en'){
      for(const key of ['channel_post.choice','channel_post.warning','channel_post.success']){
        assert.notEqual(h.i18n.t(locale,key),h.i18n.t('en',key),locale+': '+key);
      }
    }
  }
});
