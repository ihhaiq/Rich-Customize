// Beta 0.3.6 — true nested editing inside Details blocks.
(() => {
  const TEXT_TYPES = new Set([
    "paragraph", "text", "caption", "heading", "footer", "preformatted",
    "blockquote", "pullquote", "anchor", "mathematical_expression",
  ]);

  function orderedChildren(detailsBlock) {
    const d = detailsBlock.data || (detailsBlock.data = {});
    if (!Array.isArray(d.children)) d.children = [];
    d.children.sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
    d.children.forEach((child, index) => {
      if (child && typeof child === "object") child.position = index;
    });
    return d.children;
  }

  function ensureFirstParagraph(detailsBlock) {
    const children = orderedChildren(detailsBlock);
    if (children.length) return children;
    const paragraph = defaultBlock("paragraph");
    paragraph.position = 0;
    children.push(paragraph);
    return children;
  }

  function syncChildPositions(detailsBlock) {
    orderedChildren(detailsBlock).forEach((child, index) => child.position = index);
  }

  function focusNestedChild(parentId, childId) {
    requestAnimationFrame(() => {
      const parent = blocksEl?.querySelector?.(`.block[data-id="${parentId}"]`);
      if (!parent) return;
      const child = Array.from(parent.querySelectorAll(".details-child-editor[data-child-id]"))
        .find(element => element.dataset.childId === String(childId));
      const target = child?.querySelector?.('[contenteditable="true"],input,textarea,button');
      target?.focus?.();
      target?.scrollIntoView?.({block:"center", behavior:"smooth"});
    });
  }

  function addNestedBlock(detailsBlock, type, at = null, initialText = "") {
    const children = orderedChildren(detailsBlock);
    const child = defaultBlock(type);
    if (initialText && TEXT_TYPES.has(type)) applyText(child, initialText);
    const index = Number.isInteger(at)
      ? Math.max(0, Math.min(at, children.length))
      : children.length;
    children.splice(index, 0, child);
    syncChildPositions(detailsBlock);
    markDirty();
    pushHistory();
    renderBlocks();
    focusNestedChild(detailsBlock.id, child.id);
    return child;
  }

  function replaceNestedBlock(detailsBlock, childId, type) {
    const children = orderedChildren(detailsBlock);
    const index = children.findIndex(child => String(child?.id) === String(childId));
    if (index < 0) return null;
    const replacement = defaultBlock(type);
    replacement.position = index;
    children.splice(index, 1, replacement);
    syncChildPositions(detailsBlock);
    markDirty();
    pushHistory();
    renderBlocks();
    focusNestedChild(detailsBlock.id, replacement.id);
    return replacement;
  }

  function removeNestedBlock(detailsBlock, childId) {
    const children = orderedChildren(detailsBlock);
    const index = children.findIndex(child => String(child?.id) === String(childId));
    if (index < 0) return;
    children.splice(index, 1);
    if (!children.length) {
      const paragraph = defaultBlock("paragraph");
      paragraph.position = 0;
      children.push(paragraph);
    }
    syncChildPositions(detailsBlock);
    markDirty();
    pushHistory();
    renderBlocks();
  }

  function moveNestedBlock(detailsBlock, childId, delta) {
    const children = orderedChildren(detailsBlock);
    const index = children.findIndex(child => String(child?.id) === String(childId));
    const next = index + delta;
    if (index < 0 || next < 0 || next >= children.length) return;
    [children[index], children[next]] = [children[next], children[index]];
    syncChildPositions(detailsBlock);
    markDirty();
    pushHistory();
    renderBlocks();
    focusNestedChild(detailsBlock.id, childId);
  }

  function menuBounds() {
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0;
    const top = vv?.offsetTop || 0;
    const width = vv?.width || window.innerWidth;
    const height = vv?.height || window.innerHeight;
    return {left, top, right:left + width, bottom:top + height};
  }

  function placeNestedMenu(menu, anchor) {
    if (!menu || !anchor) return;
    const bounds = menuBounds();
    const margin = 10;
    menu.style.visibility = "hidden";
    menu.style.left = `${bounds.left + margin}px`;
    menu.style.top = `${bounds.top + margin}px`;
    menu.classList.remove("hidden");
    const rect = menu.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    let left = document.dir === "rtl" ? anchorRect.right - rect.width : anchorRect.left;
    left = Math.max(bounds.left + margin, Math.min(left, bounds.right - rect.width - margin));
    const below = anchorRect.bottom + 7;
    const above = anchorRect.top - rect.height - 7;
    let top = below;
    if (below + rect.height > bounds.bottom - margin && above >= bounds.top + margin) top = above;
    top = Math.max(bounds.top + margin, Math.min(top, bounds.bottom - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
  }

  function filteredNestedBlocks(query = "") {
    const q = String(query || "").trim().toLowerCase();
    return BLOCKS.filter(item => !q || `${item.type} ${item.label} ${item.keys || ""}`.toLowerCase().includes(q));
  }

  function makeNestedCommandMenu(detailsBlock, anchor, replaceChildId = null, query = "") {
    const menu = document.createElement("aside");
    menu.className = "popup-menu details-command-menu";
    menu.setAttribute("aria-label", mt("details.add_inner"));
    const list = document.createElement("div");
    list.className = "menu-list";
    const items = filteredNestedBlocks(query);

    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = mt("editor.no_block_match");
      list.appendChild(empty);
    }

    items.forEach((item, index) => {
      const button = menuButton(item.icon, item.label, item.desc || "", () => {
        menu.remove();
        if (replaceChildId) replaceNestedBlock(detailsBlock, replaceChildId, item.type);
        else addNestedBlock(detailsBlock, item.type);
      }, index === 0 ? "active" : "");
      list.appendChild(button);
    });

    menu.appendChild(list);
    document.body.appendChild(menu);
    placeNestedMenu(menu, anchor);

    const close = event => {
      if (menu.contains(event.target) || anchor.contains?.(event.target)) return;
      menu.remove();
      document.removeEventListener("pointerdown", close, true);
    };
    setTimeout(() => document.addEventListener("pointerdown", close, true), 0);
    return menu;
  }

  function textChildEditor(detailsBlock, child) {
    const d = child.data || (child.data = {});
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.spellcheck = true;
    editor.className = "details-child-text live-editor";
    if (child.type === "heading") {
      const level = Math.max(1, Math.min(6, Number(d.size || 2)));
      editor.classList.add(`live-heading-${level}`);
    } else if (child.type === "footer") editor.classList.add("live-footer");
    else if (child.type === "preformatted") editor.classList.add("live-pre");
    else if (child.type === "blockquote" || child.type === "pullquote") {
      editor.classList.add("live-quote");
      if (child.type === "pullquote") editor.classList.add("live-pullquote");
    } else editor.classList.add("live-paragraph");

    editor.dataset.placeholder = child.type === "paragraph" ? mt("details.write_inside") : info(child.type).label;
    editor.textContent = blockText(child);

    let commandMenu = null;
    const closeCommandMenu = () => {
      commandMenu?.remove?.();
      commandMenu = null;
    };
    const refreshCommandMenu = value => {
      closeCommandMenu();
      if (child.type !== "paragraph" || !value.startsWith("/")) return;
      commandMenu = makeNestedCommandMenu(detailsBlock, editor, child.id, value.slice(1));
    };

    editor.addEventListener("focus", () => selectBlock(detailsBlock.id));
    editor.addEventListener("input", () => {
      const value = editor.innerText.replace(/\r/g, "");
      applyText(child, value);
      markDirty();
      refreshCommandMenu(value.trim());
    });
    editor.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        closeCommandMenu();
        return;
      }
      if (event.key !== "Enter" || event.shiftKey) return;
      const value = editor.innerText.replace(/\r/g, "").trim();
      if (child.type === "paragraph" && value.startsWith("/")) {
        const first = filteredNestedBlocks(value.slice(1))[0];
        if (first) {
          event.preventDefault();
          closeCommandMenu();
          replaceNestedBlock(detailsBlock, child.id, first.type);
        }
        return;
      }
      if (child.type === "paragraph") {
        event.preventDefault();
        const children = orderedChildren(detailsBlock);
        const index = children.findIndex(item => String(item?.id) === String(child.id));
        addNestedBlock(detailsBlock, "paragraph", index + 1);
      }
    });
    editor.addEventListener("blur", () => setTimeout(closeCommandMenu, 160));
    return editor;
  }

  function listChildEditor(detailsBlock, child) {
    const d = child.data || (child.data = {});
    const kind = d.kind || "bullet";
    const list = document.createElement(kind === "numbered" ? "ol" : "ul");
    list.className = `telegram-list details-inner-list${kind === "checklist" ? " telegram-checklist" : ""}`;
    const values = (d.items || [{text:""}]).map(item => typeof item === "object" ? String(item.text || "") : String(item || ""));

    function sync() {
      const lines = Array.from(list.querySelectorAll('[contenteditable="true"]'), el => el.innerText.replace(/\r/g, ""));
      d.items = lines.map((text, index) => kind === "checklist"
        ? {text, has_checkbox:true, is_checked:false}
        : kind === "numbered"
          ? {text, value:index + 1, type:"1"}
          : {text});
      d.text = lines.join("\n");
      const tag = kind === "numbered" ? "ol" : "ul";
      d.html = `<${tag}>${lines.map(text => `<li>${escapeHtml(text)}</li>`).join("")}</${tag}>`;
      markDirty();
    }

    values.forEach(value => {
      const li = document.createElement("li");
      const input = document.createElement("div");
      input.contentEditable = "true";
      input.spellcheck = true;
      input.textContent = value;
      input.addEventListener("focus", () => selectBlock(detailsBlock.id));
      input.addEventListener("input", sync);
      input.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.shiftKey) return;
        event.preventDefault();
        const next = document.createElement("li");
        const nextInput = document.createElement("div");
        nextInput.contentEditable = "true";
        nextInput.addEventListener("focus", () => selectBlock(detailsBlock.id));
        nextInput.addEventListener("input", sync);
        next.appendChild(nextInput);
        li.after(next);
        nextInput.focus();
        sync();
      });
      li.appendChild(input);
      list.appendChild(li);
    });
    return list;
  }

  function tableChildEditor(detailsBlock, child) {
    const d = child.data || (child.data = {});
    const wrap = document.createElement("div");
    wrap.className = "telegram-table details-inner-table";
    if (d.is_bordered === false) wrap.classList.add("no-borders");
    if (d.is_striped) wrap.classList.add("striped");
    if (d.is_compact) wrap.classList.add("compact");
    const table = document.createElement("table");
    const rows = d.rows || (d.rows = [["", ""], ["", ""]]);
    rows.forEach((row, ri) => {
      const tr = document.createElement("tr");
      row.forEach((raw, ci) => {
        const cell = typeof raw === "object" ? raw : {text:String(raw ?? "")};
        const td = document.createElement("td");
        if (cell.colspan) td.colSpan = Number(cell.colspan);
        if (cell.rowspan) td.rowSpan = Number(cell.rowspan);
        if (cell.align) td.style.textAlign = cell.align;
        const input = document.createElement("input");
        input.value = cell.text || "";
        input.placeholder = `${ri + 1}:${ci + 1}`;
        input.addEventListener("focus", () => selectBlock(detailsBlock.id));
        input.addEventListener("input", () => {
          rows[ri][ci] = typeof raw === "object" ? {...raw, text:input.value} : input.value;
          rebuildTableHtml(child);
          markDirty();
        });
        td.appendChild(input);
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
  }

  function nestedDetailsEditor(parentDetails, child, depth) {
    const d = child.data || (child.data = {});
    if (!Array.isArray(d.children)) d.children = [];
    if (!d.children.length) {
      const paragraph = defaultBlock("paragraph");
      paragraph.position = 0;
      d.children.push(paragraph);
    }
    const section = document.createElement("div");
    section.className = "details-nested-editable";
    const input = document.createElement("input");
    input.className = "details-nested-title";
    input.value = stripHtml(d.summary_html || "") || d.summary_text || mt("details.title");
    input.addEventListener("focus", () => selectBlock(parentDetails.id));
    input.addEventListener("input", () => {
      d.summary_text = input.value || mt("details.title");
      d.summary_html = escapeHtml(d.summary_text);
      markDirty();
    });
    section.appendChild(input);
    if (depth < 2) {
      d.children.forEach(grandchild => section.appendChild(buildNestedChild(parentDetails, grandchild, depth + 1)));
    }
    return section;
  }

  function mediaChildEditor(detailsBlock, child) {
    const wrap = document.createElement("div");
    wrap.className = "details-inner-media";
    const editor = mediaEditor(child);
    editor.addEventListener("click", () => setTimeout(() => selectBlock(detailsBlock.id), 0), true);
    wrap.appendChild(editor);
    return wrap;
  }

  function buildNestedChild(detailsBlock, child, depth = 0) {
    const wrapper = document.createElement("div");
    wrapper.className = "details-child-editor";
    wrapper.dataset.childId = child.id;
    wrapper.dataset.parentDetailsId = detailsBlock.id;
    wrapper.dataset.childType = child.type;

    let editor;
    if (TEXT_TYPES.has(child.type)) editor = textChildEditor(detailsBlock, child);
    else if (child.type === "list") editor = listChildEditor(detailsBlock, child);
    else if (child.type === "table") editor = tableChildEditor(detailsBlock, child);
    else if (child.type === "divider") {
      editor = document.createElement("div");
      editor.className = "divider-line";
    } else if (child.type === "details") editor = nestedDetailsEditor(detailsBlock, child, depth);
    else editor = mediaChildEditor(detailsBlock, child);

    wrapper.appendChild(editor);

    const actions = document.createElement("div");
    actions.className = "details-child-actions";
    const children = orderedChildren(detailsBlock);
    const index = children.findIndex(item => String(item?.id) === String(child.id));
    const up = document.createElement("button");
    up.type = "button";
    MiniAppIcons.mount(up,"up");
    up.disabled = index <= 0;
    up.setAttribute("aria-label", mt("action.move_up"));
    up.addEventListener("click", event => {event.stopPropagation(); moveNestedBlock(detailsBlock, child.id, -1);});
    const down = document.createElement("button");
    down.type = "button";
    MiniAppIcons.mount(down,"down");
    down.disabled = index >= children.length - 1;
    down.setAttribute("aria-label", mt("action.move_down"));
    down.addEventListener("click", event => {event.stopPropagation(); moveNestedBlock(detailsBlock, child.id, 1);});
    const remove = document.createElement("button");
    remove.type = "button";
    MiniAppIcons.mount(remove,"delete");
    remove.className = "danger";
    remove.setAttribute("aria-label", mt("details.delete_inner"));
    remove.addEventListener("click", event => {event.stopPropagation(); removeNestedBlock(detailsBlock, child.id);});
    actions.append(up, down, remove);
    wrapper.appendChild(actions);

    wrapper.addEventListener("focusin", () => {
      wrapper.classList.add("is-active");
      selectBlock(detailsBlock.id);
    });
    wrapper.addEventListener("focusout", event => {
      if (!wrapper.contains(event.relatedTarget)) wrapper.classList.remove("is-active");
    });
    return wrapper;
  }

  detailsEditor = function(block) {
    const d = block.data || (block.data = {});
    ensureFirstParagraph(block);
    if (typeof d.is_open !== "boolean") {
      d.is_open = typeof d.expanded === "boolean" ? d.expanded : true;
    }
    d.expanded = d.is_open;

    const shell = document.createElement("section");
    shell.className = `telegram-details telegram-details-v036${d.is_open ? " is-expanded" : " is-collapsed"}`;

    const header = document.createElement("div");
    header.className = "details-header-row";
    const titleSide = document.createElement("div");
    titleSide.className = "details-title-side";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "details-toggle-btn";
    toggle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 9 5 5 5-5"/></svg>';
    const input = document.createElement("input");
    input.className = "details-summary-live details-title-input";
    input.value = stripHtml(d.summary_html || "") || d.summary_text || mt("details.title");
    input.placeholder = mt("details.title_placeholder");
    input.addEventListener("focus", () => selectBlock(block.id));
    input.addEventListener("click", event => event.stopPropagation());
    input.addEventListener("input", () => {
      const value = input.value || mt("details.title");
      d.summary_text = value;
      d.summary_html = escapeHtml(value);
      markDirty();
    });
    titleSide.append(toggle, input);

    const state = document.createElement("span");
    state.className = "details-expand-state";
    const body = document.createElement("div");
    body.className = "details-body details-live-body details-edit-body";
    const childrenHost = document.createElement("div");
    childrenHost.className = "details-children-host";
    orderedChildren(block).forEach(child => childrenHost.appendChild(buildNestedChild(block, child)));

    const addRow = document.createElement("div");
    addRow.className = "details-add-row";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "details-add-block-btn";
    add.innerHTML = '<span class="details-add-icon"></span><span class="details-add-label"></span>';
    MiniAppIcons.mount(add.querySelector(".details-add-icon"),"add");
    add.querySelector(".details-add-label").textContent=mt("details.add_inner");
    add.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectBlock(block.id);
      makeNestedCommandMenu(block, add);
    });
    addRow.appendChild(add);
    body.append(childrenHost, addRow);

    function setOpen(open, persist = true) {
      d.is_open = Boolean(open);
      d.expanded = d.is_open;
      shell.classList.toggle("is-expanded", d.is_open);
      shell.classList.toggle("is-collapsed", !d.is_open);
      toggle.setAttribute("aria-expanded", String(d.is_open));
      toggle.setAttribute("aria-label", d.is_open ? mt("details.collapse") : mt("details.expand"));
      state.textContent = d.is_open ? mt("details.expanded") : mt("details.collapsed");
      body.hidden = !d.is_open;
      if (persist) markDirty();
    }

    toggle.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      selectBlock(block.id);
      setOpen(!d.is_open);
      window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
    });

    header.append(titleSide, state);
    shell.append(header, body);
    setOpen(d.is_open, false);
    return shell;
  };

  window.RichDetailsNestedEditor = {
    addNestedBlock,
    replaceNestedBlock,
    removeNestedBlock,
    moveNestedBlock,
  };
})();
