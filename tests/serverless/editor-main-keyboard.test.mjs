import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

test('publish button sits below editor tools and is absent from extra tools', async () => {
  const h = await harness();
  const editor = h.ui.buildEditorKeyboard({ blocks: [] }, 'ar').inline_keyboard;
  const tools = h.ui.buildEditorToolsKeyboard('ar').inline_keyboard;
  const toolsRow = editor.findIndex((row) => row.some((button) => button.callback_data === 'r:tools'));
  const publishRow = editor.findIndex((row) => row.some((button) => button.callback_data === 'r:post'));

  assert.equal(publishRow, toolsRow + 1);
  assert.deepEqual(JSON.parse(JSON.stringify(editor[publishRow])), [{
    text: h.ui.editorCopy('ar').publish,
    callback_data: 'r:post',
    style: 'success',
  }]);
  assert.equal(tools.flat().some((button) => button.callback_data === 'r:post'), false);

  const populated = h.ui.buildEditorKeyboard({
    blocks: [{ id: 'block-1', type: 'paragraph', position: 0 }],
  }, 'ar').inline_keyboard;
  const populatedToolsRow = populated.findIndex((row) => row.some((button) => button.callback_data === 'r:tools'));
  const populatedPublishRow = populated.findIndex((row) => row.some((button) => button.callback_data === 'r:post'));
  assert.equal(populatedPublishRow, populatedToolsRow + 1);
});
