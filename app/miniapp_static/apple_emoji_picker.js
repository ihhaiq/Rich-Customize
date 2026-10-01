// Beta 0.3.65 — Telegram-like emoji rail, recents and mood search filters.
(() => {
  const oldButton = document.getElementById("emojiBtn");
  if (!oldButton) return;

  // Keep the exact 0.3.17 interaction model: replace the button so the older
  // OS-font picker cannot also handle the same click.
  const emojiBtn = oldButton.cloneNode(true);
  oldButton.replaceWith(emojiBtn);

  const DATA_URLS = [
    "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/emoji.json",
    "https://cdnjs.cloudflare.com/ajax/libs/emoji-datasource-apple/16.0.0/emoji.json",
  ];
  const IMAGE_BASES = [
    "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/",
    "https://cdnjs.cloudflare.com/ajax/libs/emoji-datasource-apple/16.0.0/img/apple/64/",
    "https://unpkg.com/emoji-datasource-apple@16.0.0/img/apple/64/",
  ];
  const RECENT_KEY = "rich_customize_apple_recent_emoji";
  const SEARCH_LIMIT = 180;
  const CUSTOM_EMOJI_FALLBACK_ID = "6046274330164203359";
  const SEARCH_PRESETS = [
    {key:"love", icon:"❤️", emojis:["❤️","🩷","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❤️‍🔥","❤️‍🩹","❣️","💕","💞","💓","💗","💖","💘","💝","😍","🥰","😘","💋"]},
    {key:"positive", icon:"👍", emojis:["👍","👌","👏","🙌","🫶","✅","☑️","✔️","💯","😀","😃","😄","😁","😊","🤩"]},
    {key:"negative", icon:"👎", emojis:["👎","❌","❎","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","😠","😡","🤬"]},
    {key:"celebrate", icon:"🎉", emojis:["🎉","🎊","🥳","🎂","🎁","🎈","✨","🌟","🔥","🏆","🥇","👏","🙌"]},
  ];

  // Local aliases extend the datasource names so one emoji can be found with
  // several natural Arabic words, similar to Telegram's keyword search.
  // The datasource's English names/short names are indexed as well.
  const ARABIC_SEARCH_ALIASES = {
    "😀":["سعيد","فرحان","يبتسم","مبتسم","مبتهج","ابتسامة","فرح"],
    "😃":["سعيد","فرحان","يبتسم","مبتسم","مبتهج","ابتسامة","فرح"],
    "😄":["سعيد","فرحان","يضحك","مبتسم","مبتهج","ضحك","ابتسامة"],
    "😁":["سعيد","فرحان","مبتسم","مبتهج","اسنان","أسنان","ابتسامة عريضة"],
    "😊":["سعيد","فرحان","يبتسم","مبتسم","مبتهج","خجول","مرتاح","ابتسامة"],
    "🙂":["سعيد","مبتسم","لطيف","ابتسامة"],
    "😂":["ضحك","يضحك","مضحك","قهقهة","دموع فرح","فرح"],
    "🤣":["ضحك","يضحك","مضحك","قهقهة","ميت ضحك"],
    "😍":["حب","عشق","معجب","عيون قلوب","احبك","أحبك"],
    "🥰":["حب","عشق","حنان","قلوب","مبسوط","سعيد"],
    "😘":["قبلة","بوسة","يبوس","حب"],
    "🤩":["منبهر","نجوم","واو","متحمس","مبتهج"],
    "🥳":["حفلة","احتفال","عيد ميلاد","مبتهج","فرحان","سعيد"],
    "😎":["نظارات","كول","رهيب","واثق"],
    "😢":["حزين","يبكي","بكاء","دمعة","زعلان"],
    "😭":["حزين","يبكي","بكاء","دموع","زعلان"],
    "😡":["غاضب","عصبي","غضب","زعلان"],
    "😠":["غاضب","عصبي","غضب","زعلان"],
    "🤔":["يفكر","تفكير","محتار","سؤال"],
    "🙄":["ملل","مستفز","منزعج","عيون"],
    "😴":["نائم","ينام","نوم","نعسان"],
    "😱":["خائف","خوف","مرعوب","صدمة","مصدوم"],
    "🤗":["حضن","عناق","احضان","أحضان","حب"],
    "👍":["اعجاب","إعجاب","موافق","تمام","نعم","صح"],
    "👎":["رفض","غير موافق","لا","سيء"],
    "🙏":["دعاء","شكرا","شكر","رجاء","ارجوك","أرجوك","صلاة"],
    "👏":["تصفيق","برافو","احسنت","أحسنت"],
    "❤️":["قلب","حب","احبك","أحبك","احمر","أحمر"],
    "💔":["قلب مكسور","حزن","فراق","انفصال"],
    "🔥":["نار","حريق","حار","قوي","ترند"],
    "✨":["لمعان","بريق","نجوم","جميل"],
    "⭐":["نجمة","نجم","مفضل"],
    "⚡":["برق","كهرباء","سريع"],
    "💡":["فكرة","ضوء","مصباح"],
    "✅":["صح","تم","موافق","نجاح"],
    "❌":["خطا","خطأ","لا","رفض","غلط"],
    "🎉":["احتفال","حفلة","مبروك","فرح","عيد"],
    "🎂":["كيك","كعكة","عيد ميلاد","ميلاد"],
    "🎁":["هدية","هديه","كادو"],
    "🌹":["وردة","ورد","حب"],
    "📷":["كاميرا","صورة","تصوير"],
    "📱":["هاتف","موبايل","تلفون"],
    "💻":["حاسبة","كمبيوتر","لابتوب"],
    "🚗":["سيارة","عربة"],
    "✈️":["طائرة","سفر"],
    "☕":["قهوة","كافي","مشروب"],
    "🍕":["بيتزا","طعام","اكل","أكل"],
    "🍔":["برغر","برجر","طعام","اكل","أكل"],
    "🍓":["فراولة","فراوله"],
    "🐱":["قطة","قط","بسة","بسه"],
    "🐶":["كلب","جرو"],
    "🐻":["دب"],
    "🦁":["اسد","أسد"],
    "🐸":["ضفدع"],
    "🦋":["فراشة","فراشه"],
    "🌈":["قوس قزح","قوس","الوان","ألوان"],
    "☀️":["شمس","مشمس"],
    "🌙":["قمر","ليل"],
    "💯":["مئة","مية","كامل","تمام"],
  };

  const CATEGORY_META = {
    "Smileys & Emotion": {key:"smileys", labelKey:"emoji.smileys", fallback:"😀"},
    "People & Body": {key:"people", labelKey:"emoji.people", fallback:"👋"},
    "Animals & Nature": {key:"nature", labelKey:"emoji.nature", fallback:"🐻"},
    "Food & Drink": {key:"food", labelKey:"emoji.food", fallback:"🍕"},
    Activities: {key:"activity", labelKey:"emoji.activity", fallback:"⚽"},
    "Travel & Places": {key:"travel", labelKey:"emoji.travel", fallback:"🚗"},
    Objects: {key:"objects", labelKey:"emoji.objects", fallback:"💡"},
    Symbols: {key:"symbols", labelKey:"emoji.symbols", fallback:"✨"},
    Flags: {key:"flags", labelKey:"emoji.flags", fallback:"🏳️"},
  };
  const CATEGORY_ORDER = ["smileys","people","nature","food","activity","travel","objects","symbols","flags"];

  let panel = null;
  let activeCategory = "normal";
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

  function imageUrl(image, sourceIndex = 0) {
    const base = IMAGE_BASES[Math.max(0, Math.min(sourceIndex, IMAGE_BASES.length - 1))];
    return `${base}${String(image || "").toLowerCase()}`;
  }

  function normalizeSearchText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
      .replace(/ـ/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function collectSearchTerms(raw, emoji) {
    const values = [
      emoji,
      raw?.name,
      raw?.short_name,
      raw?.text,
      raw?.category,
      raw?.subcategory,
      ...(Array.isArray(raw?.short_names) ? raw.short_names : []),
      ...(Array.isArray(raw?.texts) ? raw.texts : []),
      ...(Array.isArray(raw?.emoticons) ? raw.emoticons : []),
      ...(ARABIC_SEARCH_ALIASES[emoji] || []),
    ].filter(Boolean);
    const terms = [...new Set(values.map(normalizeSearchText).filter(Boolean))];
    return {terms, text:terms.join(" ")};
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

  async function fetchCatalogData() {
    let lastError = null;
    for (const url of DATA_URLS) {
      try {
        const response = await fetch(url, {cache:"force-cache", referrerPolicy:"no-referrer"});
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error(mt("emoji.catalog_unavailable"));
  }

  async function loadCatalog() {
    if (catalog) return catalog;
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetchCatalogData()
      .then(data => {
        const groups = Object.fromEntries(CATEGORY_ORDER.map(key => [key, []]));
        const byEmoji = new Map();
        const byUnified = new Map();
        const all = [];
        const entries = Array.isArray(data) ? data : [];
        entries
          .filter(item => item && item.has_img_apple && item.image && item.unified)
          .sort((a,b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
          .forEach(raw => {
            const meta = CATEGORY_META[raw.category];
            if (!meta || !groups[meta.key]) return;
            const emoji = unicodeFromUnified(raw.unified);
            if (!emoji) return;
            const search = collectSearchTerms(raw, emoji);
            const item = {
              emoji,
              unified:String(raw.unified),
              image:String(raw.image).toLowerCase(),
              name:String(raw.name || raw.short_name || emoji),
              category:meta.key,
              sortOrder:Number(raw.sort_order || 0),
              searchTerms:search.terms,
              searchText:search.text,
            };
            groups[meta.key].push(item);
            all.push(item);
            byEmoji.set(emoji, item);
            byUnified.set(item.unified, item);
          });
        catalog = {groups, byEmoji, byUnified, all};
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

  // Intentionally unchanged from 0.3.17: inserting an emoji still follows the
  // editor's existing text path. Preview-image failures must never alter it.
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
    if (panel?.dataset.mode === "recent" && panel?.dataset.view !== "search") renderMode("recent");
  }

  function makeAppleImage(item, className = "") {
    const img = document.createElement("img");
    img.className = className;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.draggable = false;
    img.referrerPolicy = "no-referrer";

    let sourceIndex = 0;
    const trySource = () => {
      img.src = imageUrl(item.image, sourceIndex);
    };
    img.addEventListener("error", () => {
      sourceIndex += 1;
      if (sourceIndex < IMAGE_BASES.length) {
        trySource();
        return;
      }
      // Preview only: never fall back to an OS emoji glyph because that would
      // make the picker visually inconsistent. Hide a failed asset instead.
      img.style.visibility = "hidden";
      img.closest?.(".apple-emoji-item,.apple-emoji-tab")?.classList.add("apple-emoji-preview-failed");
    });
    trySource();
    return img;
  }

  function appendEmojiButton(grid, item) {
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
  }

  function animateGrid(grid) {
    if (!grid || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    grid.classList.remove("apple-emoji-grid-switch");
    void grid.offsetWidth;
    grid.classList.add("apple-emoji-grid-switch");
    window.setTimeout(() => grid?.classList?.remove("apple-emoji-grid-switch"), 190);
  }

  function appendSectionTitle(grid, text, {divider=false} = {}) {
    const heading = document.createElement("div");
    heading.className = "apple-emoji-section-title";
    if (divider) heading.classList.add("with-divider");
    heading.dir = "auto";
    heading.textContent = text;
    grid.appendChild(heading);
  }

  function appendEmpty(grid, text, compact=false) {
    const empty = document.createElement("div");
    empty.className = "apple-emoji-empty";
    if (compact) empty.classList.add("compact");
    empty.textContent = text;
    grid.appendChild(empty);
  }

  function appendItems(grid, items) {
    items.forEach(item => appendEmojiButton(grid, item));
  }

  function appendNormalSections(grid, {dividerFirst=false} = {}) {
    let first = true;
    CATEGORY_ORDER.forEach(category => {
      const items = catalog.groups[category] || [];
      if (!items.length) return;
      const meta = Object.values(CATEGORY_META).find(item => item.key === category);
      appendSectionTitle(
        grid,
        meta?.labelKey ? mt(meta.labelKey) : mt("emoji.normal"),
        {divider: dividerFirst ? first : !first},
      );
      appendItems(grid, items);
      first = false;
    });
  }

  function setRailActive(mode) {
    panel?.querySelectorAll(".apple-emoji-tab[data-mode]").forEach(button => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
  }

  function renderMode(mode) {
    if (!panel || !catalog) return;
    activeCategory = mode === "recent" ? "recent" : "normal";
    panel.dataset.mode = activeCategory;
    panel.dataset.view = activeCategory;

    const grid = panel.querySelector(".apple-emoji-grid");
    const title = panel.querySelector(".apple-emoji-category-title");
    if (!grid) return;
    grid.innerHTML = "";

    if (activeCategory === "recent") {
      if (title) title.textContent = mt("emoji.recent");
      const recent = loadRecent()
        .map(saved => catalog.byUnified.get(saved.unified) || catalog.byEmoji.get(saved.emoji))
        .filter(Boolean);
      if (recent.length) appendItems(grid, recent);
      else appendEmpty(grid, mt("emoji.recent_empty"), true);
      appendNormalSections(grid, {dividerFirst:true});
    } else {
      if (title) title.textContent = mt("emoji.normal");
      appendNormalSections(grid);
    }

    setRailActive(activeCategory);
    panel.querySelectorAll(".apple-emoji-search-preset").forEach(button => button.classList.remove("active"));
    grid.scrollTop = 0;
    animateGrid(grid);
  }

  function searchCatalog(query) {
    if (!catalog) return [];
    const rawQuery = String(query || "").trim();
    const normalized = normalizeSearchText(rawQuery);
    if (!normalized) return [];
    const tokens = normalized.split(" ").filter(Boolean);

    return catalog.all
      .map(item => {
        if (rawQuery === item.emoji) return {item, score:-100};
        if (!tokens.every(token => item.searchText.includes(token))) return null;

        let score = 40;
        if (item.searchTerms.some(term => term === normalized)) score = 0;
        else if (item.searchTerms.some(term => term.startsWith(normalized))) score = 10;
        else if (item.searchTerms.some(term => tokens.every(token => term.includes(token)))) score = 20;
        else if (item.searchText.includes(normalized)) score = 30;

        return {item, score};
      })
      .filter(Boolean)
      .sort((a,b) => (a.score - b.score) || (a.item.sortOrder - b.item.sortOrder))
      .slice(0, SEARCH_LIMIT)
      .map(entry => entry.item);
  }

  function renderSearchItems(items) {
    if (!panel) return;
    panel.dataset.view = "search";
    const grid = panel.querySelector(".apple-emoji-grid");
    const title = panel.querySelector(".apple-emoji-category-title");
    if (!grid) return;
    if (title) title.textContent = mt("emoji.search");
    grid.innerHTML = "";
    if (!items.length) appendEmpty(grid, mt("emoji.search_empty"));
    else appendItems(grid, items);
    grid.scrollTop = 0;
    animateGrid(grid);
  }

  function renderSearch(query) {
    if (!panel || !catalog) return;
    const value = String(query || "").trim();
    panel.querySelectorAll(".apple-emoji-search-preset").forEach(button => button.classList.remove("active"));
    if (!value) {
      renderMode(activeCategory);
      return;
    }
    renderSearchItems(searchCatalog(value));
  }

  function renderPreset(key) {
    if (!panel || !catalog) return;
    const preset = SEARCH_PRESETS.find(item => item.key === key);
    if (!preset) return;
    const items = preset.emojis.map(emoji => catalog.byEmoji.get(emoji)).filter(Boolean);
    panel.querySelectorAll(".apple-emoji-search-preset").forEach(button => {
      button.classList.toggle("active", button.dataset.preset === key);
    });
    renderSearchItems(items);
  }

  function resetSearchUI() {
    if (!panel) return;
    const input = panel.querySelector(".apple-emoji-search-input");
    if (input) input.value = "";
    panel.querySelectorAll(".apple-emoji-search-preset").forEach(button => button.classList.remove("active"));
  }

  function makeRailButton(mode, icon, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "apple-emoji-tab";
    button.dataset.mode = mode;
    button.setAttribute("aria-label", label);
    if (icon === "recent" || icon === "smileys") MiniAppIcons.mount(button, icon);
    else button.textContent = icon;
    return button;
  }

  function makeCustomPlaceholderTab() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "apple-emoji-tab apple-emoji-custom-placeholder";
    button.dataset.customEmojiId = CUSTOM_EMOJI_FALLBACK_ID;
    button.setAttribute("aria-label", mt("emoji.custom_placeholder"));
    button.setAttribute("aria-disabled", "true");
    button.tabIndex = -1;
    const bubble = document.createElement("span");
    bubble.className = "apple-emoji-custom-bubble";
    bubble.textContent = "👤";
    bubble.dataset.customEmojiId = CUSTOM_EMOJI_FALLBACK_ID;
    button.appendChild(bubble);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
    });
    return button;
  }

  function buildPanel() {
    const root = document.createElement("aside");
    root.className = "popup-menu apple-emoji-picker-pop";
    root.setAttribute("aria-label", mt("emoji.apple"));

    const head = document.createElement("div");
    head.className = "apple-emoji-head";

    const headMain = document.createElement("div");
    headMain.className = "apple-emoji-head-main";
    const title = document.createElement("strong");
    title.className = "apple-emoji-category-title";
    title.textContent = mt("emoji.normal");
    const badge = document.createElement("small");
    badge.textContent = mt("emoji.apple");
    headMain.append(title, badge);
    head.append(headMain);

    const searchWrap = document.createElement("div");
    searchWrap.className = "apple-emoji-search-wrap";

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "apple-emoji-search-input";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchInput.dir = "auto";
    searchInput.placeholder = mt("emoji.search_placeholder");
    searchInput.setAttribute("aria-label", mt("emoji.search"));

    const presets = document.createElement("div");
    presets.className = "apple-emoji-search-presets";
    SEARCH_PRESETS.forEach(preset => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "apple-emoji-search-preset";
      button.dataset.preset = preset.key;
      button.textContent = preset.icon;
      button.setAttribute("aria-label", preset.icon);
      button.addEventListener("pointerdown", event => event.preventDefault());
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        searchInput.value = "";
        renderPreset(preset.key);
        requestAnimationFrame(placePanel);
      });
      presets.appendChild(button);
    });

    const clearSearch = document.createElement("button");
    clearSearch.type = "button";
    clearSearch.className = "apple-emoji-search-clear";
    clearSearch.setAttribute("aria-label", mt("common.cancel"));
    clearSearch.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>';
    searchWrap.append(searchInput, presets, clearSearch);

    let searchFrame = 0;
    const runSearch = () => {
      cancelAnimationFrame(searchFrame);
      searchFrame = requestAnimationFrame(() => {
        renderSearch(searchInput.value);
        requestAnimationFrame(placePanel);
      });
    };

    searchInput.addEventListener("input", runSearch);
    searchInput.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (searchInput.value || root.querySelector(".apple-emoji-search-preset.active")) {
        resetSearchUI();
        renderMode(activeCategory);
      } else {
        searchInput.blur();
      }
      requestAnimationFrame(placePanel);
    });

    clearSearch.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetSearchUI();
      renderMode(activeCategory);
      searchInput.focus({preventScroll:true});
      requestAnimationFrame(placePanel);
    });

    const grid = document.createElement("div");
    grid.className = "apple-emoji-grid";

    const tabs = document.createElement("div");
    tabs.className = "apple-emoji-tabs";

    const recent = makeRailButton("recent","recent",mt("emoji.recent"));
    recent.classList.add("apple-emoji-recent-tab");
    recent.addEventListener("pointerdown", event => event.preventDefault());
    recent.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetSearchUI();
      renderMode("recent");
      requestAnimationFrame(placePanel);
    });

    const normal = makeRailButton("normal","smileys",mt("emoji.normal"));
    normal.classList.add("apple-emoji-normal-tab");
    normal.addEventListener("pointerdown", event => event.preventDefault());
    normal.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetSearchUI();
      renderMode("normal");
      requestAnimationFrame(placePanel);
    });

    const custom = makeCustomPlaceholderTab();
    tabs.append(recent, normal, custom);

    root.append(head, searchWrap, grid, tabs);
    return root;
  }

  async function openPanel() {
    if (panel) { closePanel(); return; }
    try { window.RichTextToolbarMenu?.close?.(); } catch (_) {}
    try { hideMenus?.(); } catch (_) {}

    emojiBtn.classList.add("active");
    const loading = document.createElement("aside");
    loading.className = "popup-menu apple-emoji-picker-pop apple-emoji-loading";
    loading.innerHTML = '<div class="apple-emoji-loader"></div><span class="apple-emoji-loading-text"></span>';
    loading.querySelector(".apple-emoji-loading-text").textContent=mt("emoji.loading_apple");
    panel = loading;
    document.body.appendChild(panel);
    requestAnimationFrame(placePanel);

    try {
      await loadCatalog();
      if (!panel) return;
      const nextPanel = buildPanel();
      panel.replaceWith(nextPanel);
      panel = nextPanel;
      const recent = loadRecent();
      renderMode(recent.length ? "recent" : "normal");
      requestAnimationFrame(placePanel);
    } catch (error) {
      closePanel();
      if (typeof toast === "function") toast(mt("emoji.load_failed",{error:error.message}));
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
