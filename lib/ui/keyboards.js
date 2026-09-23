import { t } from 'lib/i18n';
import { getBlockButtonText, tableFlag, tableRows } from 'lib/blocks';
import { anchorTargetId, anchorTargets } from 'lib/editor/anchors';
import { MEDIA_CAPTION_TYPES, QUOTE_TYPES, compatibleChildBlockTypes } from 'lib/editor/specs';
import { buttonRows, getButtonType, getButtonValue, getMessageButton, normalizeButtonPositions } from 'lib/buttons';

export const ADD_GROUP_URL='https://t.me/RichCustomizebot?startgroup=true';
export const ADD_CHANNEL_URL='https://t.me/RichCustomizebot?startchannel&admin=post_messages+edit_messages+delete_messages';
export const BLOCK_SCROLL_SIZE=8;

function tx(key,language,values={}){return t(key,{language,...values});}
function disabled(text){return {text,disabled:{}};}
function style(value){return ['primary','success','danger'].includes(value)?value:undefined;}
export function welcomeKeyboard(language='en'){return {inline_keyboard:[
  [{text:tx('welcome.add_group_button',language),url:ADD_GROUP_URL}],
  [{text:tx('editor.showcase_button',language),callback_data:'r:showcase'},{text:tx('editor.new_button',language),callback_data:'r:starteditor',style:'primary'}],
]};}
export function startEditorKeyboard(language='en'){return {inline_keyboard:[[{text:tx('editor.start_button',language),callback_data:'r:starteditor',style:'primary'}]]};}

export function richEditorKeyboard(blocks,buttons=[],{offset=0,language='en'}={}){
  const ordered=[...(blocks??[])].sort((a,b)=>Number(a.position??0)-Number(b.position??0));
  if(!ordered.length)return {inline_keyboard:[[
    {text:tx('pages',language),callback_data:'r:pages'},
    {text:tx('ux.editor.add_block',language),callback_data:'r:addmenu',style:'primary'},
  ]]};
  const last=Math.max(0,Math.floor((ordered.length-1)/BLOCK_SCROLL_SIZE)*BLOCK_SCROLL_SIZE);
  const safe=Math.min(Math.max(0,Number(offset)||0),last);
  const visible=ordered.slice(safe,safe+BLOCK_SCROLL_SIZE),rows=[];
  if(safe>0)rows.push([{text:tx('editor.scroll_up',language),callback_data:'r:blockscroll:'+Math.max(0,safe-BLOCK_SCROLL_SIZE)}]);
  visible.forEach((block,index)=>{
    const main={text:getBlockButtonText(block,safe+index,language),callback_data:'r:b:'+block.id,...(block.type==='divider'?{style:'primary'}:{})};
    rows.push(block.type==='divider'?[main]:[{text:'👁︎',callback_data:'r:peek:'+block.id},main]);
  });
  if(safe+BLOCK_SCROLL_SIZE<ordered.length)rows.push([{text:tx('editor.scroll_down',language),callback_data:'r:blockscroll:'+(safe+BLOCK_SCROLL_SIZE)}]);
  rows.push([{text:tx('ux.editor.preview',language),callback_data:'r:result',style:'primary'}]);
  if(ordered.length>=2)rows.push([{text:tx('editor.undo_button',language),callback_data:'r:undo'},{text:tx('editor.redo_button',language),callback_data:'r:redo'}]);
  rows.push([{text:tx('editor.tools_button',language),callback_data:'r:tools',style:'primary'}]);
  rows.push([{text:tx('ux.editor.add_block',language),callback_data:'r:addmenu',style:'primary'},{text:tx('ux.editor.publish',language),callback_data:'r:post',style:'success'}]);
  return {inline_keyboard:rows};
}
export function editorToolsKeyboard(language='en'){return {inline_keyboard:[
  [{text:tx('pages',language),callback_data:'r:pages'},{text:tx('ux.editor.manage_buttons',language),callback_data:'r:buttons'}],
  [{text:tx('save_page',language),callback_data:'r:savepage',style:'success'}],
  [{text:tx('ux.common.back',language),callback_data:'r:back'}],
]};}
export function resultKeyboard(language='en'){return {inline_keyboard:[[{text:tx('result',language),callback_data:'r:result',style:'success'}]]};}
export function errorRecoveryKeyboard(language='en'){return {inline_keyboard:[[{text:tx('ux.common.retry',language),callback_data:'r:result',style:'primary'},{text:tx('ux.common.back',language),callback_data:'r:back'}]]};}

export function addBlockKeyboard(language='en'){
  const choices=[['block.paragraph','paragraph'],['block.heading','heading'],['block.preformatted','preformatted'],['block.footer','footer'],['block.divider','divider'],['block.mathematical_expression','mathematical_expression'],['block.anchor','anchor'],['list.menu_button','listmenu'],['block.blockquote','blockquote'],['block.pullquote','pullquote'],['block.collage','collage'],['block.slideshow','slideshow'],['block.table','table'],['block.details','details'],['block.map','map'],['block.animation','animation'],['block.audio','audio'],['block.photo','photo'],['block.document','document'],['block.video','video'],['block.voice','voice']];
  const rows=[];for(let i=0;i<choices.length;i+=2)rows.push(choices.slice(i,i+2).map(([key,kind])=>({text:tx(key,language),callback_data:'r:add:'+kind})));
  rows.push([{text:tx('ux.common.back',language),callback_data:'r:back'}]);return {inline_keyboard:rows};
}
export function listTypeKeyboard({prefix='r:addlist',back='r:addmenu',language='en'}={}){return {inline_keyboard:[
  [{text:tx('list.bullet',language),callback_data:prefix+':bullet'}],
  [{text:tx('list.numbered',language),callback_data:prefix+':numbered'}],
  [{text:tx('list.checklist',language),callback_data:prefix+':checklist'}],
  [{text:tx('common.cancel',language),callback_data:back}],
]};}
export function headingLevelKeyboard(action,blockId=null,language='en'){const rows=[];for(let start=1;start<=6;start+=2)rows.push([start,start+1].filter(x=>x<=6).map(level=>({text:tx('heading.level_'+level,language),callback_data:'r:hs:'+action+':'+level+(blockId?':'+blockId:'')})));const back=action==='add'?'r:addmenu':action==='details'?'r:details:add':'r:b:'+blockId;rows.push([{text:tx('ux.common.back',language),callback_data:back}]);return {inline_keyboard:rows};}
export function blockEditorKeyboard(block,blocks,language='en'){
  const id=String(block.id),ordered=[...(blocks??[])].sort((a,b)=>Number(a.position??0)-Number(b.position??0)),position=ordered.findIndex(x=>x.id===block.id),linked=block.type==='anchor'&&Boolean(anchorTargetId(block)),rows=[[{text:tx('preview_block',language),callback_data:'r:pv:'+id,style:'primary'}]];
  if(block.type!=='divider')rows.push([{text:tx(block.type==='details'?'edit_content':'edit',language),callback_data:'r:e:'+id}]);
  if(block.type==='anchor')rows.push([{text:tx('anchor.change_target',language),callback_data:'r:am:'+id}]);
  if(block.type==='details'){rows.push([{text:tx('details.edit_title_button',language),callback_data:'r:f:'+id+':summary'}]);rows.push([{text:tx('details.inner_manage_button',language),callback_data:'r:dim:'+id,style:'primary'}]);}
  if(block.type==='table')rows.push([{text:tx('table.cell_settings_button',language),callback_data:'r:tm:'+id}]);
  if(block.type==='list'&&block.data?.kind==='checklist')for(const [i,item] of (block.data.items??[]).entries()){const checked=Boolean(item?.is_checked),task=String(item?.text??tx('list.unnamed_task',language)).slice(0,48);rows.push([{text:(checked?'☑️ ':'☐ ')+task,callback_data:'r:ct:'+id+':'+i,...(checked?{style:'success'}:{})}]);}
  if(MEDIA_CAPTION_TYPES.includes?.(block.type)||MEDIA_CAPTION_TYPES?.includes?.(block.type)){rows.push([{text:tx('media.edit_caption_button',language),callback_data:'r:f:'+id+':caption'},{text:tx('media.edit_source_button',language),callback_data:'r:f:'+id+':credit'}]);}
  if(QUOTE_TYPES.includes?.(block.type))rows.push([{text:tx('quote.edit_author_button',language),callback_data:'r:f:'+id+':credit'}]);
  rows.push([{text:tx('delete',language),callback_data:'r:d:'+id,style:'danger'}]);
  if(!linked)rows.push([position<=0?disabled(tx('block.move_up',language)):{text:tx('block.move_up',language),callback_data:'r:mu:'+id},position>=ordered.length-1?disabled(tx('block.move_down',language)):{text:tx('block.move_down',language),callback_data:'r:md:'+id}]);
  rows.push([{text:tx('ux.common.back',language),callback_data:'r:back'}]);return {inline_keyboard:rows};
}
export function deleteConfirmationKeyboard(id,language='en'){return {inline_keyboard:[[{text:tx('ux.common.yes_delete',language),callback_data:'r:dc:'+id,style:'danger'},{text:tx('ux.common.cancel',language),callback_data:'r:b:'+id}]]};}
export function blockPositionKeyboard(blocks,id,language='en'){const rows=[...(blocks??[])].sort((a,b)=>Number(a.position??0)-Number(b.position??0)).map((block,i)=>block.id===id?[disabled('✅ '+(i+1))]:[{text:String(i+1),callback_data:'r:mt:'+id+':'+i}]);rows.push([{text:tx('ux.common.back',language),callback_data:'r:b:'+id}]);return {inline_keyboard:rows};}
export function anchorTargetKeyboard(blocks,{prefix='r:at',excludeIds=[],back='r:addmenu',language='en'}={}){const ordered=[...(blocks??[])].sort((a,b)=>Number(a.position??0)-Number(b.position??0)),rows=anchorTargets(ordered,{excludeIds}).map(block=>[{text:getBlockButtonText(block,ordered.indexOf(block),language),callback_data:prefix+':'+block.id}]);rows.push([{text:tx('common.cancel',language),callback_data:back}]);return {inline_keyboard:rows};}

export function pagesKeyboard({showControls=false,showPager=false,pageIndex=0,totalPages=1,prefix='r:pages',language='en'}={}){const rows=[];if(showPager){const total=Math.max(1,totalPages),index=Math.min(Math.max(0,pageIndex),total-1);rows.push([{text:'⬅️',callback_data:prefix+':'+Math.max(0,index-1)},{text:(index+1)+'/'+total,callback_data:prefix+':'+index},{text:'➡️',callback_data:prefix+':'+Math.min(total-1,index+1)}]);}if(showControls)rows.push([{text:tx('pages.search_button',language),callback_data:'r:psearch'},{text:tx('pages.sort_button',language),callback_data:'r:psort'}]);rows.push([{text:tx('ux.common.back',language),callback_data:'r:back'}]);return {inline_keyboard:rows};}
export function pageSortKeyboard(current,language='en'){const choices=[['pages.sort_updated','updated'],['pages.sort_newest','newest'],['pages.sort_oldest','oldest'],['pages.sort_title','title']];return {inline_keyboard:[...choices.map(([key,value])=>[{text:(current===value?'✅ ':'')+tx(key,language),callback_data:'r:psortset:'+value,...(current===value?{style:'primary'}:{})}]),[{text:tx('ux.common.back',language),callback_data:'r:pages:0'}]]};}
export function pageDeleteKeyboard(id,index,language='en'){return {inline_keyboard:[[{text:tx('pages.delete_yes',language),callback_data:'r:pdeleteok:'+id+':'+index,style:'danger'},{text:tx('common.cancel',language),callback_data:'r:pages:'+index}]]};}
export function pageRestoreKeyboard(index,language='en'){return {inline_keyboard:[[{text:tx('ux.pages.restore',language),callback_data:'r:prestore',style:'success'}],[{text:tx('ux.common.back',language),callback_data:'r:pages:'+index}]]};}

const BUTTON_TYPE_KEYS={url:'ux.buttons.type.url',callback_data:'ux.buttons.type.callback',copy:'ux.buttons.type.copy',popup:'ux.buttons.type.popup',web_app:'ux.buttons.type.web_app',login_url:'ux.buttons.type.login_url',switch_inline:'ux.buttons.type.inline',switch_inline_current:'ux.buttons.type.inline_here',disabled:'ux.buttons.type.disabled',page:'ux.buttons.type.page'};
export function buttonTypeLabel(button,language='en'){return tx(BUTTON_TYPE_KEYS[getButtonType(button)]??'ux.buttons.type.url',language);}
export function buttonStyleLabel(button,language='en'){const s=['default','primary','success','danger'].includes(button?.style)?button.style:'default';return tx('ux.buttons.style.'+s,language);}
export function renderedMessageButtons(buttons,{buttonsPerRow=1,includeBack=false,backText=null,sourcePageId=null,navigationToken=null,extraRows=[],language='en'}={}){
  const rendered=normalizeButtonPositions(buttons).map(button=>{const common={text:String(button.text??'Button'),...(style(button.style)?{style:style(button.style)}:{})},type=getButtonType(button),value=getButtonValue(button);if(type==='copy')return {...common,copy_text:{text:value}};if(type==='callback_data')return {...common,callback_data:value};if(type==='popup')return {...common,callback_data:'r:popup:'+(button.popup_token??button.id)};if(type==='web_app')return {...common,web_app:{url:value}};if(type==='login_url')return {...common,login_url:{url:value}};if(type==='switch_inline')return {...common,switch_inline_query:value};if(type==='switch_inline_current')return {...common,switch_inline_query_current_chat:value};if(type==='disabled')return {...common,disabled:{}};if(type==='page'){const parts=[button.audience==='subscribers'?'r:spage':'r:page',value];if(sourcePageId){parts.push(sourcePageId);if(navigationToken)parts.push(navigationToken);}return {...common,callback_data:parts.join(':')};}return {...common,url:value||'https://t.me'};});
  const rows=[];let offset=0;for(const row of buttonRows(buttons,buttonsPerRow)){rows.push(rendered.slice(offset,offset+row.length));offset+=row.length;}rows.push(...extraRows);if(includeBack)rows.push([{text:backText??tx('ux.common.back',language),callback_data:'r:bpback'}]);return {inline_keyboard:rows};
}
export function buttonsManagerKeyboard(buttons,perRow=1,language='en'){const ordered=normalizeButtonPositions(buttons),rows=ordered.map((button,i)=>[{text:tx('ux.buttons.summary',language,{position:i+1,title:String(button.text??'Button').slice(0,24),type:buttonTypeLabel(button,language),style:buttonStyleLabel(button,language)}),callback_data:'r:bed:'+button.id}]);rows.push([{text:tx('ux.buttons.add',language),callback_data:'r:ba',style:'primary'}],[{text:(buttons.some(x=>Object.hasOwn(x,'row_end'))?tx('ux.buttons.layout_custom',language):tx('ux.buttons.layout',language,{count:perRow})),callback_data:'r:brow'}],[{text:tx('button_preview',language)+' ('+ordered.length+')',callback_data:'r:bpreview',style:'primary'}],[{text:tx('ux.buttons.undo',language),callback_data:'r:undo'}],[{text:tx('ux.common.back',language),callback_data:'r:back'}]);return {inline_keyboard:rows};}
export function buttonEditorKeyboard(button,language='en'){const id=String(button.id);return {inline_keyboard:[[{text:tx('ux.buttons.edit_title',language),callback_data:'r:bedit:title:'+id},{text:tx('ux.buttons.edit_value',language),callback_data:'r:bedit:value:'+id}],[{text:tx('ux.buttons.edit_type',language),callback_data:'r:bedit:type:'+id},{text:tx('color',language),callback_data:'r:bedit:style:'+id}],[{text:tx('reorder',language),callback_data:'r:bedit:move:'+id}],[{text:tx('ux.buttons.delete',language),callback_data:'r:bdel:'+id,style:'danger'}],[{text:tx('ux.common.back',language),callback_data:'r:buttons'}]]};}
export function buttonTypeKeyboard(prefix,language='en'){const rows=[[disabled(tx('ux.buttons.category.links',language))],[{text:tx('ux.buttons.type.url',language),callback_data:prefix+':url'}],[{text:tx('ux.buttons.type.web_app',language),callback_data:prefix+':web_app'},{text:tx('ux.buttons.type.login_url',language),callback_data:prefix+':login_url'}],[disabled(tx('ux.buttons.category.actions',language))],[{text:tx('ux.buttons.type.callback',language),callback_data:prefix+':callback_data'},{text:tx('ux.buttons.type.copy',language),callback_data:prefix+':copy'}],[{text:tx('ux.buttons.type.popup',language),callback_data:prefix+':popup'}],[disabled(tx('ux.buttons.category.navigation',language))],[{text:tx('ux.buttons.type.page',language),callback_data:prefix+':page'}],[disabled(tx('ux.buttons.category.search',language))],[{text:tx('ux.buttons.type.inline',language),callback_data:prefix+':switch_inline'},{text:tx('ux.buttons.type.inline_here',language),callback_data:prefix+':switch_inline_current'}],[disabled(tx('ux.buttons.category.special',language))],[{text:tx('ux.buttons.type.disabled',language),callback_data:prefix+':disabled'}],[{text:tx('ux.common.back',language),callback_data:'r:buttons'}]];return {inline_keyboard:rows};}
export function buttonStyleKeyboard(id,current,language='en'){if(current==='link')current='default';const choices=[['⚪ '+tx('ux.buttons.style.default',language),'default'],['🔵 '+tx('ux.buttons.style.primary',language),'primary'],['🟢 '+tx('ux.buttons.style.success',language),'success'],['🔴 '+tx('ux.buttons.style.danger',language),'danger']];return {inline_keyboard:[...choices.map(([text,value])=>[{text:(current===value?'✅ ':'')+text,callback_data:'r:bsc:'+id+':'+value,...(style(value)?{style:value}:{})}]),[{text:tx('ux.common.back',language),callback_data:'r:buttons'}]]};}
export function buttonPositionKeyboard(buttons,id,language='en'){const current=getMessageButton(buttons,id),rows=normalizeButtonPositions(buttons).map((button,i)=>button===current?[disabled('✅ '+(i+1)+' — '+(button.text??'Button'))]:[{text:(i+1)+' — '+(button.text??'Button'),callback_data:'r:bmv:'+id+':'+i}]);rows.push([{text:tx('ux.common.back',language),callback_data:'r:buttons'}]);return {inline_keyboard:rows};}
export function pageTargetKeyboard(pages,action,id=null,language='en'){const prefix='r:bpg:'+action+(id?':'+id:'');const rows=pages.map(page=>[{text:'📄 '+(page.title??page.page_id),callback_data:prefix+':'+page.page_id}]);rows.push([{text:tx('ux.common.back',language),callback_data:'r:buttons'}]);return {inline_keyboard:rows};}

export function postChatsKeyboard(chats,selectedIds=[],language='en'){const selected=new Set(selectedIds.map(Number)),rows=[];for(const chat of chats){const id=Number(chat.chat_id),on=selected.has(id),icon=chat.type==='channel'?'📢':'👥';rows.push([{text:(on?'✅':'⬜')+' '+icon+' '+(chat.title??id),callback_data:'r:postchat:'+id,...(on?{style:'success'}:{style:'primary'})}]);}if(chats.length)rows.push([{text:tx('publish.settings_send',language)+' ('+selected.size+')',callback_data:'r:postsettings',style:'success'}]);rows.push([{text:tx('publish.add_bot_channel',language),url:ADD_CHANNEL_URL,style:'primary'},{text:tx('publish.add_bot_group',language),url:ADD_GROUP_URL,style:'primary'}],[{text:tx('ux.common.back',language),callback_data:'r:back'}]);return {inline_keyboard:rows};}
export function postSettingsKeyboard({silent=false,protectedContent=false,count=1,language='en'}={}){return {inline_keyboard:[[{text:tx(silent?'ux.publish.silent_on':'ux.publish.silent_off',language),callback_data:'r:pt:silent',...(silent?{style:'success'}:{})}],[{text:tx(protectedContent?'ux.publish.protected_on':'ux.publish.protected_off',language),callback_data:'r:pt:protected',...(protectedContent?{style:'success'}:{})}],[{text:tx('ux.publish.send',language,{count}),callback_data:'r:postconfirm',style:'success'}],[{text:tx('ux.common.back',language),callback_data:'r:postlist'}]]};}
export function postConfirmationKeyboard(count,language='en'){return {inline_keyboard:[[{text:tx('ux.publish.confirm_yes',language,{count}),callback_data:'r:postsend',style:'success'}],[{text:tx('ux.common.cancel',language),callback_data:'r:postsettings'}]]};}

export function developerKeyboard(){return {inline_keyboard:[[{text:'📤 رفع واستيراد',callback_data:'dev:import',style:'success'},{text:'📥 تنزيل وتصدير',callback_data:'dev:export',style:'primary'}]]};}
export function developerImportConfirmationKeyboard(){return {inline_keyboard:[[{text:'✅ تأكيد الاستيراد',callback_data:'dev:import:confirm',style:'danger'},{text:'❌ إلغاء',callback_data:'dev:import:cancel'}]]};}
