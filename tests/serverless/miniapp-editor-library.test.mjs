import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

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

test('adding a block keeps the existing editor flow and brings its block into view', () => {
  assert.match(app, /function addBlock\(type,at=insertIndex,initialText=""\)/);
  assert.ok(app.includes('target?.scrollIntoView({block:"center",behavior:"smooth"})'));
});

test('mobile editor header and popup menus stay clear of overlapping controls', () => {
  const styles = read('telegram_compact_layout.css');
  const popupLayout = read('popup_performance.js');

  assert.match(styles, /\.save-state-row\{[^}]*flex-direction:column/);
  assert.match(styles, /\.save-state-row \.save-state\{[^}]*text-overflow:ellipsis/);
  assert.match(styles, /\.save-state-row \.save-page-btn\{[^}]*white-space:nowrap/);
  assert.match(styles, /@media\(max-width:430px\)[\s\S]*width:100%!important[\s\S]*bottom-actions/);
  assert.match(styles, /@media\(max-width:430px\)[\s\S]*send-issues-btn[\s\S]*max-width:calc\(100vw - 126px\)!important/);
  assert.match(styles, /@media\(max-width:340px\)[\s\S]*bottom-actions>\.send-issues-btn/);
  assert.match(styles, /Premium compact editor chrome/);
  assert.match(styles, /bottom-actions>\.fab-send/);
  assert.match(styles, /backdrop-filter:blur\(16px\) saturate\(145%\)/);
  assert.match(styles, /\.slash-wrap:focus-within/);
  assert.match(popupLayout, /const safeBottom = Math\.max\([\s\S]*footerTop/);
  assert.match(popupLayout, /menu\.style\.maxHeight = `\$\{Math\.round\(maxMenuHeight\)\}px`/);
});

test('locale direction stays separate from editor content direction', () => {
  const i18n = read('miniapp_i18n.js');
  const styles = read('telegram_compact_layout.css');
  const directionFor = languageCode => {
    const document = {
      documentElement:{},
      readyState:'complete',
      querySelectorAll:()=>[],
      getElementById:()=>null,
      querySelector:()=>null,
    };
    const window = {Telegram:{WebApp:{initDataUnsafe:{user:{language_code:languageCode}}}}};
    runInNewContext(i18n,{window,document,navigator:{language:'en'}});
    return {language:window.MiniAppI18n.language,direction:document.documentElement.dir};
  };
  assert.deepEqual(directionFor('ru'),{language:'ru',direction:'ltr'});
  assert.deepEqual(directionFor('ar'),{language:'ar',direction:'rtl'});

  const handlerStart = app.indexOf('$("alignmentToolBtn").onclick=');
  const handlerEnd = app.indexOf('\n};',handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart,'page direction handler must remain present');
  const handler = app.slice(handlerStart,handlerEnd);
  assert.match(handler,/editorContentDirection=editorContentDirection==="ltr"\?"rtl":"ltr"/);
  assert.doesNotMatch(handler,/document\.documentElement\.dir|root\.dir/);
  assert.match(styles,/\.link-choice-row\{[^}]*text-align:start;[^}]*direction:inherit;/);
  assert.match(styles,/html:root \.menu-item,\s*html:root \.sheet-item\{\s*text-align:start;/);
  assert.match(app,/editorView"\)\?\.classList\.toggle\("has-unsaved-changes",dirty\)/);
  assert.match(styles,/editor-screen\.has-unsaved-changes \.editor-topbar\{\s*display:flex!important/);
  assert.match(html,/telegram_compact_layout\.css\?v=0\.3\.30/);
});

test('mobile editor toolbar keeps every control visible in two rows', () => {
  assert.match(html, /id="pagesToolBtn"/);
  assert.match(html, /id="boldToolBtn"/);
  assert.match(html, /id="listToolBtn"/);
  assert.match(html, /id="tableToolBtn"/);
  assert.match(html, /id="linkToolBtn"/);
  assert.match(html, /id="photoToolBtn"/);
  assert.match(html, /id="alignmentToolBtn"/);
  assert.match(app, /\$\("boldToolBtn"\)\.onclick/);
  assert.match(app, /\$\("pagesToolBtn"\)\.onclick=\(\)=>loadPages\(\)/);
  assert.match(app, /\$\("listToolBtn"\)\.onclick=\(\)=>addBlock\("list"\)/);
  assert.match(app, /\$\("tableToolBtn"\)\.onclick=\(\)=>addBlock\("table"\)/);
  assert.match(app, /\$\("photoToolBtn"\)\.onclick=\(\)=>addBlock\("photo"\)/);
  const styles=read('telegram_compact_layout.css');
  assert.match(styles,/@media\(max-width:480px\)[\s\S]*grid-template-areas:[\s\S]*"history history history text text emoji"[\s\S]*"tools tools tools tools tools tools"/);
  assert.match(styles,/@media\(max-width:480px\)[\s\S]*width:40px!important/);
  assert.match(styles,/@media\(max-width:480px\)[\s\S]*overflow:visible!important/);
  assert.match(read('telegram_compact_layout.css'), /\.editor-topbar\{[\s\S]*display:none!important/);
});

test('link toolbar icon offers text-link and rich-button choices', () => {
  assert.match(app, /\$\("linkToolBtn"\)\.onclick=\(\)=>\{/);
  assert.match(app, /id="linkChoiceMenu"/);
  assert.match(app, /inline\.add_link/);
  assert.match(app, /button\.rich/);
  assert.ok(app.includes('window.RichButtonEditor.create("url")'));
  assert.match(app, /window\.RichInlineTextTools\?\.openLinkEditor\?\.\(\)/);
  assert.match(read('telegram_compact_layout.css'), /\.link-choice-menu/);
  assert.match(app, /textRow\.append\(textIcon,textLabel\)/);
  assert.match(read('miniapp_i18n.js'), /inline\.link_text_required/);
});

test('text link choice opens a flat dialog to enter linked text and destination', () => {
  const inline = read('inline_text_tools.js');
  const styles = read('inline_text_tools.css');
  assert.match(inline, /className = "inline-link-dialog-backdrop"/);
  assert.match(inline, /className = "inline-link-dialog"/);
  assert.match(inline, /tr\("inline\.link_text", "Text"\)/);
  assert.match(inline, /tr\("inline\.link_url", "Link"\)/);
  assert.match(inline, /textInput\.value = selectedText \|\| existingLink\?\.textContent \|\| ""/);
  assert.match(inline, /range\.toString\(\) === linkText/);
  assert.match(inline, /savedRange = range\.cloneRange\(\);\s*if \(sel\.isCollapsed\)/);
  assert.match(styles, /\.inline-link-dialog\{[\s\S]*background:var\(--panel\)/);
  assert.match(styles, /\.inline-link-dialog-backdrop\{[\s\S]*backdrop-filter:none!important/);
});

test('link choice popup remains compact and inside the visible mini app viewport', () => {
  const start = app.indexOf('function linkChoiceMenuPosition(');
  const end = app.indexOf('\n$("linkToolBtn").onclick=', start);
  assert.ok(start >= 0 && end > start);
  const position = new Function(`${app.slice(start, end)};return linkChoiceMenuPosition;`)();
  const bounds = {left:20,top:40,right:280,bottom:400};
  const below = position({left:230,right:252,top:65,bottom:88},bounds,168,90);
  assert.equal(below.width,168);
  assert.equal(below.left,84);
  assert.equal(below.top,94);
  assert.ok(below.left >= bounds.left && below.left + below.width <= bounds.right);
  assert.ok(below.top >= bounds.top && below.top + 90 <= bounds.bottom);
  const above = position({left:230,right:252,top:365,bottom:388},bounds,168,90);
  assert.equal(above.top,269);
  assert.ok(above.top + 90 <= bounds.bottom);

  const styles=read('telegram_compact_layout.css');
  assert.match(styles,/\.link-choice-menu\{[\s\S]*width:168px!important/);
  assert.match(styles,/\.link-choice-menu\{[\s\S]*backdrop-filter:none!important/);
  assert.match(styles,/\.link-choice-row\{[^}]*direction:inherit/);
  assert.match(styles,/\.link-choice-row\{[^}]*text-align:start/);
  assert.doesNotMatch(app,/shortcut\.textContent="Ctrl\+K"/);
});
