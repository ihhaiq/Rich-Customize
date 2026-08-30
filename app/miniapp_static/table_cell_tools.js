// Beta 0.3.32 — consolidated Telegram-style table cell/row/column tools.
(() => {
  const state = {
    blockId:null,
    row:-1,
    col:-1,
    scope:"cell",
    anchor:null,
    anchorRect:null,
    menu:null,
  };

  function haptic(kind = "selection") {
    try {
      const feedback = window.Telegram?.WebApp?.HapticFeedback;
      if (kind === "medium") feedback?.impactOccurred?.("medium");
      else feedback?.selectionChanged?.();
    } catch (_) {}
  }

  function currentTableBlock() {
    if (!state.blockId || typeof current === "undefined") return null;
    return current?.blocks?.find?.(block => String(block.id) === String(state.blockId) && block.type === "table") || null;
  }

  function cellObject(raw) {
    return typeof raw === "object" && raw !== null ? {...raw} : {text:String(raw ?? "")};
  }

  function rowsFor(block) {
    if (!block) return [];
    const d = block.data || (block.data = {});
    return Array.isArray(d.rows) ? d.rows : (d.rows = []);
  }

  function ensureCell(block, ri, ci) {
    const rows = rowsFor(block);
    if (!rows[ri] || ci < 0 || ci >= rows[ri].length) return null;
    const cell = cellObject(rows[ri][ci]);
    if (!cell.valign) cell.valign = "middle";
    rows[ri][ci] = cell;
    return cell;
  }

  function targetCells(block) {
    const rows = rowsFor(block);
    if (!rows[state.row]) return [];
    if (state.scope === "row") {
      return rows[state.row].map((_, ci) => ({ri:state.row, ci, cell:ensureCell(block,state.row,ci)})).filter(item => item.cell);
    }
    if (state.scope === "column") {
      return rows.map((row, ri) => row?.[state.col] === undefined ? null : ({ri,ci:state.col,cell:ensureCell(block,ri,state.col)})).filter(Boolean);
    }
    const cell = ensureCell(block,state.row,state.col);
    return cell ? [{ri:state.row,ci:state.col,cell}] : [];
  }

  function logicalColumnCount(rows) {
    return Math.max(1,...rows.map(row => (row || []).reduce((sum,raw) => sum + Math.max(1,Number(cellObject(raw).colspan || 1)),0)));
  }

  function sync(block,{rerender=true}={}) {
    try { rebuildTableHtml?.(block); } catch (_) {}
    try { markDirty?.(); } catch (_) {}
    try { pushHistory?.(); } catch (_) {}
    if (rerender) {
      closeMenu();
      try { renderBlocks?.(); } catch (_) {}
    }
  }

  function setHorizontal(value) {
    const block=currentTableBlock(); if(!block)return;
    targetCells(block).forEach(({cell}) => {cell.align=value;});
    haptic(); sync(block);
  }
  function setVertical(value) {
    const block=currentTableBlock(); if(!block)return;
    targetCells(block).forEach(({cell}) => {cell.valign=value;});
    haptic(); sync(block);
  }
  function toggleShade() {
    const block=currentTableBlock(); if(!block)return;
    const targets=targetCells(block); const turnOn=targets.some(({cell})=>!cell.is_header);
    targets.forEach(({cell})=>{cell.is_header=turnOn;});
    haptic("medium"); sync(block);
  }

  function mergeRight() {
    const block=currentTableBlock(); if(!block)return;
    const row=rowsFor(block)[state.row];
    if(!row||state.col<0||state.col>=row.length-1){window.toast?.(mt("table.no_next_cell"));return;}
    const left=cellObject(row[state.col]); const right=cellObject(row[state.col+1]);
    left.colspan=Math.max(1,Number(left.colspan||1))+Math.max(1,Number(right.colspan||1));
    const a=String(left.text||"").trim(),b=String(right.text||"").trim();
    if(!a&&b)left.text=b; else if(a&&b)left.text=`${a} ${b}`;
    row[state.col]=left; row.splice(state.col+1,1); haptic("medium"); sync(block);
  }

  function unmerge() {
    const block=currentTableBlock(); if(!block)return;
    const row=rowsFor(block)[state.row]; if(!row?.[state.col])return;
    const cell=cellObject(row[state.col]); const span=Math.max(1,Number(cell.colspan||1));
    if(span<=1){window.toast?.(mt("table.not_merged"));return;}
    cell.colspan=1; row[state.col]=cell;
    for(let i=1;i<span;i+=1)row.splice(state.col+i,0,{text:"",align:cell.align||"left",valign:cell.valign||"middle"});
    haptic("medium"); sync(block);
  }

  function addRow(offset) {
    const block=currentTableBlock(); if(!block)return;
    const rows=rowsFor(block); const width=logicalColumnCount(rows);
    const next=Array.from({length:width},()=>({text:"",align:"left",valign:"middle"}));
    rows.splice(Math.max(0,Math.min(rows.length,state.row+offset)),0,next); haptic(); sync(block);
  }
  function deleteRow() {
    const block=currentTableBlock(); if(!block)return;
    const rows=rowsFor(block); if(rows.length<=1){window.toast?.(mt("table.keep_one_row"));return;}
    rows.splice(state.row,1); haptic("medium"); sync(block);
  }
  function addColumn(offset) {
    const block=currentTableBlock(); if(!block)return;
    const rows=rowsFor(block); const index=Math.max(0,state.col+offset);
    rows.forEach(row=>row.splice(Math.min(index,row.length),0,{text:"",align:"left",valign:"middle"}));
    haptic(); sync(block);
  }
  function deleteColumn() {
    const block=currentTableBlock(); if(!block)return;
    const rows=rowsFor(block); const width=Math.max(0,...rows.map(row=>row.length));
    if(width<=1){window.toast?.(mt("table.keep_one_column"));return;}
    rows.forEach(row=>{if(state.col<row.length)row.splice(state.col,1);}); haptic("medium"); sync(block);
  }
  function toggleTableFlag(key) {
    const block=currentTableBlock(); if(!block)return;
    const d=block.data||(block.data={});
    if(key==="is_bordered") d[key]=d[key]===false?true:false;
    else d[key]=d[key]?null:true;
    haptic(); sync(block);
  }

  const icons={
    left:'<svg viewBox="0 0 24 24"><path d="M5 5v14M8 8h10M8 12h7M8 16h10"/></svg>',
    center:'<svg viewBox="0 0 24 24"><path d="M12 4v16M6 8h12M8 12h8M6 16h12"/></svg>',
    right:'<svg viewBox="0 0 24 24"><path d="M19 5v14M6 8h10M9 12h7M6 16h10"/></svg>',
    top:'<svg viewBox="0 0 24 24"><path d="M5 5h14M8 8v10M12 8v7M16 8v10"/></svg>',
    middle:'<svg viewBox="0 0 24 24"><path d="M4 12h16M8 6v12M12 8v8M16 6v12"/></svg>',
    bottom:'<svg viewBox="0 0 24 24"><path d="M5 19h14M8 6v10M12 9v7M16 6v10"/></svg>',
    shade:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m6 16 10-10M8 20 20 8M4 12l8-8"/></svg>',
    merge:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="7" height="10" rx="2"/><rect x="14" y="7" width="7" height="10" rx="2"/><path d="M9 12h6m-2-2 2 2-2 2"/></svg>',
    split:'<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="10" rx="2"/><path d="M12 7v10M10 10l-2 2 2 2M14 10l2 2-2 2"/></svg>',
    up:'<svg viewBox="0 0 24 24"><path d="M12 18V7m-4 4 4-4 4 4"/><path d="M5 20h14"/></svg>',
    down:'<svg viewBox="0 0 24 24"><path d="M12 6v11m-4-4 4 4 4-4"/><path d="M5 4h14"/></svg>',
    colLeft:'<svg viewBox="0 0 24 24"><path d="M8 4v16M15 5v14M4 12h4m-2-2-2 2 2 2"/></svg>',
    colRight:'<svg viewBox="0 0 24 24"><path d="M9 5v14M16 4v16m0-8h4m-2-2 2 2-2 2"/></svg>',
    border:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M10 4v16"/></svg>',
    compact:'<svg viewBox="0 0 24 24"><path d="M5 7h14M5 12h14M5 17h14"/></svg>',
    stripe:'<svg viewBox="0 0 24 24"><path d="M5 6h14M5 10h14M5 14h14M5 18h14"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"/></svg>',
  };

  function iconButton(label,svg,handler,active=false){
    const btn=document.createElement("button");btn.type="button";btn.className=`table-tool-icon${active?" active":""}`;btn.title=label;btn.setAttribute("aria-label",label);btn.innerHTML=svg;
    btn.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();handler();});return btn;
  }
  function actionRow(icon,title,handler,danger=false){
    const btn=document.createElement("button");btn.type="button";btn.className=`table-tool-row${danger?" danger":""}`;btn.innerHTML=`<span class="table-tool-row-icon">${icon}</span><strong>${title}</strong>`;
    btn.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();handler();});return btn;
  }

  function closeMenu(){state.menu?.remove?.();state.menu=null;}
  function clearSelectionVisuals(){
    document.querySelectorAll(".telegram-table td.table-cell-selected,.telegram-table td.table-column-selected").forEach(td=>td.classList.remove("table-cell-selected","table-column-selected"));
    document.querySelectorAll(".telegram-table tr.table-row-selected").forEach(tr=>tr.classList.remove("table-row-selected"));
    document.querySelectorAll(".table-cell-handle").forEach(handle=>handle.remove());
  }
  function refreshScopeVisuals(){
    document.querySelectorAll(".telegram-table td.table-column-selected").forEach(td=>td.classList.remove("table-column-selected"));
    document.querySelectorAll(".telegram-table tr.table-row-selected").forEach(tr=>tr.classList.remove("table-row-selected"));
    const blockEl=Array.from(document.querySelectorAll(".block[data-id]")).find(el=>String(el.dataset.id)===String(state.blockId));
    if(!blockEl)return;
    if(state.scope==="row")blockEl.querySelector(`.telegram-table tr:nth-child(${state.row+1})`)?.classList.add("table-row-selected");
    if(state.scope==="column")blockEl.querySelectorAll(`.telegram-table td:nth-child(${state.col+1})`).forEach(td=>td.classList.add("table-column-selected"));
  }

  function viewportBounds(){
    const vv=window.visualViewport;const left=Number(vv?.offsetLeft||0),top=Number(vv?.offsetTop||0),width=Number(vv?.width||window.innerWidth||1),height=Number(vv?.height||window.innerHeight||1);
    return{left,top,right:left+width,bottom:top+height};
  }
  function anchorRect(){if(state.anchor?.isConnected)state.anchorRect=state.anchor.getBoundingClientRect();return state.anchorRect;}
  function positionMenu(pin=null){
    if(!state.menu)return;const menu=state.menu,bounds=viewportBounds(),margin=10,width=menu.offsetWidth||304;let left,top;
    if(pin){left=pin.left;top=pin.top;}else{const anchor=anchorRect();if(!anchor)return;left=anchor.left;top=anchor.bottom+8;}
    left=Math.max(bounds.left+margin,Math.min(left,bounds.right-width-margin));
    top=Math.max(bounds.top+margin,top);
    menu.style.left=`${Math.round(left)}px`;menu.style.top=`${Math.round(top)}px`;
    menu.style.maxHeight=`${Math.max(150,Math.floor(bounds.bottom-top-margin))}px`;
  }

  function buildMenu({preserve=false}={}){
    const pin=preserve&&state.menu?state.menu.getBoundingClientRect():null;anchorRect();closeMenu();
    const block=currentTableBlock();if(!block)return;const rows=rowsFor(block),raw=rows[state.row]?.[state.col];if(raw===undefined)return;const cell=cellObject(raw),d=block.data||{};
    const menu=document.createElement("aside");menu.className="table-cell-menu";menu.setAttribute("role","dialog");menu.setAttribute("aria-label",mt("table.customize"));menu.addEventListener("pointerdown",event=>event.stopPropagation());
    const scope=document.createElement("div");scope.className="table-scope-switch";
    [["cell",mt("table.cell")],["row",mt("table.row")],["column",mt("table.column")]].forEach(([value,label])=>{const btn=document.createElement("button");btn.type="button";btn.textContent=label;btn.classList.toggle("active",state.scope===value);btn.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();if(state.scope===value)return;state.scope=value;refreshScopeVisuals();haptic();buildMenu({preserve:true});});scope.appendChild(btn);});
    menu.appendChild(scope);
    const title=document.createElement("div");title.className="table-tool-title";title.textContent=mt("table.alignment");menu.appendChild(title);
    const representative=state.scope==="row"?cellObject(rows[state.row]?.[0]):state.scope==="column"?cellObject(rows.find(row=>row?.[state.col]!==undefined)?.[state.col]):cell;
    const align=document.createElement("div");align.className="table-align-grid";align.append(
      iconButton(mt("table.align_left"),icons.left,()=>setHorizontal("left"),representative.align==="left"),iconButton(mt("table.align_center"),icons.center,()=>setHorizontal("center"),representative.align==="center"),iconButton(mt("table.align_right"),icons.right,()=>setHorizontal("right"),representative.align==="right"),
      iconButton(mt("table.align_top"),icons.top,()=>setVertical("top"),representative.valign==="top"),iconButton(mt("table.align_middle"),icons.middle,()=>setVertical("middle"),!representative.valign||representative.valign==="middle"),iconButton(mt("table.align_bottom"),icons.bottom,()=>setVertical("bottom"),representative.valign==="bottom")
    );menu.appendChild(align);
    const sep=()=>{const el=document.createElement("div");el.className="table-tool-sep";menu.appendChild(el);};sep();
    const scopeLabel=state.scope==="row"?mt("table.row"):state.scope==="column"?mt("table.column"):mt("table.cell");
    menu.appendChild(actionRow(icons.shade,mt("table.shade_scope",{scope:scopeLabel}),toggleShade));
    if(state.scope==="cell"){menu.appendChild(actionRow(icons.merge,mt("table.merge_next"),mergeRight));if(Number(cell.colspan||1)>1)menu.appendChild(actionRow(icons.split,mt("table.unmerge"),unmerge));}
    sep();
    menu.appendChild(actionRow(icons.up,mt("table.add_row_above"),()=>addRow(0)));menu.appendChild(actionRow(icons.down,mt("table.add_row_below"),()=>addRow(1)));menu.appendChild(actionRow(icons.trash,mt("table.delete_row"),deleteRow,true));
    sep();
    menu.appendChild(actionRow(icons.colLeft,mt("table.add_column_before"),()=>addColumn(0)));menu.appendChild(actionRow(icons.colRight,mt("table.add_column_after"),()=>addColumn(1)));menu.appendChild(actionRow(icons.trash,mt("table.delete_column"),deleteColumn,true));
    sep();
    menu.appendChild(actionRow(icons.border,d.is_bordered===false?mt("table.show_borders"):mt("table.hide_borders"),()=>toggleTableFlag("is_bordered")));
    menu.appendChild(actionRow(icons.stripe,d.is_striped?mt("table.unstriped"):mt("table.striped"),()=>toggleTableFlag("is_striped")));
    menu.appendChild(actionRow(icons.compact,d.is_compact?mt("table.uncompact"):mt("table.compact"),()=>toggleTableFlag("is_compact")));
    document.body.appendChild(menu);state.menu=menu;positionMenu(pin?{left:pin.left,top:pin.top}:null);requestAnimationFrame(()=>menu.classList.add("show"));
  }

  function selectCell(block,td,ri,ci){
    state.blockId=String(block.id);state.row=ri;state.col=ci;state.scope="cell";closeMenu();clearSelectionVisuals();td.classList.add("table-cell-selected");
    const handle=document.createElement("button");handle.type="button";handle.className="table-cell-handle";handle.setAttribute("aria-label",mt("table.cell_options"));handle.innerHTML="<span></span><span></span><span></span>";
    handle.addEventListener("pointerdown",event=>event.stopPropagation());handle.addEventListener("click",event=>{event.preventDefault();event.stopPropagation();state.anchor=handle;state.anchorRect=handle.getBoundingClientRect();haptic();buildMenu();});td.appendChild(handle);
  }

  function enhancedTableEditor(block){
    const d=block.data||(block.data={}),wrap=document.createElement("div");wrap.className="telegram-table telegram-table-contextual";if(d.is_bordered===false)wrap.classList.add("no-borders");if(d.is_striped)wrap.classList.add("striped");if(d.is_compact)wrap.classList.add("compact");
    const table=document.createElement("table"),rows=Array.isArray(d.rows)?d.rows:(d.rows=[]);
    rows.forEach((row,ri)=>{const tr=document.createElement("tr");row.forEach((raw,ci)=>{const cell=cellObject(raw),td=document.createElement("td");td.dataset.row=String(ri);td.dataset.col=String(ci);if(cell.colspan)td.colSpan=Math.max(1,Number(cell.colspan));if(cell.rowspan)td.rowSpan=Math.max(1,Number(cell.rowspan));td.style.textAlign=cell.align||"left";td.style.verticalAlign=cell.valign||"middle";if(cell.is_header)td.classList.add("table-cell-shaded");
      const input=document.createElement("input");input.value=cell.text||"";input.placeholder=`${ri+1}:${ci+1}`;input.addEventListener("focus",()=>{selectBlock?.(block.id);selectCell(block,td,ri,ci);});input.addEventListener("pointerdown",()=>selectCell(block,td,ri,ci));input.addEventListener("input",()=>{const next=cellObject(rows[ri][ci]);next.text=input.value;if(!next.valign)next.valign="middle";rows[ri][ci]=next;try{rebuildTableHtml?.(block);}catch(_){}try{markDirty?.();}catch(_){}});td.appendChild(input);tr.appendChild(td);});table.appendChild(tr);});wrap.appendChild(table);return wrap;
  }

  if(typeof tableEditor==="function")tableEditor=enhancedTableEditor;
  document.addEventListener("pointerdown",event=>{const target=event.target,insideMenu=Boolean(state.menu?.contains?.(target)),onHandle=Boolean(target.closest?.(".table-cell-handle"));if(insideMenu||onHandle)return;if(state.menu)closeMenu();if(!target.closest?.(".telegram-table")){clearSelectionVisuals();state.anchor=null;state.anchorRect=null;}},true);
  const reposition=()=>positionMenu();window.addEventListener("resize",reposition,{passive:true});window.visualViewport?.addEventListener("resize",reposition,{passive:true});window.visualViewport?.addEventListener("scroll",reposition,{passive:true});window.addEventListener("scroll",reposition,{passive:true,capture:true});
})();
