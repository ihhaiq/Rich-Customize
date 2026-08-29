// Beta 0.3.20 — render Unicode emoji as Apple artwork inside rich text editors only.
// The persisted value stays Unicode. Visual <img> nodes are converted back to
// Unicode whenever the editor is cloned by the existing serializer.
(() => {
  const EDITOR_SELECTOR = ".rich-inline-editor";
  const INLINE_SELECTOR = "img.apple-inline-emoji[data-emoji]";
  const DATA_URLS = [
    "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/emoji.json",
    "https://cdnjs.cloudflare.com/ajax/libs/emoji-datasource-apple/16.0.0/emoji.json",
  ];
  const IMAGE_BASES = [
    "https://cdn.jsdelivr.net/npm/emoji-datasource-apple@16.0.0/img/apple/64/",
    "https://cdnjs.cloudflare.com/ajax/libs/emoji-datasource-apple/16.0.0/img/apple/64/",
    "https://unpkg.com/emoji-datasource-apple@16.0.0/img/apple/64/",
  ];

  let emojiMap = null;
  let emojiKeys = [];
  let catalogPromise = null;
  let allFrame = 0;
  const editorFrames = new WeakMap();
  const failedTextNodes = new WeakSet();
  const segmenter = typeof Intl?.Segmenter === "function"
    ? new Intl.Segmenter(undefined, {granularity:"grapheme"})
    : null;

  function unicodeFromUnified(unified) {
    try {
      return String.fromCodePoint(
        ...String(unified || "").split("-").filter(Boolean).map(part => parseInt(part, 16)),
      );
    } catch (_) {
      return "";
    }
  }

  function registerEmoji(map, record, fallbackName = "") {
    if (!record || !record.unified || !record.image) return;
    const emoji = unicodeFromUnified(record.unified);
    if (!emoji) return;
    const item = {
      emoji,
      image:String(record.image).toLowerCase(),
      name:String(record.name || fallbackName || emoji),
    };
    map.set(emoji, item);

    const nonQualified = unicodeFromUnified(record.non_qualified);
    if (nonQualified && !map.has(nonQualified)) map.set(nonQualified, {...item, emoji:nonQualified});

    if (emoji.includes("\uFE0F")) {
      const withoutVs = emoji.replaceAll("\uFE0F", "");
      if (withoutVs && !map.has(withoutVs)) map.set(withoutVs, {...item, emoji:withoutVs});
    }
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
    throw lastError || new Error("Apple emoji catalog unavailable");
  }

  async function loadCatalog() {
    if (emojiMap) return emojiMap;
    if (catalogPromise) return catalogPromise;
    catalogPromise = fetchCatalogData().then(data => {
      const map = new Map();
      for (const raw of Array.isArray(data) ? data : []) {
        if (!raw || !raw.has_img_apple) continue;
        registerEmoji(map, raw, raw.name || raw.short_name || "");
        const variations = raw.skin_variations;
        if (variations && typeof variations === "object") {
          Object.values(variations).forEach(variation => registerEmoji(
            map,
            variation,
            raw.name || raw.short_name || "",
          ));
        }
      }
      emojiMap = map;
      emojiKeys = Array.from(map.keys()).sort((a, b) => b.length - a.length);
      return map;
    }).catch(error => {
      catalogPromise = null;
      throw error;
    });
    return catalogPromise;
  }

  function imageUrl(image, sourceIndex = 0) {
    const index = Math.max(0, Math.min(sourceIndex, IMAGE_BASES.length - 1));
    return `${IMAGE_BASES[index]}${String(image || "").toLowerCase()}`;
  }

  function makeInlineImage(item, displayedEmoji = item.emoji) {
    const img = document.createElement("img");
    img.className = "apple-inline-emoji";
    img.dataset.emoji = displayedEmoji;
    img.dataset.appleImage = item.image;
    img.alt = displayedEmoji;
    img.setAttribute("aria-label", displayedEmoji);
    img.contentEditable = "false";
    img.draggable = false;
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.style.visibility = "hidden";

    let sourceIndex = 0;
    const trySource = () => {
      img.src = imageUrl(item.image, sourceIndex);
    };
    img.addEventListener("load", () => {
      img.style.visibility = "visible";
    });
    img.addEventListener("error", () => {
      sourceIndex += 1;
      if (sourceIndex < IMAGE_BASES.length) {
        trySource();
        return;
      }
      const fallback = document.createTextNode(displayedEmoji);
      failedTextNodes.add(fallback);
      img.replaceWith(fallback);
    });
    trySource();
    return img;
  }

  function lookupEmoji(segment) {
    if (!emojiMap || !segment) return null;
    return emojiMap.get(segment)
      || emojiMap.get(segment.replaceAll("\uFE0F", ""))
      || null;
  }

  function tokeniseWithSegmenter(text) {
    const parts = [];
    let plainStart = 0;
    for (const part of segmenter.segment(text)) {
      const value = part.segment;
      const item = lookupEmoji(value);
      if (!item) continue;
      const start = part.index;
      const end = start + value.length;
      if (start > plainStart) parts.push({kind:"text", value:text.slice(plainStart, start)});
      parts.push({kind:"emoji", value, item});
      plainStart = end;
    }
    if (!parts.length) return null;
    if (plainStart < text.length) parts.push({kind:"text", value:text.slice(plainStart)});
    return parts;
  }

  function tokeniseFallback(text) {
    const parts = [];
    let plainStart = 0;
    let index = 0;
    while (index < text.length) {
      let key = null;
      for (const candidate of emojiKeys) {
        if (candidate && text.startsWith(candidate, index)) {
          key = candidate;
          break;
        }
      }
      if (!key) {
        const cp = text.codePointAt(index);
        index += cp > 0xFFFF ? 2 : 1;
        continue;
      }
      if (index > plainStart) parts.push({kind:"text", value:text.slice(plainStart, index)});
      parts.push({kind:"emoji", value:key, item:emojiMap.get(key)});
      index += key.length;
      plainStart = index;
    }
    if (!parts.length) return null;
    if (plainStart < text.length) parts.push({kind:"text", value:text.slice(plainStart)});
    return parts;
  }

  function tokenise(text) {
    if (!emojiMap || !text) return null;
    return segmenter ? tokeniseWithSegmenter(text) : tokeniseFallback(text);
  }

  function logicalLength(node) {
    if (!node) return 0;
    if (node.nodeType === Node.TEXT_NODE) return (node.nodeValue || "").length;
    if (node.nodeType !== Node.ELEMENT_NODE) return 0;
    if (node.matches?.(INLINE_SELECTOR)) return String(node.dataset.emoji || node.alt || "").length;
    if (node.tagName === "BR") return 1;
    let total = 0;
    node.childNodes.forEach(child => { total += logicalLength(child); });
    return total;
  }

  function logicalOffset(editor, container, offset) {
    let total = 0;
    let found = false;

    const walk = node => {
      if (found || !node) return;
      if (node === container) {
        if (node.nodeType === Node.TEXT_NODE) {
          total += Math.max(0, Math.min(Number(offset) || 0, (node.nodeValue || "").length));
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const limit = Math.max(0, Math.min(Number(offset) || 0, node.childNodes.length));
          for (let i = 0; i < limit; i += 1) total += logicalLength(node.childNodes[i]);
        }
        found = true;
        return;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        total += (node.nodeValue || "").length;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches?.(INLINE_SELECTOR)) {
        total += String(node.dataset.emoji || node.alt || "").length;
        return;
      }
      if (node.tagName === "BR") {
        total += 1;
        return;
      }
      for (const child of node.childNodes) {
        walk(child);
        if (found) break;
      }
    };

    walk(editor);
    return total;
  }

  function selectionSnapshot(editor) {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null;
    return {
      start:logicalOffset(editor, range.startContainer, range.startOffset),
      end:logicalOffset(editor, range.endContainer, range.endOffset),
    };
  }

  function pointForOffset(editor, wanted) {
    let remaining = Math.max(0, Number(wanted) || 0);
    let result = null;

    const walk = node => {
      if (result || !node) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const length = (node.nodeValue || "").length;
        if (remaining <= length) {
          result = {node, offset:remaining};
          return;
        }
        remaining -= length;
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.matches?.(INLINE_SELECTOR)) {
        const length = String(node.dataset.emoji || node.alt || "").length;
        const parent = node.parentNode;
        const index = parent ? Array.prototype.indexOf.call(parent.childNodes, node) : -1;
        if (remaining <= length) {
          result = {node:parent || editor, offset:index < 0 ? 0 : index + (remaining > 0 ? 1 : 0)};
          return;
        }
        remaining -= length;
        return;
      }
      if (node.tagName === "BR") {
        const parent = node.parentNode;
        const index = parent ? Array.prototype.indexOf.call(parent.childNodes, node) : -1;
        if (remaining <= 1) {
          result = {node:parent || editor, offset:index < 0 ? 0 : index + (remaining > 0 ? 1 : 0)};
          return;
        }
        remaining -= 1;
        return;
      }
      for (const child of node.childNodes) {
        walk(child);
        if (result) break;
      }
    };

    walk(editor);
    return result || {node:editor, offset:editor.childNodes.length};
  }

  function restoreSelection(editor, snapshot) {
    if (!snapshot || !editor.isConnected) return;
    try {
      const start = pointForOffset(editor, snapshot.start);
      const end = pointForOffset(editor, snapshot.end);
      const range = document.createRange();
      range.setStart(start.node, start.offset);
      range.setEnd(end.node, end.offset);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    } catch (_) {}
  }

  function shouldSkipTextNode(node) {
    if (!node?.parentElement || failedTextNodes.has(node)) return true;
    return Boolean(node.parentElement.closest(
      ".inline-rich-button-token,.apple-inline-emoji,script,style,textarea,input",
    ));
  }

  function decorateEditor(editor) {
    if (!emojiMap || !editor?.isConnected || !editor.matches?.(EDITOR_SELECTOR)) return;
    const snapshot = selectionSnapshot(editor);
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!shouldSkipTextNode(node) && tokenise(node.nodeValue || "")) nodes.push(node);
    }

    if (!nodes.length) return;
    for (const node of nodes) {
      if (!node.isConnected) continue;
      const parts = tokenise(node.nodeValue || "");
      if (!parts) continue;
      const fragment = document.createDocumentFragment();
      parts.forEach(part => {
        if (part.kind === "emoji") fragment.appendChild(makeInlineImage(part.item, part.value));
        else fragment.appendChild(document.createTextNode(part.value));
      });
      node.replaceWith(fragment);
    }
    restoreSelection(editor, snapshot);
  }

  function scheduleEditor(editor) {
    if (!editor?.isConnected || editorFrames.has(editor)) return;
    const frame = requestAnimationFrame(async () => {
      editorFrames.delete(editor);
      try {
        await loadCatalog();
        decorateEditor(editor);
      } catch (_) {}
    });
    editorFrames.set(editor, frame);
  }

  function scheduleAll() {
    if (allFrame) return;
    allFrame = requestAnimationFrame(async () => {
      allFrame = 0;
      try {
        await loadCatalog();
        document.querySelectorAll(EDITOR_SELECTOR).forEach(decorateEditor);
      } catch (_) {}
    });
  }

  // Existing rich-text serialization clones the editor before reading HTML/text.
  // Keep the DOM visual, but make that clone contain Unicode again so saved HTML,
  // history, entities and Telegram output never contain our presentation images.
  if (!Node.prototype.__richAppleEmojiClonePatched) {
    const nativeCloneNode = Node.prototype.cloneNode;
    Object.defineProperty(Node.prototype, "__richAppleEmojiClonePatched", {
      value:true,
      configurable:true,
    });
    Node.prototype.cloneNode = function(deep) {
      const clone = nativeCloneNode.call(this, deep);
      try {
        if (
          deep
          && this.nodeType === Node.ELEMENT_NODE
          && this.matches?.(EDITOR_SELECTOR)
          && clone?.querySelectorAll
        ) {
          clone.querySelectorAll(INLINE_SELECTOR).forEach(img => {
            img.replaceWith(document.createTextNode(img.dataset.emoji || img.alt || ""));
          });
        }
      } catch (_) {}
      return clone;
    };
  }

  document.addEventListener("input", event => {
    const target = event.target;
    const editor = target?.matches?.(EDITOR_SELECTOR)
      ? target
      : target?.closest?.(EDITOR_SELECTOR);
    if (editor) scheduleEditor(editor);
  });

  document.addEventListener("focusin", event => {
    const target = event.target;
    const editor = target?.matches?.(EDITOR_SELECTOR)
      ? target
      : target?.closest?.(EDITOR_SELECTOR);
    if (editor) scheduleEditor(editor);
  });

  const blocks = document.getElementById("blocks");
  if (blocks && typeof MutationObserver === "function") {
    const observer = new MutationObserver(() => scheduleAll());
    observer.observe(blocks, {subtree:true, childList:true, characterData:true});
  }

  window.RichAppleInlineEmoji = Object.freeze({
    refresh:scheduleAll,
    decorate:editor => scheduleEditor(editor),
    load:loadCatalog,
  });

  loadCatalog().then(scheduleAll).catch(() => {});
})();
