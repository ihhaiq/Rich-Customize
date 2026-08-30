// Beta 0.3.33 — consolidated inline Rich Button behavior with saved-page callback picker.
(() => {
  const tr = (key, fallback, vars) => window.MiniAppI18n?.t?.(key, vars) || fallback;
  const TYPE_INFO = {
    user:{label:tr("button.mention", "Mention"),icon:"user"},
    url:{label:tr("button.url", "Link"),icon:"link"},
    callback_data:{label:tr("button.callback", "Callback"),icon:"callback"},
    page_callback:{label:tr("button.page", "Page"),icon:"page"},
    copy:{label:tr("button.copy", "Copy"),icon:"copy"},
    popup:{label:tr("button.popup", "Popup"),icon:"popup"},
    switch_inline_query:{label:tr("button.inline_search", "Inline search"),icon:"search"},
    switch_inline_query_current_chat:{label:tr("button.search_here", "Search here"),icon:"search_here"},
    disabled:{label:tr("button.disabled", "Disabled"),icon:"disabled"},
  };
  const PAGE_TYPES = new Set(["callback_data", "page_callback"]);

  function cleanTitle(value) {
    return String(value || tr("button.generic", "Button")).replace(/[{}\n]/g, " ").trim().slice(0, 64) || tr("button.generic", "Button");
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
    const create = function(type, title = tr("button.generic", "Button"), fromSelection = false, options = {}) {
      const token = baseCreate(type, title, fromSelection);
      if (token?.nodeType === Node.ELEMENT_NODE) {
        configureToken(token, type, title, options);
        return token;
      }
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
      toast?.(tr("button.editor_not_ready", "محرر الأزرار غير جاهز بعد"));
      return;
    }
    window.RichButtonDialog.open({presetType:type, title});
  }

  window.RichButtonEditor = {
    types:TYPE_INFO,
    create:type => openDialog(type),
  };

  function currentDialogType(card) {
    return card?.querySelector?.('input[name="rich_button_type"]:checked')?.value || "url";
  }

  function buildPageField(card) {
    let field = card.querySelector(".button-page-field");
    if (field) return field;
    field = document.createElement("div");
    field.className = "button-dialog-field button-page-field hidden";
    field.innerHTML = `<span>${tr("button.linked_page", "الصفحة المرتبطة")}</span><div class="button-page-list button-type-list"></div><small class="details-meta button-pages-status"></small>`;
    card.querySelector(".button-dialog-actions")?.before(field);
    return field;
  }

  async function loadPagesIntoDialog(card) {
    if (!card?.isConnected || card.dataset.pagesLoaded === "1" || card.dataset.pagesLoading === "1") return;
    card.dataset.pagesLoading = "1";
    const field = buildPageField(card);
    const list = field.querySelector(".button-page-list");
    const status = field.querySelector(".button-pages-status");
    list.innerHTML = "";
    status.textContent = tr("button.loading_pages", "جاري تحميل صفحاتك المحفوظة…");
    try {
      const data = await api("/miniapp/api/pages");
      if (!card.isConnected) return;
      const pages = Array.isArray(data?.pages) ? data.pages : [];
      card.dataset.pagesLoaded = "1";
      status.textContent = pages.length
        ? tr("button.choose_page", "اختر الصفحة التي يفتحها الزر")
        : tr("button.no_pages", "ما عندك صفحات محفوظة بعد");
      pages.forEach(page => {
        const pageId = String(page.page_id || "");
        if (!pageId) return;
        const label = document.createElement("label");
        label.className = "button-type-option button-page-option";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = "rich_button_page";
        input.value = pageId;
        const radio = document.createElement("span");
        radio.className = "button-radio";
        const copy = document.createElement("span");
        copy.className = "menu-copy";
        const title = document.createElement("strong");
        title.textContent = page.title || pageId;
        const meta = document.createElement("small");
        const blocks = Number(page.block_count || 0);
        meta.textContent = `${pageId}${Number.isFinite(blocks) ? ` · ${blocks} Block` : ""}`;
        copy.append(title, meta);
        label.append(input, radio, copy);
        input.addEventListener("change", () => {
          status.textContent = tr("button.selected_page", `تم اختيار «${page.title || pageId}»`, {title:page.title || pageId});
          try { window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.(); } catch (_) {}
        });
        list.appendChild(label);
      });
    } catch (error) {
      status.textContent = tr("button.pages_failed", `تعذر تحميل الصفحات: ${error?.message || "خطأ غير معروف"}`, {error:error?.message || tr("common.unknown_error", "خطأ غير معروف")});
    } finally {
      delete card.dataset.pagesLoading;
    }
  }

  function syncCallbackPagePicker(card) {
    if (!card?.isConnected) return;
    const type = currentDialogType(card);
    const usesPage = PAGE_TYPES.has(type);
    const valueField = card.querySelector(".button-value-field");
    const pageField = buildPageField(card);
    valueField?.classList.toggle("hidden", usesPage);
    pageField.classList.toggle("hidden", !usesPage);
    if (usesPage) loadPagesIntoDialog(card);
  }

  function enhanceButtonDialog(card) {
    if (!card || card.dataset.callbackPagesEnhanced === "1") return;
    card.dataset.callbackPagesEnhanced = "1";
    buildPageField(card);
    card.querySelectorAll('input[name="rich_button_type"]').forEach(input => {
      input.addEventListener("change", () => syncCallbackPagePicker(card));
    });

    // Capture the Save click before editor_features.js reads the hidden value
    // input. The user chooses a page; the callback payload is generated here.
    card.addEventListener("click", event => {
      const action = event.target.closest?.('[data-button-dialog="save"]');
      if (!action) return;
      const type = currentDialogType(card);
      if (!PAGE_TYPES.has(type)) return;
      const pageId = card.querySelector('input[name="rich_button_page"]:checked')?.value || "";
      if (!pageId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast?.(tr("button.choose_saved_page", "اختر صفحة محفوظة للزر"));
        return;
      }
      const valueInput = card.querySelector(".button-value-input");
      if (valueInput) valueInput.value = type === "callback_data" ? `r:cbd:${pageId}` : pageId;
    }, true);

    syncCallbackPagePicker(card);
  }

  const dialogObserver = new MutationObserver(records => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue;
        if (node.matches?.(".rich-button-dialog")) enhanceButtonDialog(node);
        node.querySelectorAll?.(".rich-button-dialog").forEach(enhanceButtonDialog);
      }
    }
  });
  dialogObserver.observe(document.body, {childList:true, subtree:true});

  // Aa > "زر غني" now opens the single Telegram-style Add Button panel directly.
  document.addEventListener("click", event => {
    const row = event.target.closest?.(".text-menu-row");
    if (!row) return;
    if (row.dataset.menuKind !== "rich_button") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    window.RichTextToolbarMenu?.close?.();
    window.RichButtonDialog?.open?.({presetType:"url"});
  }, true);

  // Selected text > create button uses the same panel, with the selected text
  // prefilled as the button title.
  document.addEventListener("click", event => {
    const button = event.target.closest?.(".selection-format-btn");
    if (!button || button.dataset.format !== "button") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const title = String(window.getSelection?.()?.toString?.() || "").trim();
    window.RichButtonDialog?.open?.({title, fromSelection:true, presetType:"url"});
  }, true);

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

  window.RichEditorButtons = {configureToken, markerFor, open:openDialog, enhanceButtonDialog};
})();
