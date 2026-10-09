import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('retired saved-page history has no storage, save hooks or restore callbacks', () => {
  for (const path of [
    'tgcloud/schema.js',
    'tgcloud/lib/editor-pages.js',
    'tgcloud/lib/editor-session.js',
    'tgcloud/lib/miniapp-bridge.js',
    'tgcloud/lib/pages.js',
    'tgcloud/lib/subscription-policy.js',
    'app/miniapp_static/subscription_offers.js',
  ]) {
    const source = read(path);
    assert.doesNotMatch(source,
      /page-version-history|editorPageVersions|PLAN_HISTORY_LIMITS|r:phistory|r:phrestore|archivePreviousPageVersion|restoreSavedPageVersion|refreshRestoredEditorDraft|planBenefit\([^\n]+['"]history['"]/);
  }
  assert.equal(existsSync(new URL('../../tgcloud/lib/page-version-history.js', import.meta.url)), false);
});

test('independent editor undo/redo and full backup continue to exist', () => {
  const session=read('tgcloud/lib/editor-session.js');
  const schema=read('tgcloud/schema.js');
  assert.match(session,/undoStack/);
  assert.match(session,/redoStack/);
  assert.match(schema,/export const pageSnapshots/);
  assert.match(schema,/revision: integer\('revision'\)/);
});

test('donor entitlement and plan UI no longer advertise saved-page history', () => {
  const source=read('app/miniapp_static/subscription_offers.js');
  assert.doesNotMatch(source,/lastVersions|plan\.history|سجل نسخ الصفحة|Page version history/);
  const pages=read('tgcloud/lib/pages.js');
  assert.doesNotMatch(pages,/🕘/);
});
