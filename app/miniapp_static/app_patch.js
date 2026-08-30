// Beta 0.3.4 — block long-press menu contains only quick actions.
function openBlockMenu(block){
  if(!block||!current?.blocks)return;
  slashMenu.classList.add("hidden");
  blockActions.innerHTML="";
  blockMenuTitle.textContent=info(block.type).label;
  blockMenu.classList.add("block-quick-menu");

  const index=current.blocks.findIndex(item=>item.id===block.id);

  const up=menuButton("up",mt("action.move_up"),"",()=>{
    moveBlock(block.id,-1);
    hideMenus();
  });
  up.disabled=index<=0;
  blockActions.appendChild(up);

  const down=menuButton("down",mt("action.move_down"),"",()=>{
    moveBlock(block.id,1);
    hideMenus();
  });
  down.disabled=index<0||index>=current.blocks.length-1;
  blockActions.appendChild(down);

  blockActions.appendChild(menuButton("delete",mt("action.delete_block"),"",()=>{
    deleteBlock(block.id);
    hideMenus();
  },"danger"));

  blockMenu.classList.remove("hidden");
}
