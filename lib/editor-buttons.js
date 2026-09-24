import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { richPages } from 'schema';
import {
  loadEditorSession,
  rememberEditorState,
  updateEditorSession,
} from 'lib/editor-session';
import {
  buildMessageButtonsKeyboard,
  prepareMessageButtons,
} from 'lib/page-buttons';

const MAX_BUTTONS = 100;
const BUTTON_STYLES = new Set(['default', 'primary', 'success', 'danger', 'link']);
const BUTTON_TYPES = new Set([
  'url', 'callback_data', 'copy', 'popup', 'web_app', 'login_url',
  'switch_inline', 'switch_inline_current', 'disabled', 'page',
]);
const TYPE_ALIASES = {
  url: 'url', link: 'url', 'رابط': 'url',
  callback: 'callback_data', callback_data: 'callback_data',
  callbackdata: 'callback_data', cb: 'callback_data',
  copy: 'copy', 'نسخ': 'copy',
  popup: 'popup', alert: 'popup', 'تنبيه': 'popup',
  web_app: 'web_app', webapp: 'web_app',
  login_url: 'login_url', login: 'login_url',
  switch_inline: 'switch_inline', switch_inline_query: 'switch_inline',
  inline: 'switch_inline',
  switch_inline_current: 'switch_inline_current',
  switch_inline_query_current_chat: 'switch_inline_current',
  inline_here: 'switch_inline_current', current: 'switch_inline_current',
  cbd: 'page', page: 'page', 'صفحة': 'page',
  disabled: 'disabled', 'معطل': 'disabled', 'معطّل': 'disabled',
};

function code(source) {
  return source?.from?.language_code || 'en';
}
function ar(languageCode) {
  return String(languageCode || '').toLowerCase().startsWith('ar');
}
function copy(languageCode) {
  if (ar(languageCode)) {
    return {
      title: 'إدارة الأزرار',
      count: (n) => 'عدد الأزرار: ' + n,
      empty: 'لا توجد أزرار بعد.',
      choose: 'اختر العملية:',
      add: '➕ إضافة زر',
      layout: (n) => 'تخطيط الأزرار: ' + n + ' بكل صف',
      layoutCustom: 'تخطيط الأزرار: مخصص',
      preview: '👁 معاينة الأزرار',
      undo: '↩️ تراجع',
      back: '🔙 رجوع',
      editTitle: 'تعديل العنوان',
      editValue: 'تعديل المحتوى',
      editType: 'تغيير النوع',
      color: 'اللون',
      reorder: 'إعادة الترتيب',
      delete: 'حذف',
      yesDelete: 'نعم، حذف',
      cancel: 'إلغاء',
      added: '✅ تمت إضافة الزر.',
      deleted: 'تم حذف الزر.',
      missing: 'هذا الزر لم يعد موجودًا.',
      invalid: 'اختيار غير صالح.',
      sendFormat: 'أرسل الزر بهذه الصيغة:\n{ اسم الزر - النوع: المحتوى }',
      invalidFormat: 'صيغة الزر غير صحيحة.',
      sendTitle: 'أرسل عنوان الزر الجديد.',
      sendValue: 'أرسل محتوى الزر الجديد.',
      invalidText: 'أرسل قيمة نصية صحيحة.',
      longTitle: 'عنوان الزر طويل جدًا؛ الحد الأقصى 64 حرفًا.',
      max: 'وصلت إلى الحد الأقصى للأزرار.',
      noPreview: 'لا توجد أزرار لمعاينتها.',
      previewText: 'معاينة الأزرار',
      closedPreview: 'تم إغلاق المعاينة',
      typeChanged: '✅ تم تغيير نوع الزر.',
      titleChanged: '✅ تم تغيير عنوان الزر.',
      valueChanged: '✅ تم تغيير محتوى الزر.',
      valueTypeChanged: '✅ تم تغيير محتوى الزر ونوعه تلقائيًا.',
      styleChanged: '✅ تم تغيير لون الزر.',
      positionChanged: '✅ تم تغيير ترتيب الزر.',
      pageLinked: (title) => '✅ تم ربط الزر بالصفحة «' + title + '».',
      pageMissing: 'كود الصفحة غير موجود أو لا يخصك.',
      savePageFirst: 'احفظ صفحة أولاً حتى تربط الزر بها.',
      choosePage: 'اختر الصفحة التي يفتحها الزر:',
      editing: (title) => 'تعديل الزر: ' + title,
      currentType: (type) => 'النوع الحالي: ' + type,
      types: {
        url:'رابط', callback_data:'Callback', copy:'نسخ', popup:'تنبيه',
        web_app:'Web App', login_url:'Login URL', switch_inline:'Inline',
        switch_inline_current:'Inline هنا', disabled:'معطل', page:'صفحة',
      },
      styles: {default:'افتراضي',primary:'أزرق',success:'أخضر',danger:'أحمر'},
      layoutHint: 'اختر عدد الأزرار في كل صف:',
      customHint: 'حدد عدد الأزرار لكل صف:',
      custom: 'تخصيص كل صف',
      row: (n) => 'الصف ' + n,
    };
  }
  return {
    title:'Manage buttons', count:(n)=>'Buttons: '+n, empty:'No buttons yet.',
    choose:'Choose an action:', add:'➕ Add button', layout:(n)=>'Buttons per row: '+n,
    layoutCustom:'Button layout: custom', preview:'👁 Preview buttons', undo:'↩️ Undo',
    back:'🔙 Back', editTitle:'Edit title', editValue:'Edit value', editType:'Change type',
    color:'Color', reorder:'Reorder', delete:'Delete', yesDelete:'Yes, delete',
    cancel:'Cancel', added:'✅ Button added.', deleted:'Button deleted.',
    missing:'This button no longer exists.', invalid:'Invalid selection.',
    sendFormat:'Send the button as:\n{ button name - type: content }',
    invalidFormat:'Invalid button format.', sendTitle:'Send the new button title.',
    sendValue:'Send the new button value.', invalidText:'Send a valid text value.',
    longTitle:'Button title is too long; maximum 64 characters.',
    max:'You reached the maximum number of buttons.', noPreview:'There are no buttons to preview.',
    previewText:'Button preview', closedPreview:'Preview closed',
    typeChanged:'✅ Button type changed.', titleChanged:'✅ Button title changed.',
    valueChanged:'✅ Button value changed.', valueTypeChanged:'✅ Button value and type changed automatically.',
    styleChanged:'✅ Button color changed.', positionChanged:'✅ Button order changed.',
    pageLinked:(title)=>'✅ Button linked to page “'+title+'”.',
    pageMissing:'The page code does not exist or does not belong to you.',
    savePageFirst:'Save a page first so you can link the button to it.',
    choosePage:'Choose the page opened by this button:',
    editing:(title)=>'Editing button: '+title, currentType:(type)=>'Current type: '+type,
    types:{url:'URL',callback_data:'Callback',copy:'Copy',popup:'Popup',web_app:'Web App',
      login_url:'Login URL',switch_inline:'Inline',switch_inline_current:'Inline here',
      disabled:'Disabled',page:'Page'},
    styles:{default:'Default',primary:'Blue',success:'Green',danger:'Red'},
    layoutHint:'Choose how many buttons per row:', customHint:'Choose the size of each row:',
    custom:'Customize each row', row:(n)=>'Row '+n,
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function uuid10() {
  const raw = globalThis.crypto?.randomUUID?.() || (Math.random().toString(16).slice(2) + Date.now().toString(16));
  return String(raw).replaceAll('-', '').slice(0, 10);
}
function normalize(buttons) {
  buttons.sort((a,b)=>Number(a?.position||0)-Number(b?.position||0));
  buttons.forEach((button,index)=>{
    button.position=index;
    if (!BUTTON_STYLES.has(String(button.style||'default'))) button.style='default';
  });
  return buttons;
}
function getButton(buttons,id) {
  return (buttons||[]).find((b)=>String(b?.id)===String(id)) || null;
}
function buttonType(button) {
  const value=String(button?.type||'url');
  return BUTTON_TYPES.has(value)?value:'url';
}
function buttonValue(button) {
  return button?.value!=null?String(button.value):String(button?.url||'');
}
function utf8Len(value) {
  let n=0;
  for (const ch of String(value||'')) {
    const cp=ch.codePointAt(0);
    n += cp<=0x7f?1:cp<=0x7ff?2:cp<=0xffff?3:4;
  }
  return n;
}
function normalizeUrl(value) {
  let raw=String(value||'').trim();
  if (!raw || /\s/.test(raw)) return null;
  if (/^@[A-Za-z0-9_]{5,32}$/.test(raw)) return 'https://t.me/'+raw.slice(1);
  if (!raw.includes('://') && /^(?:[\w-]+\.)+[\w-]+(?::[0-9]+)?(?:[/?#]|$)/u.test(raw)) raw='https://'+raw;
  const http=raw.match(/^https?:\/\/([^/?#]+)(?:[/?#]|$)/i);
  if (http) {
    let host=http[1].split('@').at(-1);
    if (host.startsWith('[')) host=host.slice(1,host.indexOf(']'));
    else host=host.split(':')[0];
    if (!host) return null;
    if (!host.includes('.') && /^[A-Za-z0-9_]{5,32}$/.test(host) && !raw.replace(/^https?:\/\/[^/]+\/?$/i,'')) return 'https://t.me/'+host;
    return host.includes('.')?raw:null;
  }
  return /^tg:(?:\/\/)?[^?#\s]+(?:[?#].*)?$/i.test(raw)?raw:null;
}
function infer(value,current='url') {
  const raw=String(value||'').trim();
  const compact=raw.toLowerCase().replace(/[\s-]+/g,'_');
  if (['disabled','معطل','معطّل'].includes(compact)) return ['disabled',''];
  const m=raw.match(/^([\w\u0600-\u06ff -]+?)\s*:\s*([\s\S]*)$/u);
  if (m) {
    const alias=m[1].trim().toLowerCase().replace(/[\s-]+/g,'_');
    if (TYPE_ALIASES[alias]) return [TYPE_ALIASES[alias],m[2].trim()];
  }
  if (normalizeUrl(raw)) return ['url',raw];
  return [BUTTON_TYPES.has(current)?current:'url',raw];
}
function parseSpec(value) {
  const m=String(value||'').trim().match(/^\{([^{}]+)\}$/s);
  if (!m) return null;
  const body=m[1].trim();
  let parts=body.split(/\s+[-–—]\s+/,2);
  if (parts.length!==2) parts=body.split(/[-–—]/,2);
  if (parts.length!==2) return null;
  const title=parts[0].trim(), spec=parts[1].trim();
  if (!title || title.includes('\n') || !spec) return null;
  const [type,content]=infer(spec);
  if (!content && !['disabled','switch_inline','switch_inline_current'].includes(type)) return null;
  return [title,type,content];
}
function validateValue(type,value,languageCode) {
  const c=copy(languageCode);
  if (type==='disabled') return ['',null];
  if (type==='url') {
    const v=normalizeUrl(value);
    return v && v.length<=256 ? [v,null] : [null, ar(languageCode)?'الرابط غير صالح.':'Invalid URL.'];
  }
  if (type==='web_app'||type==='login_url') {
    const v=normalizeUrl(value);
    return v?.startsWith('https://') && v.length<=256 ? [v,null] : [null, ar(languageCode)?'هذا النوع يحتاج رابط HTTPS صالح.':'This type requires a valid HTTPS URL.'];
  }
  if (type==='page') return /^[A-Za-z0-9_-]{1,64}$/.test(String(value||'').trim())
    ? [String(value).trim(),null] : [null,c.pageMissing];
  if (type==='copy' && String(value).length>256) return [null,ar(languageCode)?'نص النسخ طويل جدًا؛ الحد الأقصى 256 حرفًا.':'Copy text is too long; maximum 256 characters.'];
  if (type==='callback_data' && !(utf8Len(value)>=1 && utf8Len(value)<=64)) return [null,ar(languageCode)?'قيمة callback_data يجب أن تكون بين 1 و64 بايت.':'callback_data must be between 1 and 64 bytes.'];
  if (type==='popup' && String(value).length>200) return [null,ar(languageCode)?'نص التنبيه طويل جدًا؛ الحد الأقصى 200 حرف.':'Popup text is too long; maximum 200 characters.'];
  if (type==='switch_inline'||type==='switch_inline_current') {
    const v=String(value).trim().toLowerCase()==='/empty'?'':String(value);
    return v.length<=256?[v,null]:[null,ar(languageCode)?'استعلام Inline طويل جدًا؛ الحد الأقصى 256 حرفًا.':'Inline query is too long; maximum 256 characters.'];
  }
  return BUTTON_TYPES.has(type)?[String(value),null]:[null,c.invalid];
}
function changeType(button,type,value) {
  button.type=type; button.value=value; delete button.popup_token;
  if (['url','web_app','login_url'].includes(type)) button.url=value; else delete button.url;
  if (button.style==='link' && type!=='popup') button.style='default';
}
function rows(buttons,width=1) {
  const ordered=normalize(clone(buttons||[]));
  const safe=Math.max(1,Math.min(8,Number(width)||1));
  const result=[]; let row=[];
  for(const b of ordered) {
    row.push(b);
    const limit=Object.hasOwn(b,'row_end')?8:safe;
    if (b.row_end || row.length>=limit) {result.push(row);row=[];}
  }
  if(row.length)result.push(row);
  return result;
}
function setRowWidth(buttons,width,rowIndex,count) {
  const grouped=rows(buttons,width);
  if(rowIndex<0||rowIndex>=grouped.length||count<1||count>8)throw new Error('bad row');
  const ordered=normalize(buttons);
  const sizes=grouped.map(r=>r.length); sizes[rowIndex]=count;
  ordered.forEach(b=>{b.row_end=false;});
  let offset=0;
  for(const size of sizes){if(offset>=ordered.length)break;offset=Math.min(ordered.length,offset+size);ordered[offset-1].row_end=true;}
  while(offset<ordered.length){offset=Math.min(ordered.length,offset+Math.max(1,Math.min(8,Number(width)||1)));ordered[offset-1].row_end=true;}
}
async function ownedPage(userId,pageId) {
  const page=await db.select().from(richPages).where(eq(richPages.pageId,String(pageId))).get();
  return page && Number(page.ownerId)===Number(userId)?page:null;
}
async function ownedPages(userId) {
  return db.select().from(richPages).where(eq(richPages.ownerId,Number(userId))).all();
}
async function edit(query,text,markup) {
  try {
    await api.editMessageText({chat_id:query.message.chat.id,message_id:query.message.message_id,text,reply_markup:markup});
  } catch(error) {
    if(!String(error?.description||error?.message||error).toLowerCase().includes('message is not modified'))throw error;
  }
}
async function editSaved(userId,session,text,markup) {
  const chatId=session.managementChatId||session.chatId, messageId=session.managementMessageId;
  try {
    await api.editMessageText({chat_id:chatId,message_id:messageId,text,reply_markup:markup});
  } catch(error) {
    if(String(error?.description||error?.message||error).toLowerCase().includes('message is not modified'))return;
    const sent=await api.sendMessage({chat_id:chatId,text,reply_markup:markup});
    await updateEditorSession(userId,{managementChatId:sent.chat?.id||chatId,managementMessageId:sent.message_id});
  }
}
function managerText(buttons,languageCode,notice=null) {
  const c=copy(languageCode), lines=[];
  if(notice)lines.push(notice,'');
  lines.push(c.title,c.count(buttons.length),'',buttons.length?c.choose:c.empty);
  return lines.join('\n');
}
function typeLabel(button,c){return c.types[buttonType(button)]||c.types.url;}
function styleLabel(button,c){return c.styles[String(button?.style||'default')]||c.styles.default;}
function managerKeyboard(buttons,width,languageCode) {
  const c=copy(languageCode), ordered=normalize(buttons);
  const out=ordered.map((b,i)=>[{text:(i+1)+'. '+String(b.text||'Button').slice(0,24)+' · '+typeLabel(b,c)+' · '+styleLabel(b,c),callback_data:'r:bed:'+b.id}]);
  out.push([{text:c.add,callback_data:'r:ba',style:'primary'}]);
  out.push([{text:buttons.some(b=>Object.hasOwn(b,'row_end'))?c.layoutCustom:c.layout(width),callback_data:'r:brow'}]);
  out.push([{text:c.preview+' ('+ordered.length+')',callback_data:'r:bpreview',style:'primary'}]);
  out.push([{text:c.undo,callback_data:'r:undo'}]);
  out.push([{text:c.back,callback_data:'r:back'}]);
  return {inline_keyboard:out};
}
function editorKeyboard(button,languageCode) {
  const c=copy(languageCode), id=String(button.id);
  return {inline_keyboard:[
    [{text:c.editTitle,callback_data:'r:bedit:title:'+id},{text:c.editValue,callback_data:'r:bedit:value:'+id}],
    [{text:c.editType,callback_data:'r:bedit:type:'+id},{text:c.color,callback_data:'r:bedit:style:'+id}],
    [{text:c.reorder,callback_data:'r:bedit:move:'+id}],
    [{text:c.delete,callback_data:'r:bdel:'+id,style:'danger'}],
    [{text:c.back,callback_data:'r:buttons'}],
  ]};
}
function editorText(button,languageCode){const c=copy(languageCode);return [c.editing(button.text||'Button'),c.currentType(typeLabel(button,c)),'',c.choose].join('\n');}
function inputKeyboard(languageCode){return {inline_keyboard:[[{text:copy(languageCode).back,callback_data:'r:buttons'}]]};}
function typeKeyboard(prefix,languageCode) {
  const c=copy(languageCode);
  return {inline_keyboard:[
    [{text:c.types.url,callback_data:prefix+':url'}],
    [{text:c.types.web_app,callback_data:prefix+':web_app'},{text:c.types.login_url,callback_data:prefix+':login_url'}],
    [{text:c.types.callback_data,callback_data:prefix+':callback_data'},{text:c.types.copy,callback_data:prefix+':copy'}],
    [{text:c.types.popup,callback_data:prefix+':popup'}],
    [{text:c.types.page,callback_data:prefix+':page'}],
    [{text:c.types.switch_inline,callback_data:prefix+':switch_inline'},{text:c.types.switch_inline_current,callback_data:prefix+':switch_inline_current'}],
    [{text:c.types.disabled,callback_data:prefix+':disabled'}],
    [{text:c.back,callback_data:'r:buttons'}],
  ]};
}
function styleKeyboard(id,current,languageCode) {
  const c=copy(languageCode); if(current==='link')current='default';
  return {inline_keyboard:['default','primary','success','danger'].map(style=>[{
    text:(current===style?'✅ ':'')+c.styles[style],callback_data:'r:bsc:'+id+':'+style,
    ...({primary:'primary',success:'success',danger:'danger'}[style]?{style}:{})
  }]).concat([[{text:c.back,callback_data:'r:buttons'}]])};
}
function positionKeyboard(buttons,id,languageCode) {
  const c=copy(languageCode), ordered=normalize(buttons), current=getButton(ordered,id);
  const result=ordered.map((b,i)=>[{text:(b===current?'✅ ':'')+(i+1)+' — '+String(b.text||'Button'),...(b===current?{disabled:{}}:{callback_data:'r:bmv:'+id+':'+i})}]);
  result.push([{text:c.back,callback_data:'r:buttons'}]);return {inline_keyboard:result};
}
function pageKeyboard(pages,id,languageCode) {
  const c=copy(languageCode);
  const result=pages.map(p=>[{text:'📄 '+String(p.title||p.pageId),callback_data:'r:bpg:change:'+id+':'+p.pageId}]);
  result.push([{text:c.back,callback_data:'r:buttons'}]);return {inline_keyboard:result};
}
function deleteKeyboard(id,languageCode){const c=copy(languageCode);return {inline_keyboard:[[{text:c.yesDelete,callback_data:'r:bdelok:'+id,style:'danger'},{text:c.cancel,callback_data:'r:bed:'+id}]]};}
function layoutUi(buttons,width,languageCode,custom=false,page=0) {
  const c=copy(languageCode), blocks=[{type:'paragraph',text:custom?c.customHint:c.layoutHint}], nav=[];
  if(custom){
    const grouped=rows(buttons,width), last=Math.max(0,Math.floor((grouped.length-1)/8));page=Math.max(0,Math.min(page,last));
    const cells=[];
    for(let i=page*8;i<Math.min(grouped.length,(page+1)*8);i++){
      const remaining=grouped.slice(i).reduce((n,r)=>n+r.length,0);
      cells.push([{text:c.row(i+1),align:'center',valign:'middle'},...Array.from({length:8},(_,j)=>{
        const count=j+1;if(count>remaining)return {text:'—',align:'center',valign:'middle'};
        return {text:{type:'button',button:{text:String(count),callback_data:'r:browcustom:'+i+':'+count+':'+page,...(grouped[i].length===count?{style:'primary'}:{})}},align:'center',valign:'middle'};
      })]);
    }
    if(cells.length)blocks.push({type:'table',cells,is_compact:true,is_bordered:true});
    else blocks.push({type:'paragraph',text:c.empty});
    if(last){const row=[];if(page)row.push({text:'⬅️',callback_data:'r:browcustompage:'+(page-1)});if(page<last)row.push({text:'➡️',callback_data:'r:browcustompage:'+(page+1)});if(row.length)nav.push(row);}
  } else {
    const customActive=buttons.some(b=>Object.hasOwn(b,'row_end'));
    const cells=[[1,2,3,4],[5,6,7,8]].map(group=>group.map(n=>({text:{type:'button',button:{text:String(n),callback_data:'r:browset:'+n,...(!customActive&&Number(width)===n?{style:'primary'}:{})}},align:'center',valign:'middle'})));
    blocks.push({type:'table',cells,is_compact:true,is_bordered:true});
    blocks.push({type:'paragraph',text:{type:'button',button:{text:c.custom,callback_data:'r:browcustompage:0',style:'primary'}}});
  }
  nav.push([{text:c.back,callback_data:custom?'r:brow':'r:buttons'}]);
  return [{blocks}, {inline_keyboard:nav}];
}
async function saveDraft(userId,before,changes) {
  const after={...before,...changes};
  const old=JSON.stringify({buttons:before.messageButtons,width:before.buttonsPerRow,align:before.buttonsAlign});
  const next=JSON.stringify({buttons:after.messageButtons,width:after.buttonsPerRow,align:after.buttonsAlign});
  if(old===next)return before;
  await rememberEditorState(userId,before);
  return updateEditorSession(userId,changes);
}
async function prompt(query,userId,text,changes) {
  await updateEditorSession(userId,{state:'editing_button',...changes});
  await edit(query,text,inputKeyboard(code(query)));
}
function promptForType(type,languageCode) {
  if(ar(languageCode)) return {
    url:'أرسل الرابط الجديد؛ يقبل @username أيضًا.',callback_data:'أرسل callback_data الجديدة؛ الحد الأقصى 64 بايت.',
    copy:'أرسل النص الذي تريد نسخه؛ الحد الأقصى 256 حرفًا.',popup:'أرسل نص التنبيه؛ الحد الأقصى 200 حرف.',
    web_app:'أرسل رابط Web App يبدأ بـ https://',login_url:'أرسل رابط HTTPS من الدومين المربوط عبر @BotFather ثم /setdomain.',
    switch_inline:'أرسل استعلام Inline، أو /empty.',switch_inline_current:'أرسل استعلام Inline للمحادثة الحالية، أو /empty.',
  }[type];
  return {url:'Send the new URL; @username is accepted.',callback_data:'Send callback_data; maximum 64 bytes.',
    copy:'Send the text to copy; maximum 256 characters.',popup:'Send popup text; maximum 200 characters.',
    web_app:'Send an HTTPS Web App URL.',login_url:'Send an HTTPS URL from the domain connected in BotFather.',
    switch_inline:'Send an Inline query, or /empty.',switch_inline_current:'Send an Inline query for this chat, or /empty.'}[type];
}

export async function handleEditorButtonCallback(query) {
  const data=String(query?.data||'');
  const relevant=data==='r:buttons'||data==='r:ba'||data==='r:brow'||data==='r:bpreview'||data==='r:bpback'
    ||data.startsWith('r:bed:')||data.startsWith('r:bdel:')||data.startsWith('r:bdelok:')
    ||data.startsWith('r:bedit:')||data.startsWith('r:bct:')||data.startsWith('r:bsc:')
    ||data.startsWith('r:bmv:')||data.startsWith('r:bpg:')||data.startsWith('r:browset:')
    ||data.startsWith('r:browcustom:')||data.startsWith('r:browcustompage:');
  if(!relevant)return false;
  const userId=query?.from?.id, languageCode=code(query), c=copy(languageCode);
  const session=await loadEditorSession(userId); if(!session)return false;

  if(data==='r:buttons'){
    await updateEditorSession(userId,{state:'managing',currentButtonId:null,pendingButtonAction:null,pendingButtonText:null,pendingButtonType:null,blockScrollEnabled:0});
    await edit(query,managerText(session.messageButtons||[],languageCode),managerKeyboard(session.messageButtons||[],session.buttonsPerRow,languageCode));
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data==='r:ba'){
    if((session.messageButtons||[]).length>=MAX_BUTTONS){await api.answerCallbackQuery({callback_query_id:query.id,text:c.max,show_alert:true});return true;}
    await prompt(query,userId,c.sendFormat,{pendingButtonAction:'add_spec',currentButtonId:null,pendingButtonText:null,pendingButtonType:null});
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data.startsWith('r:bed:')){
    const id=data.slice(6), b=getButton(session.messageButtons||[],id);
    if(!b){await api.answerCallbackQuery({callback_query_id:query.id,text:c.missing,show_alert:true});return true;}
    await updateEditorSession(userId,{currentButtonId:id});
    await edit(query,editorText(b,languageCode),editorKeyboard(b,languageCode));
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data.startsWith('r:bdelok:')){
    const id=data.slice(9), buttons=clone(session.messageButtons||[]), b=getButton(buttons,id);
    if(!b){await api.answerCallbackQuery({callback_query_id:query.id,text:c.missing,show_alert:true});return true;}
    buttons.splice(buttons.indexOf(b),1);normalize(buttons);
    const updated=await saveDraft(userId,session,{messageButtons:buttons,currentButtonId:null});
    await edit(query,managerText(buttons,languageCode,c.deleted),managerKeyboard(buttons,updated.buttonsPerRow,languageCode));
    await api.answerCallbackQuery({callback_query_id:query.id,text:c.deleted});return true;
  }
  if(data.startsWith('r:bdel:')){
    const id=data.slice(7), b=getButton(session.messageButtons||[],id);
    if(!b){await api.answerCallbackQuery({callback_query_id:query.id,text:c.missing,show_alert:true});return true;}
    await edit(query,(ar(languageCode)?'هل تريد حذف الزر «':'Delete button “')+String(b.text||'Button')+(ar(languageCode)?'»؟':'”?'),deleteKeyboard(id,languageCode));
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data.startsWith('r:bedit:')){
    const parts=data.split(':'), action=parts[2],id=parts[3],b=getButton(session.messageButtons||[],id);
    if(!b){await api.answerCallbackQuery({callback_query_id:query.id,text:c.missing,show_alert:true});return true;}
    if(action==='style')await edit(query,c.editing(b.text||'Button'),styleKeyboard(id,String(b.style||'default'),languageCode));
    else if(action==='move')await edit(query,c.editing(b.text||'Button'),positionKeyboard(clone(session.messageButtons||[]),id,languageCode));
    else if(action==='type'){await updateEditorSession(userId,{currentButtonId:id});await edit(query,c.editing(b.text||'Button'),typeKeyboard('r:bct:'+id,languageCode));}
    else if(action==='title'||action==='value')await prompt(query,userId,action==='title'?c.sendTitle:c.sendValue,{pendingButtonAction:action,currentButtonId:id});
    else {await api.answerCallbackQuery({callback_query_id:query.id,text:c.invalid,show_alert:true});return true;}
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data.startsWith('r:bct:')){
    const parts=data.split(':'),id=parts[2],type=parts[3],b=getButton(session.messageButtons||[],id);
    if(!b||!BUTTON_TYPES.has(type)){await api.answerCallbackQuery({callback_query_id:query.id,text:c.invalid,show_alert:true});return true;}
    if(type==='disabled'){
      const buttons=clone(session.messageButtons||[]);changeType(getButton(buttons,id),'disabled','');
      const updated=await saveDraft(userId,session,{messageButtons:buttons,state:'managing',currentButtonId:null});
      await edit(query,managerText(buttons,languageCode,c.typeChanged),managerKeyboard(buttons,updated.buttonsPerRow,languageCode));
    }else if(type==='page'){
      const pages=await ownedPages(userId);if(!pages.length){await api.answerCallbackQuery({callback_query_id:query.id,text:c.savePageFirst,show_alert:true});return true;}
      await edit(query,c.choosePage,pageKeyboard(pages,id,languageCode));
    }else{
      await prompt(query,userId,promptForType(type,languageCode),{currentButtonId:id,pendingButtonAction:'change_type_value',pendingButtonType:type});
    }
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data.startsWith('r:bsc:')){
    const parts=data.split(':'),id=parts[2],style=parts[3],buttons=clone(session.messageButtons||[]),b=getButton(buttons,id);
    if(!b||!BUTTON_STYLES.has(style)||style==='link'){await api.answerCallbackQuery({callback_query_id:query.id,text:c.invalid,show_alert:true});return true;}
    b.style=style;const updated=await saveDraft(userId,session,{messageButtons:buttons});
    await edit(query,managerText(buttons,languageCode,c.styleChanged),managerKeyboard(buttons,updated.buttonsPerRow,languageCode));
    await api.answerCallbackQuery({callback_query_id:query.id,text:c.styleChanged});return true;
  }
  if(data.startsWith('r:bmv:')){
    const parts=data.split(':'),id=parts[2],to=Number(parts[3]),buttons=normalize(clone(session.messageButtons||[])),b=getButton(buttons,id);
    if(!b||!Number.isInteger(to)||to<0||to>=buttons.length){await api.answerCallbackQuery({callback_query_id:query.id,text:c.invalid,show_alert:true});return true;}
    const old=buttons.indexOf(b);if(old!==to)buttons.splice(to,0,buttons.splice(old,1)[0]);normalize(buttons);
    const updated=await saveDraft(userId,session,{messageButtons:buttons});
    await edit(query,managerText(buttons,languageCode,c.positionChanged),managerKeyboard(buttons,updated.buttonsPerRow,languageCode));
    await api.answerCallbackQuery({callback_query_id:query.id,text:c.positionChanged});return true;
  }
  if(data.startsWith('r:bpg:')){
    const parts=data.split(':');if(parts[2]!=='change'||parts.length!==5){await api.answerCallbackQuery({callback_query_id:query.id,text:c.invalid,show_alert:true});return true;}
    const id=parts[3],pageId=parts[4],page=await ownedPage(userId,pageId),buttons=clone(session.messageButtons||[]),b=getButton(buttons,id);
    if(!page){await api.answerCallbackQuery({callback_query_id:query.id,text:c.pageMissing,show_alert:true});return true;}
    if(!b){await api.answerCallbackQuery({callback_query_id:query.id,text:c.missing,show_alert:true});return true;}
    changeType(b,'page',pageId);const updated=await saveDraft(userId,session,{messageButtons:buttons,state:'managing',currentButtonId:null,pendingButtonAction:null,pendingButtonText:null,pendingButtonType:null});
    await edit(query,managerText(buttons,languageCode,c.pageLinked(page.title||pageId)),managerKeyboard(buttons,updated.buttonsPerRow,languageCode));
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data==='r:brow'||data.startsWith('r:browset:')||data.startsWith('r:browcustom:')||data.startsWith('r:browcustompage:')){
    let buttons=clone(session.messageButtons||[]),width=Number(session.buttonsPerRow||1),custom=data.startsWith('r:browcustom'),page=0;
    if(data.startsWith('r:browset:')){
      const n=Number(data.split(':')[2]);if(!Number.isInteger(n)||n<1||n>8){await api.answerCallbackQuery({callback_query_id:query.id,text:c.invalid,show_alert:true});return true;}
      width=n;buttons.forEach(b=>delete b.row_end);await saveDraft(userId,session,{messageButtons:buttons,buttonsPerRow:width});
    }else if(data.startsWith('r:browcustompage:')) page=Math.max(0,Number(data.split(':')[2])||0);
    else if(data.startsWith('r:browcustom:')){
      const parts=data.split(':'),row=Number(parts[2]),count=Number(parts[3]);page=Math.max(0,Number(parts[4])||0);
      try{setRowWidth(buttons,width,row,count);}catch{await api.answerCallbackQuery({callback_query_id:query.id,text:c.invalid,show_alert:true});return true;}
      await saveDraft(userId,session,{messageButtons:buttons});
    }
    const [rich,markup]=layoutUi(buttons,width,languageCode,custom,page);
    await api.editMessageText({chat_id:query.message.chat.id,message_id:query.message.message_id,rich_message:rich,reply_markup:markup});
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data==='r:bpreview'){
    if(!(session.messageButtons||[]).length){await api.answerCallbackQuery({callback_query_id:query.id,text:c.noPreview,show_alert:true});return true;}
    const prepared=await prepareMessageButtons(session.messageButtons||[]);
    const sent=await api.sendMessage({chat_id:userId,text:c.previewText,reply_markup:buildMessageButtonsKeyboard(prepared,{buttonsPerRow:session.buttonsPerRow,includeBack:true,backText:c.back})});
    if(session.buttonPreviewMessageId && Number(session.buttonPreviewMessageId)!==Number(sent.message_id)){try{await api.deleteMessage({chat_id:userId,message_id:session.buttonPreviewMessageId});}catch{}}
    await updateEditorSession(userId,{buttonPreviewMessageId:sent.message_id});
    await api.answerCallbackQuery({callback_query_id:query.id});return true;
  }
  if(data==='r:bpback'){
    if(query.message?.chat?.id&&query.message?.message_id){try{await api.deleteMessage({chat_id:query.message.chat.id,message_id:query.message.message_id});}catch{}}
    await updateEditorSession(userId,{buttonPreviewMessageId:null});
    await api.answerCallbackQuery({callback_query_id:query.id,text:c.closedPreview});return true;
  }
  return false;
}

export async function handleEditorButtonMessage(message) {
  const userId=message?.from?.id;if(!userId)return false;
  const session=await loadEditorSession(userId);if(!session||session.state!=='editing_button')return false;
  const languageCode=code(message),c=copy(languageCode),value=String(message?.text||'').trim();
  if(!value){await api.sendMessage({chat_id:message.chat.id,text:c.invalidText});return true;}
  if(session.pendingButtonAction==='title'&&value.length>64){await api.sendMessage({chat_id:message.chat.id,text:c.longTitle});return true;}

  let buttons=clone(session.messageButtons||[]),notice;
  const action=String(session.pendingButtonAction||'');
  if(action==='add_spec'){
    const spec=parseSpec(value);if(!spec){await api.sendMessage({chat_id:message.chat.id,text:c.invalidFormat});return true;}
    const [title,type,raw]=spec;if(title.length>64){await api.sendMessage({chat_id:message.chat.id,text:c.longTitle});return true;}
    const [normalized,error]=validateValue(type,raw,languageCode);if(error||normalized==null){await api.sendMessage({chat_id:message.chat.id,text:error||c.invalid});return true;}
    if(type==='page'&&!await ownedPage(userId,normalized)){await api.sendMessage({chat_id:message.chat.id,text:c.pageMissing});return true;}
    if(buttons.length>=MAX_BUTTONS){await api.sendMessage({chat_id:message.chat.id,text:c.max});await updateEditorSession(userId,{state:'managing'});return true;}
    buttons.push({id:uuid10(),text:title,type,value:normalized,style:'default',position:buttons.length,...(['url','web_app','login_url'].includes(type)?{url:normalized}:{})});
    notice=c.added;
  }else{
    const b=getButton(buttons,String(session.currentButtonId||''));if(!b){await api.sendMessage({chat_id:message.chat.id,text:c.missing});await updateEditorSession(userId,{state:'managing'});return true;}
    if(action==='change_type_value'){
      const type=String(session.pendingButtonType||''),[normalized,error]=validateValue(type,value,languageCode);if(error||normalized==null){await api.sendMessage({chat_id:message.chat.id,text:error||c.invalid});return true;}
      if(type==='page'&&!await ownedPage(userId,normalized)){await api.sendMessage({chat_id:message.chat.id,text:c.pageMissing});return true;}
      changeType(b,type,normalized);notice=c.typeChanged;
    }else if(action==='title'){b.text=value;notice=c.titleChanged;
    }else if(action==='value'){
      const old=buttonType(b),[type,raw]=infer(value,old),[normalized,error]=validateValue(type,raw,languageCode);if(error||normalized==null){await api.sendMessage({chat_id:message.chat.id,text:error||c.invalid});return true;}
      if(type==='page'&&!await ownedPage(userId,normalized)){await api.sendMessage({chat_id:message.chat.id,text:c.pageMissing});return true;}
      changeType(b,type,normalized);notice=type!==old?c.valueTypeChanged:c.valueChanged;
    }else{await api.sendMessage({chat_id:message.chat.id,text:ar(languageCode)?'انتهت عملية تعديل الزر. ارجع إلى لوحة الإدارة وحاول مجددًا.':'Button editing ended. Return to the manager and try again.'});await updateEditorSession(userId,{state:'managing'});return true;}
  }

  await rememberEditorState(userId,session);
  const updated=await updateEditorSession(userId,{messageButtons:normalize(buttons),state:'managing',currentButtonId:null,pendingButtonAction:null,pendingButtonText:null,pendingButtonType:null});
  try{await api.deleteMessage({chat_id:message.chat.id,message_id:message.message_id});}catch{}
  await editSaved(userId,updated,managerText(updated.messageButtons,languageCode,notice),managerKeyboard(updated.messageButtons,updated.buttonsPerRow,languageCode));
  return true;
}
