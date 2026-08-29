// Beta 0.2.1 hotfix: keep block actions fully inline and avoid prompt-based editing.
function openBlockMenu(block){
  slashMenu.classList.add("hidden");
  blockActions.innerHTML="";
  blockMenuTitle.textContent=`${info(block.type).icon} ${info(block.type).label}`;

  if(block.type==="heading"){
    for(let level=1;level<=6;level++){
      blockActions.appendChild(menuButton(`H${level}`,`العنوان ${level}`,"",()=>{
        block.data.size=level;
        applyText(block,blockText(block));
        renderBlocks();
        markDirty();
        hideMenus();
      }));
    }
    blockActions.appendChild(separator());
  }

  if(block.type==="list"){
    [["•","منقطة","bullet"],["1.","مرقمة","numbered"],["☑","قائمة مهام","checklist"]].forEach(([icon,label,kind])=>{
      blockActions.appendChild(menuButton(icon,label,"",()=>{
        block.data.kind=kind;
        renderBlocks();
        markDirty();
        hideMenus();
      }));
    });
    blockActions.appendChild(separator());
  }

  if(block.type==="table"){
    blockActions.appendChild(menuButton("＋","إضافة صف","",()=>{
      const rows=block.data.rows||(block.data.rows=[]);
      const cols=Math.max(1,...rows.map(row=>row.length));
      rows.push(Array(cols).fill(""));
      rebuildTableHtml(block);renderBlocks();markDirty();hideMenus();
    }));
    blockActions.appendChild(menuButton("＋","إضافة عمود","",()=>{
      const rows=block.data.rows||(block.data.rows=[]);
      if(!rows.length)rows.push([]);
      rows.forEach(row=>row.push(""));
      rebuildTableHtml(block);renderBlocks();markDirty();hideMenus();
    }));
    blockActions.appendChild(menuButton("▦",block.data.is_bordered===false?"إظهار الحدود":"إخفاء الحدود","",()=>{
      block.data.is_bordered=block.data.is_bordered===false;
      rebuildTableHtml(block);markDirty();hideMenus();
    }));
    blockActions.appendChild(menuButton("≋",block.data.is_striped?"إلغاء الصفوف المخططة":"صفوف مخططة","",()=>{
      block.data.is_striped=block.data.is_striped?null:true;markDirty();hideMenus();
    }));
    blockActions.appendChild(menuButton("↔",block.data.is_compact?"إلغاء الوضع المضغوط":"وضع مضغوط","",()=>{
      block.data.is_compact=block.data.is_compact?null:true;markDirty();hideMenus();
    }));
    blockActions.appendChild(separator());
  }

  const index=current.blocks.findIndex(item=>item.id===block.id);
  const up=menuButton("↑","تحريك للأعلى","",()=>{moveBlock(block.id,-1);hideMenus()});
  up.disabled=index===0;
  blockActions.appendChild(up);
  const down=menuButton("↓","تحريك للأسفل","",()=>{moveBlock(block.id,1);hideMenus()});
  down.disabled=index===current.blocks.length-1;
  blockActions.appendChild(down);
  blockActions.appendChild(separator());
  blockActions.appendChild(menuButton("⌫","حذف البلوك","",()=>deleteBlock(block.id),"danger"));
  blockMenu.classList.remove("hidden");
}
