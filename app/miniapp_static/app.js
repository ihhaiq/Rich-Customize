const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $ = (id) => document.getElementById(id);
const pagesView = $("pagesView");
const editorView = $("editorView");
const pagesEl = $("pages");
const blocksEl = $("blocks");
const slashInput = $("slashInput");
const slashMenu = $("slashMenu");
const slashItems = $("slashItems");
const slashQuery = $("slashQuery");
const blockMenu = $("blockMenu");
const blockActions = $("blockActions");
const blockMenuTitle = $("blockMenuTitle");
const saveBtn = $("saveBtn");
const saveState = $("saveState");
const pageTitle = $("pageTitle");
const pageCode = $("pageCode");
const undoBtn = $("undoBtn");
const redoBtn = $("redoBtn");

let current = null;
let dirty = false;
let selectedBlockId = null;
let insertIndex = null;
let history = [];
let future = [];
let snapshotTimer = null;

const BLOCKS = [
  {type:"paragraph",icon:"¶",label:"نص",desc:"فقرة نصية عادية",keys:"paragraph text فقرة نص"},
  {type:"heading",icon:"H",label:"عنوان",desc:"عنوان من H1 إلى H6",keys:"heading title h1 h2 h3 عنوان"},
  {type:"preformatted",icon:"</>",label:"كود",desc:"نص مهيأ مسبقًا",keys:"code preformatted كود"},
  {type:"footer",icon:"⌄",label:"تذييل",desc:"نص صغير في نهاية المحتوى",keys:"footer تذييل"},
  {type:"divider",icon:"—",label:"فاصل",desc:"خط فاصل بين الأقسام",keys:"divider فاصل"},
  {type:"mathematical_expression",icon:"Σ",label:"معادلة",desc:"صيغة رياضية",keys:"math equation formula معادلة"},
  {type:"anchor",icon:"#",label:"مرساة",desc:"Anchor داخل الرسالة",keys:"anchor مرساة"},
  {type:"list",icon:"☷",label:"قائمة",desc:"منقطة، مرقمة أو مهام",keys:"list bullet numbered checklist قائمة"},
  {type:"blockquote",icon:"❝",label:"اقتباس",desc:"اقتباس نصي",keys:"quote blockquote اقتباس"},
  {type:"pullquote",icon:"❞",label:"اقتباس بارز",desc:"اقتباس بارز",keys:"pullquote quote اقتباس بارز"},
  {type:"table",icon:"▦",label:"جدول",desc:"جدول قابل للتعديل",keys:"table grid جدول"},
  {type:"details",icon:"▸",label:"تفاصيل",desc:"قسم قابل للفتح والطي",keys:"details accordion تفاصيل"},
  {type:"collage",icon:"▩",label:"Collage",desc:"مجموعة صور وفيديو",keys:"collage gallery مجموعة معرض"},
  {type:"slideshow",icon:"▣",label:"Slideshow",desc:"شرائح وسائط",keys:"slideshow slides شرائح"},
  {type:"map",icon:"⌖",label:"خريطة",desc:"موقع جغرافي",keys:"map location خريطة موقع"},
  {type:"animation",icon:"GIF",label:"GIF",desc:"صورة متحركة",keys:"animation gif"},
  {type:"audio",icon:"♫",label:"صوت",desc:"ملف صوتي",keys:"audio music صوت"},
  {type:"document",icon:"▤",label:"ملف",desc:"مستند أو ملف",keys:"document file ملف"},
  {type:"photo",icon:"▧",label:"صورة",desc:"صورة Telegram",keys:"photo image صورة"},
  {type:"video",icon:"▶",label:"فيديو",desc:"فيديو Telegram",keys:"video فيديو"},
  {type:"voice",icon:"◉",label:"رسالة صوتية",desc:"Voice note",keys:"voice note رسالة صوتية"}
];

const CATEGORIES = {
  text:["paragraph","heading","preformatted","footer","divider","blockquote","pullquote","anchor"],
  list:["list","details"],
  table:["table"],
  math:["mathematical_expression"],
  media:["photo","video","animation","audio","voice","document","collage","slideshow","map"]
};

function toast(text){const el=$("toast");el.textContent=text;el.classList.add("show");clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove("show"),1900)}
function headers(){return {"X-Telegram-Init-Data":tg?.initData||"","Content-Type":"application/json"}}
async function api(path,options={}){const res=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}});if(!res.ok)throw new Error((await res.text())||`HTTP ${res.status}`);return res.json()}
function escapeHtml(s){return String(s??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}
function uid(){return (crypto?.randomUUID?.()||`${Date.now()}${Math.random()}`).replaceAll("-","").slice(0,12)}
function clone(v){return JSON.parse(JSON.stringify(v))}
function blockInfo(type){return BLOCKS.find(b=>b.type===type)||{type,icon:"□",label:type,desc:"Block"}}
function typeLabel(type){return blockInfo(type).label}
function setDirty(value=true){dirty=value;saveBtn.disabled=!value;saveBtn.textContent=value?"حفظ":"تم";saveState.textContent=value?"توجد تعديلات":"تم الحفظ"}
function autoGrow(el){el.style.height="auto";el.style.height=`${Math.max(30,el.scrollHeight)}px`}
function normalizePositions(){current?.blocks?.forEach((b,i)=>b.position=i)}

function stateSnapshot(){if(!current)return null;return JSON.stringify({title:pageTitle.value,blocks:current.blocks})}
function pushHistory(){if(!current)return;const snap=stateSnapshot();if(history[history.length-1]===snap)return;history.push(snap);if(history.length>60)history.shift();future=[];syncHistoryButtons()}
function scheduleHistory(){clearTimeout(snapshotTimer);snapshotTimer=setTimeout(pushHistory,250)}
function restoreSnapshot(raw){if(!raw||!current)return;const parsed=JSON.parse(raw);pageTitle.value=parsed.title||"";current.title=pageTitle.value;current.blocks=parsed.blocks||[];normalizePositions();selectedBlockId=null;renderBlocks();setDirty(true);syncHistoryButtons()}
function undo(){if(history.length<2)return;const now=history.pop();future.push(now);restoreSnapshot(history[history.length-1])}
function redo(){if(!future.length)return;const next=future.pop();history.push(next);restoreSnapshot(next)}
function syncHistoryButtons(){undoBtn.disabled=history.length<2;redoBtn.disabled=!future.length}

function defaultBlock(type){
  const base={id:uid(),type,position:0,data:{}};
  const d=base.data;
  if(type==="paragraph")Object.assign(d,{text:"",html:"<p></p>"});
  else if(type==="heading")Object.assign(d,{text:"",html:"<h2></h2>",size:2});
  else if(type==="preformatted")Object.assign(d,{text:"",html:"<pre></pre>"});
  else if(type==="footer")Object.assign(d,{text:"",html:"<footer></footer>"});
  else if(type==="divider")Object.assign(d,{text:"",html:"<hr>"});
  else if(type==="mathematical_expression")Object.assign(d,{text:"",html:"<tg-math-block></tg-math-block>"});
  else if(type==="anchor")Object.assign(d,{text:"anchor",html:'<a name="anchor"></a>'});
  else if(type==="list")Object.assign(d,{kind:"bullet",text:"عنصر",items:[{text:"عنصر"}],html:"<ul><li>عنصر</li></ul>"});
  else if(type==="blockquote"||type==="pullquote")Object.assign(d,{quote_text:"",quote_html:""});
  else if(type==="table")Object.assign(d,{rows:[["",""],["",""]],text:" | \n | ",html:"<table bordered><tr><td></td><td></td></tr><tr><td></td><td></td></tr></table>",is_bordered:true,native:false});
  else if(type==="details")Object.assign(d,{summary_html:"تفاصيل",children:[]});
  else if(type==="map")Object.assign(d,{latitude:0,longitude:0,zoom:15,width:600,height:400,caption_html:null,credit_html:null,_draft:true});
  else if(["photo","video","animation","audio","voice","document"].includes(type))Object.assign(d,{file:{file_id:""},_draft:true});
  else if(type==="collage"||type==="slideshow")Object.assign(d,{children:[],caption_html:null,credit_html:null,_draft:true});
  return base;
}

function applyText(block,value){
  const d=block.data||(block.data={});
  if(block.type==="blockquote"||block.type==="pullquote"){d.quote_text=value;d.quote_html=escapeHtml(value);return}
  d.text=value;const e=escapeHtml(value);
  if(block.type==="heading"){const size=Math.max(1,Math.min(6,Number(d.size||2)));d.html=`<h${size}>${e}</h${size}>`}
  else if(block.type==="footer")d.html=`<footer>${e}</footer>`;
  else if(block.type==="preformatted")d.html=`<pre>${e}</pre>`;
  else if(block.type==="mathematical_expression")d.html=`<tg-math-block>${e}</tg-math-block>`;
  else if(block.type==="anchor")d.html=`<a name="${e}"></a>`;
  else d.html=`<p>${e}</p>`;
  d.rich_text=null;
}
function blockText(block){const d=block.data||{};return d.text??d.quote_text??""}

function addBlock(type,at=insertIndex){
  if(!current)return;
  const block=defaultBlock(type);
  const index=Number.isInteger(at)?Math.max(0,Math.min(at,current.blocks.length)):current.blocks.length;
  current.blocks.splice(index,0,block);normalizePositions();selectedBlockId=block.id;insertIndex=index+1;
  slashInput.value="";hideMenus();setDirty(true);renderBlocks();pushHistory();
  requestAnimationFrame(()=>{const target=blocksEl.querySelector(`[data-id="${block.id}"] textarea,[data-id="${block.id}"] input`);target?.focus();target?.scrollIntoView({block:"center",behavior:"smooth"})});
}
function deleteBlock(id){const i=current.blocks.findIndex(b=>b.id===id);if(i<0)return;current.blocks.splice(i,1);normalizePositions();selectedBlockId=null;hideMenus();setDirty(true);renderBlocks();pushHistory()}
function moveBlock(id,delta){const i=current.blocks.findIndex(b=>b.id===id),j=i+delta;if(i<0||j<0||j>=current.blocks.length)return;[current.blocks[i],current.blocks[j]]=[current.blocks[j],current.blocks[i]];normalizePositions();setDirty(true);renderBlocks();pushHistory()}

function editableTextBlock(block){return ["paragraph","heading","footer","preformatted","mathematical_expression","anchor","blockquote","pullquote"].includes(block.type)}
function textEditor(block){const ta=document.createElement("textarea");ta.className="block-editor";ta.value=blockText(block);ta.placeholder=typeLabel(block.type);ta.addEventListener("input",()=>{applyText(block,ta.value);autoGrow(ta);setDirty(true);scheduleHistory()});ta.addEventListener("focus",()=>selectBlock(block.id));requestAnimationFrame(()=>autoGrow(ta));return ta}

function tableEditor(block){
  const wrap=document.createElement("div");wrap.className="table-preview";const table=document.createElement("table");
  const rows=block.data?.rows||[];
  rows.forEach((row,ri)=>{const tr=document.createElement("tr");row.forEach((cell,ci)=>{const td=document.createElement("td");const input=document.createElement("input");input.className="block-editor";input.value=typeof cell==="object"?(cell.text||""):String(cell??"");input.placeholder=`${ri+1}:${ci+1}`;input.addEventListener("focus",()=>selectBlock(block.id));input.addEventListener("input",()=>{const old=rows[ri][ci];rows[ri][ci]=typeof old==="object"?{...old,text:input.value}:input.value;rebuildTableHtml(block);setDirty(true);scheduleHistory()});td.appendChild(input);tr.appendChild(td)});table.appendChild(tr)});
  wrap.appendChild(table);return wrap;
}
function rebuildTableHtml(block){const rows=block.data?.rows||[];const trs=rows.map(row=>`<tr>${row.map(raw=>{const c=typeof raw==="object"?raw:{text:String(raw??"")};const cs=c.colspan?` colspan="${Number(c.colspan)}"`:"";return `<td${cs}>${escapeHtml(c.text||"")}</td>`}).join("")}</tr>`).join("");block.data.html=`<table${block.data?.is_bordered!==false?" bordered":""}>${trs}</table>`}

function listEditor(block){
  const ta=document.createElement("textarea");ta.className="block-editor";const d=block.data||(block.data={});const items=d.items||[];ta.value=items.map(i=>typeof i==="object"?i.text:String(i)).join("\n");ta.placeholder="عنصر في كل سطر";ta.addEventListener("focus",()=>selectBlock(block.id));ta.addEventListener("input",()=>{const lines=ta.value.split("\n").filter(Boolean);d.items=lines.map((text,i)=>d.kind==="checklist"?{text,has_checkbox:true,is_checked:false}:d.kind==="numbered"?{text,value:i+1,type:"1"}:{text});d.text=ta.value;const tag=d.kind==="numbered"?"ol":"ul";d.html=`<${tag}>${lines.map(x=>`<li>${escapeHtml(x)}</li>`).join("")}</${tag}>`;autoGrow(ta);setDirty(true);scheduleHistory()});requestAnimationFrame(()=>autoGrow(ta));return ta
}

function genericPreview(block){
  const d=block.data||{};const box=document.createElement("div");
  if(block.type==="divider"){box.className="divider-line";return box}
  if(block.type==="details"){box.className="details-preview";box.innerHTML=`<details open><summary>${escapeHtml((d.summary_html||"تفاصيل").replace(/<[^>]+>/g,""))}</summary><div class="muted">${(d.children||[]).length} Block داخلي</div></details>`;return box}
  if(["photo","video","animation","audio","voice","document","collage","slideshow","map"].includes(block.type)){
    const draft=d._draft||(["photo","video","animation","audio","voice","document"].includes(block.type)&&!d.file?.file_id)||(block.type==="map"&&(Number(d.latitude)===0&&Number(d.longitude)===0));
    box.className=`media-placeholder${draft?" invalid":""}`;box.textContent=draft?`${typeLabel(block.type)} — يحتاج إكمال البيانات قبل الحفظ`:`${typeLabel(block.type)} جاهز`;return box
  }
  box.className="generic-placeholder";box.textContent=typeLabel(block.type);return box
}

function renderBlocks(){
  blocksEl.innerHTML="";if(!current)return;
  current.blocks.forEach((block,index)=>{
    const el=document.createElement("article");el.className=`block ${block.type}${block.type==="heading"?` h${Math.max(1,Math.min(6,Number(block.data?.size||2)))}`:""}${["blockquote","pullquote"].includes(block.type)?" quote":""}${selectedBlockId===block.id?" selected":""}`;el.dataset.id=block.id;el.innerHTML=`<span class="block-badge">${index+1} · ${escapeHtml(typeLabel(block.type))}</span>`;el.addEventListener("click",e=>{if(e.target.closest("input,textarea,button"))return;selectBlock(block.id)});
    if(editableTextBlock(block))el.appendChild(textEditor(block));
    else if(block.type==="table")el.appendChild(tableEditor(block));
    else if(block.type==="list")el.appendChild(listEditor(block));
    else el.appendChild(genericPreview(block));
    blocksEl.appendChild(el);
  });
}

function selectBlock(id){selectedBlockId=id;const i=current.blocks.findIndex(b=>b.id===id);insertIndex=i+1;renderSelectionOnly();openBlockMenu(current.blocks[i])}
function renderSelectionOnly(){blocksEl.querySelectorAll(".block").forEach(el=>el.classList.toggle("selected",el.dataset.id===selectedBlockId))}
function hideMenus(){slashMenu.classList.add("hidden");blockMenu.classList.add("hidden")}

function menuButton(info,onClick,extra=""){const b=document.createElement("button");b.type="button";b.className="menu-item";b.innerHTML=`<span class="menu-icon">${info.icon||"•"}</span><span class="menu-copy"><strong>${escapeHtml(info.label)}</strong><small>${escapeHtml(extra||info.desc||"")}</small></span>`;b.addEventListener("click",onClick);return b}
function showBlockPicker(types=BLOCKS.map(b=>b.type),query=""){
  const q=query.trim().toLowerCase();const source=BLOCKS.filter(b=>types.includes(b.type)&&(!q||`${b.label} ${b.type} ${b.keys}`.toLowerCase().includes(q)));
  slashItems.innerHTML="";slashQuery.textContent=q?`/ ${q}`:"";
  source.forEach(info=>slashItems.appendChild(menuButton(info,()=>addBlock(info.type))));
  if(!source.length){const d=document.createElement("div");d.className="empty";d.textContent="ماكو Block مطابق";slashItems.appendChild(d)}
  slashMenu.classList.remove("hidden");blockMenu.classList.add("hidden")
}

function openBlockMenu(block){
  if(!block)return;blockMenuTitle.textContent=`${typeLabel(block.type)} · تعديل`;blockActions.innerHTML="";
  if(block.type==="heading"){
    for(let n=1;n<=6;n++)blockActions.appendChild(menuButton({icon:`H${n}`,label:`العنوان ${n}`,desc:`تحويل إلى H${n}`},()=>{block.data.size=n;applyText(block,blockText(block));setDirty(true);renderBlocks();pushHistory();openBlockMenu(block)}));
  }
  if(block.type==="list"){
    [["•","منقطة","bullet"],["1.","مرقمة","numbered"],["✓","قائمة مهام","checklist"]].forEach(([icon,label,kind])=>blockActions.appendChild(menuButton({icon,label,desc:"تغيير نوع القائمة"},()=>{block.data.kind=kind;setDirty(true);renderBlocks();pushHistory();openBlockMenu(block)})));
  }
  if(block.type==="table"){
    blockActions.appendChild(menuButton({icon:"＋",label:"إضافة صف",desc:"صف جديد أسفل الجدول"},()=>{const cols=Math.max(1,...(block.data.rows||[]).map(r=>r.length));block.data.rows.push(Array(cols).fill(""));rebuildTableHtml(block);setDirty(true);renderBlocks();pushHistory();openBlockMenu(block)}));
    blockActions.appendChild(menuButton({icon:"＋",label:"إضافة عمود",desc:"عمود جديد"},()=>{(block.data.rows||[]).forEach(r=>r.push(""));rebuildTableHtml(block);setDirty(true);renderBlocks();pushHistory();openBlockMenu(block)}));
    blockActions.appendChild(menuButton({icon:"▦",label:block.data.is_bordered===false?"تفعيل الحدود":"إلغاء الحدود",desc:"حدود الجدول والخلايا"},()=>{block.data.is_bordered=block.data.is_bordered===false?true:false;rebuildTableHtml(block);setDirty(true);pushHistory();openBlockMenu(block)}));
    blockActions.appendChild(menuButton({icon:"≋",label:block.data.is_striped?"إلغاء الصفوف المخططة":"صفوف مخططة",desc:"تمييز الصفوف بالتناوب"},()=>{block.data.is_striped=!block.data.is_striped;setDirty(true);pushHistory();openBlockMenu(block)}));
    blockActions.appendChild(menuButton({icon:"↔",label:block.data.is_compact?"إلغاء الوضع المضغوط":"وضع مضغوط",desc:"تقليل المسافات داخل الخلايا"},()=>{block.data.is_compact=!block.data.is_compact;setDirty(true);pushHistory();openBlockMenu(block)}));
  }
  if(block.type==="details")blockActions.appendChild(menuButton({icon:"✎",label:"تعديل العنوان",desc:"عنوان قسم التفاصيل"},()=>{const value=prompt("عنوان التفاصيل",String(block.data.summary_html||"تفاصيل").replace(/<[^>]+>/g,""));if(value!==null){block.data.summary_html=escapeHtml(value||"تفاصيل");setDirty(true);renderBlocks();pushHistory()}}));
  if(["photo","video","animation","audio","voice","document"].includes(block.type))blockActions.appendChild(menuButton({icon:"ID",label:"ربط file_id",desc:"Beta: أدخل Telegram file_id"},()=>{const value=prompt("Telegram file_id",block.data?.file?.file_id||"");if(value){block.data.file={...(block.data.file||{}),file_id:value.trim()};block.data._draft=false;setDirty(true);renderBlocks();pushHistory()}}));
  if(block.type==="map"){
    blockActions.appendChild(menuButton({icon:"⌖",label:"تحديد الإحداثيات",desc:"Latitude, Longitude"},()=>{const value=prompt("latitude, longitude",`${block.data.latitude||0}, ${block.data.longitude||0}`);if(value){const [a,b]=value.split(",").map(Number);if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a)<=90&&Math.abs(b)<=180){block.data.latitude=a;block.data.longitude=b;block.data._draft=false;setDirty(true);renderBlocks();pushHistory()}else toast("إحداثيات غير صالحة")}}));
  }
  blockActions.appendChild(menuButton({icon:"↑",label:"تحريك للأعلى",desc:"تغيير ترتيب الـBlock"},()=>moveBlock(block.id,-1)));
  blockActions.appendChild(menuButton({icon:"↓",label:"تحريك للأسفل",desc:"تغيير ترتيب الـBlock"},()=>moveBlock(block.id,1)));
  blockActions.appendChild(menuButton({icon:"＋",label:"إضافة بعده",desc:"فتح قائمة كل الـBlocks"},()=>{insertIndex=current.blocks.findIndex(b=>b.id===block.id)+1;showBlockPicker()}));
  blockActions.appendChild(menuButton({icon:"×",label:"حذف",desc:"حذف هذا الـBlock"},()=>{if(confirm(`حذف ${typeLabel(block.type)}؟`))deleteBlock(block.id)}));
  blockMenu.classList.remove("hidden");slashMenu.classList.add("hidden")
}

function unresolvedBlocks(){return current.blocks.filter(b=>{const d=b.data||{};if(["photo","video","animation","audio","voice","document"].includes(b.type))return !d.file?.file_id;if(["collage","slideshow"].includes(b.type))return !(d.children||[]).length;if(b.type==="map")return d._draft===true;return false})}

async function loadPages(){
  try{const data=await api("/miniapp/api/pages");pagesEl.innerHTML="";$("emptyPages").classList.toggle("hidden",data.pages.length>0);for(const p of data.pages){const card=document.createElement("div");card.className="page-card";card.innerHTML=`<div><h3>${escapeHtml(p.title)}</h3><div class="meta">${p.block_count} Block · <code>${p.page_id}</code></div></div><button>فتح</button>`;card.querySelector("button").addEventListener("click",()=>openPage(p.page_id));pagesEl.appendChild(card)}}catch(e){pagesEl.innerHTML=`<div class="empty">تعذر فتح Beta 0.2<br>${escapeHtml(e.message)}</div>`}
}
async function openPage(id){
  try{const data=await api(`/miniapp/api/pages/${encodeURIComponent(id)}`);current=data.page;current.blocks=(current.blocks||[]).sort((a,b)=>(a.position||0)-(b.position||0));normalizePositions();pageTitle.value=current.title||id;pageCode.textContent=id;selectedBlockId=null;insertIndex=current.blocks.length;renderBlocks();pagesView.classList.remove("active");editorView.classList.add("active");setDirty(false);history=[];future=[];pushHistory();slashInput.value="";slashInput.focus()}catch(e){toast(e.message)}
}

slashInput.addEventListener("input",()=>{
  autoGrow(slashInput);const value=slashInput.value;const match=value.match(/^\/([^\s]*)$/);
  if(match){showBlockPicker(BLOCKS.map(b=>b.type),match[1]);return}
  slashMenu.classList.add("hidden");
});
slashInput.addEventListener("keydown",e=>{if(e.key==="Escape")hideMenus();if(e.key==="Enter"&&!e.shiftKey&&slashInput.value.trim()){e.preventDefault();const block=defaultBlock("paragraph");applyText(block,slashInput.value);const at=Number.isInteger(insertIndex)?insertIndex:current.blocks.length;current.blocks.splice(at,0,block);insertIndex=at+1;normalizePositions();slashInput.value="";autoGrow(slashInput);setDirty(true);renderBlocks();pushHistory()}});

pageTitle.addEventListener("input",()=>{if(current){current.title=pageTitle.value;setDirty(true);scheduleHistory()}});
undoBtn.addEventListener("click",undo);redoBtn.addEventListener("click",redo);
$("backBtn").addEventListener("click",()=>{hideMenus();editorView.classList.remove("active");pagesView.classList.add("active");current=null;history=[];future=[];setDirty(false);loadPages()});
$("allBlocksBtn").addEventListener("click",()=>{insertIndex=current?.blocks?.length||0;showBlockPicker()});
document.querySelectorAll("[data-tool]").forEach(btn=>btn.addEventListener("click",()=>{insertIndex=Number.isInteger(insertIndex)?insertIndex:(current?.blocks?.length||0);showBlockPicker(CATEGORIES[btn.dataset.tool]||BLOCKS.map(b=>b.type))}));
document.addEventListener("click",e=>{if(!e.target.closest(".popup-menu,.composer-toolbar,.block"))blockMenu.classList.add("hidden")});

saveBtn.addEventListener("click",async()=>{
  if(!current||!dirty)return;const unresolved=unresolvedBlocks();if(unresolved.length){toast(`أكمل ${typeLabel(unresolved[0].type)} قبل الحفظ`);selectBlock(unresolved[0].id);return}
  saveBtn.disabled=true;saveBtn.textContent="جارٍ الحفظ…";saveState.textContent="جارٍ الحفظ";
  try{normalizePositions();await api(`/miniapp/api/pages/${encodeURIComponent(current.page_id)}`,{method:"PUT",body:JSON.stringify({title:pageTitle.value,blocks:current.blocks})});current.title=pageTitle.value;setDirty(false);history=[];future=[];pushHistory();toast("تم الحفظ بنفس كود CBD")}
  catch(e){setDirty(true);toast(`فشل الحفظ: ${e.message}`)}
});

if(!tg?.initData){pagesEl.innerHTML='<div class="empty">افتح التطبيق من داخل Telegram حتى يتم التحقق من حساب المطور.</div>'}else loadPages();
