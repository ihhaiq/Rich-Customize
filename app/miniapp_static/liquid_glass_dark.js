// Optional deep-black Liquid Glass theme controlled by the ⚡ top-bar toggle.
(()=>{
  const ROOT_CLASS="liquid-glass-dark";
  const STORAGE_KEY="richCustomizeLiquidGlassDark";
  const BUTTON_ID="liquidGlassToggle";

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

  function init(){
    const button=ensureToggle();
    const enabled=readPreference();
    document.documentElement.classList.toggle(ROOT_CLASS,enabled);
    syncButton(button,enabled);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init,{once:true});
  }else{
    init();
  }
})();
