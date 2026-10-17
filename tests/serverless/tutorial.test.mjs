import test from 'node:test';
import assert from 'node:assert/strict';
import { harness } from './harness.mjs';

async function setup(){
  const h=await harness({extraModules:{tutorial:'lib/editor-core',store:'lib/editor-session',model:'lib/editor-import',view:'lib/editor-renderer',welcome:'lib/welcome',pages:'lib/editor-pages'}});
  h.user={id:901234,language_code:'ar'};h.chat={id:h.user.id,type:'private'};h.messageId=50;h.inputId=100;
  h.state=()=>h.store.readTutorial(h.user.id);
  h.tap=async action=>{const state=await h.state();return h.tutorial.handleTutorialCallback({id:'q'+(++h.inputId),from:h.user,message:{message_id:h.messageId,chat:h.chat},data:action==='open'?'tut:open':h.view.guideCallback(state,action)});};
  h.input=async text=>h.tutorial.handleTutorialMessage({message_id:++h.inputId,from:h.user,chat:h.chat,text});
  await h.tap('open');return h;
}
test('welcome layout, uncluttered guide home and rich options have the required structure',async()=>{
 const h=await setup();const keyboard=h.welcome.buildWelcomeKeyboard('ar').inline_keyboard;
 assert.equal(keyboard[0][0].callback_data,'tut:open');assert.equal(keyboard[1].length,2);
 assert.equal(keyboard[1][0].callback_data,'r:starteditor');assert.ok(keyboard[1][1].url.includes('startgroup'));
 assert.ok(!JSON.stringify(keyboard).includes('r:showcase'));
 const view=h.view.tutorialView(await h.state(),'ar');
 assert.ok(view.rich_message.blocks[1].text.includes('المنشور الغني يتكوّن من بلوكات'));
 const homeKeyboard=view.reply_markup.inline_keyboard;
 assert.deepEqual(Array.from(homeKeyboard,row=>row.length),[2,1]);
 assert.equal(homeKeyboard[0][0].callback_data.split(':').at(-1),'build');
 assert.equal(homeKeyboard[0][1].callback_data.split(':').at(-1),'templates');
 const allBlocks=homeKeyboard[1][0];assert.equal(allBlocks.callback_data,'r:showcase');
 const options=view.rich_message.blocks.find(block=>block.type==='details');
 assert.equal(options.summary,'خيارات إضافية');
 assert.ok(options.blocks.every(block=>block.type==='paragraph'));
 const homeActions=options.blocks.map(block=>block.text[0].button.callback_data.split(':').at(-1));
 for(const action of ['save','cbd','guest','publish'])assert.ok(homeActions.includes(action),action);
 await h.tutorial.pauseTutorialForCommand({chat:h.chat,message_id:h.messageId,from:h.user,data:allBlocks.callback_data});
 assert.equal((await h.state()).active,true);
 await h.tutorial.pauseTutorialForCommand({chat:h.chat,message_id:h.messageId+1,from:h.user,data:allBlocks.callback_data});
 assert.equal((await h.state()).active,false);
});
test('tutorial actions are grouped and bottom navigation restores the preceding menu',async()=>{
 const h=await setup(),base=await h.state();
 for(const step of ['home','build','catalog','choose','inspect','input','preview','advice','templates','template','replace','complete','publish','save','saved','cbd','guest','handoff','paused','save_retry']){
  const state={...base,step,pending:{type:'heading'},inspectType:'heading',template:'heading_table',pageId:'tut_example',pageTitle:'Example'};
  const view=h.view.tutorialView(state,'ar');
  assert.ok(view.reply_markup.inline_keyboard
   .filter((row,index)=>index!==view.reply_markup.inline_keyboard.length-1||row.length!==3)
   .every(row=>row.length<=2),step);
 }
 const paged=h.view.tutorialView({...base,step:'catalog',listOffset:8},'ar');
 const last=paged.reply_markup.inline_keyboard.at(-1);
 const pagedState={...base,step:'catalog',listOffset:8};
 assert.deepEqual(Array.from(last,button=>button.callback_data),[
  h.view.guideCallback(pagedState,'list:0'),
  h.view.guideCallback(pagedState,'back'),
  h.view.guideCallback(pagedState,'list:16'),
 ]);
 const complete=h.view.tutorialView({...base,step:'complete'},'ar');
 assert.deepEqual(Array.from(complete.reply_markup.inline_keyboard,row=>row.length),[2,1]);
 assert.ok(complete.rich_message.blocks.some(block=>block.type==='details'));
 await h.tap('build');await h.tap('choose');await h.tap('list:8');await h.tap('add:slideshow');
 await h.tutorial.handleTutorialMessage({message_id:++h.inputId,from:h.user,chat:h.chat,photo:[{file_id:'guide-photo',width:100,height:100}]});
 await h.tap('mediaDone');
 assert.equal((await h.state()).step,'preview');
 await h.tap('back');assert.equal((await h.state()).step,'choose');assert.equal((await h.state()).listOffset,8);
 await h.tap('back');assert.equal((await h.state()).step,'build');
 await h.tap('back');assert.equal((await h.state()).step,'home');
 assert.ok(h.calls.filter(c=>c.method==='editMessageText').every(c=>c.args.message_id===50));
});
test('full preview includes every block, with a clear fallback for a Telegram-sized overflow',async()=>{
 const h=await setup(),state=await h.state();
 const blocks=Array.from({length:7},(_,index)=>h.model.textBlock('paragraph','Full preview block '+index));
 const full=h.view.tutorialView({...state,step:'preview',blocks},'en');
 for(let index=0;index<blocks.length;index++)assert.ok(JSON.stringify(full.rich_message).includes('Full preview block '+index));
 assert.equal(full.rich_message.blocks.filter(block=>block.type==='divider').length,2);
 const tooLong=h.view.tutorialView({...state,step:'preview',blocks:[h.model.textBlock('paragraph','oversized-preview-'.repeat(2000))]},'en');
 assert.ok(JSON.stringify(tooLong.rich_message).includes('too long to show fully'));
 assert.ok(!JSON.stringify(tooLong.rich_message).includes('oversized-preview-'));
 assert.deepEqual(Array.from(tooLong.reply_markup.inline_keyboard[0],button=>button.callback_data.split(':').at(-1)),['edit','handoff']);
});
test('build, advice and input edit one message; wrappers never enter content',async()=>{
 const h=await setup();await h.tap('build');await h.tap('add:heading');await h.input('عنواني');
 assert.equal((await h.state()).blocks.length,1);
 await h.tap('advice');await h.tap('apply');assert.equal((await h.state()).blocks.length,4);
 const current=await h.state(),serialized=h.view.guideCallback(current,'undo');
 await h.tap('undo');assert.equal((await h.state()).blocks.length,1);
 await h.tutorial.handleTutorialCallback({id:'old',from:h.user,message:{message_id:50,chat:h.chat},data:serialized});
 assert.equal((await h.state()).blocks.length,1);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage'||c.method==='sendMessage').length,0);
 assert.ok(h.calls.filter(c=>c.method==='editMessageText').every(c=>c.args.message_id===50));
 const state=await h.state();assert.equal(state.blocks.filter(b=>b.type==='divider').length,0);
 const view=h.view.tutorialView(state,'ar');assert.equal(view.rich_message.blocks.filter(b=>b.type==='divider').length,2);
});
test('all five templates render, copy independently and include real completed tasks',async()=>{
 const h=await setup();for(const id of h.model.TEMPLATE_IDS){const blocks=h.model.templateBlocks(id,'ar');assert.ok(h.renderer.buildInputRichMessage(blocks).blocks.length);}
 const a=h.model.templateBlocks('task_list','ar'),b=h.model.templateBlocks('task_list','ar');
 assert.equal(a[1].data.items.filter(x=>x.is_checked).length,2);a[0].data.text='changed';assert.notEqual(b[0].data.text,'changed');
 const recipe=h.model.templateBlocks('recipe','ar');assert.equal(recipe[2].type,'slideshow');assert.equal(recipe[2].data.children.length,2);
});
test('publishing lesson names the live editor steps and hands the draft to publish controls',async()=>{
 const h=await setup();await h.tap('build');await h.tap('add:heading');await h.input('عنواني');await h.tap('complete');
 let latest=h.calls.filter(c=>c.method==='editMessageText').at(-1).args;
 assert.ok(JSON.stringify(latest).includes('شلون أنشر؟'));
 await h.tap('publish');assert.equal((await h.state()).step,'publish');
 latest=h.calls.filter(c=>c.method==='editMessageText').at(-1).args;
 for(const label of ['أدوات إضافية','نشر','إعدادات وإرسال','متابعة إلى التأكيد','نعم، انشر الآن'])assert.ok(JSON.stringify(latest.rich_message).includes(label),label);
 await h.tap('handoff');assert.equal((await h.state()).active,false);
 latest=h.calls.filter(c=>c.method==='editMessageText').at(-1).args;
 assert.ok(JSON.stringify(latest.rich_message).includes('أدوات إضافية'));
 assert.ok(JSON.stringify(latest.reply_markup).includes('r:tools'));
});
test('table recommendations are ordered and do not duplicate on repeat',async()=>{
 const h=await setup();let blocks=h.model.templateBlocks('heading_table','ar');
 blocks=h.model.applyAdvice(blocks,'ar');assert.deepEqual(Array.from(blocks,b=>b.type),['heading','table','divider','details']);
 blocks=h.model.applyAdvice(blocks,'ar');const again=h.model.applyAdvice(blocks,'ar');assert.equal(again.length,blocks.length);
 const detailsAlreadyFollowTable=[blocks[0],blocks[1],blocks[3]];
 const updated=h.model.applyAdvice(detailsAlreadyFollowTable,'ar');
 assert.equal(updated.filter(b=>b.type==='details').length,1);
 const detailsLater=[blocks[1],h.model.textBlock('paragraph','Existing content'),h.model.templateBlocks('announcement','ar')[3]];
 assert.equal(h.model.advice(detailsLater,'ar').kind,'none');
 assert.equal(h.model.applyAdvice(detailsLater,'ar').filter(b=>b.type==='details').length,1);
 const separatedTable=[blocks[1],blocks[2],blocks[2]];
 assert.deepEqual(Array.from(h.model.applyAdvice(separatedTable,'ar'),b=>b.type),['table','divider','divider','details']);
});
test('advice preview shows the exact proposed content before applying it',async()=>{
 const h=await setup();let state=await h.state();
 state=await h.store.writeTutorial({...state,blocks:h.model.templateBlocks('heading_table','ar'),step:'advice'},state);
 const before=h.clone(state.blocks),view=h.view.tutorialView(state,'ar');
 assert.equal(h.view.tutorialView({...state,step:'advice'},'ar').reply_markup.inline_keyboard[0][0].callback_data,h.view.guideCallback(state,'apply'));
 assert.equal(JSON.stringify(state.blocks),JSON.stringify(before));
 assert.ok(view.rich_message.blocks.some(block=>block.type==='details'));
 await h.tap('apply');
 assert.deepEqual(Array.from((await h.state()).blocks,b=>b.type),['heading','table','divider','details']);
});
test('heading advice adds body content only when needed and preserves existing blocks',async()=>{
 const h=await setup(),heading=[h.model.textBlock('heading','Heading')];
 const completed=h.model.applyAdvice(heading,'en');
 assert.deepEqual(Array.from(completed,b=>b.type),['heading','paragraph','divider','footer']);
 const withBody=[...heading,h.model.textBlock('paragraph','Body')];
 const finished=h.model.applyAdvice(withBody,'en');
 assert.deepEqual(Array.from(finished,b=>b.type),['heading','paragraph','divider','footer']);
 assert.equal(finished[1].data.text,'Body');
 assert.equal(h.model.advice(finished,'en').kind,'none');
 const misplacedFooter=[...heading,h.model.textBlock('footer','Existing footer'),h.model.textBlock('paragraph','Later content')];
 assert.equal(h.model.advice(misplacedFooter,'en').kind,'none');
 assert.equal(h.model.applyAdvice(misplacedFooter,'en').filter(b=>b.type==='footer').length,1);
});
test('template replacement is explicit, nested editing preserves siblings',async()=>{
 const h=await setup();await h.tap('templates');await h.tap('template:announcement');await h.tap('useTemplate');
 await h.tap('edit');await h.tap('edit:3.0');await h.input('[x] أولى\n[ ] ثانية');
 assert.equal((await h.state()).blocks[3].data.children[0].data.items.length,2);
 await h.tap('open');await h.tap('templates');await h.tap('template:recipe');await h.tap('useTemplate');
 assert.equal((await h.state()).step,'replace');assert.equal((await h.state()).blocks[3].type,'details');
 await h.tap('replaceTemplate');assert.equal((await h.state()).blocks[2].type,'slideshow');
});
test('durable draft is isolated from editor session and protected by ownership and CAS',async()=>{
 const h=await setup();await h.session.createEditorSession(h.user.id,h.user.id,70);
 await h.session.updateEditorSession(h.user.id,{blocks:h.model.templateBlocks('regular_post','ar')});
 const editorBefore=h.clone(await h.session.loadEditorSession(h.user.id));
 await h.tap('templates');await h.tap('template:task_list');await h.tap('useTemplate');await h.tap('complete');await h.tap('handoff');
 assert.equal((await h.state()).step,'handoff');assert.deepEqual(h.clone((await h.session.loadEditorSession(h.user.id)).blocks),editorBefore.blocks);
 const before=await h.state();await h.tutorial.handleTutorialCallback({id:'foreign',from:{id:2},message:{message_id:50,chat:h.chat},data:h.view.guideCallback(before,'home')});
 assert.equal((await h.state()).revision,before.revision);
 await h.store.writeTutorial({...before,step:'home'},before);await assert.rejects(()=>h.store.writeTutorial(before,before),/TUTORIAL_CONFLICT/);
});
test('saving uses shared persistence; replay of save intent does not create two pages',async()=>{
 const h=await setup();await h.tap('templates');await h.tap('template:regular_post');await h.tap('useTemplate');await h.tap('complete');await h.tap('save');await h.input('صفحتي');
 const state=await h.state();assert.equal(state.step,'saved');assert.equal(h.records.richPages.length,1);
 assert.equal(h.records.richPages[0].blocks.length,4);assert.equal(h.records.richPages[0].ownerId,h.user.id);
 const id=await h.pages.persistPage(h.user.id,'صفحتي',{blocks:state.blocks,messageButtons:[],buttonsPerRow:1,buttonsAlign:'center'},null,{reservedId:state.pageId});
 assert.equal(id,state.pageId);assert.equal(h.records.richPages.length,1);
 await h.tap('back');assert.equal((await h.state()).step,'complete');
 await h.tap('cbd');const view=h.view.tutorialView(await h.state(),'ar');assert.ok(JSON.stringify(view).includes('CBD:'+state.pageId));
 assert.ok(!JSON.stringify(view).includes('switch_inline'));
});
test('duplicate input, pause and commands never consume or repeat content',async()=>{
 const h=await setup();await h.tap('build');await h.tap('add:heading');
 const message={message_id:++h.inputId,from:h.user,chat:h.chat,text:'واحد'};
 await h.tutorial.handleTutorialMessage(message);await h.tutorial.handleTutorialMessage(message);assert.equal((await h.state()).blocks.length,1);
 await h.tutorial.pauseTutorialForCommand({...message,text:'/start'});
 assert.equal(await h.tutorial.handleTutorialMessage({...message,message_id:++h.inputId,text:'لا تلتقطه'}),false);
 await h.tap('open');assert.equal((await h.state()).blocks.length,1);
});
test('render error retains applied mutation and does not resend on ambiguous transport failure',async()=>{
 const h=await setup();await h.tap('build');await h.tap('add:heading');h.apiState.editError='network timeout';
 await assert.rejects(()=>h.input('محتوى محفوظ'),/network timeout/);
 assert.equal((await h.state()).blocks.length,1);assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,0);
 h.apiState.editError=null;await h.tap('open');assert.equal((await h.state()).blocks.length,1);
});
test('catalog previews do not mutate the draft, and CBD demo keeps the guide wrapper',async()=>{
 const h=await setup();await h.tap('catalog');await h.tap('inspect:heading');
 assert.equal((await h.state()).blocks.length,0);
 const sample=h.calls.filter(c=>c.method==='editMessageText').at(-1).args.rich_message;
 assert.ok(sample.blocks.some(b=>b.type==='divider'));
 await h.tap('add:heading');await h.input('عنوان');await h.tap('complete');await h.tap('save');await h.input('للتجربة');await h.tap('cbd');await h.tap('trycbd');
 const view=h.calls.filter(c=>c.method==='editMessageText').at(-1).args.rich_message;
 assert.equal(view.blocks.filter(b=>b.type==='divider').length,2);
 assert.ok(JSON.stringify(view).includes('عنوان'));assert.equal((await h.state()).step,'cbd');
 const state=await h.state(),button=h.text.inlineButtonRichText('{افتح الصفحة - CBD:'+state.pageId+' #b}');
 assert.ok(JSON.stringify(button).includes(state.pageId));
 assert.ok(JSON.stringify(button).includes('callback_data'));
});
test('album inputs can arrive out of order, are deduplicated and preserve display order',async()=>{
 const h=await setup();await h.tap('build');await h.tap('choose');
 await h.tap('list:8');await h.tap('add:slideshow');
 const input=id=>({message_id:id,from:h.user,chat:h.chat,photo:[{file_id:'photo-'+id,width:100,height:100}]});
 await h.tutorial.handleTutorialMessage(input(700));await h.tutorial.handleTutorialMessage(input(699));await h.tutorial.handleTutorialMessage(input(700));
 assert.equal((await h.state()).pending.children.length,2);
 await h.tap('mediaDone');assert.equal((await h.state()).blocks[0].data.children.length,2);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,0);
});
test('429 creates a cooldown without resending',async()=>{
 const h=await setup();h.apiState.editError='Too Many Requests: retry after 30';await h.tap('build');
 assert.ok((await h.state()).renderAfter>Math.floor(Date.now()/1000));
 const calls=h.calls.filter(c=>c.method==='editMessageText').length;await h.tap('open');
 assert.equal(h.calls.filter(c=>c.method==='editMessageText').length,calls);
 assert.equal(h.calls.filter(c=>c.method==='sendRichMessage').length,0);
});
test('lease contention retries input instead of silently dropping it',async()=>{
 const h=await setup();await h.tap('build');await h.tap('add:heading');
 const lock=await h.session.acquireEditorMutationLock(h.user.id);
 await assert.rejects(()=>h.input('لا يضيع'),/TUTORIAL_BUSY_RETRY/);
 await h.session.releaseEditorMutationLock(lock);await h.input('لا يضيع');
 assert.equal((await h.state()).blocks.length,1);
});
test('stale save revision cannot overwrite a page edited elsewhere',async()=>{
 const h=await setup();await h.tap('templates');await h.tap('template:regular_post');await h.tap('useTemplate');await h.tap('complete');await h.tap('save');await h.input('صفحة محمية');
 const state=await h.state();h.records.richPages[0].revision+=1;
 h.records.richPages[0].blocks=h.clone(h.model.templateBlocks('task_list','ar'));
 await assert.rejects(()=>h.pages.persistPage(h.user.id,state.pageTitle,{blocks:state.blocks,messageButtons:[]},state.pageId,{expectedRevision:state.pageRevision}),/PAGE_CONFLICT/);
 assert.equal(h.records.richPages[0].blocks.length,2);
});
test('CBD lesson requires saving changes instead of showing a stale page',async()=>{
 const h=await setup();await h.tap('templates');await h.tap('template:regular_post');await h.tap('useTemplate');await h.tap('complete');await h.tap('save');await h.input('قبل التعديل');
 await h.tap('open');await h.tap('preview');await h.tap('edit');await h.tap('edit:0');await h.input('بعد التعديل');await h.tap('complete');await h.tap('cbd');
 const view=h.view.tutorialView(await h.state(),'ar');assert.ok(!JSON.stringify(view).includes('CBD:tut_'));
 assert.ok(JSON.stringify(view).includes('احفظ الصفحة أولاً'));
});
