// Beta 0.3.24 — Telegram-style contextual table cell/row tools.
(() => {
  const state = {
    blockId: null,
    row: -1,
    col: -1,
    scope: "cell",
    anchor: null,
    menu: null,
  };

  function haptic(kind = "selection") {
    try {
      const feedback = window.Telegram?.WebApp?.HapticFeedback;
      if (kind === "medium") feedback?.impactOccurred?.("medium");
      else feedback?.selectionChanged?.();
    } catch (_) {}
  }

  function currentTableBlock() {
    if (!state.blockId || typeof current === "undefined") return null;
    return current?.blocks?.find?.(block => String(block.id) === String(state.blockId) && block.type === "table") || null;
  }

  function cellObject(raw) {
    return typeof raw === "object" && raw !== null
      ? {...raw}
      : {text:String(raw ?? "")};
  }

  function rowsFor(block) {
    const d = block?.data || (block.data = {});
    return Array.isArray(d.rows) ? d.rows : (d.rows = []);
  }

  function ensureCell(block, ri, ci) {
    const rows = rowsFor(block);
    if (!rows[ri] || ci < 0 || ci >= rows[ri].length) return null;
    const cell = cellObject(rows[ri][ci]);
    cell.setdefault = undefined;
    if (!cell.valign) cell.valign = "middle";
    rows[ri][ci] = cell;
    return cell;
  }

  function targetCells(block) {
    const rows = rowsFor(block);
    if (!rows[state.row]) return [];
    if (state.scope === "row") {
      return rows[state.row].map((_, ci) => ({ri:state.row, ci, cell:ensureCell(block, state.row, ci)}));
    }
    const cell = ensureCell(block, state.row, state.col);
    return cell ? [{ri:state.row, ci:state.col, cell}] : [];
  }

  function logicalColumnCount(rows) {
    let max = 1;
    rows.forEach(row => {
      const width = (row || []).reduce((sum, raw) => {
        const cell = cellObject(raw);
        return sum + Math.max(1, Number(cell.colspan || 1));
      }, 0);
      max = Math.max(max, width);
    });
    return max;
  }

  function sync(block, {rerender = true} = {}) {
    try { if (typeof rebuildTableHtml === "function") rebuildTableHtml(block); } catch (_) {}
    try { if (typeof markDirty === "function") markDirty(); } catch (_) {}
    try { if (typeof pushHistory === "function") pushHistory(); } catch (_) {}
    if (rerender) {
      closeMenu();
      try { if (typeof renderBlocks === "function") renderBlocks(); } catch (_) {}
    }
  }

  function setHorizontal(value) {
    const block = currentTableBlock();
    if (!block) return;
    targetCells(block).forEach(({cell}) => { cell.align = value; });
    haptic();
    sync(block);
  }

  function setVertical(value) {
    const block = currentTableBlock();
    if (!block) return;
    targetCells(block).forEach(({cell}) => { cell.valign = value; });
    haptic();
    sync(block);
  }

  function toggleShade() {
    const block = currentTableBlock();
    if (!block) return;
    const targets = targetCells(block);
    const turnOn = targets.some(({cell}) => !cell.is_header);
    targets.forEach(({cell}) => { cell.is_header = turnOn; });
    haptic("medium");
    sync(block);
  }

  function mergeRight() {
    const block = currentTableBlock();
    if (!block) return;
    const rows = rowsFor(block);
    const row = rows[state.row];
    if (!row || state.col < 0 || state.col >= row.length - 1) {
      window.toast?.("ماكو خلية تالية حتى تندمج وياها");
      return;
    }
    const left = cellObject(row[state.col]);
    const right = cellObject(row[state.col + 1]);
    left.colspan = Math.max(1, Number(left.colspan || 1)) + Math.max(1, Number(right.colspan || 1));
    const leftText = String(left.text || "").trim();
    const rightText = String(right.text || "").trim();
    if (!leftText && rightText) left.text = rightText;
    else if (leftText && rightText) left.text = `${leftText} ${rightText}`;
    row[state.col] = left;
    row.splice(state.col + 1, 1);
    haptic("medium");
    sync(block);
  }

  function unmerge() {
    const block = currentTableBlock();
    if (!block) return;
    const rows = rowsFor(block);
    const row = rows[state.row];
    if (!row || !row[state.col]) return;
    const cell = cellObject(row[state.col]);
    const span = Math.max(1, Number(cell.colspan || 1));
    if (span <= 1) {
      window.toast?.("الخلية مو مدمجة");
      return;
    }
    cell.colspan = 1;
    row[state.col] = cell;
    for (let i = 1; i < span; i += 1) row.splice(state.col + i, 0, {text:"", align:cell.align || "left", valign:cell.valign || "middle"});
    haptic("medium");
    sync(block);
  }

  function addRow(offset) {
    const block = currentTableBlock();
    if (!block) return;
    const rows = rowsFor(block);
    const width = logicalColumnCount(rows);
    const next = Array.from({length:width}, () => ({text:"", align:"left", valign:"middle"}));
    rows.splice(Math.max(0, Math.min(rows.length, state.row + offset)), 0, next);
    haptic();
    sync(block);
  }

  function deleteRow() {
    const block = currentTableBlock();
    if (!block) return;
    const rows = rowsFor(block);
    if (rows.length <= 1) {
      window.toast?.("الجدول لازم يبقى بيه صف واحد على الأقل");
      return;
    }
    rows.splice(state.row, 1);
    haptic("medium");
    sync(block);
  }

  function iconButton(label, svg, handler, active = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `table-tool-icon${active ? " active" : ""}`;
    btn.setAttribute("aria-label", label);
    btn.title = label;
    btn.innerHTML = svg;
    btn.addEventListener("click", event => {
      event.stopPropagation();
      handler();
    });
    return btn;
  }

  const icons = {
    left:'<svg viewBox="0 0 24 24"><path d="M5 5v14M8 8h10M8 12h7M8 16h10"/></svg>',
    center:'<svg viewBox="0 0 24 24"><path d="M12 4v16M6 8h12M8 12h8M6 16h12"/></svg>',
    right:'<svg viewBox="0 0 24 24"><path d="M19 5v14M6 8h10M9 12h7M6 16h10"/></svg>',
    top:'<svg viewBox="0 0 24 24"><path d="M5 5h14M8 8v10M12 8v7M16 8v10"/></svg>',
    middle:'<svg viewBox="0 0 24 24"><path d="M4 12h16M8 6v12M12 8v8M16 6v12"/></svg>',
    bottom:'<svg viewBox="0 0 24 24"><path d="M5 19h14M8 6v10M12 9v7M16 6v10"/></svg>',
    shade:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="m6 16 10-10M8 20 20 8M4 12l8-8"/></svg>',
    merge:'<svg viewBox="0 0 24 24"><rect x="3" y="7" width="7" height="10" rx="2"/><rect x="14" y="7" width="7" height="10" rx="2"/><path d="M9 12h6m-2-2 2 2-2 2"/></svg>',
    split:'<svg viewBox="0 0 24 24"><rect x="4" y="7" width="16" height="10" rx="2"/><path d="M12 7v10M10 10l-2 2 2 2M14 10l2 2-2 2"/></svg>',
    up:'<svg viewBox="0 0 24 24"><path d="M12 18V7m-4 4 4-4 4 4"/><path d="M5 20h14"/></svg>',
    down:'<svg viewBox="0 0 24 24"><path d="M12 6v11m-4-4 4 4 4-4"/><path d="M5 4h14"/></svg>',
    trash:'<svg viewBox="0 0 24 24"><path d="M5 7h14M9 7V5h6v2M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13"/></svg>',
  };

  function actionRow(icon, title, handler, danger = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `table-tool-row${danger ? " danger" : ""}`;
    btn.innerHTML = `<span class="table-tool-row-icon">${icon}</span><strong>${title}</strong>`;
    btn.addEventListener("click", event => {
      event.stopPropagation();
      handler();
    });
    return btn;
  }

  function buildMenu() {
    closeMenu();
    const block = currentTableBlock();
    if (!block) return;
    const rows = rowsFor(block);
    const raw = rows[state.row]?.[state.col];
    if (raw === undefined) return;
    const cell = cellObject(raw);

    const menu = document.createElement("aside");
    menu.className = "table-cell-menu";
    menu.setAttribute("role", "dialog");
    menu.setAttribute("aria-label", "تخصيص الجدول");

    const scope = document.createElement("div");
    scope.className = "table-scope-switch";
    [["cell","الخلية"],["row","الصف"]].forEach(([value,label]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.classList.toggle("active", state.scope === value);
      btn.addEventListener("click", event => {
        event.stopPropagation();
        state.scope = value;
        buildMenu();
      });
      scope.appendChild(btn);
    });
    menu.appendChild(scope);

    const alignTitle = document.createElement("div");
    alignTitle.className = "table-tool-title";
    alignTitle.textContent = "المحاذاة";
    menu.appendChild(alignTitle);

    const align = document.createElement("div");
    align.className = "table-align-grid";
    const representative = state.scope === "row" ? cellObject(rows[state.row]?.[0]) : cell;
    align.append(
      iconButton("محاذاة يسار", icons.left, () => setHorizontal("left"), representative.align === "left"),
      iconButton("توسيط أفقي", icons.center, () => setHorizontal("center"), representative.align === "center"),
      iconButton("محاذاة يمين", icons.right, () => setHorizontal("right"), representative.align === "right"),
      iconButton("محاذاة للأعلى", icons.top, () => setVertical("top"), representative.valign === "top"),
      iconButton("توسيط عمودي", icons.middle, () => setVertical("middle"), !representative.valign || representative.valign === "middle"),
      iconButton("محاذاة للأسفل", icons.bottom, () => setVertical("bottom"), representative.valign === "bottom"),
    );
    menu.appendChild(align);

    const sep = () => {
      const el = document.createElement("div");
      el.className = "table-tool-sep";
      menu.appendChild(el);
    };
    sep();

    menu.appendChild(actionRow(icons.shade, state.scope === "row" ? "تلوين الصف" : "تلوين الخلية", toggleShade));
    if (state.scope === "cell") {
      menu.appendChild(actionRow(icons.merge, "دمج مع الخلية التالية", mergeRight));
      if (Number(cell.colspan || 1) > 1) menu.appendChild(actionRow(icons.split, "فك دمج الخلية", unmerge));
    }
    sep();
    menu.appendChild(actionRow(icons.up, "إضافة صف للأعلى", () => addRow(0)));
    menu.appendChild(actionRow(icons.down, "إضافة صف للأسفل", () => addRow(1)));
    menu.appendChild(actionRow(icons.trash, "حذف الصف", deleteRow, true));

    document.body.appendChild(menu);
    state.menu = menu;
    positionMenu();
    requestAnimationFrame(() => menu.classList.add("show"));
  }

  function positionMenu() {
    if (!state.menu || !state.anchor?.isConnected) return;
    const menu = state.menu;
    const anchor = state.anchor.getBoundingClientRect();
    const margin = 10;
    const width = menu.offsetWidth || 292;
    const height = menu.offsetHeight || 360;
    let left = anchor.left;
    let top = anchor.bottom + 8;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin;
    if (left < margin) left = margin;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, anchor.top - height - 8);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function closeMenu() {
    if (state.menu) state.menu.remove();
    state.menu = null;
  }

  function clearSelectionVisuals() {
    document.querySelectorAll(".telegram-table td.table-cell-selected").forEach(td => td.classList.remove("table-cell-selected"));
    document.querySelectorAll(".table-cell-handle").forEach(handle => handle.remove());
  }

  function selectCell(block, td, ri, ci) {
    state.blockId = String(block.id);
    state.row = ri;
    state.col = ci;
    state.scope = "cell";
    clearSelectionVisuals();
    td.classList.add("table-cell-selected");

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "table-cell-handle";
    handle.setAttribute("aria-label", "خيارات الخلية والصف");
    handle.innerHTML = "<span></span><span></span><span></span>";
    handle.addEventListener("pointerdown", event => event.stopPropagation());
    handle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      state.anchor = handle;
      haptic();
      buildMenu();
    });
    td.appendChild(handle);
  }

  function enhancedTableEditor(block) {
    const d = block.data || (block.data = {});
    const wrap = document.createElement("div");
    wrap.className = "telegram-table telegram-table-contextual";
    if (d.is_bordered === false) wrap.classList.add("no-borders");
    if (d.is_striped) wrap.classList.add("striped");
    if (d.is_compact) wrap.classList.add("compact");

    const table = document.createElement("table");
    const rows = Array.isArray(d.rows) ? d.rows : (d.rows = []);
    rows.forEach((row, ri) => {
      const tr = document.createElement("tr");
      row.forEach((raw, ci) => {
        const cell = cellObject(raw);
        const td = document.createElement("td");
        td.dataset.row = String(ri);
        td.dataset.col = String(ci);
        if (cell.colspan) td.colSpan = Math.max(1, Number(cell.colspan));
        if (cell.rowspan) td.rowSpan = Math.max(1, Number(cell.rowspan));
        td.style.textAlign = cell.align || "left";
        td.style.verticalAlign = cell.valign || "middle";
        if (cell.is_header) td.classList.add("table-cell-shaded");

        const input = document.createElement("input");
        input.value = cell.text || "";
        input.placeholder = `${ri + 1}:${ci + 1}`;
        input.addEventListener("focus", () => {
          if (typeof selectBlock === "function") selectBlock(block.id);
          selectCell(block, td, ri, ci);
        });
        input.addEventListener("pointerdown", () => selectCell(block, td, ri, ci));
        input.addEventListener("input", () => {
          const next = cellObject(rows[ri][ci]);
          next.text = input.value;
          if (!next.valign) next.valign = "middle";
          rows[ri][ci] = next;
          try { if (typeof rebuildTableHtml === "function") rebuildTableHtml(block); } catch (_) {}
          try { if (typeof markDirty === "function") markDirty(); } catch (_) {}
        });
        td.appendChild(input);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
  }

  // live_preview.js defines tableEditor globally before this file loads.
  if (typeof tableEditor === "function") tableEditor = enhancedTableEditor;

  document.addEventListener("pointerdown", event => {
    if (state.menu && !state.menu.contains(event.target) && !event.target.closest?.(".table-cell-handle")) closeMenu();
    if (!event.target.closest?.(".telegram-table")) clearSelectionVisuals();
  }, true);
  window.addEventListener("resize", positionMenu, {passive:true});
  window.addEventListener("scroll", positionMenu, {passive:true, capture:true});
})();
