// Beta 0.3.79 — server-authorized premium pack limits; developers can add unlimited packs.
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
  const CUSTOM_PACKS_KEY = "rich_customize_custom_emoji_packs";
  const SEARCH_LIMIT = 180;
  const DEFAULT_CUSTOM_PACK_LIMIT = 1;
  const CUSTOM_PREVIEW_CONCURRENCY = 5;
  const CUSTOM_PREVIEW_CACHE_NAME = "rich-custom-emoji-previews-v1";
  const CUSTOM_PREVIEW_CACHE_INDEX_KEY = "rich_customize_custom_preview_cache_index";
  const CUSTOM_PREVIEW_CACHE_LIMIT = 120;
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
  let activeNormalCategory = "smileys";
  let categoryScrollFrame = 0;
  let walletOpen = false;
  let activeTarget = null;
  let savedRange = null;
  let savedInputSelection = null;
  let catalogPromise = null;
  let catalog = null;
  let customPacks = loadCustomPacks();
  const customPreviewBlobs = new Map();
  const customPreviewQueue = [];
  let customPreviewActive = 0;
  let customPreviewObserver = null;

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
    if (el.matches?.(".rich-inline-editor,.rich-table-cell-editor[contenteditable='true'],.details-child-text[contenteditable='true'],.block-editor[contenteditable='true']")) return true;
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
    const editor = node?.closest?.(".rich-inline-editor,.rich-table-cell-editor[contenteditable='true'],.details-child-text[contenteditable='true'],.block-editor[contenteditable='true']");
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
    const customId = String(item?.custom_emoji_id || "");
    const recent = loadRecent().filter(entry => customId
      ? String(entry.custom_emoji_id || "") !== customId
      : String(entry.unified || "") !== String(item.unified || ""));
    recent.unshift(customId
      ? {
          custom_emoji_id:customId,
          emoji:String(item.emoji || "▫️"),
          pack_name:String(item.pack_name || ""),
          preview_file_id:String(item.preview_file_id || ""),
        }
      : {unified:item.unified, image:item.image, emoji:item.emoji});
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 36))); } catch (_) {}
  }

  function customPackLimit() {
    const access = window.RichMiniAppAccess;
    if (access?.isDeveloper && access?.customEmojiPackLimit == null) return Infinity;
    const value = Number(access?.customEmojiPackLimit);
    return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CUSTOM_PACK_LIMIT;
  }

  function serverPackNames() {
    return Array.isArray(window.RichMiniAppAccess?.customEmojiPacks)
      ? window.RichMiniAppAccess.customEmojiPacks.map(name => String(name || "")).filter(Boolean)
      : [];
  }

  function effectivePackCount() {
    return Math.max(customPacks.length, serverPackNames().length);
  }

  function hasCustomPackCapacity() {
    const limit = customPackLimit();
    return !Number.isFinite(limit) || effectivePackCount() < limit;
  }

  function visibleCustomPacks() {
    const limit = customPackLimit();
    return Number.isFinite(limit) ? customPacks.slice(0, limit) : customPacks.slice();
  }

  function loadCustomPacks() {
    try {
      const value = JSON.parse(localStorage.getItem(CUSTOM_PACKS_KEY) || "[]");
      if (!Array.isArray(value)) return [];
      return value
        .filter(pack => pack && /^[A-Za-z0-9_]{1,64}$/.test(String(pack.name || "")) && Array.isArray(pack.emojis));
    } catch (_) {
      return [];
    }
  }

  function saveCustomPacks() {
    try {
      localStorage.setItem(CUSTOM_PACKS_KEY, JSON.stringify(customPacks));
    } catch (_) {}
  }

  function rememberCustomPack(pack) {
    if (!pack?.name || !Array.isArray(pack.emojis) || !pack.emojis.length) return false;
    const name = String(pack.name);
    const index = customPacks.findIndex(item => String(item?.name || "") === name);
    if (index >= 0) {
      customPacks[index] = pack;
      saveCustomPacks();
      return true;
    }
    const serverAuthorized = serverPackNames().includes(name);
    if (!serverAuthorized && !hasCustomPackCapacity()) return false;
    customPacks.push(pack);
    saveCustomPacks();
    return true;
  }

  function customPack(name) {
    return customPacks.find(pack => pack.name === name) || null;
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
    panel?.querySelectorAll?.("[data-object-url]").forEach(node => {
      const objectUrl = node.dataset.objectUrl;
      if (objectUrl) {
        try { URL.revokeObjectURL(objectUrl); } catch (_) {}
      }
    });
    try { customPreviewObserver?.disconnect?.(); } catch (_) {}
    customPreviewObserver = null;
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

  function insertCustomEmojiIntoEditor(editor, item) {
    if (!editor || !item?.custom_emoji_id) return;
    const sel = window.getSelection();
    let range = savedRange?.cloneRange?.();
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    sel.removeAllRanges();
    sel.addRange(range);

    const token = document.createElement("tg-emoji");
    token.setAttribute("emoji-id", String(item.custom_emoji_id));
    token.textContent = String(item.emoji || "▫️");
    token.contentEditable = "false";

    range.deleteContents();
    range.insertNode(token);
    const caret = document.createRange();
    caret.setStartAfter(token);
    caret.collapse(true);
    sel.removeAllRanges();
    sel.addRange(caret);
    savedRange = caret.cloneRange();
    dispatchInput(editor, String(item.emoji || "▫️"));
  }

  function insertCustomEmoji(item) {
    addRecent(item);
    const target = activeTarget;
    if (target?.isConnected && target.isContentEditable) {
      insertCustomEmojiIntoEditor(target, item);
    } else {
      try {
        if (target === document.getElementById("slashInput") && typeof commitPendingComposerText === "function") {
          commitPendingComposerText();
        }
      } catch (_) {}
      if (typeof addBlock === "function" && (!selectedBlockId || !blocksEl?.querySelector?.(`.block[data-id="${selectedBlockId}"] [contenteditable='true']`))) {
        addBlock("paragraph");
      }
      requestAnimationFrame(() => {
        const editor = blocksEl?.querySelector?.(`.block[data-id="${selectedBlockId}"] .rich-inline-editor,.block[data-id="${selectedBlockId}"] [contenteditable='true']`);
        if (editor) {
          activeTarget = editor;
          savedRange = null;
          insertCustomEmojiIntoEditor(editor, item);
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

  function runCustomPreviewQueue() {
    while (customPreviewActive < CUSTOM_PREVIEW_CONCURRENCY && customPreviewQueue.length) {
      const job = customPreviewQueue.shift();
      customPreviewActive += 1;
      Promise.resolve()
        .then(job.task)
        .then(job.resolve, job.reject)
        .finally(() => {
          customPreviewActive -= 1;
          runCustomPreviewQueue();
        });
    }
  }

  function queueCustomPreview(task) {
    return new Promise((resolve, reject) => {
      customPreviewQueue.push({task, resolve, reject});
      runCustomPreviewQueue();
    });
  }

  function persistentPreviewRequest(key) {
    return new Request(
      new URL("/__rich_customize_emoji_cache__/" + encodeURIComponent(key), window.location.origin),
      {method:"GET"},
    );
  }

  function previewCacheIndex() {
    try {
      const value = JSON.parse(localStorage.getItem(CUSTOM_PREVIEW_CACHE_INDEX_KEY) || "[]");
      return Array.isArray(value) ? value.filter(item => typeof item === "string") : [];
    } catch (_) {
      return [];
    }
  }

  async function touchPersistentPreview(key) {
    if (!("caches" in window)) return;
    const next = [key, ...previewCacheIndex().filter(item => item !== key)];
    const stale = next.slice(CUSTOM_PREVIEW_CACHE_LIMIT);
    try {
      localStorage.setItem(
        CUSTOM_PREVIEW_CACHE_INDEX_KEY,
        JSON.stringify(next.slice(0, CUSTOM_PREVIEW_CACHE_LIMIT)),
      );
    } catch (_) {}
    if (!stale.length) return;
    try {
      const cache = await caches.open(CUSTOM_PREVIEW_CACHE_NAME);
      await Promise.all(stale.map(item => cache.delete(persistentPreviewRequest(item))));
    } catch (_) {}
  }

  async function readPersistentPreview(key) {
    if (!("caches" in window)) return null;
    try {
      const cache = await caches.open(CUSTOM_PREVIEW_CACHE_NAME);
      const response = await cache.match(persistentPreviewRequest(key));
      if (!response) return null;
      const blob = await response.blob();
      if (!blob.size) {
        await cache.delete(persistentPreviewRequest(key));
        return null;
      }
      touchPersistentPreview(key);
      return blob;
    } catch (_) {
      return null;
    }
  }

  async function writePersistentPreview(key, blob) {
    if (!("caches" in window) || !blob?.size) return;
    try {
      const cache = await caches.open(CUSTOM_PREVIEW_CACHE_NAME);
      await cache.put(
        persistentPreviewRequest(key),
        new Response(blob, {
          headers:{
            "content-type":blob.type || "application/octet-stream",
            "cache-control":"public, max-age=31536000, immutable",
          },
        }),
      );
      touchPersistentPreview(key);
    } catch (_) {}
  }

  function customPreviewBlob(itemOrId) {
    const item = typeof itemOrId === "object" && itemOrId
      ? itemOrId
      : {custom_emoji_id:String(itemOrId || "")};
    const id = String(item.custom_emoji_id || "");
    const previewFileId = String(item.preview_file_id || "");
    if (!id) return Promise.reject(new Error("missing_custom_emoji_id"));

    const key = previewFileId ? `file:${previewFileId}` : `emoji:${id}`;
    if (!customPreviewBlobs.has(key)) {
      customPreviewBlobs.set(key, queueCustomPreview(async () => {
        const cached = await readPersistentPreview(key);
        if (cached) return cached;

        const initData = String(window.Telegram?.WebApp?.initData || "");
        if (!initData) throw new Error("missing_init_data");

        const url = previewFileId
          ? `/miniapp/api/media/${encodeURIComponent(previewFileId)}`
          : `/miniapp/api/custom-emoji/${encodeURIComponent(id)}`;
        const response = await fetch(url, {
          method:"GET",
          headers:{"X-Telegram-Init-Data":initData},
          cache:"force-cache",
          credentials:"same-origin",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.size) throw new Error("empty_custom_emoji_preview");
        writePersistentPreview(key, blob);
        return blob;
      }).catch(error => {
        customPreviewBlobs.delete(key);
        throw error;
      }));
    }
    return customPreviewBlobs.get(key);
  }

  window.RichCustomEmojiPreview = Object.freeze({
    getBlob:customPreviewBlob,
  });

  async function hydrateCustomPreviewNode(node) {
    if (!node || node.dataset.loaded === "1" || node.dataset.loading === "1") return;
    const emojiId = String(node.dataset.customEmojiId || "");
    if (!emojiId) return;
    node.dataset.loading = "1";
    try {
      const blob = await customPreviewBlob({
        custom_emoji_id:emojiId,
        preview_file_id:String(node.dataset.previewFileId || ""),
      });
      if (!node.isConnected) return;
      const url = URL.createObjectURL(blob);
      const img = document.createElement("img");
      img.className = node.classList.contains("apple-emoji-custom-bubble")
        ? "apple-emoji-custom-img"
        : "apple-emoji-pack-img";
      img.alt = node.dataset.fallback || "▫️";
      img.decoding = "async";
      img.draggable = false;
      img.addEventListener("load", () => {
        if (!node.isConnected) {
          URL.revokeObjectURL(url);
          return;
        }
        const previous = node.dataset.objectUrl;
        node.replaceChildren(img);
        node.dataset.loaded = "1";
        node.dataset.objectUrl = url;
        delete node.dataset.loading;
        if (previous) URL.revokeObjectURL(previous);
      }, {once:true});
      img.addEventListener("error", () => {
        delete node.dataset.loading;
        URL.revokeObjectURL(url);
      }, {once:true});
      img.src = url;
    } catch (_) {
      delete node.dataset.loading;
    }
  }

  function observeCustomPreview(node) {
    if (!node) return;
    if (!("IntersectionObserver" in window)) {
      hydrateCustomPreviewNode(node);
      return;
    }
    if (!customPreviewObserver) {
      customPreviewObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (!entry.isIntersecting) return;
          customPreviewObserver?.unobserve(entry.target);
          hydrateCustomPreviewNode(entry.target);
        });
      }, {root:null, rootMargin:"80px"});
    }
    customPreviewObserver.observe(node);
  }

  function makeCustomPreviewNode(item, className = "apple-emoji-pack-preview") {
    const node = document.createElement("span");
    node.className = className;
    node.dataset.customEmojiId = String(item.custom_emoji_id || "");
    node.dataset.previewFileId = String(item.preview_file_id || "");
    node.dataset.fallback = String(item.emoji || "▫️");
    node.textContent = String(item.emoji || "▫️");
    observeCustomPreview(node);
    return node;
  }

  function appendEmojiButton(grid, item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "apple-emoji-item";
    button.setAttribute("aria-label", item.name || item.emoji);
    button.title = item.emoji;

    if (item.custom_emoji_id) {
      button.classList.add("apple-emoji-custom-item");
      button.dataset.customEmojiId = String(item.custom_emoji_id);
      button.appendChild(makeCustomPreviewNode(item));
    } else {
      button.appendChild(makeAppleImage(item, "apple-emoji-img"));
    }

    button.addEventListener("pointerdown", event => event.preventDefault());
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      if (item.custom_emoji_id) insertCustomEmoji(item);
      else insertEmoji(item);
    });
    grid.appendChild(button);
  }

  function animateGrid(grid) {
    if (!grid || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    grid.classList.remove("apple-emoji-grid-switch");
    void grid.offsetWidth;
    grid.classList.add("apple-emoji-grid-switch");
    window.setTimeout(() => grid?.classList?.remove("apple-emoji-grid-switch"), 170);
  }

  function centerRailTab(button) {
    if (!button) return;
    const scroller = button.closest?.(".apple-emoji-wallet") || button.closest?.(".apple-emoji-tabs");
    if (!scroller) return;

    const target = button.offsetLeft - (scroller.clientWidth - button.offsetWidth) / 2;
    const max = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    const left = Math.max(0, Math.min(max, target));
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    try {
      scroller.scrollTo({left, behavior:reduced ? "auto" : "smooth"});
    } catch (_) {
      scroller.scrollLeft = left;
    }
  }

  function animateRailSelection(button) {
    if (!button || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    button.classList.remove("apple-emoji-tab-pop");
    void button.offsetWidth;
    button.classList.add("apple-emoji-tab-pop");
    window.setTimeout(() => button?.classList?.remove("apple-emoji-tab-pop"), 220);
  }

  function appendSectionTitle(grid, text, {divider=false, category=""} = {}) {
    const heading = document.createElement("div");
    heading.className = "apple-emoji-section-title";
    if (divider) heading.classList.add("with-divider");
    if (category) heading.dataset.category = category;
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
        {divider: dividerFirst ? first : !first, category},
      );
      appendItems(grid, items);
      first = false;
    });
  }

  function setWalletOpen(open, {animate=true} = {}) {
    if (!panel) return;
    walletOpen = Boolean(open);
    const tabs = panel.querySelector(".apple-emoji-tabs");
    const wallet = panel.querySelector(".apple-emoji-wallet");
    if (!tabs || !wallet) return;

    tabs.classList.toggle("wallet-open", walletOpen);
    tabs.classList.toggle("wallet-closed", !walletOpen);
    wallet.classList.toggle("open", walletOpen);
    wallet.classList.toggle("closed", !walletOpen);
    wallet.setAttribute("aria-hidden", walletOpen ? "false" : "true");

    if (!animate || window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      wallet.classList.add("no-motion");
      requestAnimationFrame(() => wallet?.classList?.remove("no-motion"));
    }
  }

  function setRailActive(mode, {animate=true} = {}) {
    if (!panel) return;
    let activeButton = null;
    let changed = false;

    panel.querySelectorAll(".apple-emoji-tab").forEach(button => {
      const matchesRecent = button.dataset.mode === "recent" && mode === "recent";
      const matchesCategory = button.dataset.category
        && mode === "normal"
        && button.dataset.category === activeNormalCategory;
      const matchesPack = button.dataset.pack && mode === "pack:" + button.dataset.pack;
      const matchesAdd = button.dataset.mode === "add-pack" && mode === "add-pack";
      const next = Boolean(matchesRecent || matchesCategory || matchesPack || matchesAdd);
      if (next && !button.classList.contains("active")) changed = true;
      button.classList.toggle("active", next);
      if (next) activeButton = button;
    });

    if (!activeButton) return;
    requestAnimationFrame(() => {
      if (walletOpen || activeButton.classList.contains("apple-emoji-recent-tab") || activeButton.classList.contains("apple-emoji-laughing-tab")) {
        centerRailTab(activeButton);
      }
      if (animate && changed) animateRailSelection(activeButton);
    });
  }

  function scrollToNormalCategory(category, {smooth=true} = {}) {
    if (!panel || !CATEGORY_ORDER.includes(category)) return;
    activeNormalCategory = category;

    const grid = panel.querySelector(".apple-emoji-grid");
    const heading = grid?.querySelector?.(`.apple-emoji-section-title[data-category="${category}"]`);
    if (!grid || !heading) {
      setRailActive("normal");
      return;
    }

    const top = Math.max(0, heading.offsetTop - 2);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    try {
      grid.scrollTo({top, behavior:smooth && !reduced ? "smooth" : "auto"});
    } catch (_) {
      grid.scrollTop = top;
    }
    setRailActive("normal");
  }

  function syncCategoryFromScroll() {
    if (!panel || panel.dataset.mode !== "normal" || panel.dataset.view !== "normal") return;
    const grid = panel.querySelector(".apple-emoji-grid");
    if (!grid) return;

    cancelAnimationFrame(categoryScrollFrame);
    categoryScrollFrame = requestAnimationFrame(() => {
      const threshold = grid.scrollTop + 18;
      let category = CATEGORY_ORDER[0];
      grid.querySelectorAll(".apple-emoji-section-title[data-category]").forEach(heading => {
        if (heading.offsetTop <= threshold) category = heading.dataset.category || category;
      });
      if (category && category !== activeNormalCategory) {
        activeNormalCategory = category;
        setRailActive("normal", {animate:false});
      }
    });
  }

  function showSearchBar(show=true) {
    const wrap = panel?.querySelector?.(".apple-emoji-search-wrap");
    if (wrap) wrap.hidden = !show;
  }

  function renderMode(mode) {
    if (String(mode || "").startsWith("pack:")) {
      renderCustomPack(String(mode).slice(5));
      return;
    }
    if (!panel || !catalog) return;
    activeCategory = mode === "recent" ? "recent" : "normal";
    panel.dataset.mode = activeCategory;
    panel.dataset.view = activeCategory;
    showSearchBar(true);

    const grid = panel.querySelector(".apple-emoji-grid");
    const title = panel.querySelector(".apple-emoji-category-title");
    if (!grid) return;
    grid.innerHTML = "";

    if (activeCategory === "recent") {
      setWalletOpen(false);
      if (title) title.textContent = mt("emoji.recent");
      const recent = loadRecent()
        .map(saved => saved.custom_emoji_id
          ? {
              custom_emoji_id:String(saved.custom_emoji_id),
              emoji:String(saved.emoji || "▫️"),
              pack_name:String(saved.pack_name || ""),
              preview_file_id:String(saved.preview_file_id || ""),
              name:String(saved.emoji || "▫️"),
            }
          : (catalog.byUnified.get(saved.unified) || catalog.byEmoji.get(saved.emoji)))
        .filter(Boolean);
      if (recent.length) appendItems(grid, recent);
      else appendEmpty(grid, mt("emoji.recent_empty"), true);
      appendNormalSections(grid, {dividerFirst:true});
    } else {
      setWalletOpen(true);
      if (title) title.textContent = mt("emoji.normal");
      appendNormalSections(grid);
      activeNormalCategory = activeNormalCategory || "smileys";
    }

    setRailActive(activeCategory);
    panel.querySelectorAll(".apple-emoji-search-preset").forEach(button => button.classList.remove("active"));
    grid.scrollTop = 0;
    animateGrid(grid);
  }

  function renderCustomPack(name) {
    if (!panel) return;
    const pack = customPack(name);
    if (!pack) {
      renderAddPackView();
      return;
    }
    activeCategory = "pack:" + pack.name;
    panel.dataset.mode = activeCategory;
    panel.dataset.view = "custom-pack";
    setWalletOpen(false);
    showSearchBar(true);

    const grid = panel.querySelector(".apple-emoji-grid");
    const title = panel.querySelector(".apple-emoji-category-title");
    if (!grid) return;
    if (title) title.textContent = pack.title || pack.name;
    grid.innerHTML = "";
    appendItems(grid, pack.emojis.map(item => ({
      ...item,
      pack_name:pack.name,
      name:item.emoji || pack.title || pack.name,
    })));
    setRailActive(activeCategory);
    grid.scrollTop = 0;
    animateGrid(grid);
  }

  function renderAddPackView() {
    if (!panel) return;
    if (!hasCustomPackCapacity()) {
      try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("warning"); } catch (_) {}
      if (typeof toast === "function") toast(mt("emoji.pack_limit_reached"));
      return;
    }
    panel.dataset.view = "add-pack";
    setWalletOpen(false);
    showSearchBar(false);
    const grid = panel.querySelector(".apple-emoji-grid");
    const title = panel.querySelector(".apple-emoji-category-title");
    if (!grid) return;
    if (title) title.textContent = mt("emoji.pack_add_title");
    grid.innerHTML = "";
    setRailActive("add-pack");

    const card = document.createElement("form");
    card.className = "apple-emoji-pack-form";
    card.setAttribute("novalidate", "");

    const intro = document.createElement("div");
    intro.className = "apple-emoji-pack-form-copy";
    const strong = document.createElement("strong");
    strong.textContent = mt("emoji.pack_add_title");
    const hint = document.createElement("span");
    hint.textContent = Number.isFinite(customPackLimit())
      ? mt("emoji.pack_add_hint")
      : mt("emoji.pack_add_hint_developer");
    intro.append(strong, hint);

    const input = document.createElement("input");
    input.type = "url";
    input.inputMode = "url";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.dir = "ltr";
    input.className = "apple-emoji-pack-link";
    input.placeholder = mt("emoji.pack_link_placeholder");
    input.setAttribute("aria-label", mt("emoji.pack_link_placeholder"));

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "apple-emoji-pack-submit";
    submit.textContent = mt("emoji.pack_add");

    const status = document.createElement("div");
    status.className = "apple-emoji-pack-status";
    status.setAttribute("role", "status");

    card.append(intro, input, submit, status);
    grid.appendChild(card);
    grid.scrollTop = 0;
    animateGrid(grid);

    card.addEventListener("submit", async event => {
      event.preventDefault();
      if (!hasCustomPackCapacity()) {
        status.textContent = mt("emoji.pack_limit_reached");
        syncCustomPackTabs();
        return;
      }
      const value = String(input.value || "").trim();
      if (!value) {
        status.textContent = mt("emoji.pack_link_required");
            return;
      }
      const initData = String(window.Telegram?.WebApp?.initData || "");
      if (!initData) {
        status.textContent = mt("emoji.pack_load_failed");
        return;
      }

      input.disabled = true;
      submit.disabled = true;
      submit.textContent = mt("emoji.pack_loading");
      status.textContent = "";

      try {
        const response = await fetch("/miniapp/api/custom-emoji/pack", {
          method:"POST",
          headers:{
            "X-Telegram-Init-Data":initData,
            "Content-Type":"application/json",
          },
          body:JSON.stringify({set:value}),
          cache:"no-store",
          credentials:"same-origin",
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok || !data?.pack) {
          const error = new Error(data?.error || data?.message || "pack_load_failed");
          error.code = String(data?.error || "");
          throw error;
        }
        if (data?.access) {
          const currentAccess = window.RichMiniAppAccess || {};
          window.RichMiniAppAccess = {
            ...currentAccess,
            isDeveloper:Boolean(data.access.is_developer),
            customEmojiPackLimit:data.access.custom_emoji_pack_limit==null?null:Number(data.access.custom_emoji_pack_limit),
            customEmojiPackCount:Math.max(0,Number(data.access.custom_emoji_pack_count||0)),
            customEmojiPacks:Array.isArray(data.access.custom_emoji_packs)
              ? data.access.custom_emoji_packs.map(name => String(name || "")).filter(Boolean)
              : serverPackNames(),
          };
        }
        const pack = {
          name:String(data.pack.name || ""),
          title:String(data.pack.title || data.pack.name || ""),
          emojis:(Array.isArray(data.pack.emojis) ? data.pack.emojis : [])
            .map(item => ({
              custom_emoji_id:String(item.custom_emoji_id || ""),
              emoji:String(item.emoji || "▫️"),
              preview_file_id:String(item.preview_file_id || ""),
            }))
            .filter(item => /^\d{5,32}$/.test(item.custom_emoji_id)),
        };
        if (!pack.name || !pack.emojis.length) throw new Error("empty_custom_emoji_pack");

        if (!rememberCustomPack(pack)) throw new Error("custom_emoji_pack_limit");
        syncCustomPackTabs();
        resetSearchUI();
        renderCustomPack(pack.name);
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("success"); } catch (_) {}
      } catch (error) {
        if (String(error?.code || error?.message || "") === "custom_emoji_pack_limit") {
          status.textContent = mt("emoji.pack_limit_reached");
          syncCustomPackTabs();
        } else {
          status.textContent = mt("emoji.pack_load_failed");
        }
        input.disabled = false;
        submit.disabled = false;
        submit.textContent = mt("emoji.pack_add");
      }
    });

  }

  let accessPackSyncRunning = false;

  async function syncRegularPackWithServer() {
    if (accessPackSyncRunning || customPackLimit() !== DEFAULT_CUSTOM_PACK_LIMIT) return;
    const initData = String(window.Telegram?.WebApp?.initData || "");
    if (!initData) return;

    const serverNames = serverPackNames();
    const targetName = serverNames[0] || String(customPacks[0]?.name || "");
    if (!targetName) {
      syncCustomPackTabs();
      return;
    }

    accessPackSyncRunning = true;
    try {
      const response = await fetch("/miniapp/api/custom-emoji/pack", {
        method:"POST",
        headers:{
          "X-Telegram-Init-Data":initData,
          "Content-Type":"application/json",
        },
        body:JSON.stringify({set:targetName}),
        cache:"no-store",
        credentials:"same-origin",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok || !data?.pack) return;

      if (data?.access) {
        const currentAccess = window.RichMiniAppAccess || {};
        window.RichMiniAppAccess = {
          ...currentAccess,
          isDeveloper:Boolean(data.access.is_developer),
          customEmojiPackLimit:data.access.custom_emoji_pack_limit==null?null:Number(data.access.custom_emoji_pack_limit),
          customEmojiPackCount:Math.max(0,Number(data.access.custom_emoji_pack_count||0)),
          customEmojiPacks:Array.isArray(data.access.custom_emoji_packs)
            ? data.access.custom_emoji_packs.map(name => String(name || "")).filter(Boolean)
            : serverPackNames(),
        };
      }

      const pack = {
        name:String(data.pack.name || ""),
        title:String(data.pack.title || data.pack.name || ""),
        emojis:(Array.isArray(data.pack.emojis) ? data.pack.emojis : [])
          .map(item => ({
            custom_emoji_id:String(item.custom_emoji_id || ""),
            emoji:String(item.emoji || "▫️"),
            preview_file_id:String(item.preview_file_id || ""),
          }))
          .filter(item => /^\d{5,32}$/.test(item.custom_emoji_id)),
      };
      if (pack.name && pack.emojis.length) {
        const existing = customPacks.findIndex(item => String(item?.name || "") === pack.name);
        if (existing >= 0) customPacks[existing] = pack;
        else customPacks.unshift(pack);
        const limit = customPackLimit();
        if (Number.isFinite(limit)) customPacks = customPacks.slice(0, limit);
        saveCustomPacks();
      }
      syncCustomPackTabs();
    } catch (_) {
      syncCustomPackTabs();
    } finally {
      accessPackSyncRunning = false;
    }
  }

  window.addEventListener("rich-miniapp-access", () => {
    syncCustomPackTabs();
    syncRegularPackWithServer();
  });
  if (window.RichMiniAppAccess) {
    queueMicrotask(() => {
      syncCustomPackTabs();
      syncRegularPackWithServer();
    });
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
    showSearchBar(true);
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

  function hydrateCustomEmojiPreview(button) {
    const bubble = button?.querySelector?.(".apple-emoji-custom-bubble");
    if (bubble) observeCustomPreview(bubble);
  }

  function makeRailButton(mode, icon, label) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "apple-emoji-tab";
    if (mode) button.dataset.mode = mode;
    button.setAttribute("aria-label", label);
    try {
      MiniAppIcons.mount(button, icon);
    } catch (_) {
      button.textContent = "•";
    }
    return button;
  }

  function makeCategoryRailButton(category) {
    const meta = Object.values(CATEGORY_META).find(item => item.key === category);
    const button = makeRailButton("", category, meta?.labelKey ? mt(meta.labelKey) : category);
    button.classList.add("apple-emoji-category-tab");
    button.dataset.category = category;
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetSearchUI();

      if (panel?.dataset.mode !== "normal" || panel?.dataset.view !== "normal") {
        activeNormalCategory = category;
        renderMode("normal");
        requestAnimationFrame(() => scrollToNormalCategory(category, {smooth:false}));
      } else {
        scrollToNormalCategory(category, {smooth:true});
      }
      requestAnimationFrame(placePanel);
    });
    return button;
  }

  function syncAddPackLockState(button) {
    if (!button) return;
    const locked = !hasCustomPackCapacity();
    button.classList.toggle("is-locked", locked);
    button.dataset.locked = locked ? "1" : "0";
    button.setAttribute("aria-disabled", locked ? "true" : "false");
    button.setAttribute("aria-label", locked ? mt("emoji.pack_limit_reached") : mt("emoji.custom_placeholder"));
    button.title = locked ? mt("emoji.pack_limit_reached") : mt("emoji.custom_placeholder");
  }

  function makeCustomPlaceholderTab() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "apple-emoji-tab apple-emoji-custom-placeholder";
    button.dataset.mode = "add-pack";
    button.dataset.customEmojiId = CUSTOM_EMOJI_FALLBACK_ID;
    const bubble = document.createElement("span");
    bubble.className = "apple-emoji-custom-bubble";
    bubble.textContent = "👤";
    bubble.dataset.customEmojiId = CUSTOM_EMOJI_FALLBACK_ID;
    bubble.dataset.fallback = "👤";
    button.appendChild(bubble);
    syncAddPackLockState(button);
    return button;
  }

  function makeCustomPackTab(pack) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "apple-emoji-tab apple-emoji-pack-tab";
    button.dataset.pack = pack.name;
    button.setAttribute("aria-label", pack.title || pack.name);
    const first = pack.emojis?.[0];
    if (first) {
      button.appendChild(makeCustomPreviewNode({
        ...first,
        pack_name:pack.name,
      }, "apple-emoji-pack-tab-preview"));
    } else {
      button.textContent = "▫️";
    }
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();

      const mode = "pack:" + pack.name;
      const alreadyOpen = panel?.dataset.mode === mode
        && panel?.dataset.view === "custom-pack";
      if (alreadyOpen) return;

      resetSearchUI();
      setWalletOpen(false);
      renderCustomPack(pack.name);
      requestAnimationFrame(placePanel);
    });
    return button;
  }

  function syncCustomPackTabs() {
    if (!panel) return;
    const tabs = panel.querySelector(".apple-emoji-tabs");
    if (!tabs) return;
    const addButton = tabs.querySelector(".apple-emoji-custom-placeholder");

    tabs.querySelectorAll(".apple-emoji-pack-tab").forEach(button => button.remove());
    visibleCustomPacks().forEach(pack => {
      const packButton = makeCustomPackTab(pack);
      if (addButton?.isConnected) tabs.insertBefore(packButton, addButton);
      else tabs.appendChild(packButton);
    });

    syncAddPackLockState(addButton);

    const mode = String(panel.dataset.mode || activeCategory || "normal");
    requestAnimationFrame(() => setRailActive(mode));
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
      requestAnimationFrame(placePanel);
    });

    const grid = document.createElement("div");
    grid.className = "apple-emoji-grid";

    const tabs = document.createElement("div");
    tabs.className = "apple-emoji-tabs";

    const activateMode = (mode, event) => {
      event?.preventDefault?.();
      event?.stopPropagation?.();
      resetSearchUI();
      renderMode(mode);
      requestAnimationFrame(placePanel);
    };

    const recent = makeRailButton("recent","recent",mt("emoji.recent"));
    recent.classList.add("apple-emoji-recent-tab");
    recent.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetSearchUI();
      setWalletOpen(false);
      renderMode("recent");
      requestAnimationFrame(placePanel);
    });

    // "Laughing" is the permanent normal-emoji launcher. It opens the wallet
    // and returns to the Smileys section, matching Telegram's two-stage rail.
    const smileMeta = Object.values(CATEGORY_META).find(item => item.key === "smileys");
    const laughing = makeRailButton("", "smileys", smileMeta?.labelKey ? mt(smileMeta.labelKey) : mt("emoji.normal"));
    laughing.classList.add("apple-emoji-laughing-tab","apple-emoji-category-tab");
    laughing.dataset.category = "smileys";
    laughing.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetSearchUI();
      setWalletOpen(true);
      activeNormalCategory = "smileys";
      if (panel?.dataset.mode !== "normal" || panel?.dataset.view !== "normal") {
        renderMode("normal");
        requestAnimationFrame(() => scrollToNormalCategory("smileys", {smooth:false}));
      } else {
        scrollToNormalCategory("smileys", {smooth:true});
      }
      requestAnimationFrame(placePanel);
    });

    const wallet = document.createElement("div");
    wallet.className = "apple-emoji-wallet closed";
    wallet.setAttribute("aria-hidden","true");

    // The wallet is reserved for standard emoji categories only.
    // Premium packs and the add-pack button always stay outside it.
    const categoryButtons = CATEGORY_ORDER
      .filter(category => category !== "smileys")
      .map(category => makeCategoryRailButton(category));

    const custom = makeCustomPlaceholderTab();
    custom.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      resetSearchUI();
      setWalletOpen(false);
      if (!hasCustomPackCapacity()) {
        try { window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.("warning"); } catch (_) {}
        if (typeof toast === "function") toast(mt("emoji.pack_limit_reached"));
        syncAddPackLockState(custom);
        requestAnimationFrame(placePanel);
        return;
      }
      renderAddPackView();
      requestAnimationFrame(placePanel);
    });

    wallet.append(...categoryButtons);
    tabs.append(recent, laughing, wallet, custom);
    grid.addEventListener("scroll", syncCategoryFromScroll, {passive:true});
    root.append(head, searchWrap, grid, tabs);

    requestAnimationFrame(() => {
      if (custom.isConnected) hydrateCustomEmojiPreview(custom);
      syncCustomPackTabs();
      setWalletOpen(panel?.dataset.mode !== "recent", {animate:false});
    });
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
