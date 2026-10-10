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
  const h = await harness({ extraModules: { policy: 'lib/subscription-policy' } });
  const { blocks, renderer } = h;
  const golden = h.policy.resolveEditorEntitlement({ plan: 'golden', active: true });
  const options = { entitlement: golden };
  const fine = blocks.makeBlock('table', { rows: [[{ text: 'A', colspan: 19 }, { text: 'B' }]] });
  const wide = blocks.makeBlock('table', { rows: [[{ text: 'A', colspan: 20 }, { text: 'B' }]] });
  assert.equal(blocks.validateEditorLimits([fine], 999999, options).ok, true);
  assert.equal(blocks.validateEditorLimits([wide], 999999, options).code, 'table_columns');
  assert.doesNotThrow(() => renderer.buildSingleBlockRichMessage(fine, { userId: 999999, ...options }));
  assert.throws(() => renderer.buildSingleBlockRichMessage(wide, { userId: 999999, ...options }), /EDITOR_LIMIT:table_columns/);
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

test('rowspan occupancy cannot hide a twenty-first column or twenty-seventh row', async () => {
  const { blocks, renderer } = await harness();
  const mergedWidth = blocks.makeBlock('table', {
    rows: [
      [{ text: 'A', colspan: 1, rowspan: 2 }, ...row(19)],
      row(20),
    ],
  });
  const mergedHeight = blocks.makeBlock('table', {
    rows: Array.from({ length: 26 }, (_, i) => i === 25
      ? [{ text: 'Last', rowspan: 2 }]
      : [{ text: String(i) }]),
  });
  assert.equal(blocks.validateEditorLimits([mergedWidth], 999999).code, 'table_columns');
  assert.equal(blocks.validateEditorLimits([mergedHeight], 999999).code, 'table_rows');
  assert.throws(() => renderer.buildSingleBlockRichMessage(mergedWidth, { userId: 999999 }), /EDITOR_LIMIT:table_columns/);
});

test('verified plan table limits: Free 8, Plus 12, Golden 20', async () => {
  const h = await harness({ extraModules: { policy: 'lib/subscription-policy' } });
  const plans = [
    [h.policy.resolveEditorEntitlement(), 8],
    [h.policy.resolveEditorEntitlement({ plan: 'plus', active: true }), 12],
    [h.policy.resolveEditorEntitlement({ plan: 'golden', active: true }), 20],
  ];
  for (const [entitlement, limit] of plans) {
    const allowed = h.blocks.makeBlock('table', { rows: [row(limit)] });
    const denied = h.blocks.makeBlock('table', { rows: [row(limit + 1)] });
    assert.equal(h.blocks.validateEditorLimits([allowed], 999999, { entitlement }).ok, true);
    const result = h.blocks.validateEditorLimits([denied], 999999, { entitlement });
    assert.equal(result.code, 'table_columns');
    assert.equal(result.limit, limit);
    assert.equal(result.actual, limit + 1);
    assert.throws(
      () => h.renderer.buildSingleBlockRichMessage(denied, { userId: 999999, entitlement }),
      /EDITOR_LIMIT:table_columns/,
    );
  }
  const spoofed = h.policy.resolveEditorEntitlement({ plan: 'golden', active: false });
  assert.equal(h.blocks.validateEditorLimits(
    [h.blocks.makeBlock('table', { rows: [row(9)] })], 999999, { entitlement: spoofed },
  ).limit, 8);
});
test('free user cannot bypass the 8-column cap with imported native cells or colspan', async () => {
  const { blocks } = await harness();
  const imported = blocks.makeBlock('table', {
    native: true,
    rows: [row(8)],
    native_data: { type: 'table', cells: [row(9)] },
  });
  assert.equal(blocks.validateEditorLimits([imported], 999999).limit, 8);
  const spanned = blocks.makeBlock('table', { rows: [[{ text: 'a', colspan: 9 }]] });
  assert.equal(blocks.validateEditorLimits([spanned], 999999).limit, 8);
});
