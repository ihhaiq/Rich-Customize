// Beta 0.3.28 — stable platform classification + popup viewport geometry.
(() => {
  const rootEl = document.documentElement;
  const platform = String(window.Telegram?.WebApp?.platform || "").toLowerCase();
  const mobilePlatforms = new Set(["android", "android_x", "ios"]);
  const desktopPlatforms = new Set(["tdesktop", "macos", "web", "webk", "weba", "unigram"]);
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  const pointerDesktop = window.matchMedia?.("(hover:hover) and (pointer:fine)")?.matches ?? false;
  const telegramDesktop = desktopPlatforms.has(platform)
    || (!mobilePlatforms.has(platform) && !mobileUA && pointerDesktop);

  rootEl.classList.toggle("tg-desktop", telegramDesktop);
  rootEl.classList.toggle("tg-mobile", !telegramDesktop);
  rootEl.dataset.tgPlatform = platform || "unknown";

  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const android = /Android/i.test(navigator.userAgent || "");
  const lowMemory = Number(navigator.deviceMemory || 8) <= 4;
  const lowCpu = Number(navigator.hardwareConcurrency || 8) <= 4;

  function positive(...values) {
    return values.map(Number).filter(value => Number.isFinite(value) && value > 0);
  }

  function desktopViewport() {
    // For Telegram Desktop Main Mini Apps, visualViewport.offsetLeft may describe
    // host-side pane geometry rather than a CSS origin. Never use it to move the
    // page. The CSS viewport itself always starts at x=0 for our document.
    const widths = positive(document.documentElement.clientWidth, window.innerWidth, window.visualViewport?.width);
    const heights = positive(document.documentElement.clientHeight, window.innerHeight, window.visualViewport?.height);
    const width = widths.length ? Math.min(...widths) : 1;
    const height = heights.length ? Math.min(...heights) : 1;
    return {left:0, top:0, width, height};
  }

  function mobileViewport() {
    const vv = window.visualViewport;
    const widths = positive(vv?.width, document.documentElement.clientWidth, window.innerWidth);
    const heights = positive(vv?.height, document.documentElement.clientHeight, window.innerHeight);
    const width = widths.length ? Math.min(...widths) : 1;
    const height = heights.length ? Math.min(...heights) : 1;
    const left = Math.max(0, Number(vv?.offsetLeft || 0));
    const top = Math.max(0, Number(vv?.offsetTop || 0));
    return {left, top, width, height};
  }

  function measuredViewport() {
    return telegramDesktop ? desktopViewport() : mobileViewport();
  }

  const firstViewport = measuredViewport();
  const narrowViewport = firstViewport.width <= 820;
  const mobilePerformance = !telegramDesktop && (coarsePointer || narrowViewport || android || lowMemory || lowCpu);

  if (mobilePerformance) rootEl.classList.add("mobile-performance");
  else rootEl.classList.remove("mobile-performance");

  function syncViewportVars() {
    const {left, top, width, height} = measuredViewport();
    const right = left + width;
    const bottom = top + height;
    const centerX = left + width / 2;

    const style = rootEl.style;
    style.setProperty("--visible-vh", `${Math.max(1, height)}px`);
    style.setProperty("--visible-vw", `${Math.max(1, width)}px`);
    style.setProperty("--visible-left", `${left}px`);
    style.setProperty("--visible-top", `${top}px`);
    style.setProperty("--visible-right", `${Math.max(1, right)}px`);
    style.setProperty("--visible-bottom", `${Math.max(1, bottom)}px`);
    style.setProperty("--visible-center-x", `${Math.max(1, centerX)}px`);
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
    const {left, top, width, height} = measuredViewport();
    return {left, top, right:left + width, bottom:top + height, width, height};
  }

  function blockAnchor(blockId) {
    if (!blocksEl || !blockId) return null;
    for (const element of blocksEl.querySelectorAll(".block[data-id]")) {
      if (element.dataset.id === String(blockId)) return element;
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
      const anchor = blockAnchor(block?.id) || lastToolbarAnchor;
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
      syncViewportVars();
      if (!blockMenu?.classList.contains("hidden")) {
        const selected = blocksEl?.querySelector?.(".block.selected");
        placePopup(blockMenu, selected || lastToolbarAnchor);
      }
      if (!slashMenu?.classList.contains("hidden")) {
        placePopup(slashMenu, document.activeElement === slashInput ? slashInput : (lastToolbarAnchor || slashInput));
      }
    });
  }
  window.visualViewport?.addEventListener("resize", repositionOpenPopup, {passive:true});
  window.visualViewport?.addEventListener("scroll", repositionOpenPopup, {passive:true});
  window.addEventListener("resize", repositionOpenPopup, {passive:true});

  const SAVE_DELAY = mobilePerformance ? 1600 : 1000;
  if (typeof markDirty === "function") {
    markDirty = function() {
      dirty = true;
      updateSaveState(current?.page_id ? mt("save.saving") : mt("save.new_draft"));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => queueSave(), SAVE_DELAY);
      scheduleHistory();
    };
  }
})();
