// Beta 0.3.32 — formula-first editor with live preview and quick LaTeX tools.
(() => {
  const KATEX_VERSION = "0.16.11";
  const editingBlocks = new Set();
  const QUICK_INSERTS = [
    ["frac","\\frac{}{}",6],
    ["√","\\sqrt{}",6],
    ["x²","^{}",2],
    ["xₙ","_{}",2],
    ["Σ","\\sum_{}^{}",6],
    ["∫","\\int_{}^{}",6],
    ["π","\\pi",3],
    ["∞","\\infty",6],
  ];
  let katexPromise = null;

  function ensureKatex() {
    if (window.katex?.render) return Promise.resolve(window.katex);
    if (katexPromise) return katexPromise;
    if (!document.querySelector('link[data-rich-katex]')) {
      const link=document.createElement("link");link.rel="stylesheet";link.href=`https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;link.crossOrigin="anonymous";link.dataset.richKatex="1";document.head.appendChild(link);
    }
    katexPromise=new Promise((resolve,reject)=>{
      const existing=document.querySelector('script[data-rich-katex]');
      if(existing){if(window.katex?.render)resolve(window.katex);else{existing.addEventListener("load",()=>resolve(window.katex),{once:true});existing.addEventListener("error",reject,{once:true});}return;}
      const script=document.createElement("script");script.src=`https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;script.crossOrigin="anonymous";script.dataset.richKatex="1";script.addEventListener("load",()=>resolve(window.katex),{once:true});script.addEventListener("error",reject,{once:true});document.head.appendChild(script);
    }).catch(()=>null);
    return katexPromise;
  }

  function haptic(kind="selection"){
    try{const feedback=window.Telegram?.WebApp?.HapticFeedback;if(kind==="medium")feedback?.impactOccurred?.("medium");else feedback?.selectionChanged?.();}catch(_){}
  }
  const inlineMathPayload=expression=>({type:"paragraph",text:{type:"mathematical_expression",expression}});
  const blockMathPayload=expression=>({type:"mathematical_expression",expression});
  function inferSeparateLine(data){if(typeof data.separate_line==="boolean")return data.separate_line;if(data.native_data?.type==="paragraph")return false;if(data.native_data?.type==="mathematical_expression")return true;return Boolean(String(data.text||"").trim());}
  function syncMathData(block,expression,separateLine){const d=block.data||(block.data={});d.text=expression;d.separate_line=Boolean(separateLine);d.rich_text=null;d.native=true;if(separateLine){d.html=`<tg-math-block>${escapeHtml(expression)}</tg-math-block>`;d.native_data=blockMathPayload(expression);}else{d.html=`<p><tg-math>${escapeHtml(expression)}</tg-math></p>`;d.native_data=inlineMathPayload(expression);}}

  function renderFormula(target,expression,separateLine,{emptyText=""}={}){
    const latex=String(expression||"");target.dataset.latex=latex;target.dataset.display=separateLine?"block":"inline";target.classList.toggle("display-formula",Boolean(separateLine));target.classList.toggle("inline-formula",!separateLine);
    if(!latex.trim()){target.classList.add("is-empty");target.textContent=emptyText||"اكتب صيغة LaTeX";return;}target.classList.remove("is-empty");
    if(window.katex?.render){try{window.katex.render(latex,target,{displayMode:Boolean(separateLine),throwOnError:false,strict:"ignore",trust:false,output:"htmlAndMathml"});return;}catch(_){}}
    target.textContent=latex;ensureKatex().then(katex=>{if(!katex?.render||!target.isConnected||target.dataset.latex!==latex)return;renderFormula(target,latex,separateLine,{emptyText});});
  }

  function formulaView(block){
    const d=block.data||(block.data={}),separateLine=inferSeparateLine(d);syncMathData(block,String(d.text||""),separateLine);
    const view=document.createElement("div");view.className="math-formula-view";view.tabIndex=0;view.setAttribute("role","button");view.setAttribute("aria-label","اضغط لتعديل المعادلة");view.title="اضغط لتعديل المعادلة";renderFormula(view,d.text||"",separateLine,{emptyText:"اضغط لإضافة المعادلة"});
    const openEditor=event=>{event?.preventDefault?.();event?.stopPropagation?.();editingBlocks.add(String(block.id));haptic();try{selectBlock(block.id);}catch(_){}try{renderBlocks();}catch(_){}requestAnimationFrame(()=>{const input=Array.from(document.querySelectorAll(".block[data-id] .math-latex-input")).find(el=>String(el.closest(".block")?.dataset?.id)===String(block.id));input?.focus?.({preventScroll:true});input?.scrollIntoView?.({block:"nearest",behavior:"smooth"});});};
    view.addEventListener("click",openEditor);view.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" ")openEditor(event);});ensureKatex();return view;
  }

  function insertSnippet(input,snippet,cursorBack=0){
    const start=Number.isInteger(input.selectionStart)?input.selectionStart:input.value.length;const end=Number.isInteger(input.selectionEnd)?input.selectionEnd:start;input.setRangeText(snippet,start,end,"end");const pos=Math.max(start,start+snippet.length-cursorBack);input.setSelectionRange(pos,pos);input.dispatchEvent(new Event("input",{bubbles:true}));input.focus({preventScroll:true});haptic();
  }

  function formulaEditor(block){
    const d=block.data||(block.data={});let separateLine=inferSeparateLine(d);syncMathData(block,String(d.text||""),separateLine);
    const wrap=document.createElement("section");wrap.className="telegram-math-editor";wrap.setAttribute("aria-label","تعديل المعادلة");
    const field=document.createElement("label");field.className="math-field";const fieldTitle=document.createElement("span");fieldTitle.className="math-field-title";fieldTitle.textContent="LaTeX";const input=document.createElement("textarea");input.className="math-latex-input";input.rows=2;input.spellcheck=false;input.autocapitalize="off";input.autocomplete="off";input.placeholder="x_{1,2}=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}";input.value=String(d.text||"");field.append(fieldTitle,input);

    const quick=document.createElement("div");quick.className="math-symbol-strip";quick.setAttribute("aria-label","رموز رياضية سريعة");QUICK_INSERTS.forEach(([label,snippet,back])=>{const btn=document.createElement("button");btn.type="button";btn.textContent=label;btn.title=snippet;btn.addEventListener("pointerdown",event=>event.preventDefault());btn.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();insertSnippet(input,snippet,back);});quick.appendChild(btn);});

    const option=document.createElement("label");option.className="math-line-option";const checkbox=document.createElement("input");checkbox.type="checkbox";checkbox.checked=separateLine;checkbox.setAttribute("aria-label","صيغة في سطر منفصل");const box=document.createElement("span");box.className="math-check-box";box.setAttribute("aria-hidden","true");const optionText=document.createElement("span");optionText.textContent="صيغة في سطر منفصل";option.append(checkbox,box,optionText);
    const resultHead=document.createElement("div");resultHead.className="math-result-head";resultHead.textContent="المعاينة";const preview=document.createElement("div");preview.className="math-live-preview";preview.setAttribute("aria-live","polite");
    const actions=document.createElement("div");actions.className="math-editor-actions";const done=document.createElement("button");done.type="button";done.className="math-done-button";done.textContent="تم";actions.appendChild(done);
    function update({dirty=true}={}){separateLine=checkbox.checked;syncMathData(block,input.value,separateLine);renderFormula(preview,input.value,separateLine,{emptyText:"اكتب صيغة LaTeX حتى تظهر المعاينة هنا"});if(dirty){try{markDirty();}catch(_){}}}
    input.addEventListener("focus",()=>{try{selectBlock(block.id);}catch(_){}});input.addEventListener("input",()=>update());checkbox.addEventListener("change",()=>{haptic();update();});done.addEventListener("pointerdown",event=>event.stopPropagation());done.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();update();editingBlocks.delete(String(block.id));haptic("medium");try{renderBlocks();}catch(_){}});
    wrap.append(field,quick,option,resultHead,preview,actions);renderFormula(preview,input.value,separateLine,{emptyText:"اكتب صيغة LaTeX حتى تظهر المعاينة هنا"});ensureKatex();return wrap;
  }

  function mathEditor(block){const id=String(block.id),d=block.data||(block.data={});if(!String(d.text||"").trim())editingBlocks.add(id);return editingBlocks.has(id)?formulaEditor(block):formulaView(block);}
  const baseTextEditor=typeof textEditor==="function"?textEditor:null;if(!baseTextEditor)return;textEditor=function(block){if(block?.type==="mathematical_expression")return mathEditor(block);return baseTextEditor(block);};
  requestAnimationFrame(()=>{try{if(current?.blocks?.some?.(block=>block.type==="mathematical_expression"))renderBlocks?.();}catch(_){}});
})();
