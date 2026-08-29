// Beta 0.3.22 — keep Mini App content inside Telegram fullscreen safe areas.
(() => {
  const tg = window.Telegram?.WebApp;
  const root = document.documentElement;
  let raf = 0;

  function px(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${Math.max(0, number)}px` : "0px";
  }

  function inset(source, side) {
    return source && Number.isFinite(Number(source[side])) ? Number(source[side]) : 0;
  }

  function viewportHeight() {
    const stable = Number(tg?.viewportStableHeight);
    if (Number.isFinite(stable) && stable > 0) return stable;
    const visible = Number(window.visualViewport?.height);
    if (Number.isFinite(visible) && visible > 0) return visible;
    return window.innerHeight || document.documentElement.clientHeight || 0;
  }

  function apply() {
    raf = 0;
    const safe = tg?.safeAreaInset || {};
    const content = tg?.contentSafeAreaInset || {};

    root.style.setProperty("--miniapp-safe-top", px(inset(safe, "top")));
    root.style.setProperty("--miniapp-safe-right", px(inset(safe, "right")));
    root.style.setProperty("--miniapp-safe-bottom", px(inset(safe, "bottom")));
    root.style.setProperty("--miniapp-safe-left", px(inset(safe, "left")));

    root.style.setProperty("--miniapp-content-safe-top", px(inset(content, "top")));
    root.style.setProperty("--miniapp-content-safe-right", px(inset(content, "right")));
    root.style.setProperty("--miniapp-content-safe-bottom", px(inset(content, "bottom")));
    root.style.setProperty("--miniapp-content-safe-left", px(inset(content, "left")));

    const height = viewportHeight();
    if (height > 0) root.style.setProperty("--miniapp-viewport-height", `${Math.round(height)}px`);
  }

  function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(apply);
  }

  try {
    tg?.ready?.();
    tg?.expand?.();
  } catch (_) {}

  apply();

  try {
    tg?.onEvent?.("safeAreaChanged", schedule);
    tg?.onEvent?.("contentSafeAreaChanged", schedule);
    tg?.onEvent?.("viewportChanged", schedule);
    tg?.onEvent?.("fullscreenChanged", schedule);
  } catch (_) {}

  window.visualViewport?.addEventListener("resize", schedule, {passive:true});
  window.visualViewport?.addEventListener("scroll", schedule, {passive:true});
  window.addEventListener("resize", schedule, {passive:true});
  window.addEventListener("orientationchange", schedule, {passive:true});
})();
