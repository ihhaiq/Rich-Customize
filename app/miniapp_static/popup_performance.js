// Beta 0.3.3 — compact floating popup placement + mobile performance tuning.
(() => {
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = Math.min(window.innerWidth || 9999, window.screen?.width || 9999) <= 820;
  const android = /Android/i.test(navigator.userAgent || "");
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const lowCpu = Number(navigator.hardwareConcurrency || 8) <= 4;
  const mobilePerformance = coarsePointer || narrowViewport || android || lowMemory || lowCpu;

  if (mobilePerformance) document.documentElement.classList.add("mobile-performance");

  function syncViewportVars() {
    const vv = window.visualViewport;
    const height = vv?.height || window.innerHeight;
    const width = vv?.width || window.innerWidth;
    document.documentElement.style.setProperty("--visible-vh", `${Math.max(1, height)}px`);
    document.documentElement.style.setProperty("--visible-vw", `${Math.max(1, width)}px`);
  }
  syncViewportVars();
  window.visualViewport?.addEventListener("resize", syncViewportVars, {passive:true});
  window.visualViewport?.addEventListener("scroll", syncViewportVars, {passive:true});
  window.addEventListener("resize", syncViewportVars, {passive:true});

  let lastToolbarAnchor = null;
  document.addEventListener("pointerdown", event => {
    const toolbarButton = event.target.closest?.(".composer-toolbar button");
    if (toolbarButton) lastToolbarAnchor = toolbarButton;
  }, {capture:true, passive:true});

  function visibleBounds() {
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0;
    const top = vv?.offsetTop || 0;
    const width = vv?.width || window.innerWidth;
    const height = vv?.height || window.innerHeight;
    return {left, top, right:left + width, bottom:top + height, width, height};
  }

  function blockOptionsAnchor(blockId) {
    if (!blocksEl || !blockId) return null;
    for (const element of blocksEl.querySelectorAll(".block[data-id]")) {
      if (element.dataset.id === String(blockId)) return element.querySelector(".mini-btn");
    }
    return null;
  }

  function placePopup(menu, anchor) {
    if (!menu || menu.classList.contains("hidden")) return;
    const bounds = visibleBounds();
    const margin = 10;

    menu.style.right = "auto";
    menu.style.bottom = "auto";
    menu.style.left = `${bounds.left + margin}px`;
    menu.style.top = `${bounds.top + margin}px`;
    menu.style.visibility = "hidden";
    menu.classList.add("popup-floating");

    const menuRect = menu.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect?.() || {
      left: bounds.left + bounds.width / 2,
      right: bounds.left + bounds.width / 2,
      top: bounds.top + 58,
      bottom: bounds.top + 58,
      width: 0,
      height: 0,
    };

    let left = anchorRect.right - menuRect.width;
    left = Math.max(bounds.left + margin, Math.min(left, bounds.right - menuRect.width - margin));

    const below = anchorRect.bottom + 8;
    const above = anchorRect.top - menuRect.height - 8;
    let top;
    if (below + menuRect.height <= bounds.bottom - margin) top = below;
    else if (above >= bounds.top + margin) top = above;
    else top = Math.max(bounds.top + margin, Math.min(below, bounds.bottom - menuRect.height - margin));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
  }

  const baseOpenBlockMenu = typeof openBlockMenu === "function" ? openBlockMenu : null;
  if (baseOpenBlockMenu) {
    openBlockMenu = function(block) {
      const result = baseOpenBlockMenu(block);
      const anchor = blockOptionsAnchor(block?.id) || lastToolbarAnchor;
      requestAnimationFrame(() => placePopup(blockMenu, anchor));
      return result;
    };
  }

  const baseOpenSlashMenu = typeof openSlashMenu === "function" ? openSlashMenu : null;
  if (baseOpenSlashMenu) {
    openSlashMenu = function(query = "", types = null) {
      const result = baseOpenSlashMenu(query, types);
      const anchor = document.activeElement === slashInput ? slashInput : (lastToolbarAnchor || slashInput);
      requestAnimationFrame(() => placePopup(slashMenu, anchor));
      return result;
    };
  }

  let repositionFrame = 0;
  function repositionOpenPopup() {
    cancelAnimationFrame(repositionFrame);
    repositionFrame = requestAnimationFrame(() => {
      if (!blockMenu?.classList.contains("hidden")) {
        const selected = blocksEl?.querySelector?.(".block.selected .mini-btn");
        placePopup(blockMenu, selected || lastToolbarAnchor);
      }
      if (!slashMenu?.classList.contains("hidden")) {
        placePopup(slashMenu, document.activeElement === slashInput ? slashInput : (lastToolbarAnchor || slashInput));
      }
    });
  }
  window.visualViewport?.addEventListener("resize", repositionOpenPopup, {passive:true});
  window.visualViewport?.addEventListener("scroll", repositionOpenPopup, {passive:true});

  const SAVE_DELAY = mobilePerformance ? 1600 : 1000;
  if (typeof markDirty === "function") {
    markDirty = function() {
      dirty = true;
      updateSaveState(current?.page_id ? "جاري الحفظ…" : "مسودة جديدة");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => queueSave(), SAVE_DELAY);
      scheduleHistory();
    };
  }
})();
