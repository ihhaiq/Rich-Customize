// Beta 0.3.5 — keep the compact list-menu styling scoped to the list toolbar only.
(() => {
  const listMenuOpen = openSlashMenu;
  openSlashMenu = function(query = "", types = null) {
    const isListToolbar = Array.isArray(types)
      && types.length === 2
      && types.includes("list")
      && types.includes("details")
      && !String(query || "").trim();
    if (!isListToolbar) slashMenu.classList.remove("list-tool-menu");
    return listMenuOpen(query, types);
  };
})();
