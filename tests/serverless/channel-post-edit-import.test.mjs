import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import { harness } from './harness.mjs';

const userId = 48123;
const botId = 9001;
const channelId = -1001234567890;
const miniAppSource=readFileSync(new URL('../../app/miniapp_static/app.js',import.meta.url),'utf8');
const livePreviewSource=readFileSync(new URL('../../app/miniapp_static/live_preview.js',import.meta.url),'utf8');
const mediaUploadSource=readFileSync(new URL('../../app/miniapp_static/media_upload.js',import.meta.url),'utf8');
const nestedEditorSource=readFileSync(new URL('../../app/miniapp_static/details_nested_editor.js',import.meta.url),'utf8');
const inlineTextToolsSource=readFileSync(new URL('../../app/miniapp_static/inline_text_tools.js',import.meta.url),'utf8');
const editorHtml=readFileSync(new URL('../../app/miniapp_static/editor.html',import.meta.url),'utf8');
const miniAppApiSource=readFileSync(new URL('../../app/miniapp_static/miniapp_serverless_api.js',import.meta.url),'utf8');

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

test('regular users cannot import a rich message with a login URL button',async()=>{
  const h=await fixture();
  await h.core.handleEditorCoreMessage(forwardedMessage({
    reply_markup:{
      inline_keyboard:[[{text:'Sign in',login_url:{url:'https://example.com/login'}}]],
    },
  }),{confirmReplace:true});

  assert.ok(h.calls.some(call=>call.method==='sendMessage'
    && call.args.text==='زر تسجيل الدخول غير متاح, لانك لست مخول لاستعماله'));
  const session=await h.session.loadEditorSession(userId,{touch:false});
  assert.deepEqual(session.blocks,[]);
  assert.deepEqual(session.messageButtons,[]);
  assert.equal(session.pendingUserState,null);
});

test('forwarded channel post offers edit/import and confirms editing the original message',async()=>{
  const h=await fixture();
  const callbackButtons={
    inline_keyboard:[[
      {text:'Open page',callback_data:'r:cbd:private-page-code'},
      {text:'External action',callback_data:'action:private-token'},
    ]],
  };
  assert.equal(await h.core.handleEditorCoreMessage(
    forwardedMessage({reply_markup:callbackButtons}),
    {confirmReplace:true},
  ),true);
  let session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.pendingUserState.kind,'channel_post_choice');
  assert.equal(session.pendingUserState.target.chatId,channelId);
  const choiceMessageId=session.pendingUserState.choiceMessageId;
  assert.equal(h.calls.at(-1).method,'sendMessage');
  const choiceMessage=h.calls.at(-1);
  assert.equal(choiceMessage.args.reply_markup.inline_keyboard[0][0].callback_data,'r:channel:edit');
  assert.equal(choiceMessage.args.reply_markup.inline_keyboard[0][1].callback_data,'r:channel:import');
  assert.equal(choiceMessage.args.reply_markup.inline_keyboard[1][0].text,'فتح في التطبيق المصغر');
  assert.match(
    choiceMessage.args.reply_markup.inline_keyboard[1][0].url,
    /^https:\/\/t\.me\/RichCustomizebot\/editor\?startapp=draft_[a-f0-9]{32}$/,
  );
  assert.match(session.pendingUserState.miniAppToken,/^[a-f0-9]{32}$/);

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
  assert.equal(Object.hasOwn(edit.args,'reply_markup'),false);
  assert.equal(JSON.stringify(edit.args).includes('private-page-code'),false);
  assert.equal(JSON.stringify(edit.args).includes('private-token'),false);
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

test('editing a forwarded post without a copied keyboard leaves the original keyboard untouched',async()=>{
  const h=await fixture();
  await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true});
  let session=await h.session.loadEditorSession(userId,{touch:false});
  await h.core.handleEditorChannelPostCallback(callback(
    'r:channel:edit',
    session.pendingUserState.choiceMessageId,
  ));
  await h.core.handleEditorChannelPostCallback(callback('r:channel:confirm'));
  await h.core.handleEditorChannelPostCallback(callback('r:channel:apply'));

  const edit=h.calls.findLast(call=>
    call.method==='editMessageText'
    && Number(call.args.chat_id)===channelId
    && Number(call.args.message_id)===77);
  assert.ok(edit);
  assert.equal(Object.hasOwn(edit.args,'reply_markup'),false);
});

test('editing a channel post applies intentional callback-button changes unchanged',async()=>{
  const h=await fixture();
  await h.core.handleEditorCoreMessage(forwardedMessage({
    reply_markup:{inline_keyboard:[[{text:'Action',callback_data:'action:old'}]]},
  }),{confirmReplace:true});
  let session=await h.session.loadEditorSession(userId,{touch:false});
  await h.core.handleEditorChannelPostCallback(callback(
    'r:channel:edit',
    session.pendingUserState.choiceMessageId,
  ));
  session=await h.session.loadEditorSession(userId,{touch:false});
  const buttons=JSON.parse(JSON.stringify(session.messageButtons));
  buttons[0].value='action:updated';
  await h.session.updateEditorSession(userId,{messageButtons:buttons});
  await h.core.handleEditorChannelPostCallback(callback('r:channel:confirm'));
  await h.core.handleEditorChannelPostCallback(callback('r:channel:apply'));

  const edit=h.calls.findLast(call=>
    call.method==='editMessageText'
    && Number(call.args.chat_id)===channelId
    && Number(call.args.message_id)===77);
  assert.deepEqual(edit.args.reply_markup.inline_keyboard[0][0],{
    text:'Action',
    callback_data:'action:updated',
  });
});

test('Mini App draft handoff is owner-bound, expires, and never creates a saved page',async()=>{
  const h=await harness({extraModules:{miniapp:'lib/miniapp-bridge'}});
  await h.session.createEditorSession(userId,userId,900);
  const token='a'.repeat(32);
  await h.session.updateEditorSession(userId,{
    pendingUserState:{
      kind:'channel_post_choice',
      miniAppToken:token,
      miniAppExpiresAt:9999999999,
      importDraft:{
        blocks:[{id:'imported',type:'text',position:0,data:{text:'From channel'}}],
        messageButtons:[{id:'button',text:'Visit',type:'url',value:'https://example.com'}],
        buttonsPerRow:1,
        buttonsAlign:'center',
      },
    },
  });

  const result=await h.miniapp.handleMiniAppServerlessEndpoint(
    {action:'draft',token,user_id:999},
    {initData:{user:{id:userId}}},
  );
  assert.equal(result.ok,true);
  assert.equal(result.draft.blocks[0].data.text,'From channel');
  assert.equal(result.draft.buttons[0].text,'Visit');
  assert.equal(result.draft.buttons_per_row,1);
  assert.equal(h.records.richPages.length,0);
  await assert.rejects(
    ()=>h.miniapp.handleMiniAppServerlessEndpoint(
      {action:'draft',token},
      {initData:{user:{id:userId+1}}},
    ),
    error=>error.code==='DRAFT_NOT_FOUND',
  );

  const expired=await h.session.loadEditorSession(userId,{touch:false});
  expired.pendingUserState.miniAppExpiresAt=1;
  await h.session.updateEditorSession(userId,{pendingUserState:expired.pendingUserState});
  await assert.rejects(
    ()=>h.miniapp.handleMiniAppServerlessEndpoint(
      {action:'draft',token},
      {initData:{user:{id:userId}}},
    ),
    error=>error.code==='DRAFT_NOT_FOUND',
  );
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

test('an inaccessible channel member list quietly falls back to import without logging a technical error',async()=>{
  const h=await fixture();
  const errorChatId=-1009876543210;
  h.apiState.memberErrors={[String(userId)]:new h.BotApiError(400,'Bad Request: member list is inaccessible')};
  h.records.legacyStates.push({
    namespace:'error_log',
    payload:{enabled:true,chat_id:errorChatId},
  });

  assert.equal(await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true}),true);
  const session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.blocks.length,1);
  assert.equal(session.blocks[0].type,'text');
  assert.equal(session.channelPostTarget,null);
  assert.equal(h.calls.some(call =>
    call.method==='sendRichMessage' && Number(call.args.chat_id)===errorChatId),false);
  assert.equal(h.calls.filter(call=>call.method==='getChatMember').length,2);
});

test('Mini App renders imported text blocks as editable text instead of empty media placeholders',()=>{
  assert.match(miniAppSource,/function info\(type\)\{const kind=type==="text"\?"paragraph":type;/);
  assert.match(miniAppSource,/if\(\["paragraph","text","heading"/);
  assert.match(livePreviewSource,/if \(\["paragraph","text","heading"/);
  assert.match(editorHtml,/app\.js\?v=0\.3\.108/);
  assert.match(editorHtml,/live_preview\.js\?v=0\.3\.102/);
  assert.match(editorHtml,/media_upload\.js\?v=0\.3\.58/);
  assert.match(editorHtml,/details_nested_editor\.js\?v=0\.3\.44/);
});

test('Mini App opens channel handoffs as untitled unsaved drafts after loading saved pages',()=>{
  assert.match(miniAppApiSource,/draftMatch = path\.match/);
  assert.match(miniAppApiSource,/action:"draft",token:draftMatch\[1\]/);
  assert.match(miniAppSource,/function miniAppDraftToken\(\)/);
  assert.match(miniAppSource,/page_id:null,\s*title:mt\("editor\.untitled"\),\s*blocks:copySessionValue\(draft\.blocks\)/);
  assert.match(miniAppSource,/await api\(`\/miniapp\/api\/drafts\/\$\{encodeURIComponent\(draftToken\)\}`\)/);
  assert.match(miniAppSource,/const pageData=await api\("\/miniapp\/api\/pages"\)/);
  assert.match(editorHtml,/miniapp_serverless_api\.js\?v=0\.3\.85/);
  assert.match(editorHtml,/app\.js\?v=0\.3\.108/);
});

test('Mini App imported quotes preserve Telegram formatting and paragraph breaks',async()=>{
  const h=await fixture();
  await h.core.handleEditorCoreMessage(forwardedMessage({
    rich_message:{blocks:[
      {type:'paragraph',text:{type:'bold',text:'Announcement'}},
      {type:'blockquote',blocks:[
        {type:'paragraph',text:{type:'italic',text:'First quoted line'}},
        {type:'paragraph',text:{type:'bold',text:'Second quoted line'}},
      ]},
    ]},
  }),{confirmReplace:true});
  const session=await h.session.loadEditorSession(userId,{touch:false});
  const quote=session.pendingUserState.importDraft.blocks.find(block=>block.type==='blockquote');
  assert.ok(quote);
  assert.match(quote.data.quote_html,/<p><i>First quoted line<\/i><\/p>/);
  assert.match(quote.data.quote_html,/<p><b>Second quoted line<\/b><\/p>/);

  const start=inlineTextToolsSource.indexOf('function preserveBlockBoundaries(');
  const end=inlineTextToolsSource.indexOf('\n  function sanitizeInlineHtml',start);
  assert.ok(start>=0&&end>start,'imported rich-text boundary helper must remain present');
  const preserveBlockBoundaries=new Function(
    inlineTextToolsSource.slice(start,end)+';return preserveBlockBoundaries;',
  )();
  assert.equal(
    preserveBlockBoundaries('<p><i>First quoted line</i></p><p><b>Second quoted line</b></p>'),
    '<i>First quoted line</i><br><b>Second quoted line</b>',
  );
  assert.match(inlineTextToolsSource,/template\.innerHTML = preserveBlockBoundaries\(raw\)/);
});

test('Mini App reports imported-draft rendering failures to the client error relay',()=>{
  assert.match(miniAppSource,/source:"miniapp\.imported_draft\.render"/);
  assert.match(miniAppSource,/window\.RichMiniAppErrors\?\.report\?\.\(error/);
  assert.match(editorHtml,/inline_text_tools\.js\?v=0\.3\.75/);
  assert.match(editorHtml,/app\.js\?v=0\.3\.108/);
});

test('Mini App quote preview hydrates media nested in native and editable quotes',()=>{
  const start=miniAppSource.indexOf('function miniAppQuoteMedia(');
  const end=miniAppSource.indexOf('\nwindow.RichMiniAppQuoteMedia',start);
  assert.ok(start>=0&&end>start,'quote media hydration helper must remain present');
  const miniAppQuoteMedia=new Function(
    'copySessionValue',
    'window',
    miniAppSource.slice(start,end)+';return miniAppQuoteMedia;',
  )(value=>JSON.parse(JSON.stringify(value)),{});
  const block={
    id:'quote',
    data:{
      native_data:{blocks:[
        {type:'paragraph',text:'Quoted text'},
        {type:'photo',photo:[{file_id:'small-photo'},{file_id:'large-photo',file_size:1234}]},
        {type:'collage',blocks:[{type:'video',video:{file_id:'nested-video'}}]},
      ]},
    },
  };
  assert.deepEqual(miniAppQuoteMedia(block).map(child=>[
    child.type,
    child.data.file.file_id,
  ]),[['photo','large-photo'],['video','nested-video']]);
  const editableQuote={
    id:'editable-quote',
    data:{media_children:[{
      id:'saved-photo',
      type:'photo',
      data:{file:{file_id:'saved-photo-file'}},
    }]},
  };
  assert.deepEqual(miniAppQuoteMedia(editableQuote).map(child=>child.data.file.file_id),[
    'saved-photo-file',
  ]);
  assert.deepEqual(miniAppQuoteMedia({
    id:'cleared-quote',
    data:{
      media_children:[],
      native_data:{blocks:[{type:'photo',photo:{file_id:'removed-photo'}}]},
    },
  }),[]);
  assert.match(livePreviewSource,/window\.RichMiniAppQuoteMedia\?\.\(block\)/);
  assert.match(livePreviewSource,/window\.RichMiniAppStoredMediaPreview\?\.\(child\)/);
  assert.match(mediaUploadSource,/window\.RichMiniAppStoredMediaPreview\s*=\s*storedQuoteMediaPreview/);
});

test('Mini App hydrates imported native table cells for top-level and nested rendering',()=>{
  const start=miniAppSource.indexOf('function nativeTableCellForMiniApp(');
  const end=miniAppSource.indexOf('\nfunction syncNativeTableData',start);
  assert.ok(start>=0&&end>start,'native table hydration helper must remain present');
  const window={RichInlineTextTools:{richTextToHtml:value=>'<b>'+value.text+'</b>'}};
  const miniAppTableRows=new Function(
    'copySessionValue',
    'window',
    miniAppSource.slice(start,end)+';return miniAppTableRows;',
  )(value=>JSON.parse(JSON.stringify(value)),window);
  const table={
    type:'table',
    data:{
      native:true,
      native_data:{
        type:'table',
        is_bordered:false,
        cells:[[{text:'Title',rich_text:{type:'bold',text:'Title'}}],['Body']],
      },
    },
  };
  const rows=miniAppTableRows(table);
  assert.deepEqual(rows.map(row=>row.map(cell=>cell.text)),[['Title'],['Body']]);
  assert.equal(rows[0][0].html,'<b>Title</b>');
  assert.equal(table.data.is_bordered,false);
  assert.match(livePreviewSource,/window\.RichMiniAppTableRows\?\.\(block\)/);
  assert.match(nestedEditorSource,/window\.RichMiniAppTableRows\(child\)/);
});

test('the bot itself must have permission to edit channel messages',async()=>{
  const h=await fixture();
  h.apiState.members[String(botId)]={status:'administrator',can_edit_messages:false};
  assert.equal(await h.core.handleEditorCoreMessage(forwardedMessage(),{confirmReplace:true}),true);
  const session=await h.session.loadEditorSession(userId,{touch:false});
  assert.equal(session.channelPostTarget,null);
  assert.equal(session.pendingUserState,null);
  assert.equal(session.blocks.length,1);
  assert.equal(h.calls.filter(call=>call.method==='getChatMember').length,1);
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
      h.i18n.channelPostMiniAppLabel(locale),
    ];
    for(const text of texts){
      assert.ok(text.trim(),locale);
      assert.doesNotMatch(text,/\{[A-Za-z0-9_]+\}/,locale);
    }
    if(locale!=='en'){
      for(const key of ['channel_post.choice','channel_post.warning','channel_post.success']){
        assert.notEqual(h.i18n.t(locale,key),h.i18n.t('en',key),locale+': '+key);
      }
      assert.notEqual(
        h.i18n.channelPostMiniAppLabel(locale),
        h.i18n.channelPostMiniAppLabel('en'),
        locale+': Mini App label',
      );
    }
  }
});
