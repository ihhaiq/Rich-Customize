// Draggable insertion point for the Mini App's rich-text editors.
(() => {
  const root = document.getElementById("blocks");
  if (!root) return;
  const EDITOR_SELECTOR = '[contenteditable="true"]';
  const LABELS = {
    ar:"تحريك مؤشر الكتابة", en:"Move text cursor", es:"Mover el cursor de texto",
    de:"Textcursor bewegen", it:"Sposta il cursore", pt:"Mover o cursor de texto",
    nl:"Tekstcursor verplaatsen", pl:"Przenieś kursor tekstu",
    uk:"Перемістити текстовий курсор", ru:"Переместить текстовый курсор",
    tr:"Metin imlecini taşı", ur:"متن کا کرسر منتقل کریں",
    hi:"टेक्स्ट कर्सर ले जाएँ", id:"Pindahkan kursor teks",
    ja:"テキストカーソルを移動", ko:"텍스트 커서 이동",
    vi:"Di chuyển con trỏ văn bản", th:"ย้ายเคอร์เซอร์ข้อความ",
    "zh-hans":"移动文本光标", "zh-hant":"移動文字游標",
  };
  const languageTag = String(window.MiniAppI18n?.language || document.documentElement.lang || "en")
    .toLowerCase().replace("_", "-");
  const language = languageTag.startsWith("zh")
    ? /(?:^|-)(hant|tw|hk|mo)(?:-|$)/.test(languageTag) ? "zh-hant" : "zh-hans"
    : languageTag.split("-", 1)[0];
  const handle = document.createElement("button");
  handle.type = "button";
  handle.className = "miniapp-caret-handle";
  handle.setAttribute("aria-label", LABELS[language] || "Move text cursor");
  handle.setAttribute("data-no-long-press", "");
  handle.tabIndex = -1;
  handle.innerHTML = '<span class="miniapp-caret-handle-stem"></span><span class="miniapp-caret-handle-drop"></span>';
  document.body.appendChild(handle);

  let activeEditor = null;
  let drag = null;
  let updateFrame = 0;
  let scrollFrame = 0;

  function editorFromNode(node) {
    const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    const editor = element?.closest?.(EDITOR_SELECTOR);
    return editor && root.contains(editor) && editor.isContentEditable ? editor : null;
  }

  function selectionFor(editor) {
    const selection = window.getSelection?.();
    if (!selection?.rangeCount || !selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    return editor.contains(range.startContainer) ? range : null;
  }

  function caretPoint(range, editor) {
    let rect = range.getBoundingClientRect?.();
    if (!rect || (!rect.height && !rect.width)) {
      const rects = Array.from(range.getClientRects?.() || []);
      rect = rects[rects.length - 1];
    }
    if (rect && (rect.height || rect.width)) {
      return {x:rect.left, y:rect.top + Math.max(1, rect.height)};
    }
    const bounds = editor.getBoundingClientRect();
    const style = window.getComputedStyle(editor);
    const lineHeight = Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) || 18;
    return {x:bounds.left + 3, y:bounds.top + lineHeight};
  }

  function hideHandle() {
    handle.classList.remove("is-visible");
    activeEditor?.classList.remove("miniapp-custom-caret-active");
    activeEditor = null;
  }

  function placeHandle(editor, range = selectionFor(editor)) {
    if (!editor?.isConnected || !editor.isContentEditable || !range || root.closest(".preview-mode")) {
      hideHandle();
      return null;
    }
    if (activeEditor && activeEditor !== editor) {
      activeEditor.classList.remove("miniapp-custom-caret-active");
    }
    const point = caretPoint(range, editor);
    const left = Math.max(2, Math.min(window.innerWidth - 42, point.x - 20));
    const top = Math.max(2, Math.min(window.innerHeight - 46, point.y - 2));
    handle.style.left = `${Math.round(left)}px`;
    handle.style.top = `${Math.round(top)}px`;
    handle.classList.add("is-visible");
    editor.classList.add("miniapp-custom-caret-active");
    activeEditor = editor;
    return point;
  }

  function scheduleUpdate() {
    if (drag || updateFrame) return;
    updateFrame = requestAnimationFrame(() => {
      updateFrame = 0;
      const editor = editorFromNode(window.getSelection?.()?.anchorNode)
        || editorFromNode(document.activeElement);
      if (!editor) {
        hideHandle();
        return;
      }
      placeHandle(editor);
    });
  }

  function editorAtPoint(x, y) {
    handle.style.visibility = "hidden";
    const hit = document.elementFromPoint(x, y);
    handle.style.visibility = "";
    const direct = hit?.closest?.(EDITOR_SELECTOR);
    if (direct && root.contains(direct) && direct.isContentEditable) return direct;

    let nearest = null;
    let nearestDistance = Infinity;
    root.querySelectorAll(EDITOR_SELECTOR).forEach(editor => {
      if (!editor.isContentEditable || !editor.getClientRects().length) return;
      const rect = editor.getBoundingClientRect();
      const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
      const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearest = editor;
        nearestDistance = distance;
      }
    });
    return nearest;
  }

  function rangeAtPoint(editor, x, y) {
    let node = null;
    let offset = 0;
    if (typeof document.caretPositionFromPoint === "function") {
      const position = document.caretPositionFromPoint(x, y);
      node = position?.offsetNode || null;
      offset = Number(position?.offset || 0);
    } else if (typeof document.caretRangeFromPoint === "function") {
      const range = document.caretRangeFromPoint(x, y);
      node = range?.startContainer || null;
      offset = Number(range?.startOffset || 0);
    }
    if (node && editor.contains(node)) {
      const range = document.createRange();
      const maxOffset = node.nodeType === Node.TEXT_NODE
        ? node.textContent?.length || 0
        : node.childNodes?.length || 0;
      range.setStart(node, Math.max(0, Math.min(offset, maxOffset)));
      range.collapse(true);
      return range;
    }

    const bounds = editor.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(editor);
    const visualStart = y < bounds.top + bounds.height / 2;
    range.collapse(visualStart);
    return range;
  }

  function setCaretAtPoint(x, y) {
    const editor = editorAtPoint(x, y);
    if (!editor) return;
    const range = rangeAtPoint(editor, x, y);
    if (editor !== activeEditor) editor.focus({preventScroll:true});
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    placeHandle(editor, range);
  }

  function scrollTargetAtPoint(x, y) {
    let element = document.elementFromPoint(x, y);
    while (element && element !== document.body) {
      const style = window.getComputedStyle(element);
      if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1) return element;
      element = element.parentElement;
    }
    const page = document.scrollingElement;
    return page && page.scrollHeight > page.clientHeight + 1 ? page : null;
  }

  function autoScroll() {
    scrollFrame = 0;
    if (!drag) return;
    const target = scrollTargetAtPoint(drag.x, drag.y);
    if (!target) return;
    const rect = target === document.scrollingElement
      ? {top:0, bottom:window.innerHeight}
      : target.getBoundingClientRect();
    const edge = 40;
    if (drag.y < rect.top + edge && target.scrollTop > 0) target.scrollTop -= 12;
    else if (drag.y > rect.bottom - edge && target.scrollTop < target.scrollHeight - target.clientHeight) target.scrollTop += 12;
    else return;
    setCaretAtPoint(drag.x - drag.offsetX, drag.y - drag.offsetY);
    scrollFrame = requestAnimationFrame(autoScroll);
  }

  handle.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;
    const editor = activeEditor;
    const range = editor && selectionFor(editor);
    if (!editor || !range) {
      hideHandle();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const point = caretPoint(range, editor);
    drag = {
      pointerId:event.pointerId,
      offsetX:event.clientX - point.x,
      offsetY:event.clientY - point.y,
      x:event.clientX,
      y:event.clientY,
    };
    handle.classList.add("is-dragging");
    try { handle.setPointerCapture(event.pointerId); } catch (_) {}
    scrollFrame = requestAnimationFrame(autoScroll);
  });

  handle.addEventListener("pointermove", event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    drag.x = event.clientX;
    drag.y = event.clientY;
    setCaretAtPoint(drag.x - drag.offsetX, drag.y - drag.offsetY);
  });

  function finishDrag(event) {
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    event.preventDefault?.();
    event.stopPropagation?.();
    drag = null;
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    handle.classList.remove("is-dragging");
    scheduleUpdate();
  }
  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);

  document.addEventListener("focusin", event => {
    const editor = editorFromNode(event.target);
    if (editor) {
      activeEditor = editor;
      scheduleUpdate();
    }
  });
  document.addEventListener("selectionchange", scheduleUpdate);
  document.addEventListener("pointerdown", event => {
    if (!event.target.closest?.(EDITOR_SELECTOR) && !event.target.closest?.(".miniapp-caret-handle")) hideHandle();
  }, true);
  window.addEventListener("resize", scheduleUpdate);
  window.addEventListener("scroll", scheduleUpdate, true);
  window.addEventListener("blur", hideHandle);
})();
