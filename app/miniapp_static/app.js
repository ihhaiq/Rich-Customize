const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $ = (id) => document.getElementById(id);
const blocksEl = $("blocks");
const starter = $("starter");
const slashInput = $("slashInput");
const slashMenu = $("slashMenu");
const slashItems = $("slashItems");
const slashQuery = $("slashQuery");
const blockMenu = $("blockMenu");
const blockActions = $("blockActions");
const blockMenuTitle = $("blockMenuTitle");
const pageTitle = $("pageTitle");
const saveState = $("saveState");
const undoBtn = $("undoBtn");
const redoBtn = $("redoBtn");
const pagesPanel = $("pagesPanel");
const sendPanel = $("sendPanel");
const backdrop = $("backdrop");
const pagesEl = $("pages");
const destinationsEl = $("destinations");

let current = null;
let selectedBlockId = null;
let insertIndex = null;
let dirty = false;
let saveTimer = null;
let saveChain = Promise.resolve();
let history = [];
let future = [];
let historyTimer = null;

const BLOCKS = [
  {type:"paragraph",icon:"paragraph",label:mt("block.paragraph"),desc:mt("block.text_desc"),keys:"paragraph text فقرة نص"},
  {type:"heading",icon:"heading",label:mt("block.heading"),desc:mt("block.heading_desc"),keys:"heading h1 h2 h3 title عنوان"},
  {type:"footer",icon:"footer",label:mt("block.footer"),desc:mt("block.footer_desc"),keys:"footer تذييل"},
  {type:"preformatted",icon:"code",label:mt("block.preformatted"),desc:mt("block.code_desc"),keys:"code preformatted كود"},
  {type:"blockquote",icon:"quote",label:mt("block.blockquote"),desc:mt("block.quote_desc"),keys:"quote blockquote اقتباس"},
  {type:"pullquote",icon:"pullquote",label:mt("block.pullquote"),desc:mt("block.pullquote_desc"),keys:"pullquote quote اقتباس بارز"},
  {type:"divider",icon:"divider",label:mt("block.divider"),desc:mt("block.divider_desc"),keys:"divider line فاصل"},
  {type:"anchor",icon:"anchor",label:mt("block.anchor"),desc:mt("block.anchor_desc"),keys:"anchor مرساة"},
  {type:"list",icon:"list",label:mt("block.list"),desc:mt("block.list_desc"),keys:"list bullets numbered checklist قائمة"},
  {type:"details",icon:"details",label:mt("block.details"),desc:mt("block.details_desc"),keys:"details summary accordion تفاصيل"},
  {type:"table",icon:"table",label:mt("block.table"),desc:mt("block.table_desc"),keys:"table grid جدول"},
  {type:"mathematical_expression",icon:"math",label:mt("block.math"),desc:mt("block.math_desc"),keys:"math equation formula معادلة"},
  {type:"photo",icon:"photo",label:mt("block.photo"),desc:mt("block.photo_desc"),keys:"photo image صورة"},
  {type:"video",icon:"video",label:mt("block.video"),desc:mt("block.video_desc"),keys:"video فيديو"},
  {type:"animation",icon:"animation",label:mt("block.animation"),desc:mt("block.animation_desc"),keys:"animation gif"},
  {type:"audio",icon:"audio",label:mt("block.audio"),desc:mt("block.audio_desc"),keys:"audio music صوت"},
  {type:"voice",icon:"voice",label:mt("block.voice"),desc:mt("block.voice_desc"),keys:"voice note صوتية"},
  {type:"document",icon:"document",label:mt("block.document"),desc:mt("block.document_desc"),keys:"document file ملف"},
  {type:"collage",icon:"collage",label:mt("block.collage"),desc:mt("block.collage_desc"),keys:"collage gallery مجموعة"},
  {type:"slideshow",icon:"slideshow",label:mt("block.slideshow"),desc:mt("block.slideshow_desc"),keys:"slideshow slides شرائح"},
  {type:"map",icon:"map",label:mt("block.map"),desc:mt("block.map_desc"),keys:"map location خريطة موقع"}
];

const CATEGORIES = {
  text:["paragraph","heading","footer","preformatted","blockquote","pullquote","divider","anchor"],
  list:["list","details"],
  table:["table"],
  math:["mathematical_expression"],
  media:["photo","video","animation","audio","voice","document","collage","slideshow","map"]
};

function toast(text){const el=$("toast");el.textContent=text;el.classList.add("show");clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove("show"),1900)}
function headers(){return {"X-Telegram-Init-Data":tg?.initData||"","Content-Type":"application/json"}}
async function api(path,options={}){const res=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}});if(!res.ok)throw new Error((await res.text())||`HTTP ${res.status}`);return res.json()}
function escapeHtml(s){return String(s??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}
function stripHtml(s){return String(s??"").replace(/<[^>]*>/g,"").trim()}
function clone(v){return JSON.parse(JSON.stringify(v))}
function uid(){return (crypto?.randomUUID?.()||`${Date.now()}${Math.random()}`).replaceAll("-","").slice(0,12)}
function info(type){return BLOCKS.find(x=>x.type===type)||{type,icon:"generic",label:type,desc:"Block"}}
function normalizePositions(){current?.blocks?.forEach((b,i)=>b.position=i)}
function autoGrow(el){el.style.height="auto";el.style.height=`${Math.max(38,el.scrollHeight)}px`}

function newDraft(){
  current={page_id:null,title:mt("editor.untitled"),blocks:[],buttons:[],buttons_per_row:1,buttons_align:"center"};
  pageTitle.value=current.title;selectedBlockId=null;insertIndex=null;dirty=false;history=[];future=[];
  renderBlocks();updateSaveState(mt("editor.unsaved"));pushHistory();hideMenus();closeSheets();
}

function updateSaveState(text){saveState.textContent=text}
function markDirty(){dirty=true;updateSaveState(current?.page_id?mt("save.saving"):mt("save.new_draft"));clearTimeout(saveTimer);saveTimer=setTimeout(()=>queueSave(),850);scheduleHistory()}
function snapshot(){return current?JSON.stringify({title:pageTitle.value,blocks:current.blocks}):null}
function pushHistory(){if(!current)return;const raw=snapshot();if(history[history.length-1]===raw)return;history.push(raw);if(history.length>60)history.shift();future=[];syncHistory()}
function scheduleHistory(){clearTimeout(historyTimer);historyTimer=setTimeout(pushHistory,260)}
function syncHistory(){undoBtn.disabled=history.length<2;redoBtn.disabled=!future.length}
function restoreSnapshot(raw){if(!raw||!current)return;const data=JSON.parse(raw);pageTitle.value=data.title||mt("editor.untitled");current.title=pageTitle.value;current.blocks=data.blocks||[];normalizePositions();selectedBlockId=null;renderBlocks();dirty=true;updateSaveState(mt("save.saving"));clearTimeout(saveTimer);saveTimer=setTimeout(()=>queueSave(),500);syncHistory()}
function undo(){if(history.length<2)return;const now=history.pop();future.push(now);restoreSnapshot(history[history.length-1])}
function redo(){if(!future.length)return;const next=future.pop();history.push(next);restoreSnapshot(next)}

async function saveNow(){
  if(!current||!dirty)return current;
  normalizePositions();
  const doc=current;
  const body={title:pageTitle.value||mt("editor.untitled"),blocks:doc.blocks,buttons:doc.buttons||[],buttons_per_row:doc.buttons_per_row||1,buttons_align:doc.buttons_align||"center"};
  try{
    let data;
    if(doc.page_id){
      data=await api(`/miniapp/api/pages/${encodeURIComponent(doc.page_id)}`,{method:"PUT",body:JSON.stringify(body)});
    }else{
      data=await api("/miniapp/api/pages",{method:"POST",body:JSON.stringify(body)});
      doc.page_id=data.page_id;
    }
    if(current===doc){dirty=false;current.title=pageTitle.value||mt("editor.untitled");updateSaveState(mt("save.saved_at",{time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}))}
    return doc;
  }catch(error){if(current===doc){dirty=true;updateSaveState(mt("save.failed"))};throw error}
}
function queueSave(){clearTimeout(saveTimer);saveChain=saveChain.then(()=>saveNow()).catch(error=>toast(mt("save.error",{error:error.message})));return saveChain}
async function flushSave(){clearTimeout(saveTimer);if(dirty)await queueSave();return current}

function defaultBlock(type){
  const block={id:uid(),type,position:0,data:{}};const d=block.data;
  if(type==="paragraph")Object.assign(d,{text:"",html:"<p></p>"});
  else if(type==="heading")Object.assign(d,{text:"",html:"<h2></h2>",size:2});
  else if(type==="footer")Object.assign(d,{text:"",html:"<footer></footer>"});
  else if(type==="preformatted")Object.assign(d,{text:"",html:"<pre></pre>"});
  else if(type==="blockquote"||type==="pullquote")Object.assign(d,{quote_text:"",quote_html:""});
  else if(type==="divider")Object.assign(d,{html:"<hr>"});
  else if(type==="anchor")Object.assign(d,{text:"anchor",html:'<a name="anchor"></a>'});
  else if(type==="list"){const item=mt("list.item");Object.assign(d,{kind:"bullet",items:[{text:item}],text:item,html:`<ul><li>${escapeHtml(item)}</li></ul>`})}
  else if(type==="details"){const title=mt("details.title");Object.assign(d,{summary_html:escapeHtml(title),summary_text:title,children:[]})}
  else if(type==="table")Object.assign(d,{rows:[["",""] ,["",""]],is_bordered:true,is_striped:null,is_compact:null,native:false});
  else if(type==="mathematical_expression")Object.assign(d,{text:"",html:"<tg-math-block></tg-math-block>"});
  else if(["photo","video","animation","audio","voice","document"].includes(type))Object.assign(d,{file:{file_id:""},_draft:true});
  else if(type==="collage"||type==="slideshow")Object.assign(d,{children:[],_draft:true});
  else if(type==="map")Object.assign(d,{latitude:0,longitude:0,zoom:15,width:600,height:400,_draft:true});
  return block;
}

function applyText(block,value){
  const d=block.data||(block.data={});const e=escapeHtml(value);
  if(block.type==="blockquote"||block.type==="pullquote"){d.quote_text=value;d.quote_html=e;return}
  d.text=value;d.rich_text=null;
  if(block.type==="heading"){const n=Math.max(1,Math.min(6,Number(d.size||2)));d.html=`<h${n}>${e}</h${n}>`}
  else if(block.type==="footer")d.html=`<footer>${e}</footer>`;
  else if(block.type==="preformatted")d.html=`<pre>${e}</pre>`;
  else if(block.type==="mathematical_expression")d.html=`<tg-math-block>${e}</tg-math-block>`;
  else if(block.type==="anchor")d.html=`<a name="${e}"></a>`;
  else d.html=`<p>${e}</p>`;
}
function blockText(block){const d=block.data||{};return d.text??d.quote_text??""}

function addBlock(type,at=insertIndex,initialText=""){
  if(!current)return;
  const block=defaultBlock(type);if(initialText&&["paragraph","heading","footer","preformatted","blockquote","pullquote","mathematical_expression"].includes(type))applyText(block,initialText);
  const index=Number.isInteger(at)?Math.max(0,Math.min(at,current.blocks.length)):current.blocks.length;
  current.blocks.splice(index,0,block);normalizePositions();selectedBlockId=block.id;insertIndex=index+1;slashInput.value="";hideMenus();renderBlocks();markDirty();pushHistory();
  requestAnimationFrame(()=>{const target=blocksEl.querySelector(`[data-id="${block.id}"] textarea,[data-id="${block.id}"] input`);target?.focus();target?.scrollIntoView({block:"center",behavior:"smooth"})});
}
function deleteBlock(id){const i=current.blocks.findIndex(b=>b.id===id);if(i<0)return;current.blocks.splice(i,1);normalizePositions();selectedBlockId=null;renderBlocks();hideMenus();markDirty();pushHistory()}
function moveBlock(id,delta){const i=current.blocks.findIndex(b=>b.id===id),j=i+delta;if(i<0||j<0||j>=current.blocks.length)return;[current.blocks[i],current.blocks[j]]=[current.blocks[j],current.blocks[i]];normalizePositions();renderBlocks();markDirty();pushHistory()}
function selectBlock(id){selectedBlockId=id;const i=current.blocks.findIndex(b=>b.id===id);insertIndex=i<0?null:i+1;blocksEl.querySelectorAll(".block").forEach(el=>el.classList.toggle("selected",el.dataset.id===id))}

function textEditor(block){
  const ta=document.createElement("textarea");ta.className="block-editor";const n=Math.max(1,Math.min(6,Number(block.data?.size||2)));
  if(block.type==="heading")ta.classList.add(`heading-${n}`);if(block.type==="footer")ta.classList.add("footer-editor");if(block.type==="preformatted")ta.classList.add("pre-editor");if(block.type==="blockquote"||block.type==="pullquote")ta.classList.add("quote-editor");
  ta.value=blockText(block);ta.placeholder=info(block.type).label;ta.addEventListener("focus",()=>selectBlock(block.id));ta.addEventListener("input",()=>{applyText(block,ta.value);autoGrow(ta);markDirty()});requestAnimationFrame(()=>autoGrow(ta));return ta
}

function detailsEditor(block){
  const box=document.createElement("div");box.className="details-box";const input=document.createElement("input");input.className="inline-input details-summary";input.value=stripHtml(block.data?.summary_html)||mt("details.title");input.placeholder=mt("details.title_placeholder");
  input.addEventListener("focus",()=>selectBlock(block.id));input.addEventListener("input",()=>{const value=input.value;block.data.summary_text=value;block.data.summary_html=escapeHtml(value||mt("details.title"));markDirty()});
  const meta=document.createElement("div");meta.className="details-meta";meta.textContent=mt("details.inside_count",{count:(block.data?.children||[]).length});box.append(input,meta);return box
}

function listEditor(block){
  const ta=document.createElement("textarea");ta.className="block-editor";const d=block.data||(block.data={});ta.value=(d.items||[]).map(item=>typeof item==="object"?(item.text||""):String(item)).join("\n");ta.placeholder=mt("list.item_placeholder");ta.addEventListener("focus",()=>selectBlock(block.id));ta.addEventListener("input",()=>{const lines=ta.value.split("\n").filter(x=>x.length);d.items=lines.map((text,i)=>d.kind==="checklist"?{text,has_checkbox:true,is_checked:false}:d.kind==="numbered"?{text,value:i+1,type:"1"}:{text});d.text=ta.value;const tag=d.kind==="numbered"?"ol":"ul";d.html=`<${tag}>${lines.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</${tag}>`;autoGrow(ta);markDirty()});requestAnimationFrame(()=>autoGrow(ta));return ta
}

function rebuildTableHtml(block){const rows=block.data?.rows||[];const trs=rows.map(row=>`<tr>${row.map(raw=>{const c=typeof raw==="object"?raw:{text:String(raw??"")};const span=c.colspan?` colspan="${Number(c.colspan)}"`:"";return `<td${span}>${escapeHtml(c.text||"")}</td>`}).join("")}</tr>`).join("");block.data.html=`<table${block.data?.is_bordered!==false?" bordered":""}>${trs}</table>`}
function tableEditor(block){
  const wrap=document.createElement("div");wrap.className="table-preview";const table=document.createElement("table");const rows=block.data?.rows||[];
  rows.forEach((row,ri)=>{const tr=document.createElement("tr");row.forEach((raw,ci)=>{const td=document.createElement("td");const input=document.createElement("input");input.value=typeof raw==="object"?(raw.text||""):String(raw??"");input.placeholder=`${ri+1}:${ci+1}`;input.addEventListener("focus",()=>selectBlock(block.id));input.addEventListener("input",()=>{const old=rows[ri][ci];rows[ri][ci]=typeof old==="object"?{...old,text:input.value}:input.value;rebuildTableHtml(block);markDirty()});td.appendChild(input);tr.appendChild(td)});table.appendChild(tr)});wrap.appendChild(table);return wrap
}

function mediaEditor(block){
  const box=document.createElement("div");box.className="media-placeholder";const d=block.data||(block.data={});const label=document.createElement("strong");label.textContent=info(block.type).label;
  if(["photo","video","animation","audio","voice","document"].includes(block.type)){
    const hint=document.createElement("label");hint.textContent="Telegram file_id";const input=document.createElement("input");input.value=d.file?.file_id||"";input.placeholder=mt("media.paste_file_id");input.addEventListener("focus",()=>selectBlock(block.id));input.addEventListener("input",()=>{d.file=d.file||{};d.file.file_id=input.value.trim();d._draft=!d.file.file_id;box.classList.toggle("invalid",d._draft);markDirty()});box.classList.toggle("invalid",!d.file?.file_id);box.append(label,hint,input);
  }else if(block.type==="map"){
    const lat=document.createElement("input"),lon=document.createElement("input");lat.type=lon.type="number";lat.step=lon.step="any";lat.placeholder="Latitude";lon.placeholder="Longitude";lat.value=d.latitude||"";lon.value=d.longitude||"";const update=()=>{d.latitude=Number(lat.value||0);d.longitude=Number(lon.value||0);d._draft=!(lat.value&&lon.value);markDirty()};lat.oninput=lon.oninput=update;lat.onfocus=lon.onfocus=()=>selectBlock(block.id);box.append(label,lat,lon);
  }else{const meta=document.createElement("div");meta.className="details-meta";meta.textContent=mt("media.items_count",{count:(d.children||[]).length});box.append(label,meta)}return box
}

function renderBlocks(){
  blocksEl.innerHTML="";starter.classList.toggle("hidden",!!current?.blocks?.length);
  (current?.blocks||[]).forEach((block,index)=>{
    const article=document.createElement("article");article.className=`block${selectedBlockId===block.id?" selected":""}`;article.dataset.id=block.id;
    const row=document.createElement("div");row.className="block-row";const main=document.createElement("div");main.className="block-main";let editor;
    if(["paragraph","heading","footer","preformatted","blockquote","pullquote","anchor","mathematical_expression"].includes(block.type))editor=textEditor(block);
    else if(block.type==="details")editor=detailsEditor(block);
    else if(block.type==="list")editor=listEditor(block);
    else if(block.type==="table")editor=tableEditor(block);
    else if(block.type==="divider"){editor=document.createElement("div");editor.className="divider-line"}
    else editor=mediaEditor(block);
    main.appendChild(editor);const tools=document.createElement("div");tools.className="block-tools";const more=document.createElement("button");more.type="button";more.className="mini-btn";MiniAppIcons.mount(more,"more");more.setAttribute("aria-label",mt("block.settings",{name:info(block.type).label}));more.addEventListener("click",e=>{e.stopPropagation();selectBlock(block.id);openBlockMenu(block)});tools.appendChild(more);row.append(main,tools);article.appendChild(row);article.addEventListener("click",()=>selectBlock(block.id));blocksEl.appendChild(article);
  });
}

function menuButton(icon,label,desc,handler,extra=""){
  const btn=document.createElement("button");btn.type="button";btn.className=`menu-item ${extra}`;const iconEl=document.createElement("span");iconEl.className="menu-icon";MiniAppIcons.mount(iconEl,icon);const copy=document.createElement("span");copy.className="menu-copy";const strong=document.createElement("strong");strong.textContent=label;copy.appendChild(strong);if(desc){const small=document.createElement("small");small.textContent=desc;copy.appendChild(small)}btn.append(iconEl,copy);btn.addEventListener("click",handler);return btn
}
function separator(){const el=document.createElement("div");el.className="menu-sep";return el}
function hideMenus(){slashMenu.classList.add("hidden");blockMenu.classList.add("hidden")}

function openBlockMenu(block){
  slashMenu.classList.add("hidden");blockActions.innerHTML="";blockMenuTitle.textContent=info(block.type).label;
  if(block.type==="heading"){
    for(let level=1;level<=6;level++)blockActions.appendChild(menuButton("heading",mt("heading.level",{level}),"",()=>{block.data.size=level;applyText(block,blockText(block));renderBlocks();markDirty();hideMenus()}));blockActions.appendChild(separator());
  }
  if(block.type==="list"){
    [["list",mt("list.bulleted"),"bullet"],["numbered",mt("list.numbered"),"numbered"],["checklist",mt("list.tasks"),"checklist"]].forEach(([icon,label,kind])=>blockActions.appendChild(menuButton(icon,label,"",()=>{block.data.kind=kind;renderBlocks();markDirty();hideMenus()})));blockActions.appendChild(separator());
  }
  if(block.type==="table"){
    blockActions.appendChild(menuButton("add",mt("table.add_row"),"",()=>{const rows=block.data.rows||(block.data.rows=[]);const cols=Math.max(1,...rows.map(r=>r.length));rows.push(Array(cols).fill(""));rebuildTableHtml(block);renderBlocks();markDirty();hideMenus()}));
    blockActions.appendChild(menuButton("add",mt("table.add_column"),"",()=>{const rows=block.data.rows||(block.data.rows=[]);if(!rows.length)rows.push([]);rows.forEach(r=>r.push(""));rebuildTableHtml(block);renderBlocks();markDirty();hideMenus()}));
    blockActions.appendChild(menuButton("border",block.data.is_bordered===false?mt("table.show_borders"):mt("table.hide_borders"),"",()=>{block.data.is_bordered=block.data.is_bordered===false;rebuildTableHtml(block);markDirty();hideMenus()}));
    blockActions.appendChild(menuButton("stripe",block.data.is_striped?mt("table.unstriped"):mt("table.striped"),"",()=>{block.data.is_striped=block.data.is_striped?null:true;markDirty();hideMenus()}));
    blockActions.appendChild(menuButton("compact",block.data.is_compact?mt("table.uncompact"):mt("table.compact"),"",()=>{block.data.is_compact=block.data.is_compact?null:true;markDirty();hideMenus()}));blockActions.appendChild(separator());
  }
  const index=current.blocks.findIndex(x=>x.id===block.id);blockActions.appendChild(menuButton("up",mt("action.move_up"),"",()=>{moveBlock(block.id,-1);hideMenus()}));blockActions.lastChild.disabled=index===0;
  blockActions.appendChild(menuButton("down",mt("action.move_down"),"",()=>{moveBlock(block.id,1);hideMenus()}));blockActions.lastChild.disabled=index===current.blocks.length-1;
  blockActions.appendChild(separator());blockActions.appendChild(menuButton("delete",mt("action.delete_block"),"",()=>deleteBlock(block.id),"danger"));
  blockMenu.classList.remove("hidden");
}

function filteredBlocks(query="",types=null){const q=query.trim().toLowerCase();return BLOCKS.filter(item=>(!types||types.includes(item.type))&&(!q||`${item.type} ${item.label} ${item.keys}`.toLowerCase().includes(q)))}
function openSlashMenu(query="",types=null){
  blockMenu.classList.add("hidden");slashItems.innerHTML="";slashQuery.textContent=query?`/${query}`:"/";const items=filteredBlocks(query,types);
  if(!items.length){const empty=document.createElement("div");empty.className="empty";empty.textContent=mt("editor.no_block_match");slashItems.appendChild(empty)}
  items.forEach((item,index)=>slashItems.appendChild(menuButton(item.icon,item.label,item.desc,()=>addBlock(item.type),index===0?"active":"")));slashMenu.classList.remove("hidden");
}

function closeSheets(){pagesPanel.classList.add("hidden");sendPanel.classList.add("hidden");backdrop.classList.add("hidden")}
function showSheet(panel){closeSheets();backdrop.classList.remove("hidden");panel.classList.remove("hidden")}

async function loadPages(){
  showSheet(pagesPanel);pagesEl.innerHTML=`<div class="empty">${escapeHtml(mt("common.loading"))}</div>`;
  try{const data=await api("/miniapp/api/pages");pagesEl.innerHTML="";$("emptyPages").classList.toggle("hidden",data.pages.length>0);data.pages.forEach(page=>{const btn=document.createElement("button");btn.type="button";btn.className="sheet-item";btn.innerHTML=`<span class="sheet-item-main"><strong>${escapeHtml(page.title)}</strong><small>${page.block_count} Block · ${page.page_id}</small></span><span class="sheet-next"></span>`;MiniAppIcons.mount(btn.querySelector(".sheet-next"),"next");btn.onclick=()=>openPage(page.page_id);pagesEl.appendChild(btn)})}catch(error){pagesEl.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`}
}
async function openPage(pageId){
  try{await flushSave();const data=await api(`/miniapp/api/pages/${encodeURIComponent(pageId)}`);current=data.page;current.blocks=(current.blocks||[]).sort((a,b)=>(a.position||0)-(b.position||0));pageTitle.value=current.title||pageId;selectedBlockId=null;insertIndex=null;dirty=false;history=[];future=[];renderBlocks();updateSaveState(mt("save.saved"));pushHistory();closeSheets()}catch(error){toast(error.message)}
}

async function openSendPanel(){
  if(!current?.blocks?.length){toast(mt("send.add_content"));return}
  try{await flushSave();if(!current.page_id){toast(mt("send.save_before"));return}showSheet(sendPanel);destinationsEl.innerHTML=`<div class="empty">${escapeHtml(mt("send.loading_destinations"))}</div>`;const data=await api("/miniapp/api/destinations");destinationsEl.innerHTML="";data.destinations.forEach(dest=>{const btn=document.createElement("button");btn.type="button";btn.className="sheet-item";const icon=dest.kind==="private"?"user":dest.type==="channel"?"channel":"group";btn.innerHTML=`<span class="destination-icon"></span><span class="sheet-item-main"><strong>${escapeHtml(dest.title)}</strong><small>${dest.kind==="private"?escapeHtml(mt("send.private")):escapeHtml(dest.type)}</small></span><span>${escapeHtml(mt("send.action"))}</span>`;MiniAppIcons.mount(btn.querySelector(".destination-icon"),icon);btn.onclick=()=>sendTo(dest,btn);destinationsEl.appendChild(btn)})}catch(error){toast(mt("send.preparing_failed",{error:error.message}))}
}
async function sendTo(dest,button){
  const old=button.innerHTML;button.disabled=true;button.textContent=mt("send.sending");try{await api("/miniapp/api/send",{method:"POST",body:JSON.stringify({page_id:current.page_id,kind:dest.kind,chat_id:dest.chat_id})});closeSheets();toast(mt("send.sent_to",{title:dest.title}))}catch(error){button.disabled=false;button.innerHTML=old;toast(mt("send.failed",{error:error.message}))}
}

pageTitle.addEventListener("input",()=>{if(!current)return;current.title=pageTitle.value;markDirty()});
undoBtn.onclick=undo;redoBtn.onclick=redo;
$("pagesBtn").onclick=loadPages;
$("newPageBtn").onclick=async()=>{try{await flushSave();newDraft()}catch(error){toast(error.message)}};
$("sendBtn").onclick=openSendPanel;
backdrop.onclick=closeSheets;
$("startWritingBtn").onclick=()=>addBlock("paragraph");
$("startPhotoBtn").onclick=()=>addBlock("photo");
$("allBlocksBtn").onclick=()=>openSlashMenu("");
$("moreBtn").onclick=()=>{blockActions.innerHTML="";blockMenuTitle.textContent=mt("page.title");blockActions.appendChild(menuButton("add",mt("page.new"),"",async()=>{hideMenus();try{await flushSave();newDraft()}catch(error){toast(error.message)}}));blockActions.appendChild(menuButton("save",mt("page.save_now"),"",async()=>{hideMenus();try{dirty=true;await flushSave();toast(mt("save.saved"))}catch(error){toast(error.message)}}));blockMenu.classList.remove("hidden")};

document.querySelectorAll(".composer-toolbar [data-tool]").forEach(btn=>btn.addEventListener("click",()=>openSlashMenu("",CATEGORIES[btn.dataset.tool]||null)));

slashInput.addEventListener("focus",()=>{insertIndex=Number.isInteger(insertIndex)?insertIndex:current.blocks.length});
slashInput.addEventListener("input",()=>{autoGrow(slashInput);const value=slashInput.value;if(value.startsWith("/")){openSlashMenu(value.slice(1))}else slashMenu.classList.add("hidden")});
slashInput.addEventListener("keydown",event=>{
  if(event.key==="Escape"){hideMenus();return}
  if(event.key==="Enter"&&!event.shiftKey){
    const value=slashInput.value.trim();if(!value)return;
    event.preventDefault();
    if(value.startsWith("/")){const first=filteredBlocks(value.slice(1))[0];if(first)addBlock(first.type);return}
    addBlock("paragraph",insertIndex,value);
  }
});

document.addEventListener("click",event=>{if(!slashMenu.contains(event.target)&&event.target!==slashInput&&!event.target.closest(".composer-toolbar"))slashMenu.classList.add("hidden");if(!blockMenu.contains(event.target)&&!event.target.closest(".mini-btn")&&event.target!==$("moreBtn"))blockMenu.classList.add("hidden")});

async function boot(){
  if(!tg?.initData){updateSaveState(mt("save.open_in_telegram"));slashInput.disabled=true;return}
  try{await api("/miniapp/api/me");newDraft()}catch(error){updateSaveState(mt("save.unauthorized"));toast(error.message)}
}
boot();
