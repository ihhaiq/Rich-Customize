// Beta 0.3.13 — inline Rich Buttons + selection formatting inside normal text blocks.
(() => {
  const INLINE_TEXT_TYPES = new Set([
    "paragraph", "text", "caption", "heading", "footer", "blockquote", "pullquote",
  ]);
  const BUTTON_TYPES = {
    user:{label:"مستخدم",icon:"👤",action:"تحديد مستخدم"},
    url:{label:"رابط",icon:"🔗",action:"تعديل الرابط"},
    callback_data:{label:"Callback data",icon:"↪",action:"ربط بصفحة محفوظة"},
    page_callback:{label:"CBD / صفحة",icon:"📚",action:"ربط بصفحة محفوظة"},
    copy:{label:"نسخ",icon:"📋",action:"تعديل نص النسخ"},
    popup:{label:"Popup",icon:"💬",action:"تعديل نص التنبيه"},
    switch_inline_query:{label:"بحث Inline",icon:"⌕",action:"تعديل نص البحث"},
    switch_inline_query_current_chat:{label:"بحث هنا",icon:"⌖",action:"تعديل نص البحث هنا"},
    disabled:{label:"معطّل",icon:"⊘",action:null},
  };
  const BUTTON_ORDER = [
    "user", "url", "callback_data", "page_callback", "copy", "popup",
    "switch_inline_query", "switch_inline_query_current_chat", "disabled",
  ];
  const MARKER_RE = /\{([^{}\n]+)\}/g;
  const ALIASES = {cbd:"page_callback",page:"page_callback",callback:"callback_data"};

  let activeEditor = null;
  let savedRange = null;
  let selectionToolbar = null;
  let floatingMenu = null;

  function cleanTitle(value) {
    return String(value || "زر").replace(/[{}\n]/g, " ").trim().slice(0, 64) || "زر";
  }

  function parseMarker(marker) {
    const raw = String(marker || "");
    if (!raw.startsWith("{") || !raw.endsWith("}")) return null;
    const body = raw.slice(1, -1).trim();
    const colon = body.indexOf(":");
    if (colon <= 0) return null;
    const title = cleanTitle(body.slice(0, colon));
    let spec = body.slice(colon + 1).trim();
    let color = null;
    const colorMatch = spec.match(/#\s*([rbpg])\s*$/i);
    if (colorMatch) {
      color = colorMatch[1].toLowerCase();
      spec = spec.slice(0, colorMatch.index).trim();
    }
    let type = "url";
    let value = "";
    const typed = spec.match(/^([\w-]+(?:\s+[\w-]+)*)\s*:\s*(.*)$/s);
    if (typed) {
      type = ALIASES[typed[1].toLowerCase()] || typed[1].toLowerCase();
      value = typed[2].trim();
    } else {
      const pieces = spec.split(/\s+/, 2);
      type = ALIASES[(pieces[0] || "url").toLowerCase()] || (pieces[0] || "url").toLowerCase();
      value = spec.slice((pieces[0] || "").length).trim();
    }
    if (!BUTTON_TYPES[type]) return null;
    return {marker:raw,title,type,value,color};
  }

  function markerFor(info) {
    const title = cleanTitle(info.title);
    const type = info.type === "page_callback" ? "cbd" : info.type;
    const value = String(info.value || "");
    const color = ["r","b","p","g"].includes(info.color) ? ` #${info.color}` : "";
    return `{${title}:${type}:${value}${color}}`;
  }

  function stripOuter(raw, tag) {
    const value = String(raw || "").trim();
    const re = new RegExp(`^<${tag}(?:\\s+[^>]*)?>([\\s\\S]*)<\\/${tag}>$`, "i");
    const match = value.match(re);
    return match ? match[1] : value;
  }

  function innerHtmlForBlock(block) {
    const d = block?.data || {};
    if (block?.type === "blockquote" || block?.type === "pullquote") {
      return String(d.quote_html || escapeHtml(d.quote_text || ""));
    }
    const raw = String(d.html || escapeHtml(d.text || ""));
    if (block?.type === "heading") return stripOuter(raw, `h${Math.max(1, Math.min(6, Number(d.size || 2)))}`);
    if (block?.type === "footer") return stripOuter(raw, "footer");
    if (["paragraph","text","caption"].includes(block?.type)) return stripOuter(raw, "p");
    return raw;
  }

  function sanitizeInlineHtml(raw) {
    const template = document.createElement("template");
    template.innerHTML = String(raw || "");
    const allowed = new Set(["B","STRONG","I","EM","U","INS","S","STRIKE","DEL","TG-SPOILER","CODE","MARK","SUB","SUP","BR","A","TG-EMOJI"]);
    const cleanNode = node => {
      if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.nodeValue || "");
      if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
      if (!allowed.has(node.tagName)) {
        const frag = document.createDocumentFragment();
        Array.from(node.childNodes).forEach(child => frag.appendChild(cleanNode(child)));
        return frag;
      }
      const el = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === "A") {
        const href = String(node.getAttribute("href") || "");
        if (/^(https?:|tg:|mailto:|tel:|#)/i.test(href)) el.setAttribute("href", href);
      }
      if (node.tagName === "TG-EMOJI") {
        const emojiId = node.getAttribute("emoji-id");
        if (emojiId) el.setAttribute("emoji-id", emojiId);
      }
      Array.from(node.childNodes).forEach(child => el.appendChild(cleanNode(child)));
      return el;
    };
    const out = document.createElement("div");
    Array.from(template.content.childNodes).forEach(child => out.appendChild(cleanNode(child)));
    return out.innerHTML;
  }

  function tokenClass(info) {
    if (info.type === "disabled") return "is-disabled";
    return ({r:"is-danger",g:"is-success",b:"is-primary",p:"is-primary"})[info.color] || "is-default";
  }

  function makeToken(marker) {
    const info = parseMarker(marker);
    if (!info) return document.createTextNode(marker);
    const token = document.createElement("span");
    token.className = `inline-rich-button-token ${tokenClass(info)}`;
    token.contentEditable = "false";
    token.dataset.inlineRichButton = "1";
    token.dataset.marker = marker;
    token.dataset.buttonType = info.type;
    token.textContent = info.title;
    token.setAttribute("role", "button");
    token.setAttribute("aria-label", `${info.title} · ${BUTTON_TYPES[info.type]?.label || "زر"}`);
    return token;
  }

  function decorateMarkers(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest?.(".inline-rich-button-token")) continue;
      if (MARKER_RE.test(node.nodeValue || "")) nodes.push(node);
      MARKER_RE.lastIndex = 0;
    }
    nodes.forEach(node => {
      const text = node.nodeValue || "";
      const frag = document.createDocumentFragment();
      let cursor = 0;
      MARKER_RE.lastIndex = 0;
      for (const match of text.matchAll(MARKER_RE)) {
        const info = parseMarker(match[0]);
        if (!info) continue;
        if (match.index > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, match.index)));
        frag.appendChild(makeToken(match[0]));
        cursor = match.index + match[0].length;
      }
      if (!cursor) return;
      if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
      node.replaceWith(frag);
    });
  }

  function serializeEditor(editor) {
    const clone = editor.cloneNode(true);
    clone.querySelectorAll(".inline-rich-button-token").forEach(token => {
      token.replaceWith(document.createTextNode(token.dataset.marker || token.textContent || ""));
    });
    clone.querySelectorAll("[contenteditable]").forEach(el => el.removeAttribute("contenteditable"));
    return {html:clone.innerHTML, text:clone.textContent || ""};
  }

  function findBlockRecursive(blocks, id) {
    for (const block of blocks || []) {
      if (!block || typeof block !== "object") continue;
      if (String(block.id) === String(id)) return block;
      const children = block.data?.children;
      if (Array.isArray(children)) {
        const found = findBlockRecursive(children, id);
        if (found) return found;
      }
      const items = block.data?.items;
      if (Array.isArray(items)) {
        for (const item of items) {
          const found = findBlockRecursive(item?.blocks, id);
          if (found) return found;
        }
      }
    }
    return null;
  }

  function blockForEditor(editor) {
    const id = editor?.dataset?.richBlockId
      || editor?.closest?.(".details-child-editor[data-child-id]")?.dataset?.childId
      || editor?.closest?.(".block[data-id]")?.dataset?.id;
    return id ? findBlockRecursive(current?.blocks || [], id) : null;
  }

  function syncEditor(editor, block = blockForEditor(editor)) {
    if (!editor || !block) return;
    const d = block.data || (block.data = {});
    const serialized = serializeEditor(editor);
    delete d._rich_button;
    d.rich_text = null;
    if (block.type === "blockquote" || block.type === "pullquote") {
      d.quote_text = serialized.text;
      d.quote_html = serialized.html;
    } else {
      d.text = serialized.text;
      if (block.type === "heading") {
        const level = Math.max(1, Math.min(6, Number(d.size || 2)));
        d.html = `<h${level}>${serialized.html}</h${level}>`;
      } else if (block.type === "footer") d.html = `<footer>${serialized.html}</footer>`;
      else d.html = `<p>${serialized.html}</p>`;
    }
  }

  function hydrateEditor(editor, block) {
    if (!editor || !block || !INLINE_TEXT_TYPES.has(block.type)) return;
    editor.classList.add("rich-inline-editor");
    editor.dataset.richBlockId = block.id;
    editor.dataset.placeholder ||= block.type === "paragraph" ? "اكتب نصًا…" : info(block.type).label;
    if (editor.dataset.richHydrated === "1") return;
    editor.dataset.richHydrated = "1";
    editor.innerHTML = sanitizeInlineHtml(innerHtmlForBlock(block));
    decorateMarkers(editor);
    editor.querySelectorAll("tg-spoiler").forEach(el => el.classList.add("inline-spoiler"));
  }

  function makeTopLevelEditor(block) {
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.spellcheck = true;
    editor.className = "block-editor live-editor rich-inline-editor";
    if (block.type === "heading") {
      const level = Math.max(1, Math.min(6, Number(block.data?.size || 2)));
      editor.classList.add(`heading-${level}`, `live-heading-${level}`);
    } else if (block.type === "footer") editor.classList.add("footer-editor", "live-footer");
    else if (block.type === "blockquote" || block.type === "pullquote") {
      editor.classList.add("quote-editor", "live-quote");
      if (block.type === "pullquote") editor.classList.add("live-pullquote");
    } else editor.classList.add("live-paragraph");
    hydrateEditor(editor, block);
    editor.addEventListener("focus", () => {
      activeEditor = editor;
      selectBlock(block.id);
    });
    editor.addEventListener("input", () => {
      syncEditor(editor, block);
      markDirty();
    });
    editor.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        document.execCommand?.("insertLineBreak", false, null);
      }
    });
    return editor;
  }

  const previousTextEditor = textEditor;
  textEditor = function(block) {
    if (INLINE_TEXT_TYPES.has(block?.type)) return makeTopLevelEditor(block);
    return previousTextEditor(block);
  };

  function hydrateAllNested() {
    document.querySelectorAll(".details-child-editor[data-child-id] .details-child-text[contenteditable='true']").forEach(editor => {
      const childId = editor.closest(".details-child-editor[data-child-id]")?.dataset?.childId;
      const block = findBlockRecursive(current?.blocks || [], childId);
      if (!block || !INLINE_TEXT_TYPES.has(block.type)) return;
      hydrateEditor(editor, block);
    });
  }

  const previousRenderBlocks = renderBlocks;
  renderBlocks = function(...args) {
    const result = previousRenderBlocks(...args);
    requestAnimationFrame(hydrateAllNested);
    return result;
  };
  requestAnimationFrame(hydrateAllNested);

  document.addEventListener("input", event => {
    const editor = event.target.closest?.(".rich-inline-editor,[data-rich-block-id]");
    if (!editor || !editor.isContentEditable) return;
    const block = blockForEditor(editor);
    if (!block || !INLINE_TEXT_TYPES.has(block.type)) return;
    syncEditor(editor, block);
  });

  function selectionBounds() {
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0;
    const top = vv?.offsetTop || 0;
    const width = vv?.width || window.innerWidth;
    const height = vv?.height || window.innerHeight;
    return {left,top,right:left+width,bottom:top+height};
  }

  function closeFloatingMenu() {
    floatingMenu?.remove?.();
    floatingMenu = null;
  }

  function placeNearRect(el, rect, preferAbove = true) {
    const bounds = selectionBounds();
    const margin = 8;
    el.style.visibility = "hidden";
    el.style.left = `${bounds.left + margin}px`;
    el.style.top = `${bounds.top + margin}px`;
    const own = el.getBoundingClientRect();
    let left = rect.left + (rect.width - own.width) / 2;
    left = Math.max(bounds.left + margin, Math.min(left, bounds.right - own.width - margin));
    let top = preferAbove ? rect.top - own.height - 8 : rect.bottom + 8;
    if (top < bounds.top + margin) top = rect.bottom + 8;
    if (top + own.height > bounds.bottom - margin) top = Math.max(bounds.top + margin, rect.top - own.height - 8);
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.visibility = "visible";
  }

  function restoreSelection() {
    if (!savedRange || !activeEditor?.isConnected) return false;
    activeEditor.focus({preventScroll:true});
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange.cloneRange());
    return true;
  }

  function syncActiveAndDirty() {
    if (!activeEditor) return;
    const block = blockForEditor(activeEditor);
    if (!block) return;
    syncEditor(activeEditor, block);
    markDirty();
    pushHistory();
  }

  function applyCommand(command) {
    if (!restoreSelection()) return;
    document.execCommand?.(command, false, null);
    syncActiveAndDirty();
    requestAnimationFrame(refreshSelectionToolbar);
  }

  function applySpoiler() {
    if (!restoreSelection()) return;
    const sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const wrapper = document.createElement("tg-spoiler");
    wrapper.className = "inline-spoiler";
    try {
      wrapper.appendChild(range.extractContents());
      range.insertNode(wrapper);
      const next = document.createRange();
      next.selectNodeContents(wrapper);
      sel.removeAllRanges();
      sel.addRange(next);
      savedRange = next.cloneRange();
      syncActiveAndDirty();
      requestAnimationFrame(refreshSelectionToolbar);
    } catch (_) {}
  }

  function normalizeLink(value) {
    const href = String(value || "").trim();
    if (!href) return "";
    if (/^(https?:\/\/|tg:\/\/|mailto:|tel:)/i.test(href)) return href;
    if (/^[\w.-]+\.[a-z]{2,}(?:[/?#].*)?$/i.test(href)) return `https://${href}`;
    return "";
  }

  function openLinkEditorFromSelection() {
    if (!savedRange || !activeEditor) return;
    const selectionRect = savedRange.getBoundingClientRect();
    const {menu} = simpleMenu("إضافة رابط داخل النص");
    menu.classList.add("inline-value-editor");
    const input = document.createElement("input");
    input.className = "rich-button-editor-input";
    input.type = "url";
    input.dir = "ltr";
    input.inputMode = "url";
    input.placeholder = "https://example.com";
    const actions = document.createElement("div");
    actions.className = "rich-button-editor-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "إلغاء";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-soft";
    save.textContent = "إضافة الرابط";
    cancel.onclick = () => closeFloatingMenu();
    save.onclick = () => {
      const href = normalizeLink(input.value);
      if (!href) {
        toast("أدخل رابطًا صحيحًا يبدأ بـ https:// أو tg://");
        input.focus();
        return;
      }
      closeFloatingMenu();
      if (!restoreSelection()) return;
      document.execCommand?.("createLink", false, href);
      syncActiveAndDirty();
      hideSelectionToolbar();
    };
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        save.click();
      }
    });
    actions.append(cancel,save);
    menu.append(input,actions);
    placeNearRect(menu, selectionRect, false);
    requestAnimationFrame(() => input.focus({preventScroll:true}));
  }

  function makeSelectionToolbar() {
    if (selectionToolbar) return selectionToolbar;
    const bar = document.createElement("div");
    bar.className = "selection-format-bubble";
    bar.setAttribute("role", "toolbar");
    const specs = [
      ["B","عريض",() => applyCommand("bold")],
      ["I","مائل",() => applyCommand("italic")],
      ["S","مشطوب",() => applyCommand("strikeThrough")],
      ["◌","تشويش",applySpoiler],
      ["↗","رابط",openLinkEditorFromSelection],
      ["▣","إنشاء زر",openButtonTypeMenuFromSelection],
    ];
    specs.forEach(([icon,label,handler]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "selection-format-btn";
      btn.title = label;
      btn.setAttribute("aria-label", label);
      btn.innerHTML = `<span>${icon}</span><small>${label}</small>`;
      btn.addEventListener("pointerdown", event => event.preventDefault());
      btn.addEventListener("click", event => {event.preventDefault();event.stopPropagation();handler();});
      bar.appendChild(btn);
    });
    document.body.appendChild(bar);
    selectionToolbar = bar;
    return bar;
  }

  function hideSelectionToolbar() {
    selectionToolbar?.classList.remove("show");
  }

  function refreshSelectionToolbar() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      hideSelectionToolbar();
      return;
    }
    const range = sel.getRangeAt(0);
    const node = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const editor = node?.closest?.(".rich-inline-editor");
    if (!editor || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) {
      hideSelectionToolbar();
      return;
    }
    const text = sel.toString();
    if (!text.trim()) {
      hideSelectionToolbar();
      return;
    }
    activeEditor = editor;
    savedRange = range.cloneRange();
    const rect = range.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    const bar = makeSelectionToolbar();
    bar.classList.add("show");
    placeNearRect(bar, rect, true);
  }

  let selectionFrame = 0;
  function scheduleSelectionToolbar(delay = 0) {
    cancelAnimationFrame(selectionFrame);
    if (delay) {
      window.setTimeout(() => {
        selectionFrame = requestAnimationFrame(refreshSelectionToolbar);
      }, delay);
      return;
    }
    selectionFrame = requestAnimationFrame(refreshSelectionToolbar);
  }

  document.addEventListener("selectionchange", () => scheduleSelectionToolbar());

  // Telegram's Android/iOS WebViews may finish updating the range only after
  // pointerup/touchend. Re-check it after those events so our toolbar is not
  // lost behind the operating-system copy/paste callout.
  ["pointerup", "touchend", "keyup"].forEach(type => {
    document.addEventListener(type, event => {
      if (!event.target.closest?.(".rich-inline-editor")) return;
      scheduleSelectionToolbar();
      scheduleSelectionToolbar(80);
    }, true);
  });

  document.addEventListener("contextmenu", event => {
    const editor = event.target.closest?.(".rich-inline-editor");
    if (!editor) return;
    event.preventDefault();
    event.stopPropagation();
    activeEditor = editor;
    scheduleSelectionToolbar();
    scheduleSelectionToolbar(80);
  }, true);

  document.addEventListener("pointerdown", event => {
    const editor = event.target.closest?.(".rich-inline-editor");
    if (editor) activeEditor = editor;
    if (selectionToolbar?.contains(event.target) || floatingMenu?.contains(event.target)) return;
    if (!editor && !event.target.closest?.(".inline-rich-button-token")) hideSelectionToolbar();
    if (floatingMenu && !floatingMenu.contains(event.target)) closeFloatingMenu();
  }, true);

  function caretRangeAtEnd(editor) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    return range;
  }

  function insertTokenAtRange(editor, range, info) {
    const token = makeToken(markerFor(info));
    range.deleteContents();
    range.insertNode(token);
    const spacer = document.createTextNode("\u200B");
    token.after(spacer);
    const caret = document.createRange();
    caret.setStartAfter(spacer);
    caret.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(caret);
    syncEditor(editor);
    markDirty();
    pushHistory();
    hideSelectionToolbar();
    return token;
  }

  function ensureEditorForInlineButton(callback) {
    if (activeEditor?.isConnected && activeEditor.isContentEditable) {
      callback(activeEditor);
      return;
    }
    addBlock("paragraph");
    requestAnimationFrame(() => {
      const editor = blocksEl.querySelector(`.block[data-id="${selectedBlockId}"] .rich-inline-editor`);
      if (editor) {
        activeEditor = editor;
        callback(editor);
      }
    });
  }

  function createInlineButton(type, title = "زر", fromSelection = false) {
    if (!BUTTON_TYPES[type]) return null;
    let created = null;
    ensureEditorForInlineButton(editor => {
      let range = fromSelection && savedRange ? savedRange.cloneRange() : null;
      if (!range || !editor.contains(range.commonAncestorContainer)) range = caretRangeAtEnd(editor);
      created = insertTokenAtRange(editor, range, {title:cleanTitle(title),type,value:"",color:null});
    });
    return created;
  }

  function simpleMenu(title = "") {
    closeFloatingMenu();
    const menu = document.createElement("aside");
    menu.className = "popup-menu inline-text-pop";
    if (title) {
      const head = document.createElement("strong");
      head.className = "inline-text-pop-title";
      head.textContent = title;
      menu.appendChild(head);
    }
    const list = document.createElement("div");
    list.className = "menu-list";
    menu.appendChild(list);
    document.body.appendChild(menu);
    floatingMenu = menu;
    return {menu,list};
  }

  function openButtonTypeMenuFromSelection() {
    if (!savedRange || !activeEditor) return;
    const selectedTitle = cleanTitle(window.getSelection()?.toString() || savedRange.toString() || "زر");
    const rect = savedRange.getBoundingClientRect();
    const {menu,list} = simpleMenu("حوّل النص إلى زر");
    BUTTON_ORDER.forEach(type => {
      const meta = BUTTON_TYPES[type];
      list.appendChild(menuButton(meta.icon, meta.label, "", () => {
        menu.remove();
        floatingMenu = null;
        createInlineButton(type, selectedTitle, true);
      }));
    });
    placeNearRect(menu, rect, false);
  }

  function tokenEditor(token) {
    return token.closest?.(".rich-inline-editor");
  }

  function updateToken(token, next) {
    const currentInfo = parseMarker(token.dataset.marker);
    if (!currentInfo) return;
    const info = {...currentInfo,...next};
    const marker = markerFor(info);
    token.dataset.marker = marker;
    token.dataset.buttonType = info.type;
    token.textContent = cleanTitle(info.title);
    token.className = `inline-rich-button-token ${tokenClass(info)}`;
    token.dataset.inlineRichButton = "1";
    const editor = tokenEditor(token);
    syncEditor(editor);
    markDirty();
    pushHistory();
  }

  function openValueEditor(token, title, placeholder = "") {
    const info = parseMarker(token.dataset.marker);
    if (!info) return;
    const rect = token.getBoundingClientRect();
    const {menu} = simpleMenu(title);
    menu.classList.add("inline-value-editor");
    const input = document.createElement(info.type === "popup" ? "textarea" : "input");
    input.className = "rich-button-editor-input";
    input.value = info.value || "";
    input.placeholder = placeholder;
    if (info.type === "url") input.type = "url";
    const actions = document.createElement("div");
    actions.className = "rich-button-editor-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "إلغاء";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-soft";
    save.textContent = "حفظ";
    cancel.onclick = () => closeFloatingMenu();
    save.onclick = () => {updateToken(token,{value:String(input.value || "").trim()});closeFloatingMenu();};
    actions.append(cancel,save);
    menu.append(input,actions);
    placeNearRect(menu, rect, false);
    requestAnimationFrame(() => input.focus());
  }

  function openTitleEditor(token) {
    const info = parseMarker(token.dataset.marker);
    if (!info) return;
    const rect = token.getBoundingClientRect();
    const {menu} = simpleMenu("اسم الزر");
    menu.classList.add("inline-value-editor");
    const input = document.createElement("input");
    input.className = "rich-button-editor-input";
    input.value = info.title;
    const actions = document.createElement("div");
    actions.className = "rich-button-editor-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-soft";
    save.textContent = "حفظ";
    save.onclick = () => {updateToken(token,{title:cleanTitle(input.value)});closeFloatingMenu();};
    actions.append(save);
    menu.append(input,actions);
    placeNearRect(menu, rect, false);
    requestAnimationFrame(() => {input.focus();input.select();});
  }

  async function choosePageForToken(token) {
    const info = parseMarker(token.dataset.marker);
    if (!info) return;
    let data;
    try { data = await api("/miniapp/api/pages"); }
    catch (error) { toast(`تعذر تحميل الصفحات: ${error.message}`); return; }
    const pages = Array.isArray(data.pages) ? data.pages : [];
    if (!pages.length) { toast("ما عندك صفحات محفوظة للربط"); return; }
    const rect = token.getBoundingClientRect();
    const {menu,list} = simpleMenu("اختر الصفحة المرتبطة");
    pages.forEach(page => {
      list.appendChild(menuButton("📄", page.title || page.page_id, page.page_id, () => {
        const value = info.type === "callback_data" ? `r:cbd:${page.page_id}` : page.page_id;
        updateToken(token,{value});
        closeFloatingMenu();
        toast(`تم ربط الزر بصفحة «${page.title || page.page_id}»`);
      }));
    });
    placeNearRect(menu, rect, false);
  }

  async function requestUserForToken(token) {
    const info = parseMarker(token.dataset.marker);
    const editor = tokenEditor(token);
    const block = blockForEditor(editor);
    if (!info || !editor || !block) return;
    try {
      updateToken(token,{value:""});
      await flushSave();
      if (!current?.page_id) throw new Error("تعذر حفظ الصفحة");
      const marker = token.dataset.marker;
      window.RichMiniAppResume?.remember?.(current.page_id);
      await api("/miniapp/api/rich-buttons/user-picker", {
        method:"POST",
        body:JSON.stringify({page_id:current.page_id,block_id:block.id,marker}),
      });
      toast("اختَر المستخدم من محادثة البوت");
      setTimeout(() => {try { tg?.close?.(); } catch (_) {}}, 650);
    } catch (error) {
      toast(`تعذر فتح اختيار المستخدم: ${error.message}`);
    }
  }

  function openColorMenuForToken(token) {
    const info = parseMarker(token.dataset.marker);
    if (!info) return;
    const rect = token.getBoundingClientRect();
    const {menu,list} = simpleMenu("لون الزر");
    [["○","افتراضي",null],["●","أزرق","b"],["●","أخضر","g"],["●","أحمر","r"]].forEach(([icon,label,color]) => {
      list.appendChild(menuButton(icon,label,"",() => {updateToken(token,{color});closeFloatingMenu();}));
    });
    placeNearRect(menu, rect, false);
  }

  function openTokenMenu(token) {
    const info = parseMarker(token.dataset.marker);
    if (!info) return;
    hideSelectionToolbar();
    const rect = token.getBoundingClientRect();
    const {menu,list} = simpleMenu(`${BUTTON_TYPES[info.type]?.icon || "▣"} زر غني`);
    list.appendChild(menuButton("✎","تعديل اسم الزر","",() => {closeFloatingMenu();openTitleEditor(token);}));
    if (info.type === "user") {
      list.appendChild(menuButton("👤","تحديد مستخدم",info.value || "",() => {closeFloatingMenu();requestUserForToken(token);}));
    } else if (info.type === "callback_data" || info.type === "page_callback") {
      list.appendChild(menuButton("📚","ربط بصفحة محفوظة",info.value || "",() => {closeFloatingMenu();choosePageForToken(token);}));
    } else if (BUTTON_TYPES[info.type]?.action) {
      const placeholder = {
        url:"https://example.com",copy:"النص المطلوب نسخه",popup:"نص التنبيه",
        switch_inline_query:"كلمة البحث",switch_inline_query_current_chat:"كلمة البحث هنا",
      }[info.type] || "القيمة";
      list.appendChild(menuButton(BUTTON_TYPES[info.type].icon,BUTTON_TYPES[info.type].action,info.value || "",() => {
        closeFloatingMenu();openValueEditor(token,BUTTON_TYPES[info.type].action,placeholder);
      }));
    }
    list.appendChild(menuButton("◉","تغيير اللون","",() => {closeFloatingMenu();openColorMenuForToken(token);}));
    list.appendChild(separator());
    list.appendChild(menuButton("T","تحويل إلى نص عادي","",() => {
      const text = document.createTextNode(info.title);
      const editor = tokenEditor(token);
      token.replaceWith(text);
      syncEditor(editor);markDirty();pushHistory();closeFloatingMenu();
    }));
    list.appendChild(menuButton("⌫","حذف الزر","",() => {
      const editor = tokenEditor(token);
      token.remove();syncEditor(editor);markDirty();pushHistory();closeFloatingMenu();
    },"danger"));
    placeNearRect(menu, rect, false);
  }

  let tokenPress = null;
  document.addEventListener("pointerdown", event => {
    const token = event.target.closest?.(".inline-rich-button-token");
    if (!token) return;
    const state = {token,id:event.pointerId,x:event.clientX,y:event.clientY,timer:null};
    state.timer = setTimeout(() => {
      if (tokenPress !== state) return;
      tokenPress = null;
      window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.("medium");
      openTokenMenu(token);
    }, 460);
    tokenPress = state;
  }, true);
  document.addEventListener("pointermove", event => {
    if (!tokenPress || event.pointerId !== tokenPress.id) return;
    if (Math.hypot(event.clientX-tokenPress.x,event.clientY-tokenPress.y) > 10) {
      clearTimeout(tokenPress.timer);tokenPress=null;
    }
  }, true);
  const cancelTokenPress = event => {
    if (!tokenPress || (event.pointerId !== undefined && event.pointerId !== tokenPress.id)) return;
    clearTimeout(tokenPress.timer);tokenPress=null;
  };
  document.addEventListener("pointerup", cancelTokenPress, true);
  document.addEventListener("pointercancel", cancelTokenPress, true);
  document.addEventListener("contextmenu", event => {
    const token = event.target.closest?.(".inline-rich-button-token");
    if (!token) return;
    event.preventDefault();
    openTokenMenu(token);
  });

  document.addEventListener("click", event => {
    const spoiler = event.target.closest?.("tg-spoiler.inline-spoiler");
    if (spoiler) spoiler.classList.toggle("revealed");
  });

  if (window.RichButtonEditor) {
    window.RichButtonEditor.create = type => createInlineButton(type, BUTTON_TYPES[type]?.label || "زر", false);
    window.RichButtonEditor.types = BUTTON_TYPES;
  }

  window.InlineTextTools = {
    createButton:createInlineButton,
    openTokenMenu,
    syncEditor,
    hydrateAll:hydrateAllNested,
  };
})();
