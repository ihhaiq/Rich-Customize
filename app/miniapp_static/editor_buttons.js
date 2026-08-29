// Beta 0.3.32 — consolidated inline Rich Button behavior; replaces rich_button_patch.js.
(() => {
  const TYPE_INFO = {
    user:{label:"Mention",icon:"👤"},
    url:{label:"رابط",icon:"🔗"},
    callback_data:{label:"Callback",icon:"↪"},
    page_callback:{label:"صفحة",icon:"📚"},
    copy:{label:"نسخ",icon:"📋"},
    popup:{label:"Popup",icon:"💬"},
    switch_inline_query:{label:"بحث Inline",icon:"⌕"},
    switch_inline_query_current_chat:{label:"بحث هنا",icon:"⌖"},
    disabled:{label:"معطّل",icon:"⊘"},
  };

  function cleanTitle(value) {
    return String(value || "زر").replace(/[{}\n]/g, " ").trim().slice(0, 64) || "زر";
  }

  function markerFor(type, title, options = {}) {
    const typeName = type === "page_callback" ? "cbd" : type;
    const value = String(options.value || "").trim();
    const color = ["r","b","p","g"].includes(options.color) ? ` #${options.color}` : "";
    return `{${cleanTitle(title)}:${typeName}:${value}${color}}`;
  }

  function styleClass(type, color) {
    if (type === "disabled") return "is-disabled";
    return ({r:"is-danger",g:"is-success",b:"is-primary",p:"is-primary"})[color] || "is-default";
  }

  function configureToken(token, type, title, options = {}) {
    if (!token?.isConnected) return false;
    const marker = markerFor(type, title, options);
    token.dataset.marker = marker;
    token.dataset.buttonType = type;
    token.dataset.inlineRichButton = "1";
    token.textContent = cleanTitle(title);
    token.className = `inline-rich-button-token ${styleClass(type, options.color)}`;

    if (options.separateLine) {
      const previous = token.previousSibling;
      const next = token.nextSibling;
      if (!(previous?.nodeType === Node.ELEMENT_NODE && previous.tagName === "BR")) token.before(document.createElement("br"));
      if (!(next?.nodeType === Node.ELEMENT_NODE && next.tagName === "BR")) token.after(document.createElement("br"));
      token.classList.add("separate-line-button");
    }

    const editor = token.closest?.(".rich-inline-editor");
    try { window.InlineTextTools?.syncEditor?.(editor); } catch (_) {}
    try { markDirty(); } catch (_) {}
    try { pushHistory(); } catch (_) {}
    return true;
  }

  function findNewestToken(title) {
    const tokens = Array.from(document.querySelectorAll(".inline-rich-button-token"));
    const wanted = cleanTitle(title);
    return tokens.reverse().find(token => token.textContent === wanted) || tokens[0] || null;
  }

  function installCreateBridge() {
    if (!window.InlineTextTools?.createButton || window.InlineTextTools.createButton.__richConfigured) return;
    const baseCreate = window.InlineTextTools.createButton.bind(window.InlineTextTools);
    const create = function(type, title = "زر", fromSelection = false, options = {}) {
      const token = baseCreate(type, title, fromSelection);
      if (token?.nodeType === Node.ELEMENT_NODE) {
        configureToken(token, type, title, options);
        return token;
      }
      // When no text editor is active, InlineTextTools creates a paragraph on the
      // next animation frame. Configure the token as soon as that insertion lands.
      let tries = 0;
      const applyLater = () => {
        tries += 1;
        const delayed = findNewestToken(title);
        if (delayed && configureToken(delayed, type, title, options)) return;
        if (tries < 12) requestAnimationFrame(applyLater);
      };
      requestAnimationFrame(applyLater);
      return true;
    };
    create.__richConfigured = true;
    window.InlineTextTools.createButton = create;
  }

  function openDialog(type = "url", title = "") {
    if (!window.RichButtonDialog?.open) {
      toast?.("محرر الأزرار غير جاهز بعد");
      return;
    }
    window.RichButtonDialog.open({presetType:type, title});
  }

  window.RichButtonEditor = {
    types:TYPE_INFO,
    create:type => openDialog(type),
  };

  // The selected-text toolbar previously opened a second type chooser. Replace
  // that flow with the single Telegram-style Add Button panel.
  document.addEventListener("click", event => {
    const button = event.target.closest?.(".selection-format-btn");
    if (!button || button.parentElement?.lastElementChild !== button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const title = String(window.getSelection?.()?.toString?.() || "").trim();
    window.RichButtonDialog?.open?.({title, fromSelection:true, presetType:"url"});
  }, true);

  // InlineTextTools loads before this module in the consolidated index. Keep a
  // small fallback for cached load-order differences.
  if (window.InlineTextTools) installCreateBridge();
  else {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (window.InlineTextTools) {
        clearInterval(timer);
        installCreateBridge();
      } else if (attempts > 80) clearInterval(timer);
    }, 25);
  }

  window.RichEditorButtons = {configureToken, markerFor, open:openDialog};
})();
