// Beta 0.3.8 — Telegram-style Aa menu with Heading and Rich Button submenus.
(() => {
  const textButton = document.querySelector('.composer-toolbar [data-tool="text"]');
  if (!textButton) return;

  let rootMenu = null;
  let headingMenu = null;
  let buttonMenu = null;
  let submenuRow = null;

  const ROOT_ITEMS = [
    {kind:"heading", icon:"H", label:"العنوان", arrow:true},
    {type:"paragraph", icon:"T", label:"Text", shortcut:"Ctrl+Shift+B"},
    {type:"blockquote", icon:"❝", label:"اقتباس", shortcut:"Ctrl+Shift+."},
    {type:"pullquote", icon:"❞", label:"اقتباس مميز"},
    {type:"preformatted", icon:"</>", label:"نص برمجي", shortcut:"Ctrl+Shift+M"},
    {type:"footer", icon:"≡", label:"التذييل"},
    {type:"divider", icon:"—", label:"Divider"},
    {kind:"rich_button", icon:"▣", label:"زر غني", arrow:true},
  ];

  function viewportBounds() {
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0;
    const top = vv?.offsetTop || 0;
    const width = vv?.width || window.innerWidth;
    const height = vv?.height || window.innerHeight;
    return {left, top, right:left + width, bottom:top + height, width, height};
  }

  function closeSubmenus() {
    headingMenu?.remove();
    buttonMenu?.remove();
    headingMenu = null;
    buttonMenu = null;
    submenuRow?.classList.remove("active", "submenu-open");
    submenuRow = null;
  }

  function closeTextMenus() {
    closeSubmenus();
    rootMenu?.remove();
    rootMenu = null;
    textButton.classList.remove("active");
  }

  function makeRow({icon, label, shortcut = "", arrow = false, level = null}, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "menu-item text-menu-row";
    if (level) button.classList.add("heading-level-row");

    const iconEl = document.createElement("span");
    iconEl.className = "text-menu-icon";
    iconEl.textContent = icon;
    const labelEl = document.createElement("span");
    labelEl.className = "text-menu-label";
    labelEl.textContent = label;
    const tail = document.createElement("span");
    tail.className = "text-menu-tail";
    if (shortcut) {
      const shortcutEl = document.createElement("small");
      shortcutEl.className = "text-menu-shortcut";
      shortcutEl.textContent = shortcut;
      tail.appendChild(shortcutEl);
    }
    if (arrow) {
      const arrowEl = document.createElement("span");
      arrowEl.className = "text-menu-arrow";
      arrowEl.textContent = "›";
      tail.appendChild(arrowEl);
    }
    button.append(iconEl, labelEl, tail);
    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      onClick?.(button);
    });
    return button;
  }

  function insertSimpleBlock(type) {
    closeTextMenus();
    addBlock(type);
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
  }

  function insertHeading(level) {
    closeTextMenus();
    addBlock("heading");
    const block = current?.blocks?.find(item => String(item.id) === String(selectedBlockId));
    if (block) {
      block.data = block.data || {};
      block.data.size = level;
      applyText(block, blockText(block));
      renderBlocks();
      markDirty();
      pushHistory();
      requestAnimationFrame(() => {
        const target = blocksEl?.querySelector?.(`[data-id="${block.id}"] [contenteditable="true"], [data-id="${block.id}"] textarea, [data-id="${block.id}"] input`);
        target?.focus?.();
      });
    }
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
  }

  function insertRichButton(type) {
    closeTextMenus();
    if (!window.RichButtonEditor?.create) {
      toast("محرر الأزرار الغنية غير جاهز");
      return;
    }
    window.RichButtonEditor.create(type);
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
  }

  function positionRootMenu() {
    if (!rootMenu) return;
    const bounds = viewportBounds();
    const margin = 8;
    const gap = 7;
    rootMenu.style.visibility = "hidden";
    rootMenu.style.left = `${bounds.left + margin}px`;
    rootMenu.style.top = `${bounds.top + margin}px`;
    const rect = rootMenu.getBoundingClientRect();
    const anchor = textButton.getBoundingClientRect();
    let left = anchor.left;
    left = Math.max(bounds.left + margin, Math.min(left, bounds.right - rect.width - margin));
    let top = anchor.bottom + gap;
    if (top + rect.height > bounds.bottom - margin) top = anchor.top - rect.height - gap;
    top = Math.max(bounds.top + margin, Math.min(top, bounds.bottom - rect.height - margin));
    rootMenu.style.left = `${Math.round(left)}px`;
    rootMenu.style.top = `${Math.round(top)}px`;
    rootMenu.style.visibility = "visible";
  }

  function positionSubmenu(menu, row) {
    if (!rootMenu || !menu || !row) return;
    const bounds = viewportBounds();
    const margin = 6;
    const gap = 5;
    menu.style.visibility = "hidden";
    menu.style.left = `${bounds.left + margin}px`;
    menu.style.top = `${bounds.top + margin}px`;
    const rootRect = rootMenu.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const subRect = menu.getBoundingClientRect();
    const rightCandidate = rootRect.right + gap;
    const leftCandidate = rootRect.left - subRect.width - gap;
    let left;
    if (rightCandidate + subRect.width <= bounds.right - margin) left = rightCandidate;
    else if (leftCandidate >= bounds.left + margin) left = leftCandidate;
    else left = Math.max(bounds.left + margin, bounds.right - subRect.width - margin);
    let top = rowRect.top;
    if (top + subRect.height > bounds.bottom - margin) top = bounds.bottom - subRect.height - margin;
    top = Math.max(bounds.top + margin, top);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
  }

  function openHeadingMenu(row) {
    if (headingMenu && submenuRow === row) { closeSubmenus(); return; }
    closeSubmenus();
    submenuRow = row;
    row.classList.add("active", "submenu-open");
    headingMenu = document.createElement("aside");
    headingMenu.className = "popup-menu text-heading-submenu";
    headingMenu.setAttribute("aria-label", "مستوى العنوان");
    for (let level = 1; level <= 6; level++) {
      headingMenu.appendChild(makeRow({icon:`H${level}`, label:`العنوان ${level}`, level}, () => insertHeading(level)));
    }
    document.body.appendChild(headingMenu);
    requestAnimationFrame(() => positionSubmenu(headingMenu, row));
  }

  function openButtonMenu(row) {
    if (buttonMenu && submenuRow === row) { closeSubmenus(); return; }
    closeSubmenus();
    submenuRow = row;
    row.classList.add("active", "submenu-open");
    buttonMenu = document.createElement("aside");
    buttonMenu.className = "popup-menu text-button-submenu";
    buttonMenu.setAttribute("aria-label", "نوع الزر الغني");
    const types = window.RichButtonEditor?.types || {};
    [
      "user", "url", "callback_data", "page_callback", "copy", "popup",
      "web_app", "login_url", "switch_inline_query",
      "switch_inline_query_current_chat", "disabled",
    ].forEach(type => {
      const item = types[type];
      if (!item) return;
      buttonMenu.appendChild(makeRow({icon:item.icon, label:item.label}, () => insertRichButton(type)));
    });
    document.body.appendChild(buttonMenu);
    requestAnimationFrame(() => positionSubmenu(buttonMenu, row));
  }

  function openRootMenu() {
    if (rootMenu) { closeTextMenus(); return; }
    try { hideMenus(); } catch (_) {}
    textButton.classList.add("active");
    rootMenu = document.createElement("aside");
    rootMenu.className = "popup-menu text-toolbar-menu";
    rootMenu.setAttribute("aria-label", "أدوات النص");
    ROOT_ITEMS.forEach(item => {
      rootMenu.appendChild(makeRow(item, button => {
        if (item.kind === "heading") openHeadingMenu(button);
        else if (item.kind === "rich_button") openButtonMenu(button);
        else insertSimpleBlock(item.type);
      }));
    });
    document.body.appendChild(rootMenu);
    requestAnimationFrame(positionRootMenu);
  }

  document.addEventListener("click", event => {
    const button = event.target.closest?.('.composer-toolbar [data-tool="text"]');
    if (button !== textButton) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openRootMenu();
  }, true);

  document.addEventListener("pointerdown", event => {
    if (!rootMenu) return;
    if (textButton.contains(event.target)) return;
    if (rootMenu.contains(event.target)) return;
    if (headingMenu?.contains(event.target)) return;
    if (buttonMenu?.contains(event.target)) return;
    closeTextMenus();
  }, true);

  function reposition() {
    if (!rootMenu) return;
    requestAnimationFrame(() => {
      positionRootMenu();
      if (headingMenu && submenuRow) positionSubmenu(headingMenu, submenuRow);
      if (buttonMenu && submenuRow) positionSubmenu(buttonMenu, submenuRow);
    });
  }
  window.visualViewport?.addEventListener("resize", reposition, {passive:true});
  window.visualViewport?.addEventListener("scroll", reposition, {passive:true});
  window.addEventListener("resize", reposition, {passive:true});
  window.RichTextToolbarMenu = {close: closeTextMenus};
})();
