// Beta 0.3.32 — unified editor features: drag/drop, multi-select, preview, commands and button dialog.
(() => {
  const tr = (key, fallback, vars) => window.MiniAppI18n?.t?.(key, vars) || fallback;
  const root = document.getElementById("editorView");
  if (!root || typeof renderBlocks !== "function") return;

  const state = {
    multi:false,
    preview:false,
    selected:new Set(),
    drag:null,
  };

  const haptic = kind => {
    try {
      const feedback = window.Telegram?.WebApp?.HapticFeedback;
      if (!feedback) return;
      if (kind === "medium") feedback.impactOccurred?.("medium");
      else feedback.selectionChanged?.();
    } catch (_) {}
  };

  function svgButton(id, label, path) {
    const btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.className = "icon-btn editor-feature-btn";
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${path}</svg>`;
    return btn;
  }

  function injectTopActions() {
    const top = document.querySelector(".top-actions");
    if (!top || document.getElementById("previewModeBtn")) return;
    const preview = svgButton(
      "previewModeBtn",
      tr("preview.message", "Preview message"),
      '<path d="M2.8 12s3.4-5.3 9.2-5.3S21.2 12 21.2 12 17.8 17.3 12 17.3 2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.5"/>'
    );
    const multi = svgButton(
      "multiSelectModeBtn",
      tr("multi.select_blocks", "Select multiple blocks"),
      '<rect x="5" y="5" width="6" height="6" rx="1.4"/><rect x="13" y="5" width="6" height="6" rx="1.4"/><rect x="5" y="13" width="6" height="6" rx="1.4"/><path d="m14.2 16 1.7 1.7 3.3-4"/>'
    );
    top.prepend(multi);
    top.prepend(preview);
    preview.addEventListener("click", () => togglePreview());
    multi.addEventListener("click", () => toggleMulti());
  }

  function ensureMultiBar() {
    let bar = document.getElementById("multiSelectBar");
    if (bar) return bar;
    bar = document.createElement("div");
    bar.id = "multiSelectBar";
    bar.className = "multi-select-bar hidden";
    bar.innerHTML = `
      <strong class="multi-count">${tr("multi.selected_count", "{count} selected", {count:0})}</strong>
      <div class="multi-actions">
        <button type="button" data-multi="all">${tr("common.all", "All")}</button>
        <button type="button" data-multi="up" aria-label="${tr("multi.move_up", "Move selected up")}"><span data-miniapp-icon="up"></span></button>
        <button type="button" data-multi="down" aria-label="${tr("multi.move_down", "Move selected down")}"><span data-miniapp-icon="down"></span></button>
        <button type="button" data-multi="delete" class="danger">${tr("common.delete", "Delete")}</button>
        <button type="button" data-multi="done">${tr("common.done", "Done")}</button>
      </div>`;
    MiniAppIcons.apply(bar);
    root.appendChild(bar);
    bar.addEventListener("click", event => {
      const action = event.target.closest?.("[data-multi]")?.dataset?.multi;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      if (action === "all") selectAll();
      else if (action === "up") moveSelected(-1);
      else if (action === "down") moveSelected(1);
      else if (action === "delete") deleteSelected();
      else if (action === "done") toggleMulti(false);
    });
    return bar;
  }

  function updateMultiBar() {
    const bar = ensureMultiBar();
    bar.classList.toggle("hidden", !state.multi);
    const count = bar.querySelector(".multi-count");
    if (count) count.textContent = tr("multi.selected_count", "{count} selected", {count:state.selected.size});
    document.getElementById("multiSelectModeBtn")?.classList.toggle("active", state.multi);
  }

  function clearSelected() {
    state.selected.clear();
    blocksEl?.querySelectorAll?.(".block.multi-selected").forEach(el => el.classList.remove("multi-selected"));
    updateMultiBar();
  }

  function toggleSelected(id) {
    const key = String(id);
    if (state.selected.has(key)) state.selected.delete(key);
    else state.selected.add(key);
    blocksEl?.querySelectorAll?.(".block[data-id]").forEach(el => {
      el.classList.toggle("multi-selected", state.selected.has(String(el.dataset.id)));
      const check = el.querySelector(".multi-select-check");
      if (check) check.setAttribute("aria-pressed", state.selected.has(String(el.dataset.id)) ? "true" : "false");
    });
    updateMultiBar();
    haptic();
  }

  function toggleMulti(force = !state.multi) {
    const next = Boolean(force);
    if (next && state.preview) togglePreview(false);
    state.multi = next;
    root.classList.toggle("multi-select-mode", next);
    if (!next) clearSelected();
    updateMultiBar();
    decorateBlocks();
    haptic();
  }

  function selectAll() {
    if (!current?.blocks) return;
    const allSelected = state.selected.size === current.blocks.length && current.blocks.length > 0;
    state.selected.clear();
    if (!allSelected) current.blocks.forEach(block => state.selected.add(String(block.id)));
    decorateBlocks();
    updateMultiBar();
    haptic();
  }

  function moveSelected(direction) {
    if (!current?.blocks?.length || !state.selected.size) return;
    const selected = state.selected;
    if (direction < 0) {
      for (let i = 1; i < current.blocks.length; i += 1) {
        if (selected.has(String(current.blocks[i].id)) && !selected.has(String(current.blocks[i - 1].id))) {
          [current.blocks[i - 1], current.blocks[i]] = [current.blocks[i], current.blocks[i - 1]];
        }
      }
    } else {
      for (let i = current.blocks.length - 2; i >= 0; i -= 1) {
        if (selected.has(String(current.blocks[i].id)) && !selected.has(String(current.blocks[i + 1].id))) {
          [current.blocks[i + 1], current.blocks[i]] = [current.blocks[i], current.blocks[i + 1]];
        }
      }
    }
    normalizePositions();
    renderBlocks();
    markDirty();
    pushHistory();
    haptic("medium");
  }

  function deleteSelected() {
    if (!current?.blocks || !state.selected.size) return;
    current.blocks = current.blocks.filter(block => !state.selected.has(String(block.id)));
    state.selected.clear();
    normalizePositions();
    selectedBlockId = null;
    renderBlocks();
    markDirty();
    pushHistory();
    updateMultiBar();
    haptic("medium");
  }

  function decorateBlocks() {
    if (!blocksEl) return;
    blocksEl.querySelectorAll(".block[data-id]").forEach(article => {
      const id = String(article.dataset.id || "");
      article.classList.toggle("multi-selected", state.selected.has(id));

      if (!article.querySelector(".editor-drag-handle")) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "editor-drag-handle";
        handle.setAttribute("aria-label", tr("block.drag", "Drag to move block"));
        handle.title = tr("block.drag_short", "Drag to move");
        handle.innerHTML = '<span></span><span></span><span></span><span></span><span></span><span></span>';
        handle.addEventListener("pointerdown", startDrag);
        article.appendChild(handle);
      }

      if (!article.querySelector(".multi-select-check")) {
        const check = document.createElement("button");
        check.type = "button";
        check.className = "multi-select-check";
        check.setAttribute("aria-label", tr("block.select", "Select block"));
        check.setAttribute("aria-pressed", state.selected.has(id) ? "true" : "false");
        MiniAppIcons.mount(check, "check");
        article.appendChild(check);
      }
    });
  }

  const baseRenderBlocks = renderBlocks;
  renderBlocks = function(...args) {
    const result = baseRenderBlocks(...args);
    requestAnimationFrame(decorateBlocks);
    return result;
  };

  function startDrag(event) {
    if (state.preview || state.multi) return;
    const handle = event.currentTarget;
    const article = handle.closest?.(".block[data-id]");
    if (!article || !current?.blocks?.length) return;
    event.preventDefault();
    event.stopPropagation();
    try { handle.setPointerCapture(event.pointerId); } catch (_) {}
    state.drag = {pointerId:event.pointerId, article, handle};
    article.classList.add("is-dragging");
    document.documentElement.classList.add("editor-dragging");
    haptic("medium");
  }

  document.addEventListener("pointermove", event => {
    const drag = state.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.(".block[data-id]");
    if (target && target !== drag.article && target.parentElement === drag.article.parentElement) {
      const rect = target.getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) target.before(drag.article);
      else target.after(drag.article);
    }
    const main = document.querySelector(".editor-main");
    const rect = main?.getBoundingClientRect?.();
    if (main && rect) {
      if (event.clientY < rect.top + 70) main.scrollBy({top:-18});
      else if (event.clientY > rect.bottom - 70) main.scrollBy({top:18});
    }
  }, {passive:true});

  function finishDrag(event) {
    const drag = state.drag;
    if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    state.drag = null;
    drag.article.classList.remove("is-dragging");
    document.documentElement.classList.remove("editor-dragging");
    const order = Array.from(blocksEl.querySelectorAll(".block[data-id]"), el => String(el.dataset.id));
    const byId = new Map((current?.blocks || []).map(block => [String(block.id), block]));
    const reordered = order.map(id => byId.get(id)).filter(Boolean);
    if (reordered.length === current?.blocks?.length) current.blocks = reordered;
    normalizePositions();
    renderBlocks();
    markDirty();
    pushHistory();
    haptic();
  }
  document.addEventListener("pointerup", finishDrag, true);
  document.addEventListener("pointercancel", finishDrag, true);

  document.addEventListener("click", event => {
    if (!state.multi) return;
    const article = event.target.closest?.(".block[data-id]");
    if (!article || event.target.closest?.(".editor-drag-handle")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleSelected(article.dataset.id);
  }, true);

  function togglePreview(force = !state.preview) {
    const next = Boolean(force);
    if (next && state.multi) toggleMulti(false);
    if (next) {
      document.querySelectorAll(".math-done-button").forEach(btn => btn.click());
      hideMenus?.();
      window.RichTextToolbarMenu?.close?.();
    }
    state.preview = next;
    root.classList.toggle("preview-mode", next);
    document.getElementById("previewModeBtn")?.classList.toggle("active", next);
    const previewBtn = document.getElementById("previewModeBtn");
    if (previewBtn) {
      previewBtn.title = next ? tr("preview.back_to_edit", "Back to editing") : tr("preview.message", "Preview message");
      previewBtn.setAttribute("aria-label", previewBtn.title);
    }
    haptic();
  }

  const BUTTON_TYPES = [
    {value:"url", label:tr("button.url", "Link"), placeholder:"https://example.com"},
    {value:"copy", label:tr("button.copy", "Copy"), placeholder:tr("button.copy_placeholder", "Text to copy")},
    {value:"user", label:tr("button.mention", "Mention"), placeholder:"User ID / @username"},
    {value:"page_callback", label:tr("button.page", "Page"), placeholder:tr("button.page_placeholder", "Saved page code")},
    {value:"callback_data", label:tr("button.callback", "Callback"), placeholder:"callback_data"},
    {value:"popup", label:tr("button.popup", "Popup"), placeholder:tr("button.popup_placeholder", "Popup text")},
  ];
  const BUTTON_STYLES = [
    {label:tr("button.default", "Default"), color:null},
    {label:tr("button.active", "Active"), color:"b"},
    {label:tr("button.accept", "Accept"), color:"g"},
    {label:tr("button.decline", "Decline"), color:"r"},
  ];

  function closeButtonDialog() {
    document.querySelector(".rich-button-dialog-backdrop")?.remove();
  }

  function openButtonDialog(options = {}) {
    closeButtonDialog();
    const backdrop = document.createElement("div");
    backdrop.className = "rich-button-dialog-backdrop";
    const card = document.createElement("section");
    card.className = "rich-button-dialog glass-panel";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", tr("button.add", "Add button"));

    const preset = BUTTON_TYPES.some(item => item.value === options.presetType) ? options.presetType : "url";
    let chosenType = preset;
    let chosenColor = null;

    card.innerHTML = `
      <h3>${escapeHtml(tr("button.add", "Add button"))}</h3>
      <label class="button-dialog-field"><span>${escapeHtml(tr("button.title", "Button text"))}</span><input class="button-title-input" maxlength="64" value="${escapeHtml(options.title || "")}" placeholder="${escapeHtml(tr("button.title_placeholder", "Enter button title"))}"></label>
      <label class="button-separate-option"><input type="checkbox" class="button-separate-input"><span class="button-check"></span><span>${escapeHtml(tr("button.separate", "Button on a separate line"))}</span></label>
      <div class="button-style-row" aria-label="${escapeHtml(tr("button.style", "Button style"))}"></div>
      <div class="button-type-list" role="radiogroup"></div>
      <label class="button-dialog-field button-value-field"><span class="button-value-label">${escapeHtml(tr("button.url", "Link"))}</span><input class="button-value-input" dir="ltr" placeholder="https://example.com"></label>
      <div class="button-dialog-actions"><button type="button" data-button-dialog="cancel">${escapeHtml(tr("common.cancel", "Cancel"))}</button><button type="button" class="save" data-button-dialog="save">${escapeHtml(tr("common.save", "Save"))}</button></div>`;

    const styleRow = card.querySelector(".button-style-row");
    BUTTON_STYLES.forEach((style, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `button-style-pill style-${style.color || "default"}${index === 0 ? " active" : ""}`;
      btn.textContent = style.label;
      btn.addEventListener("click", () => {
        chosenColor = style.color;
        styleRow.querySelectorAll("button").forEach(item => item.classList.toggle("active", item === btn));
        haptic();
      });
      styleRow.appendChild(btn);
    });

    const typeList = card.querySelector(".button-type-list");
    const valueLabel = card.querySelector(".button-value-label");
    const valueInput = card.querySelector(".button-value-input");
    const updateTypeField = () => {
      const meta = BUTTON_TYPES.find(item => item.value === chosenType) || BUTTON_TYPES[0];
      valueLabel.textContent = chosenType === "url" ? "URL" : meta.label;
      valueInput.placeholder = meta.placeholder;
      valueInput.type = chosenType === "url" ? "url" : "text";
    };
    BUTTON_TYPES.forEach(meta => {
      const label = document.createElement("label");
      label.className = "button-type-option";
      label.innerHTML = `<input type="radio" name="rich_button_type" value="${meta.value}"${meta.value === preset ? " checked" : ""}><span class="button-radio"></span><span>${meta.label}</span>`;
      label.querySelector("input").addEventListener("change", () => {
        chosenType = meta.value;
        updateTypeField();
        haptic();
      });
      typeList.appendChild(label);
    });
    updateTypeField();

    card.addEventListener("click", event => {
      const action = event.target.closest?.("[data-button-dialog]")?.dataset?.buttonDialog;
      if (!action) return;
      if (action === "cancel") { closeButtonDialog(); return; }
      const title = String(card.querySelector(".button-title-input")?.value || "").trim();
      let value = String(valueInput.value || "").trim();
      const separateLine = Boolean(card.querySelector(".button-separate-input")?.checked);
      if (!title) { toast(tr("button.title_required", "Enter the button text")); return; }
      if (chosenType === "url" && value && !/^(https?:\/\/|tg:\/\/)/i.test(value)) { toast(tr("inline.invalid_link", "The link must start with https:// or tg://")); return; }
      if (["copy","popup"].includes(chosenType) && !value) { toast(tr("button.value_required", "Enter a button value")); return; }
      let type = chosenType;
      if (type === "user" && /^@[A-Za-z0-9_]{4,}$/.test(value)) {
        type = "url";
        value = `https://t.me/${value.slice(1)}`;
      }
      const created = window.InlineTextTools?.createButton?.(type, title, Boolean(options.fromSelection), {
        value,
        color:chosenColor,
        separateLine,
      });
      if (created === null || created === false) { toast(tr("button.create_failed", "Could not create the button")); return; }
      closeButtonDialog();
      haptic("medium");
    });

    backdrop.addEventListener("pointerdown", event => {
      if (event.target === backdrop) closeButtonDialog();
    });
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    requestAnimationFrame(() => card.querySelector(".button-title-input")?.focus());
  }
  window.RichButtonDialog = {open:openButtonDialog, close:closeButtonDialog};

  const COMMANDS = [
    {name:"h1", label:tr("heading.level", "Heading 1", {level:1}), hint:"/h1 text"},
    {name:"h2", label:tr("heading.level", "Heading 2", {level:2}), hint:"/h2 text"},
    {name:"h3", label:tr("heading.level", "Heading 3", {level:3}), hint:"/h3 text"},
    {name:"table", label:tr("block.table", "Table"), hint:"/table 3x4"},
    {name:"math", label:tr("block.math", "Equation"), hint:"/math x^2+y^2"},
    {name:"details", label:tr("block.details", "Details"), hint:"/details title"},
    {name:"button", label:tr("button.rich", "Rich button"), hint:"/button"},
    {name:"preview", label:tr("preview.mode", "Preview mode"), hint:"/preview"},
    {name:"select", label:tr("multi.mode", "Multi-select"), hint:"/select"},
  ];

  function executeCommand(raw) {
    const text = String(raw || "").trim().replace(/^\//, "");
    if (!text) return false;
    const firstSpace = text.search(/\s/);
    const name = (firstSpace < 0 ? text : text.slice(0, firstSpace)).toLowerCase();
    const args = firstSpace < 0 ? "" : text.slice(firstSpace + 1).trim();

    if (/^h[1-6]$/.test(name)) {
      addBlock("heading", insertIndex, args);
      const block = current?.blocks?.find(item => String(item.id) === String(selectedBlockId));
      if (block) {
        block.data.size = Number(name.slice(1));
        applyText(block, blockText(block));
        renderBlocks();
        markDirty();
      }
      return true;
    }
    if (name === "table") {
      const match = args.match(/^(\d{1,2})\s*[x×*]\s*(\d{1,2})$/i);
      const rows = Math.max(1, Math.min(12, Number(match?.[1] || 3)));
      const cols = Math.max(1, Math.min(12, Number(match?.[2] || 3)));
      addBlock("table");
      const block = current?.blocks?.find(item => String(item.id) === String(selectedBlockId));
      if (block) {
        block.data.rows = Array.from({length:rows}, () => Array.from({length:cols}, () => ""));
        try { rebuildTableHtml?.(block); } catch (_) {}
        renderBlocks();
        markDirty();
      }
      return true;
    }
    if (name === "math") { addBlock("mathematical_expression", insertIndex, args); return true; }
    if (name === "details") {
      addBlock("details");
      const block = current?.blocks?.find(item => String(item.id) === String(selectedBlockId));
      if (block && args) {
        block.data.summary_text = args;
        block.data.summary_html = escapeHtml(args);
        renderBlocks();
        markDirty();
      }
      return true;
    }
    if (name === "button") { openButtonDialog(); return true; }
    if (name === "preview") { togglePreview(); return true; }
    if (name === "select") { toggleMulti(); return true; }

    const block = BLOCKS.find(item => item.type === name || String(item.keys || "").toLowerCase().split(/\s+/).includes(name));
    if (block) { addBlock(block.type, insertIndex, args); return true; }
    return false;
  }

  const baseOpenSlashMenu = openSlashMenu;
  openSlashMenu = function(query = "", types = null) {
    if (types) return baseOpenSlashMenu(query, types);
    const q = String(query || "").trim().toLowerCase();
    blockMenu.classList.add("hidden");
    slashItems.innerHTML = "";
    slashQuery.textContent = q ? `/${q}` : "/";
    const commandMatches = COMMANDS.filter(command => !q || `${command.name} ${command.label} ${command.hint}`.toLowerCase().includes(q));
    commandMatches.forEach(command => {
      slashItems.appendChild(menuButton(command.name.startsWith("h")?"heading":command.name==="math"?"math":command.name==="select"?"multi":command.name, command.label, command.hint, () => {
        if (["preview","select","button"].includes(command.name)) {
          slashInput.value = "";
          slashMenu.classList.add("hidden");
          executeCommand(command.name);
        } else {
          slashInput.value = `${command.hint} `;
          slashInput.focus();
          autoGrow(slashInput);
        }
      }));
    });
    const blockQuery = q.split(/\s+/, 1)[0];
    filteredBlocks(blockQuery).forEach(item => {
      slashItems.appendChild(menuButton(item.icon, item.label, item.desc, () => addBlock(item.type)));
    });
    if (!slashItems.children.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = tr("editor.no_command_match", "No matching command or block");
      slashItems.appendChild(empty);
    }
    slashMenu.classList.remove("hidden");
  };

  slashInput?.addEventListener("keydown", event => {
    if (event.key !== "Enter" || event.shiftKey) return;
    const value = slashInput.value.trim();
    if (!value.startsWith("/")) return;
    if (!executeCommand(value)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    slashInput.value = "";
    slashMenu.classList.add("hidden");
    autoGrow(slashInput);
  }, true);

  document.addEventListener("keydown", event => {
    if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.key.toLowerCase() !== "p") return;
    const target = event.target;
    if (target?.matches?.("input,textarea,[contenteditable='true']")) return;
    event.preventDefault();
    slashInput.value = "/";
    slashInput.focus();
    openSlashMenu("");
  });

  injectTopActions();
  ensureMultiBar();
  requestAnimationFrame(decorateBlocks);

  window.RichEditorFeatures = {
    preview:togglePreview,
    multiSelect:toggleMulti,
    openButtonDialog,
    executeCommand,
  };
})();