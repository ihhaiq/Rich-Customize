const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $ = (id) => document.getElementById(id);
const pagesView = $("pagesView");
const editorView = $("editorView");
const pagesEl = $("pages");
const blocksEl = $("blocks");
const saveBtn = $("saveBtn");
const pageTitle = $("pageTitle");
const pageCode = $("pageCode");
let current = null;
let dirty = false;

function toast(text){const el=$("toast");el.textContent=text;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),1800)}
function setDirty(value=true){dirty=value;saveBtn.disabled=!value;saveBtn.textContent=value?"حفظ التعديلات":"تم الحفظ"}
function headers(){return {"X-Telegram-Init-Data":tg?.initData||"","Content-Type":"application/json"}}
async function api(path,options={}){const res=await fetch(path,{...options,headers:{...headers(),...(options.headers||{})}});if(!res.ok)throw new Error((await res.text())||`HTTP ${res.status}`);return res.json()}
function escapeHtml(s){return String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}
function typeLabel(type){return ({paragraph:"نص",text:"نص",heading:"عنوان",footer:"تذييل",preformatted:"كود",table:"جدول",details:"تفاصيل",list:"قائمة",blockquote:"اقتباس",pullquote:"اقتباس بارز",photo:"صورة",video:"فيديو",animation:"GIF",audio:"صوت",voice:"رسالة صوتية",document:"ملف",divider:"فاصل",map:"خريطة",mathematical_expression:"معادلة",anchor:"مرساة"})[type]||type}
function editable(block){return ["paragraph","text","heading","footer","preformatted","mathematical_expression","anchor"].includes(block.type)}
function blockText(block){const d=block.data||{};return d.text??d.quote_text??d.summary_text??""}
function applyText(block,value){const d=block.data||(block.data={});d.text=value;const e=escapeHtml(value);if(block.type==="heading"){const size=Math.max(1,Math.min(6,Number(d.size||2)));d.html=`<h${size}>${e}</h${size}>`}else if(block.type==="footer")d.html=`<footer>${e}</footer>`;else if(block.type==="preformatted")d.html=`<pre>${e}</pre>`;else if(block.type==="mathematical_expression")d.html=`<tg-math-block>${e}</tg-math-block>`;else if(block.type==="anchor")d.html=`<a name="${e}"></a>`;else d.html=`<p>${e}</p>`;d.rich_text=null}

async function loadPages(){try{const data=await api("/miniapp/api/pages");pagesEl.innerHTML="";$("emptyPages").classList.toggle("hidden",data.pages.length>0);for(const p of data.pages){const card=document.createElement("div");card.className="page-card";card.innerHTML=`<div><h3>${escapeHtml(p.title)}</h3><div class="meta">${p.block_count} Block · <code>${p.page_id}</code></div></div><button class="primary">فتح</button>`;card.querySelector("button").onclick=()=>openPage(p.page_id);pagesEl.appendChild(card)}}catch(e){pagesEl.innerHTML=`<div class="empty">تعذر فتح Beta 0.1<br>${escapeHtml(e.message)}</div>`}}

async function openPage(id){try{const data=await api(`/miniapp/api/pages/${encodeURIComponent(id)}`);current=data.page;current.blocks=(current.blocks||[]).sort((a,b)=>(a.position||0)-(b.position||0));pageTitle.value=current.title||id;pageCode.textContent=id;renderBlocks();pagesView.classList.remove("active");editorView.classList.add("active");setDirty(false)}catch(e){toast(e.message)}}

function normalizePositions(){current.blocks.forEach((b,i)=>b.position=i)}
function moveBlock(index,delta){const next=index+delta;if(next<0||next>=current.blocks.length)return;[current.blocks[index],current.blocks[next]]=[current.blocks[next],current.blocks[index]];normalizePositions();renderBlocks();setDirty()}
function renderBlocks(){blocksEl.innerHTML="";current.blocks.forEach((block,index)=>{const el=document.createElement("article");el.className="block"+(block.type==="table"?" wide":"");const head=document.createElement("div");head.className="block-head";head.innerHTML=`<span class="block-type">${index+1}. ${escapeHtml(typeLabel(block.type))}</span><span class="move"><button ${index===0?"disabled":""}>↑</button><button ${index===current.blocks.length-1?"disabled":""}>↓</button></span>`;const [up,down]=head.querySelectorAll("button");up.onclick=()=>moveBlock(index,-1);down.onclick=()=>moveBlock(index,1);el.appendChild(head);if(editable(block)){const ta=document.createElement("textarea");ta.value=blockText(block);ta.placeholder="اكتب المحتوى...";ta.oninput=()=>{applyText(block,ta.value);setDirty()};el.appendChild(ta)}else{const ro=document.createElement("div");ro.className="readonly";if(block.type==="table"){const rows=(block.data?.rows||[]);ro.textContent=`جدول: ${rows.length} صف · محرر الجدول البصري قادم في Beta 0.2`}else ro.textContent=`هذا النوع للعرض فقط في Beta 0.1. تعديل ${typeLabel(block.type)} يبقى من محرر البوت حاليًا.`;el.appendChild(ro)}blocksEl.appendChild(el)})}

pageTitle.addEventListener("input",()=>{if(current){current.title=pageTitle.value;setDirty()}});
$("backBtn").onclick=()=>{editorView.classList.remove("active");pagesView.classList.add("active");current=null;setDirty(false);loadPages()};
saveBtn.onclick=async()=>{if(!current||!dirty)return;saveBtn.disabled=true;saveBtn.textContent="جاري الحفظ…";try{normalizePositions();await api(`/miniapp/api/pages/${encodeURIComponent(current.page_id)}`,{method:"PUT",body:JSON.stringify({title:pageTitle.value,blocks:current.blocks})});current.title=pageTitle.value;setDirty(false);toast("تم الحفظ بنفس كود CBD") }catch(e){setDirty(true);toast(`فشل الحفظ: ${e.message}`)}};

if(!tg?.initData){pagesEl.innerHTML='<div class="empty">افتح التطبيق من داخل Telegram حتى يتم التحقق من حساب المطور.</div>'}else loadPages();
