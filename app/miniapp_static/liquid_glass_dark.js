// ⚡ toggles between the classic Liquid Glass UI and a lightweight no-glass UI.
(()=>{
  const LITE_CLASS="miniapp-lite-ui";
  const OLD_DARK_CLASS="liquid-glass-dark";
  const STORAGE_KEY="richCustomizeUiMode";
  const BUTTON_ID="liquidGlassToggle";

  function readPreference(){
    try{return localStorage.getItem(STORAGE_KEY)==="lite";}catch(_){return false;}
  }

  function savePreference(lite){
    try{localStorage.setItem(STORAGE_KEY,lite?"lite":"glass");}catch(_){}
  }

  function copy(lite){
    const language=String(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code||document.documentElement.lang||"").toLowerCase();
    const ar=language.startsWith("ar");
    return lite
      ? (ar?"العودة إلى الزجاج السائل":"Switch to Liquid Glass")
      : (ar?"استخدام الواجهة الخفيفة":"Use lightweight interface");
  }

  function syncButton(button,lite){
    if(!button)return;
    button.classList.toggle("active",lite);
    button.setAttribute("aria-pressed",lite?"true":"false");
    button.dataset.mode=lite?"lite":"glass";
    button.title=copy(lite);
    button.setAttribute("aria-label",copy(lite));
  }

  function applyTheme(lite,{persist=true,haptic=false}={}){
    const root=document.documentElement;
    root.classList.remove(OLD_DARK_CLASS);
    root.classList.toggle(LITE_CLASS,lite);
    syncButton(document.getElementById(BUTTON_ID),lite);
    if(persist)savePreference(lite);
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
      applyTheme(!document.documentElement.classList.contains(LITE_CLASS),{
        persist:true,
        haptic:true,
      });
    });
    return button;
  }

  function init(){
    const button=ensureToggle();
    const lite=readPreference();
    applyTheme(lite,{persist:false});
    syncButton(button,lite);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",init,{once:true});
  }else{
    init();
  }
})();