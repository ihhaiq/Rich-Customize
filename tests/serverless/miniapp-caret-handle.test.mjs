import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../app/miniapp_static/', import.meta.url);
const read = name => fs.readFileSync(new URL(name, root), 'utf8');

test('all-block button opens the full catalog and slash search supports complete block names', () => {
  const html = read('editor.html');
  const sections = read('toolbar_sections.js');
  const features = read('editor_features.js');
  const app = read('app.js');
  assert.match(html, /id="allBlocksBtn"[^>]*class="all-blocks-btn"/);
  assert.match(sections, /openSlashMenu\(""\)/);
  assert.doesNotMatch(sections, /openSlashMenu\("",\s*OTHER_BLOCK_TYPES\)/);
  assert.match(features, /firstTokenIsBlockName[\s\S]*const blockQuery = filteredBlocks\(q\)\.length \? q : firstTokenIsBlockName \? firstToken : q/);
  assert.match(features, /openSlashMenu\(""/);

  const catalog = app.slice(app.indexOf('const BLOCKS = ['), app.indexOf('\n];', app.indexOf('const BLOCKS = [')));
  assert.equal((catalog.match(/\{type:/g) || []).length, 22);
  assert.match(catalog, /type:"map"/);
  assert.match(catalog, /type:"mathematical_expression"/);
});

test('one custom draggable caret replaces the native caret while active on touch and desktop', () => {
  const html = read('editor.html');
  const script = read('caret_handle.js');
  const styles = read('caret_handle.css');
  assert.match(html, /caret_handle\.css\?v=0\.2\.0/);
  assert.match(html, /caret_handle\.js\?v=0\.2\.0/);
  assert.doesNotMatch(script, /pointer:\s*coarse/);
  assert.match(script, /handle\.classList\.add\("is-visible"\)[\s\S]*editor\.classList\.add\("miniapp-custom-caret-active"\)/);
  assert.match(script, /activeEditor\?\.classList\.remove\("miniapp-custom-caret-active"\)/);
  assert.match(styles, /\.miniapp-custom-caret-active\{caret-color:transparent!important\}/);
  assert.doesNotMatch(styles, /@media\s*\(pointer:\s*coarse\)[\s\S]*miniapp-caret-handle\{display:none/);
  assert.match(script, /setPointerCapture/);
  assert.match(script, /selection\.addRange\(range\)/);
});
