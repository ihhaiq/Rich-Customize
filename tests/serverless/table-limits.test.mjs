import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

const row = (columns) => Array.from({ length: columns }, (_, i) => ({ text: String(i) }));

test('table boundaries are 20 columns and 26 rows for regular users', async () => {
  const { blocks, renderer } = await harness();
  assert.equal(blocks.MAX_TABLE_COLUMNS, 20);
  assert.equal(blocks.MAX_TABLE_ROWS, 26);
  assert.equal(blocks.validateTableRows(Array.from({ length: 26 }, () => row(20))).ok, true);
  const extraColumn = blocks.validateTableRows([row(21)]);
  assert.equal(extraColumn.code, 'table_columns');
  assert.equal(extraColumn.limit, 20);
  const extraRow = blocks.validateTableRows(Array.from({ length: 27 }, () => row(1)));
  assert.equal(extraRow.code, 'table_rows');
  assert.equal(extraRow.limit, 26);

  const wide = blocks.makeBlock('table', { rows: [row(21)] });
  const tall = blocks.makeBlock('table', { rows: Array.from({ length: 27 }, () => row(1)) });
  assert.equal(blocks.validateEditorLimits([wide], 999999).code, 'table_columns');
  assert.equal(blocks.validateEditorLimits([tall], 999999).code, 'table_rows');
  assert.throws(() => renderer.buildSingleBlockRichMessage(wide, { userId: 999999 }), /EDITOR_LIMIT:table_columns:21:20/);
});

test('colspan is counted in actual table width', async () => {
  const { blocks, renderer } = await harness();
  const fine = blocks.makeBlock('table', { rows: [[{ text: 'A', colspan: 19 }, { text: 'B' }]] });
  const wide = blocks.makeBlock('table', { rows: [[{ text: 'A', colspan: 20 }, { text: 'B' }]] });
  assert.equal(blocks.validateEditorLimits([fine], 999999).ok, true);
  assert.equal(blocks.validateEditorLimits([wide], 999999).code, 'table_columns');
  assert.doesNotThrow(() => renderer.buildSingleBlockRichMessage(fine, { userId: 999999 }));
  assert.throws(() => renderer.buildSingleBlockRichMessage(wide, { userId: 999999 }), /EDITOR_LIMIT:table_columns/);
});

test('developer quota exemption does not bypass technical table limits', async () => {
  const h = await harness({ extraModules: { access: 'lib/developer-access' } });
  const developerId = h.access.DEVELOPER_IDS[0];
  assert.ok(developerId, 'Developer fixture must be configured');
  const wide = h.blocks.makeBlock('table', { rows: [row(21)] });
  const tall = h.blocks.makeBlock('table', { rows: Array.from({ length: 27 }, () => row(1)) });
  assert.equal(h.blocks.validateEditorLimits([wide], developerId).code, 'table_columns');
  assert.equal(h.blocks.validateEditorLimits([tall], developerId).code, 'table_rows');
  assert.throws(() => h.renderer.buildSingleBlockRichMessage(wide, { userId: developerId }), /EDITOR_LIMIT:table_columns/);
});

test('stale editable rows cannot conceal an oversized imported native table', async () => {
  const h = await harness();
  const imported = h.blocks.makeBlock('table', {
    native: true,
    rows: [[{ text: 'Small editable cache' }]],
    native_data: { type: 'table', cells: [row(21)] },
  });
  assert.equal(h.blocks.validateEditorLimits([imported], 999999).code, 'table_columns');
  assert.throws(() => h.renderer.buildSingleBlockRichMessage(imported, { userId: 999999 }), /EDITOR_LIMIT:table_columns/);
  const preview = h.ui.blockEditorRichMessage(imported, [imported], 'ar', 999999);
  assert.ok(Array.isArray(preview.blocks));
  assert.equal(preview.blocks.some(block => block.type === 'table'), false);
  assert.ok(preview.blocks.some(block => block.type === 'paragraph'));
  assert.equal(imported.data.native_data.cells[0].length, 21, 'Must preserve the user data for editing');
});

test('nested tables are checked, including imported native tables inside details', async () => {
  const { blocks, renderer } = await harness();
  const nested = blocks.makeBlock('details', {
    summary_text: 'Nested',
    children: [blocks.makeBlock('table', {
      native: true,
      native_data: { type: 'table', cells: [row(21)] },
    })],
  });
  assert.equal(blocks.validateEditorLimits([nested], 999999).code, 'table_columns');
  assert.throws(() => renderer.buildSingleBlockRichMessage(nested, { userId: 999999 }), /EDITOR_LIMIT:table_columns/);
});
