// Beta 0.2 live-preview layer: the rendered block is also the editor.
function liveEditable(block, className, placeholder) {
  const el = document.createElement("div");
  el.className = `live-editor ${className}`;
  el.contentEditable = "true";
  el.spellcheck = true;
  el.dataset.placeholder = placeholder || info(block.type).label;
  el.textContent = blockText(block);
  el.addEventListener("focus", () => selectBlock(block.id));
  el.addEventListener("input", () => {
    applyText(block, el.innerText.replace(/\r/g, ""));
    markDirty();
  });
  return el;
}

function quoteWithCredit(block, className, quotePlaceholder) {
  const wrap = document.createElement("div");
  wrap.className = "live-quote-wrap";
  wrap.appendChild(liveEditable(block, className, quotePlaceholder));

  const credit = document.createElement("div");
  credit.className = "live-editor live-credit";
  credit.contentEditable = "true";
  credit.spellcheck = true;
  credit.dataset.placeholder = "إضافة الكاتب";
  credit.textContent = block.data?.credit_text || "";
  credit.addEventListener("focus", () => selectBlock(block.id));
  credit.addEventListener("input", () => {
    const d = block.data || (block.data = {});
    d.credit_text = credit.innerText.replace(/\r/g, "");
    d.credit_html = escapeHtml(d.credit_text);
    markDirty();
  });
  wrap.appendChild(credit);
  return wrap;
}

textEditor = function(block) {
  if (block.type === "heading") {
    const level = Math.max(1, Math.min(6, Number(block.data?.size || 2)));
    return liveEditable(block, `live-heading-${level}`, `العنوان ${level}`);
  }
  if (block.type === "footer") return liveEditable(block, "live-footer", "تذييل");
  if (block.type === "preformatted") return liveEditable(block, "live-pre", "اكتب الكود…");
  if (block.type === "blockquote") return quoteWithCredit(block, "live-quote", "اكتب الاقتباس…");
  if (block.type === "pullquote") return quoteWithCredit(block, "live-quote live-pullquote", "اكتب الاقتباس البارز…");
  return liveEditable(block, "live-paragraph", info(block.type).label);
};

detailsEditor = function(block) {
  const d = block.data || (block.data = {});
  const details = document.createElement("details");
  details.className = "telegram-details";
  details.open = true;

  const summary = document.createElement("summary");
  const input = document.createElement("input");
  input.className = "details-summary-live";
  input.value = stripHtml(d.summary_html) || d.summary_text || "تفاصيل";
  input.placeholder = "عنوان التفاصيل";
  input.addEventListener("click", event => event.stopPropagation());
  input.addEventListener("focus", () => selectBlock(block.id));
  input.addEventListener("input", () => {
    const value = input.value || "تفاصيل";
    d.summary_text = value;
    d.summary_html = escapeHtml(value);
    markDirty();
  });
  summary.appendChild(input);

  const body = document.createElement("div");
  body.className = "details-body";
  const count = (d.children || []).length;
  body.textContent = count ? `${count} Block داخل التفاصيل` : "ماكو محتوى داخل التفاصيل بعد";
  details.append(summary, body);
  return details;
};

listEditor = function(block) {
  const d = block.data || (block.data = {});
  const kind = d.kind || "bullet";
  const list = document.createElement(kind === "numbered" ? "ol" : "ul");
  list.className = `telegram-list${kind === "checklist" ? " telegram-checklist" : ""}`;
  const values = (d.items || [{text:""}]).map(item => typeof item === "object" ? (item.text || "") : String(item));

  function sync() {
    const lines = Array.from(list.querySelectorAll("[contenteditable]"), el => el.innerText.replace(/\r/g, ""));
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
    const editor = document.createElement("div");
    editor.contentEditable = "true";
    editor.textContent = value;
    editor.addEventListener("focus", () => selectBlock(block.id));
    editor.addEventListener("input", sync);
    editor.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        const next = document.createElement("li");
        const nextEditor = document.createElement("div");
        nextEditor.contentEditable = "true";
        nextEditor.addEventListener("focus", () => selectBlock(block.id));
        nextEditor.addEventListener("input", sync);
        next.appendChild(nextEditor);
        li.after(next);
        nextEditor.focus();
        sync();
      }
    });
    li.appendChild(editor);
    list.appendChild(li);
  });
  return list;
};

tableEditor = function(block) {
  const d = block.data || (block.data = {});
  const wrap = document.createElement("div");
  wrap.className = "telegram-table";
  if (d.is_bordered === false) wrap.classList.add("no-borders");
  if (d.is_striped) wrap.classList.add("striped");
  if (d.is_compact) wrap.classList.add("compact");
  const table = document.createElement("table");
  const rows = d.rows || [];
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
      input.addEventListener("focus", () => selectBlock(block.id));
      input.addEventListener("input", () => {
        rows[ri][ci] = typeof raw === "object" ? {...raw, text:input.value} : input.value;
        rebuildTableHtml(block);
        markDirty();
      });
      td.appendChild(input);
      tr.appendChild(td);
    });
    table.appendChild(tr);
  });
  wrap.appendChild(table);
  return wrap;
};

// Render the message as one continuous Telegram-like document. Administrative
// controls appear only on the selected block.
renderBlocks = function() {
  blocksEl.innerHTML = "";
  starter.classList.toggle("hidden", !!current?.blocks?.length);
  (current?.blocks || []).forEach(block => {
    const article = document.createElement("article");
    article.className = `block${selectedBlockId === block.id ? " selected" : ""}`;
    article.dataset.id = block.id;
    const row = document.createElement("div");
    row.className = "block-row";
    const main = document.createElement("div");
    main.className = "block-main";

    let editor;
    if (["paragraph","heading","footer","preformatted","blockquote","pullquote","anchor","mathematical_expression"].includes(block.type)) editor = textEditor(block);
    else if (block.type === "details") editor = detailsEditor(block);
    else if (block.type === "list") editor = listEditor(block);
    else if (block.type === "table") editor = tableEditor(block);
    else if (block.type === "divider") { editor = document.createElement("div"); editor.className = "divider-line"; }
    else editor = mediaEditor(block);

    main.appendChild(editor);
    const tools = document.createElement("div");
    tools.className = "block-tools";
    const more = document.createElement("button");
    more.type = "button";
    more.className = "mini-btn";
    more.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
    more.setAttribute("aria-label", `إعدادات ${info(block.type).label}`);
    more.addEventListener("click", event => {
      event.stopPropagation();
      selectBlock(block.id);
      openBlockMenu(block);
    });
    tools.appendChild(more);
    row.append(main, tools);
    article.appendChild(row);
    article.addEventListener("click", () => selectBlock(block.id));
    blocksEl.appendChild(article);
  });
};
