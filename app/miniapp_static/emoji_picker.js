// Beta 0.3.15 — Telegram-style emoji picker for the active text caret.
(() => {
  const emojiBtn = document.getElementById("emojiBtn");
  if (!emojiBtn) return;

  const RECENT_KEY = "rich_customize_recent_emoji";
  const CATEGORIES = {
    recent:{icon:"🕘",label:"الأخيرة",items:[]},
    smileys:{icon:"😀",label:"الوجوه",items:["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🥸","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🫡","🤭","🫢","🫣","🤫","🤥","😶","🫥","😐","🫤","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕"]},
    people:{icon:"👋",label:"الإشارات",items:["👋","🤚","🖐️","✋","🖖","👌","🤌","🤏","✌️","🤞","🫰","🤟","🤘","🤙","👈","👉","👆","👇","☝️","🫵","👍","👎","✊","👊","🤛","🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","✍️","💅","🤳","💪","🦾","🦿","🦵","🦶","👂","👃","🧠","🫀","🫁","🦷","👀","👁️","👅","👄","🫦"]},
    hearts:{icon:"❤️",label:"القلوب",items:["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","🩷","🩵","🩶","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️","💋","💯","💢","💥","💫","💦","💨","🕳️","💬","👁️‍🗨️","🗨️","🗯️","💭","💤"]},
    animals:{icon:"🐻",label:"الحيوانات",items:["🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐻‍❄️","🐨","🐯","🦁","🐮","🐷","🐽","🐸","🐵","🙈","🙉","🙊","🐒","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄","🐝","🪱","🐛","🦋","🐌","🐞","🐜","🪰","🪲","🪳","🦟","🦗","🕷️","🦂","🐢","🐍","🦎","🐙","🦑","🦀","🐠","🐟","🐡","🐬","🐳","🦈"]},
    food:{icon:"🍕",label:"الطعام",items:["🍏","🍎","🍐","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🍆","🥑","🥦","🥬","🥒","🌶️","🫑","🌽","🥕","🫒","🧄","🧅","🥔","🍠","🥐","🥯","🍞","🥖","🥨","🧀","🥚","🍳","🧈","🥞","🧇","🥓","🥩","🍗","🍖","🌭","🍔","🍟","🍕","🫓","🥪","🌮","🌯","🥙","🧆","🍝","🍜","🍣","🍱","🍛","🍲","🥗","🍿","🍩","🍪","🎂","🍰","🧁","🍫","🍬","🍭","☕","🧋","🥤"]},
    activity:{icon:"⚽",label:"النشاط",items:["⚽","🏀","🏈","⚾","🥎","🎾","🏐","🏉","🥏","🎱","🪀","🏓","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛼","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️","🤼","🤸","⛹️","🤺","🤾","🏌️","🏇","🧘","🏄","🏊","🚴","🚵","🏆","🥇","🥈","🥉","🎮","🕹️","🎲","♟️","🎯","🎳"]},
    objects:{icon:"💡",label:"الأشياء",items:["⌚","📱","💻","⌨️","🖥️","🖨️","🖱️","🖲️","🕹️","🗜️","💽","💾","💿","📀","📼","📷","📸","📹","🎥","📞","☎️","📟","📠","📺","📻","🎙️","🎚️","🎛️","🧭","⏱️","⏲️","⏰","🕰️","⌛","⏳","📡","🔋","🔌","💡","🔦","🕯️","🧯","🛢️","💸","💵","💴","💶","💷","🪙","💰","💳","💎","⚖️","🧰","🔧","🔨","⚒️","🛠️","⛏️","🪛","🔩","⚙️","🧱","⛓️","🧲","🔫","💣","🧨","🪓","🔪","🗡️","🛡️","🚬","⚰️","🪦"]},
    symbols:{icon:"✨",label:"الرموز",items:["✨","⭐","🌟","💫","⚡","🔥","🌈","☀️","🌤️","⛅","🌥️","☁️","🌧️","⛈️","🌩️","🌨️","❄️","☃️","🌊","✅","☑️","✔️","❌","❎","➕","➖","➗","✖️","♾️","‼️","⁉️","❓","❔","❕","❗","〰️","💲","⚕️","♻️","⚜️","🔱","📛","🔰","⭕","🛑","⛔","🚫","🔞","📵","🔕","🔇","🔔","🎵","🎶","➰","➿","〽️","✳️","✴️","❇️","©️","®️","™️","#️⃣","*️⃣","0️⃣","1️⃣","2️⃣","3️⃣","4️⃣","5️⃣","6️⃣","7️⃣","8️⃣","9️⃣","🔟"]}
  };

  let panel = null;
  let activeCategory = "smileys";
  let activeTarget = null;
  let savedRange = null;
  let savedInputSelection = null;

  function isMessageEditor(el) {
    return Boolean(el && (
      el.matches?.(".rich-inline-editor,[contenteditable='true']")
      || el === document.getElementById("slashInput")
    ));
  }

  function rememberTarget(target = document.activeElement) {
    if (!isMessageEditor(target)) return;
    activeTarget = target;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      savedInputSelection = [target.selectionStart ?? target.value.length, target.selectionEnd ?? target.value.length];
    }
  }

  function rememberRange() {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const editor = node?.closest?.(".rich-inline-editor,[contenteditable='true']");
    if (!editor || !isMessageEditor(editor)) return;
    activeTarget = editor;
    savedRange = range.cloneRange();
  }

  document.addEventListener("focusin", event => rememberTarget(event.target));
  document.addEventListener("selectionchange", rememberRange);
  document.addEventListener("select", event => rememberTarget(event.target), true);
  document.addEventListener("keyup", event => rememberTarget(event.target), true);
  document.addEventListener("click", event => rememberTarget(event.target), true);

  function loadRecent() {
    try {
      const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(value) ? value.filter(Boolean).slice(0, 32) : [];
    } catch (_) { return []; }
  }

  function addRecent(emoji) {
    const next = [emoji, ...loadRecent().filter(item => item !== emoji)].slice(0, 32);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch (_) {}
    CATEGORIES.recent.items = next;
  }

  function viewportBounds() {
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0;
    const top = vv?.offsetTop || 0;
    const width = vv?.width || window.innerWidth;
    const height = vv?.height || window.innerHeight;
    return {left,top,right:left+width,bottom:top+height};
  }

  function placePanel() {
    if (!panel) return;
    const bounds = viewportBounds();
    const margin = 8;
    panel.style.visibility = "hidden";
    panel.style.left = `${bounds.left + margin}px`;
    panel.style.top = `${bounds.top + margin}px`;
    const own = panel.getBoundingClientRect();
    const anchor = emojiBtn.getBoundingClientRect();
    let left = anchor.right - own.width;
    left = Math.max(bounds.left + margin, Math.min(left, bounds.right - own.width - margin));
    let top = anchor.bottom + 7;
    if (top + own.height > bounds.bottom - margin) top = anchor.top - own.height - 7;
    top = Math.max(bounds.top + margin, Math.min(top, bounds.bottom - own.height - margin));
    panel.style.left = `${Math.round(left)}px`;
    panel.style.top = `${Math.round(top)}px`;
    panel.style.visibility = "visible";
  }

  function closePanel() {
    panel?.remove?.();
    panel = null;
    emojiBtn.classList.remove("active");
  }

  function insertIntoContentEditable(editor, emoji) {
    editor.focus({preventScroll:true});
    const sel = window.getSelection();
    let range = savedRange?.cloneRange?.();
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);
    const node = document.createTextNode(emoji);
    range.deleteContents();
    range.insertNode(node);
    const caret = document.createRange();
    caret.setStartAfter(node);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    savedRange = caret.cloneRange();
    editor.dispatchEvent(new InputEvent("input", {bubbles:true,inputType:"insertText",data:emoji}));
  }

  function insertIntoInput(input, emoji) {
    input.focus({preventScroll:true});
    const [start,end] = savedInputSelection || [input.selectionStart ?? input.value.length,input.selectionEnd ?? input.value.length];
    input.setRangeText(emoji,start,end,"end");
    savedInputSelection = [input.selectionStart ?? input.value.length,input.selectionEnd ?? input.value.length];
    input.dispatchEvent(new InputEvent("input", {bubbles:true,inputType:"insertText",data:emoji}));
  }

  function insertEmoji(emoji) {
    addRecent(emoji);
    const target = activeTarget;
    if (target?.isConnected && target.isContentEditable) {
      insertIntoContentEditable(target, emoji);
    } else if (target?.isConnected && (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) {
      insertIntoInput(target, emoji);
    } else if (typeof addBlock === "function") {
      addBlock("paragraph");
      requestAnimationFrame(() => {
        const editor = blocksEl?.querySelector?.(`.block[data-id="${selectedBlockId}"] .rich-inline-editor,[data-id="${selectedBlockId}"] [contenteditable='true']`);
        if (editor) {
          activeTarget = editor;
          savedRange = null;
          insertIntoContentEditable(editor, emoji);
        }
      });
    }
    try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); } catch (_) {}
    if (activeCategory === "recent") renderCategory("recent");
  }

  function renderCategory(name) {
    if (!panel) return;
    activeCategory = name;
    if (name === "recent") CATEGORIES.recent.items = loadRecent();
    panel.querySelectorAll(".emoji-picker-tab").forEach(btn => btn.classList.toggle("active", btn.dataset.category === name));
    const grid = panel.querySelector(".emoji-picker-grid");
    grid.innerHTML = "";
    const items = CATEGORIES[name]?.items || [];
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "emoji-picker-empty";
      empty.textContent = "راح تظهر هنا الإيموجيات المستخدمة مؤخرًا";
      grid.appendChild(empty);
      return;
    }
    items.forEach(emoji => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "emoji-picker-item";
      button.textContent = emoji;
      button.setAttribute("aria-label", emoji);
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        insertEmoji(emoji);
      });
      grid.appendChild(button);
    });
  }

  function openPanel() {
    if (panel) { closePanel(); return; }
    try { window.RichTextToolbarMenu?.close?.(); } catch (_) {}
    try { hideMenus?.(); } catch (_) {}
    CATEGORIES.recent.items = loadRecent();
    if (CATEGORIES.recent.items.length) activeCategory = "recent";
    panel = document.createElement("aside");
    panel.className = "popup-menu emoji-picker-pop";
    panel.setAttribute("aria-label", "الإيموجي");

    const tabs = document.createElement("div");
    tabs.className = "emoji-picker-tabs";
    Object.entries(CATEGORIES).forEach(([name,category]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "emoji-picker-tab";
      button.dataset.category = name;
      button.textContent = category.icon;
      button.title = category.label;
      button.setAttribute("aria-label", category.label);
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.onclick = event => {event.preventDefault();event.stopPropagation();renderCategory(name);};
      tabs.appendChild(button);
    });
    const grid = document.createElement("div");
    grid.className = "emoji-picker-grid";
    panel.append(tabs,grid);
    document.body.appendChild(panel);
    emojiBtn.classList.add("active");
    renderCategory(activeCategory);
    requestAnimationFrame(placePanel);
  }

  emojiBtn.addEventListener("pointerdown", event => {
    rememberTarget(document.activeElement);
    rememberRange();
    event.preventDefault();
  });
  emojiBtn.addEventListener("click", event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    openPanel();
  }, true);

  document.addEventListener("pointerdown", event => {
    if (!panel) return;
    if (panel.contains(event.target) || emojiBtn.contains(event.target)) return;
    closePanel();
  }, true);

  const reposition = () => panel && requestAnimationFrame(placePanel);
  window.visualViewport?.addEventListener("resize", reposition, {passive:true});
  window.visualViewport?.addEventListener("scroll", reposition, {passive:true});
  window.addEventListener("resize", reposition, {passive:true});
})();
