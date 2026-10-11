import test from 'node:test';
import {readFileSync} from 'node:fs';
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


const appSource=readFileSync(new URL('../../app/miniapp_static/app.js',import.meta.url),'utf8');
const liveSource=readFileSync(new URL('../../app/miniapp_static/live_preview.js',import.meta.url),'utf8');

function evaluateSendButtonState(blocks) {
  const start=appSource.indexOf('function updatePublishValidity(){');
  const end=appSource.indexOf('\nfunction openPublishIssues(){',start);
  assert.ok(start>=0&&end>start,'publish validator exists in app.js');
  const send={
    disabled:true,title:'',attributes:{},classes:new Set(),
    setAttribute(name,value){this.attributes[name]=value},
    classList:{toggle(name,on){if(on)send.classes.add(name);else send.classes.delete(name)}},
  };
  const issueBtn={textContent:'',classes:new Set(),classList:{
    toggle(name,on){if(on)issueBtn.classes.add(name);else issueBtn.classes.delete(name)},
  }};
  const scope=new Function(
    'window','current','sendIssuesBtn','blocksEl','$','mt','BLOCKS','issueLabel',
    'let publishIssues=[];'+appSource.slice(start,end)
      +';return {updatePublishValidity,issues:()=>publishIssues};',
  )(
    {RichPublishValidation:{checkPage:check}},
    {blocks},
    issueBtn,
    {querySelectorAll:()=>[]},
    id=>id==='sendBtn'?send:null,
    (key,args)=>key==='send.issues_button'?args.count+' مشكلة في الرسالة':key,
    [{type:'animation',label:'GIF'},{type:'paragraph',label:'نص'}],
    issue=>'البلوك '+String(issue.index+1),
  );
  scope.updatePublishValidity();
  return {send,issueBtn,issues:scope.issues()};
}

test('a saved page with a valid GIF enables the previously disabled send button',()=>{
  const {send,issues,issueBtn}=evaluateSendButtonState([
    {id:'gif',type:'animation',data:{file:{file_id:'telegram-file-123'}}},
  ]);
  assert.equal(issues.length,0);
  assert.equal(send.disabled,false);
  assert.equal(send.attributes['aria-disabled'],'false');
  assert.equal(issueBtn.classes.has('hidden'),true);
});

test('an invalid companion block never silently disables send; issues stay accessible',()=>{
  const {send,issues,issueBtn}=evaluateSendButtonState([
    {id:'empty',type:'paragraph',data:{text:''}},
    {id:'gif',type:'animation',data:{file:{file_id:'telegram-file-123'}}},
  ]);
  assert.equal(issues.length,1);
  assert.equal(issues[0].code,'missing_text');
  assert.equal(send.disabled,false,'the user can tap send to read what is wrong');
  assert.equal(send.classes.has('has-publish-issues'),true);
  assert.equal(issueBtn.classes.has('hidden'),false,'issues control is visible');
  assert.match(send.title,/missing_text/);
});

test('live renderer revalidates after drawing saved page and restored offline draft',()=>{
  const from=liveSource.indexOf('renderBlocks = function() {');
  const until=liveSource.indexOf('\n// Contextual cell/row/column tools',from);
  assert.ok(from>=0&&until>from);
  assert.match(liveSource.slice(from,until),/if\(typeof updatePublishValidity==="function"\)updatePublishValidity\(\)/);
  assert.match(appSource,/if\(publishIssues\.length\)\{openPublishIssues\(\);return\}/);
  assert.match(appSource,/\$\("sendBtn"\)\.onclick=openSendPanel/);
});
