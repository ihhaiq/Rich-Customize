import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const paragraph = (h, value) => h.blocks.makeBlock('paragraph', { text: value });
const media = (h, id) => h.blocks.makeBlock('photo', { file: { file_id: id } });

test('plan-limit trimming keeps the earliest media and removes only excess attachments', async () => {
  const h = await harness({ extraModules: { policy: 'lib/subscription-policy' } });
  const entitlement = h.policy.resolveEditorEntitlement();
  const source = Array.from({ length: 11 }, (_, index) => media(h, 'file-' + index));
  const checked = h.blocks.validateEditorLimits(source, 999999, { entitlement });
  assert.deepEqual(
    { code: checked.code, actual: checked.actual, limit: checked.limit, source: checked.source },
    { code: 'media_attachments', actual: 11, limit: 10, source: 'plan' },
  );

  const trimmed = h.blocks.trimEditorBlocksToLimits(source, 999999, { entitlement }).blocks;
  assert.equal(trimmed.length, 10);
  assert.deepEqual(trimmed.map(block => block.data.file.file_id), source.slice(0, 10).map(block => block.data.file.file_id));
  assert.equal(source.length, 11, 'The source draft remains unchanged until confirmation is accepted');
});

test('limit trimming preserves the allowed text prefix, rows, columns and block count', async () => {
  const h = await harness({ extraModules: { policy: 'lib/subscription-policy' } });
  const entitlement = h.policy.resolveEditorEntitlement();
  const text = paragraph(h, 'x'.repeat(20001));
  const textResult = h.blocks.trimEditorBlocksToLimits([text], 999999, { entitlement }).blocks;
  assert.equal(textResult[0].data.text.length, 20000);

  const tooManyBlocks = Array.from({ length: 51 }, (_, index) => paragraph(h, String(index)));
  const blockResult = h.blocks.trimEditorBlocksToLimits(tooManyBlocks, 999999, { entitlement }).blocks;
  assert.equal(blockResult.length, 50);
  assert.equal(blockResult[49].data.text, '49');

  const table = h.blocks.makeBlock('table', {
    rows: Array.from({ length: 27 }, () => Array.from({ length: 9 }, (_, index) => ({ text: String(index) }))),
  });
  const tableResult = h.blocks.trimEditorBlocksToLimits([table], 999999, { entitlement }).blocks[0];
  assert.equal(tableResult.data.rows.length, 26);
  assert.equal(tableResult.data.rows.every(row => row.length === 8), true);
});

test('Telegram technical ceilings remain in force for developers', async () => {
  const h = await harness({ extraModules: { access: 'lib/developer-access' } });
  const developerId = h.access.DEVELOPER_IDS[0];
  const source = Array.from({ length: 51 }, (_, index) => media(h, 'file-' + index));
  const checked = h.blocks.validateEditorLimits(source, developerId);
  assert.deepEqual(
    { code: checked.code, actual: checked.actual, limit: checked.limit, source: checked.source },
    { code: 'media_attachments', actual: 51, limit: 50, source: 'telegram' },
  );
  const trimmed = h.blocks.trimEditorBlocksToLimits(source, developerId).blocks;
  assert.equal(trimmed.length, 50);
});

test('limit confirmation leaves unrelated editor callbacks for their handlers', async () => {
  const h = await harness({
    extraModules: {
      policy: 'lib/subscription-policy',
      confirmation: 'lib/editor-limit-confirmation',
    },
  });
  const handled = await h.confirmation.handleEditorLimitConfirmation({
    data: 'r:add:paragraph',
  });
  assert.equal(handled, false);
});
