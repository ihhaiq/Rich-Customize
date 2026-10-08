import test from 'node:test';
import assert from 'node:assert/strict';
import '../../app/miniapp_static/publish_validation.js';

const check = globalThis.RichPublishValidation.checkPage;
const block = (type, data) => ({ type, data });
test('photo must have a Telegram file_id before publish', () => {
  assert.equal(check({ blocks: [block('photo', {file:{file_id:''}})] })[0].code, 'missing_file');
  assert.equal(check({ blocks: [block('photo', {file:{file_id:'abc123'}})] }).length, 0);
});
test('all file block types reject missing file_id', () => {
  for (const type of ['photo','video','animation','audio','voice','document']) {
    assert.equal(check({ blocks: [block(type, {file:{file_id:''}})] })[0].code, 'missing_file');
  }
});
test('text and structural blocks report missing content', () => {
  for (const type of ['paragraph','heading','footer','preformatted','blockquote','pullquote']) {
    assert.equal(check({ blocks: [block(type, {text:''})] })[0].code, 'missing_text');
  }
  assert.equal(check({ blocks: [block('mathematical_expression', {text:''})] })[0].code, 'missing_expression');
  for (const type of ['details','collage','slideshow']) {
    assert.equal(check({ blocks: [block(type, {children:[]})] })[0].code, 'missing_children');
  }
  assert.equal(check({ blocks: [block('table', {rows:[['','']]})] })[0].code, 'missing_cells');
  assert.equal(check({ blocks: [block('list', {items:[]})] })[0].code, 'missing_items');
});
test('map validates coordinates, including missing initial selection', () => {
  assert.equal(check({blocks:[block('map',{latitude:0,longitude:0,_draft:true})]})[0].code,'missing_coordinates');
  assert.equal(check({blocks:[block('map',{latitude:95,longitude:0})]})[0].code,'invalid_coordinates');
  assert.equal(check({blocks:[block('map',{latitude:0,longitude:0,_draft:false})]}).length,0);
});
test('nested media issues are located by top-level block and child path', () => {
  const issues=check({blocks:[{id:'parent',type:'details',data:{children:[block('photo',{file:{file_id:''}})]}}]});
  assert.equal(issues[0].code,'missing_file');
  assert.equal(issues[0].topId,'parent');
  assert.deepEqual(issues[0].path,[1,1]);
});
test('valid blocks can enable sending', () => {
  assert.equal(check({blocks:[
    block('paragraph',{text:'Hello'}),
    block('divider',{}),
    block('photo',{file:{file_id:'file_id'}}),
  ]}).length,0);
});
test('native blocks validate their media files', () => {
  assert.equal(check({blocks:[block('photo',{native:true,native_data:{type:'photo',photo:{file_id:''}}})]})[0].code,'missing_file');
});
