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

// Optional ⚡ deep-black Liquid Glass mode.
(()=>{
  const ROOT_CLASS="liquid-glass-dark";
  const STORAGE_KEY="richCustomizeLiquidGlassDark";
  const STYLE_ID="liquidGlassDarkCss";
  const BUTTON_ID="liquidGlassToggle";

  function ensureThemeStyles(){
    if(document.getElementById(STYLE_ID))return;
    const link=document.createElement("link");
    link.id=STYLE_ID;
    link.rel="stylesheet";
    link.href="/miniapp/static/liquid_glass_dark.css?v=0.3.40";
    document.head.appendChild(link);
  }

  function readPreference(){
    try{return localStorage.getItem(STORAGE_KEY)==="1";}catch(_){return false;}
  }

  function savePreference(enabled){
    try{localStorage.setItem(STORAGE_KEY,enabled?"1":"0");}catch(_){}
  }

  function syncButton(button,enabled){
    if(!button)return;
    button.classList.toggle("active",enabled);
    button.setAttribute("aria-pressed",enabled?"true":"false");
    button.dataset.enabled=enabled?"1":"0";
  }

  function applyTheme(enabled,{persist=true,haptic=false}={}){
    document.documentElement.classList.toggle(ROOT_CLASS,enabled);
    syncButton(document.getElementById(BUTTON_ID),enabled);
    if(persist)savePreference(enabled);
    if(haptic){
      try{window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();}catch(_){}
    }
  }

  function ensureToggle(){
    const actions=document.querySelector(".top-actions");
    if(!actions)return null;
    let button=document.getElementById(BUTTON_ID);
    if(button)return button;

    button=document.createElement("button");
    button.id=BUTTON_ID;
    button.className="icon-btn liquid-glass-toggle";
    button.type="button";
    button.title="Liquid Glass";
    button.setAttribute("aria-label","Liquid Glass");
    button.setAttribute("aria-pressed","false");

    const bolt=document.createElement("span");
    bolt.className="liquid-glass-bolt";
    bolt.setAttribute("aria-hidden","true");
    bolt.textContent="⚡";
    button.appendChild(bolt);

    const more=document.getElementById("moreBtn");
    if(more&&more.parentElement===actions)actions.insertBefore(button,more);
    else actions.appendChild(button);

    button.addEventListener("click",()=>{
      applyTheme(!document.documentElement.classList.contains(ROOT_CLASS),{
        persist:true,
        haptic:true,
      });
    });
    return button;
  }

  function initLiquidGlassToggle(){
    ensureThemeStyles();
    const button=ensureToggle();
    const enabled=readPreference();
    document.documentElement.classList.toggle(ROOT_CLASS,enabled);
    syncButton(button,enabled);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",initLiquidGlassToggle,{once:true});
  }else{
    initLiquidGlassToggle();
  }
})();
