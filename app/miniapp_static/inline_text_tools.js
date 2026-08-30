// Beta 0.3.13 — inline Rich Buttons + selection formatting inside normal text blocks.
(() => {
  const tr = (key, fallback, vars) => window.MiniAppI18n?.t?.(key, vars) || fallback;
  const INLINE_TEXT_TYPES = new Set([
    "paragraph", "text", "caption", "heading", "footer", "blockquote", "pullquote",
  ]);
  const BUTTON_TYPES = {
    user:{label:tr("button.mention", "Mention"),icon:"user",action:tr("button.select_user", "Select user")},
    url:{label:tr("button.url", "Link"),icon:"link",action:tr("button.edit_url", "Edit link")},
    callback_data:{label:tr("button.callback_data", "Callback data"),icon:"callback",action:tr("button.link_page", "Link a saved page")},
    page_callback:{label:`CBD / ${tr("button.page", "Page")}`,icon:"page",action:tr("button.link_page", "Link a saved page")},
    copy:{label:tr("button.copy", "Copy"),icon:"copy",action:tr("button.edit_copy", "Edit copied text")},
    popup:{label:tr("button.popup", "Popup"),icon:"popup",action:tr("button.edit_popup", "Edit popup text")},
    switch_inline_query:{label:tr("button.inline_search", "Inline search"),icon:"search",action:tr("button.edit_search", "Edit search text")},
    switch_inline_query_current_chat:{label:tr("button.search_here", "Search here"),icon:"search_here",action:tr("button.edit_search_here", "Edit search-here text")},
    disabled:{label:tr("button.disabled", "Disabled"),icon:"disabled",action:null},
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
    return String(value || tr("button.generic", "Button")).replace(/[{}\n]/g, " ").trim().slice(0, 64) || tr("button.generic", "Button");
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
    token.setAttribute("aria-label", `${info.title} · ${BUTTON_TYPES[info.type]?.label || tr("button.generic", "Button")}`);
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
    editor.dataset.placeholder ||= block.type === "paragraph" ? tr("editor.write_text", "Write text…") : info(block.type).label;
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
        const sel = window.getSelection();
        if (!sel?.rangeCount) return;
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const br = document.createElement("br");
        range.insertNode(br);
        range.setStartAfter(br);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        syncEditor(editor, block);
        markDirty();
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

  const FORMAT_SPECS = {
    bold:{tag:"strong",selectors:"b,strong"},
    italic:{tag:"em",selectors:"i,em"},
    strike:{tag:"s",selectors:"s,strike,del"},
    underline:{tag:"u",selectors:"u,ins"},
    code:{tag:"code",selectors:"code"},
    highlight:{tag:"mark",selectors:"mark"},
    subscript:{tag:"sub",selectors:"sub"},
    superscript:{tag:"sup",selectors:"sup"},
    spoiler:{tag:"tg-spoiler",selectors:"tg-spoiler",className:"inline-spoiler"},
  };

  function closestMatching(node, selectors) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const match = element?.closest?.(selectors);
    return match && activeEditor?.contains(match) ? match : null;
  }

  function selectedTextNodes(range) {
    if (!activeEditor) return [];
    const walker = document.createTreeWalker(activeEditor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.nodeValue || !node.nodeValue.trim()) continue;
      try { if (range.intersectsNode(node)) nodes.push(node); } catch (_) {}
    }
    return nodes;
  }

  function rangeHasFormat(range, selectors) {
    const nodes = selectedTextNodes(range);
    return nodes.length > 0 && nodes.every(node => Boolean(closestMatching(node, selectors)));
  }

  function sharedFormatElement(range, selectors) {
    const elements = selectedTextNodes(range).map(node => closestMatching(node, selectors));
    if (!elements.length || !elements[0]) return null;
    return elements.every(element => element === elements[0]) ? elements[0] : null;
  }

  function unwrapDescendants(root, selectors) {
    Array.from(root.querySelectorAll?.(selectors) || []).reverse().forEach(element => {
      element.replaceWith(...Array.from(element.childNodes));
    });
  }

  function splitParentAround(node) {
    const parent = node?.parentElement;
    if (!parent || parent === activeEditor) return false;
    const before = parent.cloneNode(false);
    const after = parent.cloneNode(false);
    while (parent.firstChild && parent.firstChild !== node) before.appendChild(parent.firstChild);
    while (node.nextSibling) after.appendChild(node.nextSibling);
    if (before.childNodes.length) parent.before(before);
    parent.before(node);
    if (after.childNodes.length) node.after(after);
    parent.remove();
    return true;
  }

  function removeAncestorFormat(marker, selectors) {
    let ancestor = closestMatching(marker.parentElement, selectors);
    while (ancestor) {
      while (marker.parentElement && marker.parentElement !== ancestor) {
        if (!splitParentAround(marker)) break;
      }
      if (marker.parentElement === ancestor) splitParentAround(marker);
      ancestor = closestMatching(marker.parentElement, selectors);
    }
  }

  function replaceSelectedInline(spec, mode = "toggle", attributes = {}) {
    if (!restoreSelection()) return false;
    const sel = window.getSelection();
    if (!sel?.rangeCount || sel.isCollapsed) return false;
    const range = sel.getRangeAt(0);
    const remove = mode === "remove" || (mode === "toggle" && rangeHasFormat(range, spec.selectors));
    const marker = document.createElement("span");
    marker.dataset.inlineSelectionMarker = "1";
    try {
      marker.appendChild(range.extractContents());
      range.insertNode(marker);
      unwrapDescendants(marker, spec.selectors);
      removeAncestorFormat(marker, spec.selectors);
      if (!remove) {
        const wrapper = document.createElement(spec.tag);
        if (spec.className) wrapper.className = spec.className;
        Object.entries(attributes).forEach(([name,value]) => wrapper.setAttribute(name, String(value)));
        wrapper.append(...Array.from(marker.childNodes));
        marker.appendChild(wrapper);
      }
      const children = Array.from(marker.childNodes);
      if (!children.length) { marker.remove(); return false; }
      marker.replaceWith(...children);
      const next = document.createRange();
      if (!remove && children.length === 1 && children[0].nodeType === Node.ELEMENT_NODE) {
        next.selectNodeContents(children[0]);
      } else {
        next.setStartBefore(children[0]);
        next.setEndAfter(children[children.length - 1]);
      }
      sel.removeAllRanges();
      sel.addRange(next);
      savedRange = next.cloneRange();
      syncActiveAndDirty();
      requestAnimationFrame(refreshSelectionToolbar);
      return true;
    } catch (_) {
      marker.replaceWith(...Array.from(marker.childNodes));
      return false;
    }
  }

  function applyFormat(name) {
    const spec = FORMAT_SPECS[name];
    if (spec) replaceSelectedInline(spec);
  }

  function applySpoiler() {
    applyFormat("spoiler");
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
    const existingLink = sharedFormatElement(savedRange, "a[href]");
    const {menu} = simpleMenu(existingLink
      ? tr("inline.edit_link", "تعديل الرابط")
      : tr("inline.add_link", "إضافة رابط داخل النص"));
    menu.classList.add("inline-value-editor");
    const input = document.createElement("input");
    input.className = "rich-button-editor-input";
    input.type = "url";
    input.dir = "ltr";
    input.inputMode = "url";
    input.placeholder = "https://example.com";
    input.value = existingLink?.getAttribute("href") || "";
    const actions = document.createElement("div");
    actions.className = "rich-button-editor-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = tr("common.cancel", "إلغاء");
    let remove = null;
    if (existingLink) {
      remove = document.createElement("button");
      remove.type = "button";
      remove.className = "danger";
      remove.textContent = tr("inline.remove_link", "إزالة الرابط");
      remove.onclick = () => {
        closeFloatingMenu();
        replaceSelectedInline({tag:"a",selectors:"a[href]"}, "remove");
      };
    }
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-soft";
    save.textContent = existingLink
      ? tr("common.save", "حفظ")
      : tr("inline.add_link", "إضافة الرابط");
    cancel.onclick = () => closeFloatingMenu();
    save.onclick = () => {
      const href = normalizeLink(input.value);
      if (!href) {
        toast(tr("inline.invalid_link", "أدخل رابطًا صحيحًا يبدأ بـ https:// أو tg://"));
        input.focus();
        return;
      }
      closeFloatingMenu();
      if (!restoreSelection()) return;
      replaceSelectedInline({tag:"a",selectors:"a[href]"}, "apply", {href});
      hideSelectionToolbar();
    };
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        save.click();
      }
    });
    actions.append(cancel);
    if (remove) actions.append(remove);
    actions.append(save);
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
      ["bold",tr("inline.bold", "Bold"),() => applyFormat("bold"),"bold"],
      ["italic",tr("inline.italic", "Italic"),() => applyFormat("italic"),"italic"],
      ["strike",tr("inline.strike", "Strikethrough"),() => applyFormat("strike"),"strike"],
      ["underline",tr("inline.underline", "Underline"),() => applyFormat("underline"),"underline"],
      ["code",tr("inline.code", "Code"),() => applyFormat("code"),"code"],
      ["highlight",tr("inline.highlight", "Highlight"),() => applyFormat("highlight"),"highlight"],
      ["subscript",tr("inline.subscript", "Subscript"),() => applyFormat("subscript"),"subscript"],
      ["superscript",tr("inline.superscript", "Superscript"),() => applyFormat("superscript"),"superscript"],
      ["spoiler",tr("inline.spoiler", "Spoiler"),applySpoiler,"spoiler"],
      ["link",tr("inline.link", "Link"),openLinkEditorFromSelection,"link"],
      ["button",tr("inline.create_button", "Create button"),openButtonTypeMenuFromSelection,"button"],
    ];
    specs.forEach(([icon,label,handler,format]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "selection-format-btn";
      btn.dataset.format = format;
      btn.title = label;
      btn.setAttribute("aria-label", label);
      const iconEl=document.createElement("span");MiniAppIcons.mount(iconEl,icon);const labelEl=document.createElement("small");labelEl.textContent=label;btn.append(iconEl,labelEl);
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
    Object.entries(FORMAT_SPECS).forEach(([name,spec]) => {
      const button = bar.querySelector(`[data-format="${name}"]`);
      if (!button) return;
      const active = rangeHasFormat(range, spec.selectors);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    const linkButton = bar.querySelector('[data-format="link"]');
    if (linkButton) {
      const active = rangeHasFormat(range, "a[href]");
      linkButton.classList.toggle("active", active);
      linkButton.setAttribute("aria-pressed", active ? "true" : "false");
    }
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

  function createInlineButton(type, title = tr("button.generic", "Button"), fromSelection = false) {
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
    const selectedTitle = cleanTitle(window.getSelection()?.toString() || savedRange.toString() || tr("button.generic", "Button"));
    if (window.RichButtonDialog?.open) {
      window.RichButtonDialog.open({title:selectedTitle,fromSelection:true,presetType:"url"});
      return;
    }
    const rect = savedRange.getBoundingClientRect();
    const {menu,list} = simpleMenu(tr("button.convert_selection", "حوّل النص إلى زر"));
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
    cancel.textContent = tr("common.cancel", "إلغاء");
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-soft";
    save.textContent = tr("common.save", "حفظ");
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
    const {menu} = simpleMenu(tr("button.name", "اسم الزر"));
    menu.classList.add("inline-value-editor");
    const input = document.createElement("input");
    input.className = "rich-button-editor-input";
    input.value = info.title;
    const actions = document.createElement("div");
    actions.className = "rich-button-editor-actions";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-soft";
    save.textContent = tr("common.save", "حفظ");
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
    catch (error) { toast(tr("button.pages_failed", `تعذر تحميل الصفحات: ${error.message}`, {error:error.message})); return; }
    const pages = Array.isArray(data.pages) ? data.pages : [];
    if (!pages.length) { toast(tr("button.no_pages", "ما عندك صفحات محفوظة للربط")); return; }
    const rect = token.getBoundingClientRect();
    const {menu,list} = simpleMenu(tr("button.choose_page", "اختر الصفحة المرتبطة"));
    pages.forEach(page => {
      list.appendChild(menuButton("page", page.title || page.page_id, page.page_id, () => {
        const value = info.type === "callback_data" ? `r:cbd:${page.page_id}` : page.page_id;
        updateToken(token,{value});
        closeFloatingMenu();
        toast(tr("button.linked_success", `Linked to “${page.title || page.page_id}”`, {title:page.title || page.page_id}));
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
      if (!current?.page_id) throw new Error(tr("button.save_page_failed", "Could not save the page"));
      const marker = token.dataset.marker;
      window.RichMiniAppResume?.remember?.(current.page_id);
      await api("/miniapp/api/rich-buttons/user-picker", {
        method:"POST",
        body:JSON.stringify({page_id:current.page_id,block_id:block.id,marker}),
      });
      toast(tr("button.pick_user_in_chat", "Choose the user in the bot chat"));
      setTimeout(() => {try { tg?.close?.(); } catch (_) {}}, 650);
    } catch (error) {
      toast(tr("button.user_picker_failed", `Could not open user picker: ${error.message}`, {error:error.message}));
    }
  }

  function openColorMenuForToken(token) {
    const info = parseMarker(token.dataset.marker);
    if (!info) return;
    const rect = token.getBoundingClientRect();
    const {menu,list} = simpleMenu(tr("button.color", "لون الزر"));
    [[tr("button.default", "Default"),null],[tr("button.blue", "Blue"),"b"],[tr("button.green", "Green"),"g"],[tr("button.red", "Red"),"r"]].forEach(([label,color]) => {
      list.appendChild(menuButton("color",label,"",() => {updateToken(token,{color});closeFloatingMenu();}));
    });
    placeNearRect(menu, rect, false);
  }

  function openTokenMenu(token) {
    const info = parseMarker(token.dataset.marker);
    if (!info) return;
    hideSelectionToolbar();
    const rect = token.getBoundingClientRect();
    const {menu,list} = simpleMenu(tr("button.rich", "Rich button"));
    list.appendChild(menuButton("edit",tr("button.edit_name", "Edit button name"),"",() => {closeFloatingMenu();openTitleEditor(token);}));
    if (info.type === "user") {
      list.appendChild(menuButton("user",tr("button.select_user", "Select user"),info.value || "",() => {closeFloatingMenu();requestUserForToken(token);}));
    } else if (info.type === "callback_data" || info.type === "page_callback") {
      list.appendChild(menuButton("page",tr("button.link_page", "Link a saved page"),info.value || "",() => {closeFloatingMenu();choosePageForToken(token);}));
    } else if (BUTTON_TYPES[info.type]?.action) {
      const placeholder = {
        url:"https://example.com",copy:tr("button.copy_placeholder", "Text to copy"),popup:tr("button.popup_placeholder", "Popup text"),
        switch_inline_query:tr("button.search_placeholder", "Search text"),switch_inline_query_current_chat:tr("button.search_here_placeholder", "Search-here text"),
      }[info.type] || tr("button.value_placeholder", "Value");
      list.appendChild(menuButton(BUTTON_TYPES[info.type].icon,BUTTON_TYPES[info.type].action,info.value || "",() => {
        closeFloatingMenu();openValueEditor(token,BUTTON_TYPES[info.type].action,placeholder);
      }));
    }
    list.appendChild(menuButton("color",tr("button.change_color", "Change color"),"",() => {closeFloatingMenu();openColorMenuForToken(token);}));
    list.appendChild(separator());
    list.appendChild(menuButton("paragraph",tr("button.to_text", "Convert to plain text"),"",() => {
      const text = document.createTextNode(info.title);
      const editor = tokenEditor(token);
      token.replaceWith(text);
      syncEditor(editor);markDirty();pushHistory();closeFloatingMenu();
    }));
    list.appendChild(menuButton("delete",tr("button.delete", "Delete button"),"",() => {
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
    window.RichButtonEditor.create = type => createInlineButton(type, BUTTON_TYPES[type]?.label || tr("button.generic", "Button"), false);
    window.RichButtonEditor.types = BUTTON_TYPES;
  }

  window.InlineTextTools = {
    createButton:createInlineButton,
    openTokenMenu,
    syncEditor,
    hydrateAll:hydrateAllNested,
  };
})();
