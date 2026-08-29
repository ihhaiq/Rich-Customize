// Beta 0.3.30 — keep the table menu visually pinned while switching cell/row scope.
(() => {
  if (!document.querySelector('link[data-table-menu-polish]')) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/miniapp/static/table_menu_polish.css?v=0.3.30";
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

  function clamp(menu, left, top) {
    const bounds = viewportBounds();
    const margin = 10;
    const width = menu.offsetWidth || 292;
    const height = menu.offsetHeight || 360;
    let x = left;
    let y = top;
    x = Math.max(bounds.left + margin, Math.min(x, bounds.right - width - margin));
    y = Math.max(bounds.top + margin, Math.min(y, bounds.bottom - height - margin));
    menu.style.left = `${Math.round(x)}px`;
    menu.style.top = `${Math.round(y)}px`;
  }

  document.addEventListener("pointerdown", event => {
    const scopeButton = event.target.closest?.(".table-scope-switch button");
    if (!scopeButton) return;
    const menu = scopeButton.closest(".table-cell-menu");
    if (!menu) return;
    const rect = menu.getBoundingClientRect();
    pin = {left:rect.left, top:rect.top};
  }, true);

  document.addEventListener("click", event => {
    if (!event.target.closest?.(".table-scope-switch button") || !pin) return;
    const saved = pin;
    pin = null;

    queueMicrotask(() => {
      const menu = document.querySelector(".table-cell-menu");
      if (!menu) return;
      // table_cell_tools rebuilds the menu synchronously when the scope changes.
      // Reapply the old visual origin before the browser paints the new menu.
      clamp(menu, saved.left, saved.top);
      menu.classList.add("table-menu-scope-swap");
      requestAnimationFrame(() => menu.classList.remove("table-menu-scope-swap"));
    });
  }, true);
})();
