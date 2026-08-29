// Beta 0.3.8 — anchored top-page menu for the ⋯ button.
(() => {
  const more = document.getElementById("moreBtn");
  if (!more) return;
  let menu = null;

  function close() {
    menu?.remove();
    menu = null;
    more.classList.remove("active");
  }

  function place() {
    if (!menu) return;
    const vv = window.visualViewport;
    const left0 = vv?.offsetLeft || 0;
    const top0 = vv?.offsetTop || 0;
    const width = vv?.width || window.innerWidth;
    const height = vv?.height || window.innerHeight;
    const margin = 9;
    menu.style.visibility = "hidden";
    menu.style.left = `${left0 + margin}px`;
    menu.style.top = `${top0 + margin}px`;
    const rect = menu.getBoundingClientRect();
    const anchor = more.getBoundingClientRect();
    let left = anchor.right - rect.width;
    left = Math.max(left0 + margin, Math.min(left, left0 + width - rect.width - margin));
    let top = anchor.bottom + 7;
    if (top + rect.height > top0 + height - margin) top = anchor.top - rect.height - 7;
    top = Math.max(top0 + margin, Math.min(top, top0 + height - rect.height - margin));
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = "visible";
  }

  function open() {
    if (menu) { close(); return; }
    try { hideMenus(); } catch (_) {}
    window.RichTextToolbarMenu?.close?.();
    more.classList.add("active");
    menu = document.createElement("aside");
    menu.className = "popup-menu page-top-menu";
    menu.setAttribute("aria-label", "خيارات الصفحة");
    const list = document.createElement("div");
    list.className = "menu-list";
    list.appendChild(menuButton("＋","صفحة جديدة","",async() => {
      close();
      try {
        await flushSave();
        newDraft();
      } catch (error) {
        toast(error.message);
      }
    }));
    list.appendChild(menuButton("✓","حفظ الآن","",async() => {
      close();
      try {
        dirty = true;
        await flushSave();
        toast("تم الحفظ");
      } catch (error) {
        toast(error.message);
      }
    }));
    menu.appendChild(list);
    document.body.appendChild(menu);
    requestAnimationFrame(place);
  }

  // Capture phase bypasses the old inline handler in app.js, whose reused
  // blockMenu lost its anchor after the block-options redesign.
  document.addEventListener("click", event => {
    const target = event.target.closest?.("#moreBtn");
    if (target !== more) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    open();
  }, true);

  document.addEventListener("pointerdown", event => {
    if (!menu) return;
    if (menu.contains(event.target) || more.contains(event.target)) return;
    close();
  }, true);

  const reposition = () => menu && requestAnimationFrame(place);
  window.visualViewport?.addEventListener("resize", reposition, {passive:true});
  window.visualViewport?.addEventListener("scroll", reposition, {passive:true});
  window.addEventListener("resize", reposition, {passive:true});
})();
