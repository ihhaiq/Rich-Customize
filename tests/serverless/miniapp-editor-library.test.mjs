import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const root = new URL('../../app/miniapp_static/', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');
const html = read('editor.html');
const app = read('app.js');

test('block toolbar is labeled and opens searchable, categorized block catalog', () => {
  assert.match(html, /id="allBlocksBtn"[^>]*data-i18n-label="editor\.add_block"/);
  assert.match(html, /class="toolbar-action-label" data-i18n="editor\.add_block"/);
  assert.match(html, /id="blockSearch" type="search"/);
  assert.match(html, /id="blockCategoryFilters"/);
  assert.match(app, /function renderBlockFilters\(\)/);
  assert.match(app, /\["media",mt\("top\.media"\)\]/);
  assert.match(app, /blockSearch\.addEventListener\("input",\(\)=>renderSlashItems\(blockSearch\.value\)\)/);
});

test('slash commands keep their own menu while the block catalog uses search and categories', () => {
  const features = read('editor_features.js');
  const styles = read('telegram_compact_layout.css');

  assert.match(features, /slashMenu\.classList\.add\("command-menu"\)/);
  assert.match(app, /slashMenu\.classList\.remove\("command-menu"\)/);
  assert.match(app, /\$\("allBlocksBtn"\)\.onclick=\(\)=>openBlockCatalog\(""\)/);
  assert.match(app, /function openBlockCatalog\(query="",types=null\)/);
  assert.match(styles, /#slashMenu\.command-menu \.block-search-row/);
  assert.match(styles, /#slashMenu\.command-menu \.block-category-filters/);
});

test('saved-page search matches titles while keeping page identifiers out of row labels', () => {
  const start = app.indexOf('function filterSavedPages(');
  const end = app.indexOf('\nfunction renderPagesList', start);
  assert.ok(start >= 0 && end > start, 'saved-page filter helper must remain present');
  const filterSavedPages = new Function(`${app.slice(start, end)};return filterSavedPages;`)();

  const pages = [
    {title:'Rich Announcement', page_id:'A1'},
    {title:'Weekly Update', page_id:'B2'},
    {title:'', page_id:'C3'},
  ];
  assert.deepEqual(filterSavedPages(pages, '  RICH '), [pages[0]]);
  assert.deepEqual(filterSavedPages(pages, 'B2'), []);
  assert.deepEqual(filterSavedPages(pages, ''), pages);
  assert.match(html, /id="pagesSearch"[^>]*type="search"/);
  assert.match(app, /pagesSearch\.addEventListener\("input",\(\)=>renderPagesList\(pagesSnapshot\(\)\|\|\[\]\)\)/);
  assert.match(app, /pages\.block_count/);
  assert.doesNotMatch(app, /<small>\$\{Number\(page\.block_count\|\|0\)\} Block · \$\{escapeHtml\(page\.page_id\)\}/);
});

test('saving stays explicit and the visible save control appears for dirty work', () => {
  assert.match(html, /id="savePageBtn" class="save-page-btn hidden"/);
  assert.match(app, /savePageBtn\.classList\.toggle\("hidden",!dirty\)/);
  assert.match(app, /savePageBtn\.onclick=async\(\)=>\{[\s\S]*await flushSave\(\)/);
  assert.doesNotMatch(app, /if\(dirty&&hasSavablePageContent\(\)\)\{[\s\S]*queueSave\(\)/);
  assert.doesNotMatch(read('page_menu.js'), /page\.save_now/);
});

test('mobile editor header and popup menus stay clear of overlapping controls', () => {
  const styles = read('telegram_compact_layout.css');
  const popupLayout = read('popup_performance.js');

  assert.match(styles, /\.save-state-row\{[^}]*flex-direction:column/);
  assert.match(styles, /\.save-state-row \.save-state\{[^}]*text-overflow:ellipsis/);
  assert.match(styles, /\.save-state-row \.save-page-btn\{[^}]*white-space:nowrap/);
  assert.match(popupLayout, /const safeBottom = Math\.max\([\s\S]*footerTop/);
  assert.match(popupLayout, /menu\.style\.maxHeight = `\$\{Math\.round\(maxMenuHeight\)\}px`/);
});
