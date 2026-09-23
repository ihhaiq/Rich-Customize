import { normalizeButtonUrl, normalizePageCode } from 'lib/buttons';

const MARKER_RE=/\{([^{}\n]+)\}/g;
const COLOR_STYLES={r:'danger',b:'primary',p:'primary',g:'success'};
const TYPE_ALIASES={link:'url',callback:'callback_data',alert:'popup',webapp:'web_app',login:'login_url',inline:'switch_inline_query',current:'switch_inline_query_current_chat',cbd:'page_callback',page:'page_callback','inline-here':'switch_inline_query_current_chat',callbackdata:'callback_data','callback data':'callback_data','web app':'web_app','login url':'login_url','switch inline query':'switch_inline_query','switch inline query current chat':'switch_inline_query_current_chat'};
const BUTTON_TYPES=new Set(['user','disabled','url','callback_data','page_callback','copy','popup','web_app','login_url','switch_inline_query','switch_inline_query_current_chat']);
const AUDIENCE_ALIASES={all:'all',public:'all','عام':'all',sub:'subscribers',subs:'subscribers',members:'subscribers','مشتركين':'subscribers'};
function utf8Length(value){ return new TextEncoder().encode(String(value??'')).length; }

export function markerParts(marker){
  if(!String(marker).startsWith('{')||!String(marker).endsWith('}')) return null;
  const body=String(marker).slice(1,-1).trim();
  const hyphen=body.indexOf('-'), colon=body.indexOf(':');
  const newSyntax=hyphen>=0&&(colon<0||hyphen<colon);
  let title,specification;
  if(newSyntax){ title=body.slice(0,hyphen); specification=body.slice(hyphen+1); }
  else if(colon>=0){ title=body.slice(0,colon); specification=body.slice(colon+1); }
  else return null;
  title=title.trim(); specification=specification.trim();
  if(!title||title.length>64||!specification) return null;
  let audience='all',color=null;
  const colorMatch=specification.match(/#\s*([rbpg])\s*$/i);
  if(colorMatch){ color=colorMatch[1].toLowerCase(); specification=specification.slice(0,colorMatch.index).trim(); }
  const aud=specification.match(/\s+(all|public|عام|sub|subs|members|مشتركين)\s*$/i);
  if(aud){ audience=AUDIENCE_ALIASES[aud[1].toLocaleLowerCase()]??'all'; specification=specification.slice(0,aud.index).trim(); }
  const typed=specification.match(/^([\w-]+(?:\s+[\w-]+)*)\s*:\s*([\s\S]*)$/);
  let buttonType,value;
  if(typed){ const raw=typed[1].toLocaleLowerCase(); buttonType=TYPE_ALIASES[raw]??raw; value=typed[2].trim(); }
  else if(newSyntax){ const raw=specification.toLocaleLowerCase(); const known=TYPE_ALIASES[raw]??raw; if(BUTTON_TYPES.has(known)){ buttonType=known; value=''; } else { buttonType='url'; value=specification; } }
  else { const pieces=specification.split(/\s+/,2); const raw=(pieces[0]??'').toLocaleLowerCase(); buttonType=TYPE_ALIASES[raw]??raw; value=pieces[1]?.trim()??''; }
  return {title,buttonType,value,color,audience};
}

function payload(parts){
  const button={text:parts.title};
  if(parts.color) button.style={r:'danger',b:'primary',p:'primary',g:'success'}[parts.color];
  const t=parts.buttonType,v=parts.value;
  if(t==='url'){ const url=normalizeButtonUrl(v); if(!url) return null; button.url=url; }
  else if(t==='user'){ if(!/^\d+$/.test(v)) return null; button.url='tg://user?id='+v; }
  else if(t==='callback_data'){ if(utf8Length(v)<1||utf8Length(v)>64) return null; button.callback_data=v; }
  else if(t==='page_callback'){ const code=normalizePageCode(v); if(!code) return null; button.callback_data=(parts.audience==='subscribers'?'r:cbds:':'r:cbd:')+code; }
  else if(t==='copy'){ if(!v||v.length>256) return null; button.copy_text={text:v}; }
  else if(t==='popup'){ const cb='r:poptext:'+v; if(!v||utf8Length(cb)>64) return null; button.callback_data=cb; }
  else if(t==='web_app'){ if(!v.startsWith('https://')) return null; button.web_app={url:v}; }
  else if(t==='login_url'){ if(!v.startsWith('https://')) return null; button.login_url={url:v}; }
  else if(t==='switch_inline_query') button.switch_inline_query=v==='/empty'?'':v;
  else if(t==='switch_inline_query_current_chat') button.switch_inline_query_current_chat=v==='/empty'?'':v;
  else if(t==='disabled') button.disabled={}; else return null;
  return {type:'button',button};
}

export function inlineButtonRichText(value){
  if(Array.isArray(value)) return value.flatMap(x=>{const y=inlineButtonRichText(x);return Array.isArray(y)?y:[y];});
  if(value&&typeof value==='object'){ const out={...value}; if(Object.hasOwn(out,'text')) out.text=inlineButtonRichText(out.text); return out; }
  if(typeof value!=='string') return value;
  const result=[]; let cursor=0,changed=false; MARKER_RE.lastIndex=0;
  for(const match of value.matchAll(MARKER_RE)){ const parts=markerParts(match[0]); const p=parts&&payload(parts); if(!p) continue; if(match.index>cursor) result.push(value.slice(cursor,match.index)); result.push(p); cursor=match.index+match[0].length; changed=true; }
  if(!changed) return value; if(cursor<value.length) result.push(value.slice(cursor)); return result.length===1?result[0]:result;
}
