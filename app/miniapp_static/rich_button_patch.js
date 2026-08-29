// Beta 0.3.8 — Rich Button pseudo-blocks rendered as Telegram inline buttons.
(() => {
  const TYPE_INFO = {
    user: {label:"مستخدم", icon:"👤", action:"تحديد مستخدم"},
    url: {label:"رابط", icon:"🔗", action:"تعديل الرابط"},
    callback_data: {label:"Callback data", icon:"↪", action:"ربط بصفحة محفوظة"},
    page_callback: {label:"CBD / صفحة", icon:"📚", action:"ربط بصفحة محفوظة"},
    copy: {label:"نسخ", icon:"📋", action:"تعديل نص النسخ"},
    popup: {label:"Popup", icon:"💬", action:"تعديل نص التنبيه"},
    web_app: {label:"Web App", icon:"🌐", action:"تعديل رابط Web App"},
    login_url: {label:"Login URL", icon:"🔐", action:"تعديل Login URL"},
    switch_inline_query: {label:"بحث Inline", icon:"⌕", action:"تعديل نص البحث"},
    switch_inline_query_current_chat: {label:"بحث هنا", icon:"⌖", action:"تعديل نص البحث هنا"},
    disabled: {label:"معطّل", icon:"⊘", action:null},
  };

  function cleanTitle(value) {
    return String(value || "زر").replace(/[{}\n]/g, " ").trim().slice(0, 64) || "زر";
  }

  function markerFor(rb) {
    const title = cleanTitle(rb.title);
    const type = String(rb.button_type || "url");
    const value = String(rb.value || "");
    const color = ["r","b","p","g"].includes(rb.color) ? ` #${rb.color}` : "";
    const typeName = type === "page_callback" ? "cbd" : type;
    return `{${title}:${typeName}:${value}${color}}`;
  }

  function isConfigured(rb) {
    const type = String(rb.button_type || "url");
    const value = String(rb.value || "");
    if (type === "disabled") return true;
    if (type === "switch_inline_query" || type === "switch_inline_query_current_chat") return true;
    if (type === "user") return /^\d+$/.test(value);
    return value.length > 0;
  }

  function syncBlock(block) {
    const d = block.data || (block.data = {});
    const rb = d._rich_button;
    if (!rb) return;
    rb.title = cleanTitle(rb.title);
    rb.configured = isConfigured(rb);
    const marker = markerFor(rb);
    d.text = marker;
    d.html = `<p>${escapeHtml(marker)}</p>`;
    d.rich_text = null;
    d._draft = !rb.configured;
  }

  function createRichButton(type) {
    if (!current) return null;
    const block = defaultBlock("paragraph");
    const typeInfo = TYPE_INFO[type] || TYPE_INFO.url;
    block.data._rich_button = {
      button_type: type,
      title: typeInfo.label === "Callback data" ? "زر" : typeInfo.label,
      value: "",
      color: null,
      configured: type === "disabled" || type.startsWith("switch_inline_query"),
    };
    syncBlock(block);
    const index = Number.isInteger(insertIndex)
      ? Math.max(0, Math.min(insertIndex, current.blocks.length))
      : current.blocks.length;
    current.blocks.splice(index, 0, block);
    normalizePositions();
    selectedBlockId = block.id;
    insertIndex = index + 1;
    hideMenus();
    renderBlocks();
    markDirty();
    pushHistory();
    requestAnimationFrame(() => {
      const target = blocksEl.querySelector(`[data-id="${block.id}"]`);
      target?.scrollIntoView({block:"center", behavior:"smooth"});
    });
    return block;
  }

  function buttonStyleClass(rb) {
    if (rb.button_type === "disabled") return "is-disabled";
    return ({r:"is-danger", g:"is-success", b:"is-primary", p:"is-primary"})[rb.color] || "is-default";
  }

  function richButtonEditor(block) {
    const rb = block.data?._rich_button || {};
    const wrap = document.createElement("div");
    wrap.className = "rich-button-live-wrap";
    const visual = document.createElement("div");
    visual.className = `rich-button-live ${buttonStyleClass(rb)}${isConfigured(rb) ? "" : " is-unconfigured"}`;
    visual.textContent = cleanTitle(rb.title);
    visual.setAttribute("role", "button");
    visual.setAttribute("aria-label", `${cleanTitle(rb.title)} · ${TYPE_INFO[rb.button_type]?.label || rb.button_type}`);
    const meta = document.createElement("div");
    meta.className = "rich-button-meta";
    const type = TYPE_INFO[rb.button_type] || {icon:"▣",label:rb.button_type || "زر"};
    const target = rb.target_title || rb.target_label || (rb.value && rb.button_type !== "callback_data" ? rb.value : "");
    meta.textContent = `${type.icon} ${type.label}${target ? ` · ${target}` : isConfigured(rb) ? "" : " · يحتاج تخصيص"}`;
    wrap.append(visual, meta);
    return wrap;
  }

  const baseTextEditor = textEditor;
  textEditor = function(block) {
    if (block?.type === "paragraph" && block.data?._rich_button) return richButtonEditor(block);
    return baseTextEditor(block);
  };

  function blockElement(block) {
    return Array.from(blocksEl?.querySelectorAll?.(".block[data-id]") || [])
      .find(el => String(el.dataset.id) === String(block.id));
  }

  function placeFloating(menu, anchor) {
    const vv = window.visualViewport;
    const left0 = vv?.offsetLeft || 0;
    const top0 = vv?.offsetTop || 0;
    const width = vv?.width || window.innerWidth;
    const height = vv?.height || window.innerHeight;
    const margin = 10;
    menu.style.visibility = "hidden";
    menu.style.left = `${left0 + margin}px`;
    menu.style.top = `${top0 + margin}px`;
    document.body.appendChild(menu);
    const rect = menu.getBoundingClientRect();
    const ar = anchor?.getBoundingClientRect?.() || {left:left0+width/2,right:left0+width/2,top:top0+60,bottom:top0+60};
    let left = ar.right - rect.width;
    left = Math.max(left0 + margin, Math.min(left, left0 + width - rect.width - margin));
    let top = ar.bottom + 8;
    if (top + rect.height > top0 + height - margin) top = ar.top - rect.height - 8;
    top = Math.max(top0 + margin, Math.min(top, top0 + height - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
  }

  function openGlassEditor(block, field, title, placeholder = "") {
    document.querySelectorAll(".rich-button-editor-pop").forEach(el => el.remove());
    const rb = block.data._rich_button;
    const pop = document.createElement("aside");
    pop.className = "popup-menu rich-button-editor-pop";
    const heading = document.createElement("strong");
    heading.className = "rich-button-editor-title";
    heading.textContent = title;
    const input = document.createElement(field === "value" && rb.button_type === "popup" ? "textarea" : "input");
    input.className = "rich-button-editor-input";
    input.placeholder = placeholder;
    input.value = field === "title" ? cleanTitle(rb.title) : String(rb.value || "");
    if (input.tagName === "INPUT" && ["url","web_app","login_url"].includes(rb.button_type)) input.type = "url";
    const actions = document.createElement("div");
    actions.className = "rich-button-editor-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "إلغاء";
    const save = document.createElement("button");
    save.type = "button";
    save.className = "primary-soft";
    save.textContent = "حفظ";
    cancel.onclick = () => pop.remove();
    save.onclick = () => {
      if (field === "title") rb.title = cleanTitle(input.value);
      else rb.value = String(input.value || "").trim();
      rb.target_title = null;
      rb.target_page_id = null;
      syncBlock(block);
      markDirty();
      pushHistory();
      renderBlocks();
      pop.remove();
    };
    actions.append(cancel, save);
    pop.append(heading, input, actions);
    placeFloating(pop, blockElement(block));
    requestAnimationFrame(() => {input.focus(); input.select?.();});
  }

  async function chooseSavedPage(block) {
    document.querySelectorAll(".rich-button-page-pop").forEach(el => el.remove());
    let data;
    try { data = await api("/miniapp/api/pages"); }
    catch (error) { toast(`تعذر تحميل الصفحات: ${error.message}`); return; }
    const pages = Array.isArray(data.pages) ? data.pages : [];
    if (!pages.length) { toast("ما عندك صفحات محفوظة للربط"); return; }
    const pop = document.createElement("aside");
    pop.className = "popup-menu rich-button-page-pop";
    const head = document.createElement("strong");
    head.className = "rich-button-editor-title";
    head.textContent = "اختر الصفحة المرتبطة";
    pop.appendChild(head);
    const list = document.createElement("div");
    list.className = "menu-list";
    pages.forEach(page => {
      const btn = menuButton("📄", page.title || page.page_id, page.page_id, () => {
        const rb = block.data._rich_button;
        rb.target_page_id = page.page_id;
        rb.target_title = page.title || page.page_id;
        rb.value = rb.button_type === "callback_data" ? `r:cbd:${page.page_id}` : page.page_id;
        syncBlock(block);
        markDirty();
        pushHistory();
        renderBlocks();
        pop.remove();
        toast(`تم ربط الزر بصفحة «${page.title || page.page_id}»`);
      });
      list.appendChild(btn);
    });
    pop.appendChild(list);
    placeFloating(pop, blockElement(block));
  }

  async function requestUser(block) {
    try {
      syncBlock(block);
      markDirty();
      await flushSave();
      if (!current?.page_id) throw new Error("تعذر حفظ الصفحة");
      await api("/miniapp/api/rich-buttons/user-picker", {
        method:"POST",
        body:JSON.stringify({page_id:current.page_id, block_id:block.id}),
      });
      toast("راح ينغلق التطبيق؛ اختَر المستخدم من محادثة البوت");
      setTimeout(() => {
        try { tg?.close?.(); } catch (_) {}
      }, 650);
    } catch (error) {
      toast(`تعذر فتح اختيار المستخدم: ${error.message}`);
    }
  }

  function openColorMenu(block) {
    const rb = block.data._rich_button;
    blockActions.innerHTML = "";
    blockMenuTitle.textContent = "لون الزر";
    [
      ["○","افتراضي",null],
      ["●","أزرق","b"],
      ["●","أخضر","g"],
      ["●","أحمر","r"],
    ].forEach(([icon,label,color]) => {
      blockActions.appendChild(menuButton(icon,label,"",() => {
        rb.color = color;
        syncBlock(block);
        renderBlocks();
        markDirty();
        pushHistory();
        hideMenus();
      }));
    });
    blockMenu.classList.remove("hidden");
  }

  function openRichButtonMenu(block) {
    const rb = block.data._rich_button;
    slashMenu.classList.add("hidden");
    blockActions.innerHTML = "";
    blockMenuTitle.textContent = `${TYPE_INFO[rb.button_type]?.icon || "▣"} زر غني`;
    blockMenu.classList.add("rich-button-menu");

    blockActions.appendChild(menuButton("✎","تعديل اسم الزر","",() => {
      hideMenus();
      openGlassEditor(block,"title","اسم الزر","اكتب عنوان الزر");
    }));

    const type = TYPE_INFO[rb.button_type] || TYPE_INFO.url;
    if (rb.button_type === "user") {
      blockActions.appendChild(menuButton("👤","تحديد مستخدم",rb.target_label || "اختيار مستخدم من Telegram",() => {
        hideMenus();
        requestUser(block);
      }));
    } else if (rb.button_type === "callback_data" || rb.button_type === "page_callback") {
      blockActions.appendChild(menuButton("📚","ربط بصفحة محفوظة",rb.target_title || "اختر صفحة من صفحاتك",() => {
        hideMenus();
        chooseSavedPage(block);
      }));
    } else if (type.action) {
      const placeholder = {
        url:"https://example.com",
        copy:"النص المطلوب نسخه",
        popup:"نص التنبيه",
        web_app:"https://example.com/app",
        login_url:"https://example.com/login",
        switch_inline_query:"كلمة البحث",
        switch_inline_query_current_chat:"كلمة البحث هنا",
      }[rb.button_type] || "القيمة";
      blockActions.appendChild(menuButton(type.icon,type.action,rb.value || "",() => {
        hideMenus();
        openGlassEditor(block,"value",type.action,placeholder);
      }));
    }

    blockActions.appendChild(menuButton("◉","تغيير اللون","",() => openColorMenu(block)));
    blockActions.appendChild(separator());

    const index = current.blocks.findIndex(item => String(item.id) === String(block.id));
    const up = menuButton("↑","تحريك للأعلى","",() => {moveBlock(block.id,-1);hideMenus();});
    up.disabled = index <= 0;
    blockActions.appendChild(up);
    const down = menuButton("↓","تحريك للأسفل","",() => {moveBlock(block.id,1);hideMenus();});
    down.disabled = index < 0 || index >= current.blocks.length - 1;
    blockActions.appendChild(down);
    blockActions.appendChild(separator());
    blockActions.appendChild(menuButton("⌫","حذف البلوك","",() => {deleteBlock(block.id);hideMenus();},"danger"));
    blockMenu.classList.remove("hidden");
  }

  const baseOpenBlockMenu = openBlockMenu;
  openBlockMenu = function(block) {
    if (block?.type === "paragraph" && block.data?._rich_button) return openRichButtonMenu(block);
    blockMenu.classList.remove("rich-button-menu");
    return baseOpenBlockMenu(block);
  };

  window.RichButtonEditor = {
    types: TYPE_INFO,
    create: createRichButton,
    sync: syncBlock,
    openMenu: openRichButtonMenu,
  };
})();
