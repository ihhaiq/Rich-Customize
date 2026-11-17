import test from 'node:test';
import assert from 'node:assert/strict';
import {harness} from './harness.mjs';

test('checklists create an item for every input line and bot controls toggle any item', async () => {
  const h = await harness({extraModules:{extra:'lib/editor-extra-blocks'}});
  const userId = 987654;
  const block = {
    id:'tasks',
    type:'list',
    position:0,
    data:h.blocks.listData('First task\nSecond task\nThird task\nFourth task','checklist'),
  };
  assert.equal(block.data.items.length, 4);
  assert.equal(h.renderer.buildInputRichMessage([block]).blocks[0].items.length, 4);

  const taskButtons = h.ui.buildBlockEditorKeyboard(block, [block], 'en').inline_keyboard
    .flat()
    .filter(button => String(button.callback_data || '').startsWith('r:ct:'));
  assert.deepEqual(Array.from(taskButtons, button => button.callback_data), [
    'r:ct:tasks:0',
    'r:ct:tasks:1',
    'r:ct:tasks:2',
    'r:ct:tasks:3',
  ]);
  assert.equal(taskButtons[0].text, '☐ Not done: First task');
  assert.equal(taskButtons[1].text, '☐ Not done: Second task');
  assert.equal(taskButtons[0].style, undefined);

  await h.session.createEditorSession(userId, userId, 50);
  await h.session.updateEditorSession(userId, {
    state:'managing',
    currentBlockId:'tasks',
    blocks:[block],
  });
  const query = {
    id:'toggle-third-task',
    from:{id:userId,language_code:'en'},
    message:{chat:{id:userId,type:'private'},message_id:50},
    data:'r:ct:tasks:2',
  };
  await h.extra.handleExtraBlockCallback(query, await h.session.loadEditorSession(userId));
  let saved = await h.session.loadEditorSession(userId);
  assert.deepEqual(saved.blocks[0].data.items.map(item => item.is_checked), [false,false,true,false]);
  const checkedButton = h.ui.buildBlockEditorKeyboard(saved.blocks[0], saved.blocks, 'en').inline_keyboard
    .flat()
    .find(button => button.callback_data === 'r:ct:tasks:2');
  assert.equal(checkedButton.text, '☑️ Done: Third task');
  assert.equal(checkedButton.style, 'success');
  let preview = h.renderer.buildInputRichMessage(saved.blocks).blocks[0];
  assert.equal(preview.type, 'list');
  assert.equal(preview.items[2].has_checkbox, true);
  assert.equal(preview.items[2].is_checked, true);
  assert.equal(preview.items[2].blocks[0].text, 'Third task');
  assert.equal(JSON.stringify(preview).includes('callback_data'), false);

  await h.extra.handleExtraBlockCallback(
    {...query,id:'untoggle-third-task'},
    await h.session.loadEditorSession(userId),
  );
  saved = await h.session.loadEditorSession(userId);
  assert.deepEqual(saved.blocks[0].data.items.map(item => item.is_checked), [false,false,false,false]);
  preview = h.renderer.buildInputRichMessage(saved.blocks).blocks[0];
  assert.equal(preview.type, 'list');
  assert.equal(preview.items[2].has_checkbox, true);
  assert.equal(preview.items[2].is_checked, undefined);
  assert.equal(preview.items[2].blocks[0].text, 'Third task');
});

test('checklist creation explains completion markers and saves completed tasks', async () => {
  const h = await harness({extraModules:{extra:'lib/editor-extra-blocks'}});
  const userId = 987655;
  await h.session.createEditorSession(userId, userId, 51);

  await h.extra.handleExtraBlockCallback({
    id:'choose-checklist',
    from:{id:userId,language_code:'ar'},
    message:{chat:{id:userId,type:'private'},message_id:51},
    data:'r:addlist:checklist',
  }, await h.session.loadEditorSession(userId));

  const prompt = h.calls.filter(call => call.method === 'sendMessage').at(-1);
  assert.match(prompt.args.text, /\[x\]/);
  assert.match(prompt.args.text, /✅/);

  await h.extra.handleExtraBlockMessage({
    from:{id:userId,language_code:'ar'},
    chat:{id:userId,type:'private'},
    message_id:52,
    text:'[x] منجزة بعلامة x\n✅ منجزة بعلامة صح\n☑️ منجزة بمربع محدد\nمهمة غير منجزة',
  }, await h.session.loadEditorSession(userId));

  const saved = await h.session.loadEditorSession(userId);
  const checklist = saved.blocks[0];
  assert.equal(checklist.type, 'list');
  assert.equal(checklist.data.kind, 'checklist');
  assert.deepEqual(checklist.data.items.map(item => item.is_checked), [true,true,true,false]);
  assert.match(h.ui.blockPage(checklist, saved.blocks, 'ar'), /لتغيير حالة مهمة اضغط زرها أدناه/);

  const buttons = h.ui.buildBlockEditorKeyboard(checklist, saved.blocks, 'ar').inline_keyboard
    .flat()
    .filter(button => String(button.callback_data || '').startsWith('r:ct:'));
  assert.match(buttons[0].text, /منجزة/);
  assert.match(buttons[3].text, /غير منجزة/);
  assert.equal(buttons[0].style, 'success');
  assert.equal(buttons[3].style, undefined);

  await h.extra.handleExtraBlockCallback({
    id:'edit-checklist',
    from:{id:userId,language_code:'ar'},
    message:{chat:{id:userId,type:'private'},message_id:51},
    data:'r:e:' + checklist.id,
  }, saved);
  const editPrompt = h.calls.filter(call => call.method === 'sendMessage').at(-1);
  assert.match(editPrompt.args.text, /\[x\]/);
  assert.match(editPrompt.args.text, /☑️/);
});

test('checklist rendering keeps checked items as native list items and rejects legacy controls safely', async () => {
  const h = await harness({extraModules:{navigation:'lib/page-navigation'}});
  const block = {
    id:'tasks',
    type:'list',
    position:0,
    data:h.blocks.listData('[x] Finished task\n[ ] Pending task','checklist'),
  };
  const richMessage = h.renderer.buildInputRichMessage([block]);
  const list = richMessage.blocks[0];
  assert.equal(list.type, 'list');
  assert.equal(list.items[0].has_checkbox, true);
  assert.equal(list.items[0].is_checked, true);
  assert.equal(list.items[1].has_checkbox, true);
  assert.equal(list.items[1].is_checked, undefined);
  assert.equal(list.items[0].blocks[0].text, 'Finished task');
  assert.equal(list.items[1].blocks[0].text, 'Pending task');
  assert.equal(JSON.stringify(richMessage).includes('callback_data'), false);

  const nativeChecklist = {
    id:'imported',
    type:'list',
    position:1,
    data:{
      native:true,
      native_type:'list',
      kind:'checklist',
      items:[{text:'Imported task',has_checkbox:true,is_checked:true}],
      native_data:{
        type:'list',
        items:[{
          blocks:[{type:'paragraph',text:'Imported task'}],
          has_checkbox:true,
          is_checked:true,
        }],
      },
    },
  };
  const imported = h.renderer.buildInputRichMessage([nativeChecklist]);
  assert.equal(imported.blocks[0].type, 'list');
  assert.equal(imported.blocks[0].items[0].has_checkbox, true);
  assert.equal(imported.blocks[0].items[0].is_checked, true);
  assert.equal(imported.blocks[0].items[0].blocks[0].text, 'Imported task');

  await h.navigation.handlePageNavigationCallback({
    id:'obsolete-checklist-control',
    from:{id:123,language_code:'ar'},
    message:{chat:{id:123,type:'private'},message_id:77,rich_message:richMessage},
    data:'r:task:1f7422140124:1:0',
  });
  const alert = h.calls.find(call => call.method === 'answerCallbackQuery');
  assert.equal(alert.args.show_alert, true);
  assert.match(alert.args.text, /إعدادات القائمة/);
  assert.equal(h.calls.some(call => call.method === 'editMessageText'), false);
});
