// Beta 0.3.5 — Telegram-style Details block + deterministic list toolbar menu.
(() => {
  function plainTextFromBlock(block) {
    const d = block?.data || {};
    return String(d.text ?? d.quote_text ?? d.summary_text ?? stripHtml(d.html || d.summary_html || "") ?? "");
  }

  function nestedPreview(child, depth = 0) {
    const block = child && typeof child === "object" ? child : {type:"paragraph", data:{text:String(child ?? "")}};
    const d = block.data || {};
    const type = block.type || "paragraph";
    const wrap = document.createElement("div");
    wrap.className = `details-child-preview details-child-${type}`;

    if (["paragraph", "text", "caption"].includes(type)) {
      wrap.classList.add("live-paragraph");
      wrap.textContent = plainTextFromBlock(block);
      return wrap;
    }
    if (type === "heading") {
      const level = Math.max(1, Math.min(6, Number(d.size || 2)));
      wrap.classList.add(`live-heading-${level}`);
      wrap.textContent = plainTextFromBlock(block);
      return wrap;
    }
    if (type === "footer") {
      wrap.classList.add("live-footer");
      wrap.textContent = plainTextFromBlock(block);
      return wrap;
    }
    if (type === "preformatted") {
      wrap.classList.add("live-pre");
      wrap.textContent = String(d.text || "");
      return wrap;
    }
    if (type === "blockquote" || type === "pullquote") {
      wrap.classList.add("live-quote", ...(type === "pullquote" ? ["live-pullquote"] : []));
      wrap.textContent = String(d.quote_text || stripHtml(d.quote_html || "") || "");
      return wrap;
    }
    if (type === "divider") {
      wrap.className = "divider-line details-child-divider";
      return wrap;
    }
    if (type === "mathematical_expression") {
      wrap.classList.add("live-pre");
      wrap.textContent = String(d.text || "");
      return wrap;
    }
    if (type === "list") {
      const kind = d.kind || "bullet";
      const list = document.createElement(kind === "numbered" ? "ol" : "ul");
      list.className = `telegram-list details-nested-list${kind === "checklist" ? " telegram-checklist" : ""}`;
      (d.items || []).forEach(item => {
        const li = document.createElement("li");
        li.textContent = typeof item === "object" ? String(item.text || "") : String(item || "");
        list.appendChild(li);
      });
      wrap.appendChild(list);
      return wrap;
    }
    if (type === "table") {
      const tableWrap = document.createElement("div");
      tableWrap.className = "telegram-table details-nested-table";
      const table = document.createElement("table");
      (d.rows || []).forEach(row => {
        const tr = document.createElement("tr");
        (row || []).forEach(raw => {
          const cell = typeof raw === "object" ? raw : {text:String(raw ?? "")};
          const td = document.createElement("td");
          if (cell.colspan) td.colSpan = Number(cell.colspan);
          if (cell.rowspan) td.rowSpan = Number(cell.rowspan);
          if (cell.align) td.style.textAlign = cell.align;
          td.textContent = String(cell.text || "");
          tr.appendChild(td);
        });
        table.appendChild(tr);
      });
      tableWrap.appendChild(table);
      wrap.appendChild(tableWrap);
      return wrap;
    }
    if (type === "details" && depth < 3) {
      const nested = document.createElement("div");
      nested.className = "details-nested-details";
      const title = document.createElement("strong");
      title.textContent = stripHtml(d.summary_html || "") || d.summary_text || "Details";
      nested.appendChild(title);
      (d.children || []).forEach(item => nested.appendChild(nestedPreview(item, depth + 1)));
      wrap.appendChild(nested);
      return wrap;
    }

    if (["photo", "video", "animation", "audio", "voice", "document"].includes(type)) {
      const media = document.createElement("div");
      media.className = "details-nested-media";
      const icon = {photo:"🖼", video:"▶", animation:"GIF", audio:"♫", voice:"◉", document:"▤"}[type] || "□";
      const name = d.file?.file_name || d._local_preview_name || info(type).label;
      media.innerHTML = `<span>${icon}</span><span>${escapeHtml(name)}</span>`;
      wrap.appendChild(media);
      return wrap;
    }

    wrap.classList.add("live-footer");
    wrap.textContent = info(type).label || type;
    return wrap;
  }

  // Details is edited and previewed as the same block, with an explicit expand/collapse control.
  detailsEditor = function(block) {
    const d = block.data || (block.data = {});
    if (!Array.isArray(d.children)) d.children = [];
    if (typeof d.expanded !== "boolean") d.expanded = true;

    const shell = document.createElement("section");
    shell.className = `telegram-details telegram-details-v035${d.expanded ? " is-expanded" : " is-collapsed"}`;

    const header = document.createElement("div");
    header.className = "details-header-row";

    const titleSide = document.createElement("div");
    titleSide.className = "details-title-side";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "details-toggle-btn";
    toggle.setAttribute("aria-label", d.expanded ? "إغلاق التفاصيل" : "توسعة التفاصيل");
    toggle.setAttribute("aria-expanded", String(d.expanded));
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>';

    const input = document.createElement("input");
    input.className = "details-summary-live details-title-input";
    input.value = stripHtml(d.summary_html || "") || d.summary_text || "Header";
    input.placeholder = "Header";
    input.addEventListener("focus", () => selectBlock(block.id));
    input.addEventListener("click", event => event.stopPropagation());
    input.addEventListener("input", () => {
      const value = input.value || "Header";
      d.summary_text = value;
      d.summary_html = escapeHtml(value);
      markDirty();
    });

    titleSide.append(toggle, input);

    const state = document.createElement("span");
    state.className = "details-expand-state";
    state.textContent = d.expanded ? "Expanded" : "Collapsed";

    const body = document.createElement("div");
    body.className = "details-body details-live-body";

    function renderChildren() {
      body.innerHTML = "";
      if (!d.children.length) {
        const empty = document.createElement("div");
        empty.className = "details-empty-live";
        empty.textContent = "";
        body.appendChild(empty);
      } else {
        d.children.forEach(child => body.appendChild(nestedPreview(child)));
      }
      body.hidden = !d.expanded;
    }

    function setExpanded(value) {
      d.expanded = Boolean(value);
      shell.classList.toggle("is-expanded", d.expanded);
      shell.classList.toggle("is-collapsed", !d.expanded);
      toggle.setAttribute("aria-expanded", String(d.expanded));
      toggle.setAttribute("aria-label", d.expanded ? "إغلاق التفاصيل" : "توسعة التفاصيل");
      state.textContent = d.expanded ? "Expanded" : "Collapsed";
      body.hidden = !d.expanded;
      markDirty();
    }

    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectBlock(block.id);
      setExpanded(!d.expanded);
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
    });

    header.addEventListener("dblclick", event => {
      if (event.target.closest("input,button")) return;
      setExpanded(!d.expanded);
    });

    header.append(titleSide, state);
    shell.append(header, body);
    renderChildren();
    return shell;
  };

  function insertListPreset(kind) {
    if (!current) return;
    const block = defaultBlock("list");
    const d = block.data || (block.data = {});
    d.kind = kind;
    if (kind === "numbered") {
      d.items = [{text:"عنصر", value:1, type:"1"}];
      d.text = "عنصر";
      d.html = "<ol><li>عنصر</li></ol>";
    } else if (kind === "checklist") {
      d.items = [{text:"مهمة", has_checkbox:true, is_checked:false}];
      d.text = "مهمة";
      d.html = "<ul><li>مهمة</li></ul>";
    } else {
      d.items = [{text:"عنصر"}];
      d.text = "عنصر";
      d.html = "<ul><li>عنصر</li></ul>";
    }

    const index = Number.isInteger(insertIndex)
      ? Math.max(0, Math.min(insertIndex, current.blocks.length))
      : current.blocks.length;
    current.blocks.splice(index, 0, block);
    normalizePositions();
    selectedBlockId = block.id;
    insertIndex = index + 1;
    slashInput.value = "";
    hideMenus();
    renderBlocks();
    markDirty();
    pushHistory();
    requestAnimationFrame(() => {
      const target = blocksEl.querySelector(`[data-id="${block.id}"] [contenteditable="true"]`);
      target?.focus();
      target?.scrollIntoView({block:"center", behavior:"smooth"});
    });
  }

  function insertDetailsBlock() {
    if (!current) return;
    const block = defaultBlock("details");
    block.data.expanded = true;
    block.data.summary_text = block.data.summary_text || "Header";
    block.data.summary_html = block.data.summary_html || "Header";

    const index = Number.isInteger(insertIndex)
      ? Math.max(0, Math.min(insertIndex, current.blocks.length))
      : current.blocks.length;
    current.blocks.splice(index, 0, block);
    normalizePositions();
    selectedBlockId = block.id;
    insertIndex = index + 1;
    slashInput.value = "";
    hideMenus();
    renderBlocks();
    markDirty();
    pushHistory();
    requestAnimationFrame(() => {
      const target = blocksEl.querySelector(`[data-id="${block.id}"] .details-title-input`);
      target?.focus();
      target?.select?.();
      target?.scrollIntoView({block:"center", behavior:"smooth"});
    });
  }

  function isListToolbarTypes(types) {
    return Array.isArray(types)
      && types.length === 2
      && types.includes("list")
      && types.includes("details");
  }

  const baseOpenSlashMenu = openSlashMenu;
  openSlashMenu = function(query = "", types = null) {
    if (!isListToolbarTypes(types) || String(query || "").trim()) {
      return baseOpenSlashMenu(query, types);
    }

    blockMenu.classList.add("hidden");
    slashItems.innerHTML = "";
    slashQuery.textContent = "";
    slashMenu.classList.add("list-tool-menu");

    const options = [
      ["1.", "قائمة مرقمة", () => insertListPreset("numbered")],
      ["•", "قائمة منقطة", () => insertListPreset("bullet")],
      ["☑", "قائمة تحقق", () => insertListPreset("checklist")],
      ["⌄", "تفاصيل", insertDetailsBlock],
    ];
    options.forEach(([icon, label, handler], index) => {
      slashItems.appendChild(menuButton(icon, label, "", handler, index === 0 ? "active" : ""));
    });
    slashMenu.classList.remove("hidden");
  };
})();
