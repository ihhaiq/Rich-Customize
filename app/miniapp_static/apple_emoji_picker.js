// Beta 0.3.17 — fixed Apple image emoji picker via emoji-datasource-apple.
(() => {
  const oldButton = document.getElementById("emojiBtn");
  if (!oldButton) return;

  // Replace the node so the older OS-font emoji picker listeners are removed.
  const emojiBtn = oldButton.cloneNode(true);
  oldButton.replaceWith(emojiBtn);

  const DATA_URL = "https://cdnjs.cloudflare.com/ajax/libs/emoji-datasource-apple/16.0.0/emoji.json";
  const IMAGE_BASE = "https://cdnjs.cloudflare.com/ajax/libs/emoji-datasource-apple/16.0.0/img/apple/64/";
  const RECENT_KEY = "rich_customize_apple_recent_emoji";

  const CATEGORY_META = {
    "Smileys & Emotion": {key:"smileys", label:"الوجوه", fallback:"😀"},
    "People & Body": {key:"people", label:"الأشخاص", fallback:"👋"},
    "Animals & Nature": {key:"nature", label:"الحيوانات", fallback:"🐻"},
    "Food & Drink": {key:"food", label:"الطعام", fallback:"🍕"},
    Activities: {key:"activity", label:"النشاط", fallback:"⚽"},
    "Travel & Places": {key:"travel", label:"السفر", fallback:"🚗"},
    Objects: {key:"objects", label:"الأشياء", fallback:"💡"},
    Symbols: {key:"symbols", label:"الرموز", fallback:"✨"},
    Flags: {key:"flags", label:"الأعلام", fallback:"🏳️"},
  };
  const CATEGORY_ORDER = ["smileys","people","nature","food","activity","travel","objects","symbols","flags"];

  let panel = null;
  let activeCategory = "smileys";
  let activeTarget = null;
  let savedRange = null;
  let savedInputSelection = null;
  let catalogPromise = null;
  let catalog = null;

  function unicodeFromUnified(unified) {
    try {
      return String.fromCodePoint(...String(unified || "").split("-").filter(Boolean).map(part => parseInt(part, 16)));
    } catch (_) {
      return "";
    }
  }

  function imageUrl(image) {
    return `${IMAGE_BASE}${String(image || "").toLowerCase()}`;
  }

  function isMessageTarget(el) {
    if (!el) return false;
    if (el === document.getElementById("slashInput")) return true;
    if (el.matches?.(".rich-inline-editor,.details-child-text[contenteditable='true'],.block-editor[contenteditable='true']")) return true;
    return Boolean(el.isContentEditable && el.closest?.("#blocks"));
  }

  function rememberTarget(target = document.activeElement) {
    if (!isMessageTarget(target)) return;
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
    const editor = node?.closest?.(".rich-inline-editor,.details-child-text[contenteditable='true'],.block-editor[contenteditable='true']");
    if (!editor || !isMessageTarget(editor)) return;
    activeTarget = editor;
    savedRange = range.cloneRange();
  }

  document.addEventListener("focusin", event => rememberTarget(event.target));
  document.addEventListener("selectionchange", rememberRange);
  document.addEventListener("select", event => rememberTarget(event.target), true);
  document.addEventListener("keyup", event => rememberTarget(event.target), true);
  document.addEventListener("click", event => rememberTarget(event.target), true);

  function dispatchInput(target, emoji) {
    try {
      target.dispatchEvent(new InputEvent("input", {bubbles:true, inputType:"insertText", data:emoji}));
    } catch (_) {
      target.dispatchEvent(new Event("input", {bubbles:true}));
    }
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
    dispatchInput(editor, emoji);
  }

  function insertIntoInput(input, emoji) {
    input.focus({preventScroll:true});
    const fallback = input.value?.length || 0;
    const [start,end] = savedInputSelection || [input.selectionStart ?? fallback, input.selectionEnd ?? fallback];
    input.setRangeText(emoji, start, end, "end");
    savedInputSelection = [input.selectionStart ?? input.value.length, input.selectionEnd ?? input.value.length];
    dispatchInput(input, emoji);
  }

  function loadRecent() {
    try {
      const value = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(value) ? value.filter(Boolean).slice(0, 36) : [];
    } catch (_) { return []; }
  }

  function addRecent(item) {
    const recent = loadRecent().filter(entry => entry.unified !== item.unified);
    recent.unshift({unified:item.unified, image:item.image, emoji:item.emoji});
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 36))); } catch (_) {}
  }

  async function loadCatalog() {
    if (catalog) return catalog;
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetch(DATA_URL, {cache:"force-cache"})
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        const groups = Object.fromEntries(CATEGORY_ORDER.map(key => [key, []]));
        const byEmoji = new Map();
        const byUnified = new Map();
        const entries = Array.isArray(data) ? data : [];
        entries
          .filter(item => item && item.has_img_apple && item.image && item.unified)
          .sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .forEach(raw => {
            const meta = CATEGORY_META[raw.category];
            if (!meta || !groups[meta.key]) return;
            const emoji = unicodeFromUnified(raw.unified);
            if (!emoji) return;
            const item = {
              emoji,
              unified:String(raw.unified),
              image:String(raw.image).toLowerCase(),
              name:String(raw.name || raw.short_name || emoji),
              category:meta.key,
            };
            groups[meta.key].push(item);
            byEmoji.set(emoji, item);
            byUnified.set(item.unified, item);
          });
        catalog = {groups, byEmoji, byUnified};
        return catalog;
      })
      .catch(error => {
        catalogPromise = null;
        throw error;
      });
    return catalogPromise;
  }

  function viewportBounds() {
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0;
    const top = vv?.offsetTop || 0;
    const width = vv?.width || window.innerWidth;
    const height = vv?.height || window.innerHeight;
    return {left, top, right:left + width, bottom:top + height};
  }

  function placePanel() {
    if (!panel) return;
    const bounds = viewportBounds();
    const margin = 6;
    panel.style.visibility = "hidden";
    panel.style.left = `${bounds.left + margin}px`;
    panel.style.top = `${bounds.top + margin}px`;
    const own = panel.getBoundingClientRect();
    const anchor = emojiBtn.getBoundingClientRect();
    let left = anchor.right - own.width;
    left = Math.max(bounds.left + margin, Math.min(left, bounds.right - own.width - margin));
    let top = anchor.bottom + 6;
    if (top + own.height > bounds.bottom - margin) top = anchor.top - own.height - 6;
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

  function insertEmoji(item) {
    const emoji = item.emoji;
    addRecent(item);
    const target = activeTarget;
    if (target?.isConnected && target.isContentEditable) {
      insertIntoContentEditable(target, emoji);
    } else if (target?.isConnected && (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement)) {
      insertIntoInput(target, emoji);
    } else if (typeof addBlock === "function") {
      addBlock("paragraph");
      requestAnimationFrame(() => {
        const editor = blocksEl?.querySelector?.(`.block[data-id="${selectedBlockId}"] .rich-inline-editor,.block[data-id="${selectedBlockId}"] [contenteditable='true']`);
        if (editor) {
          activeTarget = editor;
          savedRange = null;
          insertIntoContentEditable(editor, emoji);
        }
      });
    }
    try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); } catch (_) {}
    if (panel?.dataset.category === "recent") renderCategory("recent");
  }

  function makeAppleImage(item, className = "") {
    const img = document.createElement("img");
    img.className = className;
    img.src = imageUrl(item.image);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    return img;
  }

  function renderCategory(category) {
    if (!panel || !catalog) return;
    panel.dataset.category = category;
    activeCategory = category;
    const grid = panel.querySelector(".apple-emoji-grid");
    const title = panel.querySelector(".apple-emoji-category-title");
    if (!grid) return;
    grid.innerHTML = "";

    let items = [];
    if (category === "recent") {
      items = loadRecent().map(saved => catalog.byUnified.get(saved.unified) || catalog.byEmoji.get(saved.emoji)).filter(Boolean);
      if (!items.length) {
        const empty = document.createElement("div");
        empty.className = "apple-emoji-empty";
        empty.textContent = "الإيموجيات المستخدمة مؤخرًا راح تظهر هنا";
        grid.appendChild(empty);
      }
      if (title) title.textContent = "الأخيرة";
    } else {
      items = catalog.groups[category] || [];
      const meta = Object.values(CATEGORY_META).find(item => item.key === category);
      if (title) title.textContent = meta?.label || "الإيموجي";
    }

    panel.querySelectorAll(".apple-emoji-tab").forEach(button => {
      button.classList.toggle("active", button.dataset.category === category);
    });

    items.forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "apple-emoji-item";
      button.setAttribute("aria-label", item.name || item.emoji);
      button.title = item.emoji;
      button.appendChild(makeAppleImage(item, "apple-emoji-img"));
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        insertEmoji(item);
      });
      grid.appendChild(button);
    });
    grid.scrollTop = 0;
  }

  function makeRecentTab() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "apple-emoji-tab apple-emoji-recent-tab";
    button.dataset.category = "recent";
    button.setAttribute("aria-label", "الأخيرة");
    button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5l3.2 1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    return button;
  }

  function representativeItem(category) {
    const meta = Object.values(CATEGORY_META).find(item => item.key === category);
    if (!meta) return catalog.groups[category]?.[0] || null;
    return catalog.byEmoji.get(meta.fallback) || catalog.groups[category]?.[0] || null;
  }

  function buildPanel() {
    const root = document.createElement("aside");
    root.className = "popup-menu apple-emoji-picker-pop";
    root.setAttribute("aria-label", "Apple Emoji");

    const head = document.createElement("div");
    head.className = "apple-emoji-head";
    const title = document.createElement("strong");
    title.className = "apple-emoji-category-title";
    title.textContent = "الوجوه";
    const badge = document.createElement("small");
    badge.textContent = "Apple Emoji";
    head.append(title, badge);

    const grid = document.createElement("div");
    grid.className = "apple-emoji-grid";

    const tabs = document.createElement("div");
    tabs.className = "apple-emoji-tabs";
    const recent = makeRecentTab();
    tabs.appendChild(recent);
    recent.onclick = event => {event.preventDefault();event.stopPropagation();renderCategory("recent");};

    CATEGORY_ORDER.forEach(category => {
      const representative = representativeItem(category);
      if (!representative) return;
      const meta = Object.values(CATEGORY_META).find(item => item.key === category);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "apple-emoji-tab";
      button.dataset.category = category;
      button.setAttribute("aria-label", meta?.label || category);
      button.appendChild(makeAppleImage(representative, "apple-emoji-tab-img"));
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.onclick = event => {event.preventDefault();event.stopPropagation();renderCategory(category);};
      tabs.appendChild(button);
    });

    root.append(head, grid, tabs);
    return root;
  }

  async function openPanel() {
    if (panel) { closePanel(); return; }
    try { window.RichTextToolbarMenu?.close?.(); } catch (_) {}
    try { hideMenus?.(); } catch (_) {}

    emojiBtn.classList.add("active");
    const loading = document.createElement("aside");
    loading.className = "popup-menu apple-emoji-picker-pop apple-emoji-loading";
    loading.innerHTML = '<div class="apple-emoji-loader"></div><span>تحميل Apple Emoji…</span>';
    panel = loading;
    document.body.appendChild(panel);
    requestAnimationFrame(placePanel);

    try {
      await loadCatalog();
      if (!panel) return;
      panel.replaceWith(buildPanel());
      panel = document.querySelector(".apple-emoji-picker-pop:not(.apple-emoji-loading)");
      const recent = loadRecent();
      renderCategory(recent.length ? "recent" : activeCategory);
      requestAnimationFrame(placePanel);
    } catch (error) {
      closePanel();
      toast?.(`تعذر تحميل Apple Emoji: ${error.message}`);
    }
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
