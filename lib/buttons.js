export const BUTTON_STYLES = new Set(['default','primary','success','danger','link']);
export const BUTTON_TYPES = new Set([
  'url','callback_data','copy','popup','web_app','login_url',
  'switch_inline','switch_inline_current','disabled','page',
]);
export const MAX_BUTTONS = 100;

const TYPE_ALIASES = new Map(Object.entries({
  url:'url', link:'url', 'رابط':'url',
  callback:'callback_data', callback_data:'callback_data', callbackdata:'callback_data', cb:'callback_data',
  copy:'copy', 'نسخ':'copy',
  popup:'popup', alert:'popup', 'تنبيه':'popup',
  web_app:'web_app', webapp:'web_app',
  login_url:'login_url', login:'login_url',
  switch_inline:'switch_inline', switch_inline_query:'switch_inline', inline:'switch_inline',
  switch_inline_current:'switch_inline_current',
  switch_inline_query_current_chat:'switch_inline_current',
  inline_here:'switch_inline_current', current:'switch_inline_current',
  cbd:'page', page:'page', 'صفحة':'page',
  disabled:'disabled', 'معطل':'disabled', 'معطّل':'disabled',
}));

function randomId() {
  return (Date.now().toString(16)+Math.floor(Math.random()*1e12).toString(16)).slice(-10);
}

export function normalizePageCode(value) {
  const code=String(value??'').trim();
  return /^[A-Za-z0-9_-]{1,64}$/.test(code)?code:null;
}

export function normalizeButtonPositions(buttons) {
  buttons.sort((a,b)=>Number(a?.position??0)-Number(b?.position??0));
  return reindexButtons(buttons);
}

export function reindexButtons(buttons) {
  buttons.forEach((button,index)=>{
    button.position=index;
    if(!BUTTON_STYLES.has(button.style)) button.style='default';
  });
  return buttons;
}

export function getMessageButton(buttons,buttonId) {
  return (buttons??[]).find((button)=>button?.id===buttonId)??null;
}

export function getButtonType(button) {
  const value=String(button?.type??'url');
  return BUTTON_TYPES.has(value)?value:'url';
}

export function getButtonValue(button) {
  return String(button?.value??button?.url??'');
}

export function normalizeButtonUrl(value) {
  let url=String(value??'').trim();
  if(!url||/\s/.test(url)) return null;
  if(/^@[A-Za-z0-9_]{5,32}$/.test(url)) return 'https://t.me/'+url.slice(1);
  if(!url.includes('://') && /^(?:[\w-]+\.)+[\w-]+(?::\d+)?(?:[/?#]|$)/.test(url)) url='https://'+url;
  if(/^tg:\/\//i.test(url)) return url;
  if(!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed=new URL(url);
    if(!parsed.hostname.includes('.')) {
      if(/^[A-Za-z0-9_]{5,32}$/.test(parsed.hostname) && !parsed.pathname.replaceAll('/','')) {
        return 'https://t.me/'+parsed.hostname;
      }
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function normalizeHttpsUrl(value) {
  const url=normalizeButtonUrl(value);
  return url&&url.startsWith('https://')?url:null;
}

export function inferButtonTypeAndValue(value,currentType='url') {
  const raw=String(value??'').trim();
  const compact=raw.toLocaleLowerCase().replace(/[\s-]+/g,'_');
  if(['disabled','معطل','معطّل'].includes(compact)) return ['disabled',''];
  const typed=raw.match(/^([\w\u0600-\u06ff -]+?)\s*:\s*([\s\S]*)$/);
  if(typed) {
    const alias=typed[1].trim().toLocaleLowerCase().replace(/[\s-]+/g,'_');
    const type=TYPE_ALIASES.get(alias);
    if(type) return [type,typed[2].trim()];
  }
  if(normalizeButtonUrl(raw)) return ['url',raw];
  return [BUTTON_TYPES.has(currentType)?currentType:'url',raw];
}

export function parseMessageButtonSpec(value) {
  const match=String(value??'').trim().match(/^\{([^{}]+)\}$/s);
  if(!match) return null;
  const body=match[1].trim();
  let parts=body.split(/\s+[-–—]\s+/,2);
  if(parts.length!==2) parts=body.split(/[-–—]/,2);
  if(parts.length!==2) return null;
  const title=parts[0].trim();
  const specification=parts[1].trim();
  if(!title||title.includes('\n')||!specification) return null;
  const [type,content]=inferButtonTypeAndValue(specification);
  if(!content&&!['disabled','switch_inline','switch_inline_current'].includes(type)) return null;
  return {title,type,value:content};
}

export function addMessageButton(buttons,text,value,buttonType='url') {
  if((buttons??[]).length>=MAX_BUTTONS||!BUTTON_TYPES.has(buttonType)) return null;
  const button={
    id:randomId(), text:String(text??'').trim(), type:buttonType, value:String(value??''),
    style:'default', position:buttons.length,
  };
  if(['url','web_app','login_url'].includes(buttonType)) button.url=String(value??'');
  buttons.push(button);
  return button;
}

export function changeMessageButtonType(button,buttonType,value) {
  if(!BUTTON_TYPES.has(buttonType)) return false;
  button.type=buttonType; button.value=String(value??''); delete button.popup_token;
  if(['url','web_app','login_url'].includes(buttonType)) button.url=button.value;
  else delete button.url;
  if(button.style==='link'&&buttonType!=='popup') button.style='default';
  return true;
}

export function deleteMessageButton(buttons,buttonId) {
  const index=buttons.findIndex((button)=>button?.id===buttonId);
  if(index<0) return false;
  buttons.splice(index,1); normalizeButtonPositions(buttons); return true;
}

export function moveMessageButton(buttons,buttonId,newIndex) {
  normalizeButtonPositions(buttons);
  const oldIndex=buttons.findIndex((button)=>button?.id===buttonId);
  const target=Number.parseInt(newIndex,10);
  if(oldIndex<0||!Number.isInteger(target)||target<0||target>=buttons.length) return false;
  if(oldIndex!==target) buttons.splice(target,0,buttons.splice(oldIndex,1)[0]);
  reindexButtons(buttons); return true;
}

export function buttonRows(buttons,width=1) {
  const ordered=[...(buttons??[])].sort((a,b)=>Number(a?.position??0)-Number(b?.position??0));
  const safe=Math.max(1,Math.min(8,Number.parseInt(width,10)||1));
  const rows=[]; let row=[];
  for(const button of ordered) {
    row.push(button);
    const limit=Object.hasOwn(button,'row_end')?8:safe;
    if(button.row_end||row.length>=limit) { rows.push(row); row=[]; }
  }
  if(row.length) rows.push(row);
  return rows;
}
