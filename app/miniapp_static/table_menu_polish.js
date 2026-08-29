// Beta 0.3.31 — keep the table menu pinned while switching cell/row scope.
(() => {
  if (!document.querySelector('link[data-table-menu-polish]')) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/miniapp/static/table_menu_polish.css?v=0.3.31";
    css.dataset.tableMenuPolish = "1";
    document.head.appendChild(css);
  }

  let pin = null;

  function viewportBounds() {
    const vv = window.visualViewport;
    const left = Number(vv?.offsetLeft || 0);
    const top = Number(vv?.offsetTop || 0);
    const width = Number(vv?.width || window.innerWidth || 1);
    const height = Number(vv?.height || window.innerHeight || 1);
    return {left, top, right:left + width, bottom:top + height};
  }

  function restorePinnedOrigin(menu, saved) {
    const bounds = viewportBounds();
    const margin = 10;
    const width = menu.offsetWidth || saved.width || 292;

    let left = saved.left;
    left = Math.max(bounds.left + margin, Math.min(left, bounds.right - width - margin));

    // Keep the same visual top edge when scope content changes. If the new
    // menu grows, constrain its internal scroll area instead of moving it.
    const top = Math.max(bounds.top + margin, saved.top);
    const availableBelow = Math.max(160, bounds.bottom - top - margin);

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.maxHeight = `${Math.floor(availableBelow)}px`;
  }

  document.addEventListener("pointerdown", event => {
    const scopeButton = event.target.closest?.(".table-scope-switch button");
    if (!scopeButton) return;
    const menu = scopeButton.closest(".table-cell-menu");
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    pin = {left:rect.left, top:rect.top, width:rect.width};
  }, true);

  document.addEventListener("click", event => {
    if (!event.target.closest?.(".table-scope-switch button") || !pin) return;
    const saved = pin;
    pin = null;

    queueMicrotask(() => {
      const menu = document.querySelector(".table-cell-menu");
      if (!menu) return;
      restorePinnedOrigin(menu, saved);
      menu.classList.add("table-menu-scope-swap");
      requestAnimationFrame(() => menu.classList.remove("table-menu-scope-swap"));
    });
  }, true);
})();
