// Beta 0.3.29 — one long-press model for every editor Block.
(() => {
  const LONG_PRESS_MS = 460;
  const MOVE_CANCEL_PX = 12;
  const COARSE_POINTER = Boolean(window.matchMedia?.("(pointer: coarse)")?.matches);
  const NO_HOVER = Boolean(window.matchMedia?.("(hover: none)")?.matches);
  const PERFORMANCE_MODE = document.documentElement.classList.contains("mobile-performance")
    || COARSE_POINTER
    || (NO_HOVER && window.innerWidth <= 820);

  if (PERFORMANCE_MODE) document.documentElement.classList.add("mobile-performance");
  else document.documentElement.classList.remove("mobile-performance");

  const PRESS_SELECTOR = [
    "button",
    ".menu-item",
    ".sheet-item",
    ".soft-btn",
    ".primary-soft",
    ".fab",
    ".icon-btn",
    ".starter-card",
    ".block",
  ].join(",");

  const BLOCK_EXCLUSIVE_SELECTOR = [
    "button",
    "a",
    "[data-inline-rich-button]",
    "[data-no-long-press]",
  ].join(",");

  let active = null;
  let longTimer = null;
  let suppressClickUntil = 0;
  let suppressContextUntil = 0;
  let suppressTarget = null;

  function haptic(kind = "light") {
    try {
      const feedback = window.Telegram?.WebApp?.HapticFeedback;
      if (!feedback) return;
      if (kind === "selection") feedback.selectionChanged?.();
      else feedback.impactOccurred?.(kind);
    } catch (_) {}
  }

  function blockFromTarget(target) {
    const block = target?.closest?.(".block");
    if (!block?.dataset?.id) return null;
    if (target.closest?.(BLOCK_EXCLUSIVE_SELECTOR)) return null;
    return block;
  }

  function nativeControlTarget(target, pressEl = null) {
    if (pressEl?.classList?.contains("block")) return false;
    return Boolean(target.closest?.(
      'input,textarea,select,video,audio,a,[contenteditable="true"],[data-inline-rich-button],[data-no-long-press]'
    ));
  }

  function pressTargetFrom(target) {
    const block = blockFromTarget(target);
    if (block) return block;

    const el = target.closest?.(PRESS_SELECTOR);
    if (!el || el.disabled || el.getAttribute?.("aria-disabled") === "true") return null;
    return el;
  }

  function clearTimer() {
    if (longTimer !== null) {
      clearTimeout(longTimer);
      longTimer = null;
    }
  }

  function addRipple(el, clientX, clientY) {
    if (PERFORMANCE_MODE || !el || el.classList.contains("block")) return;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ripple = document.createElement("span");
    ripple.className = "press-ripple";
    ripple.style.left = `${clientX - rect.left}px`;
    ripple.style.top = `${clientY - rect.top}px`;
    el.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), {once:true});
    setTimeout(() => ripple.remove(), 700);
  }

  function release(el, withPop = true) {
    if (!el) return;
    el.classList.remove("is-pressed", "long-pressing");
    if (!withPop) return;

    el.classList.remove("press-release");
    if (PERFORMANCE_MODE) {
      requestAnimationFrame(() => el.classList.add("press-release"));
      setTimeout(() => el.classList.remove("press-release"), 220);
    } else {
      void el.offsetWidth;
      el.classList.add("press-release");
      setTimeout(() => el.classList.remove("press-release"), 380);
    }
  }

  function clearNativeSelectionInside(block) {
    try {
      const focused = document.activeElement;
      if (focused && block.contains(focused) && (
        focused.matches?.("input,textarea,select") || focused.isContentEditable
      )) {
        focused.blur?.();
      }
      const selection = window.getSelection?.();
      if (selection && !selection.isCollapsed) selection.removeAllRanges();
    } catch (_) {}
  }

  function finishLongPress(el) {
    el.classList.remove("is-pressed", "long-pressing", "long-pressed");
    if (PERFORMANCE_MODE) {
      requestAnimationFrame(() => el.classList.add("long-pressed"));
      setTimeout(() => el.classList.remove("long-pressed"), 300);
    } else {
      void el.offsetWidth;
      el.classList.add("long-pressed");
      setTimeout(() => el.classList.remove("long-pressed"), 520);
    }
    haptic("medium");

    if (el.classList.contains("block") && el.dataset.id) {
      try {
        clearNativeSelectionInside(el);
        if (typeof selectBlock === "function") selectBlock(el.dataset.id);
        const block = typeof current !== "undefined"
          ? current?.blocks?.find?.(item => String(item.id) === String(el.dataset.id))
          : null;
        if (block && typeof openBlockMenu === "function") openBlockMenu(block);
      } catch (_) {}
    }

    suppressClickUntil = Date.now() + 650;
    suppressContextUntil = Date.now() + 900;
    suppressTarget = el;
  }

  document.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;
    const el = pressTargetFrom(event.target);
    if (!el) return;

    clearTimer();
    active = {
      el,
      pointerId:event.pointerId,
      startX:event.clientX,
      startY:event.clientY,
      moved:false,
      longPressed:false,
      nativeControl:nativeControlTarget(event.target, el),
    };

    el.classList.add("press-surface", "is-pressed");
    el.classList.remove("press-release", "long-pressed");
    addRipple(el, event.clientX, event.clientY);

    if (!active.nativeControl) {
      requestAnimationFrame(() => {
        if (active?.el === el) el.classList.add("long-pressing");
      });
      longTimer = setTimeout(() => {
        if (!active || active.el !== el || active.moved) return;
        active.longPressed = true;
        finishLongPress(el);
      }, LONG_PRESS_MS);
    }
  }, {passive:true});

  document.addEventListener("pointermove", event => {
    if (!active || event.pointerId !== active.pointerId) return;
    const dx = event.clientX - active.startX;
    const dy = event.clientY - active.startY;
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
      active.moved = true;
      clearTimer();
      active.el.classList.remove("long-pressing");
      if (Math.abs(dy) > 6 || Math.abs(dx) > 8) active.el.classList.remove("is-pressed");
    }
  }, {passive:true});

  function endPointer(event, cancelled = false) {
    if (!active || (event.pointerId !== undefined && event.pointerId !== active.pointerId)) return;
    const state = active;
    active = null;
    clearTimer();

    if (state.longPressed) {
      release(state.el, false);
      return;
    }
    release(state.el, !cancelled && !state.moved);
    if (!cancelled && !state.moved) haptic("selection");
  }

  document.addEventListener("pointerup", event => endPointer(event, false), {passive:true});
  document.addEventListener("pointercancel", event => endPointer(event, true), {passive:true});

  document.addEventListener("click", event => {
    if (Date.now() > suppressClickUntil || !suppressTarget) return;
    if (suppressTarget === event.target || suppressTarget.contains(event.target)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      suppressClickUntil = 0;
      suppressTarget = null;
    }
  }, true);

  document.addEventListener("contextmenu", event => {
    const block = event.target.closest?.(".block");
    if (!block) return;
    if (Date.now() <= suppressContextUntil || !event.target.closest?.(BLOCK_EXCLUSIVE_SELECTOR)) {
      event.preventDefault();
    }
  });
})();

// Load the table-cell controls after live_preview.js has installed tableEditor.
(() => {
  if (!document.querySelector('link[data-table-cell-tools]')) {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/miniapp/static/table_cell_tools.css?v=0.3.29";
    css.dataset.tableCellTools = "1";
    document.head.appendChild(css);
  }
  if (!document.querySelector('script[data-table-cell-tools]')) {
    const script = document.createElement("script");
    script.src = "/miniapp/static/table_cell_tools.js?v=0.3.29";
    script.dataset.tableCellTools = "1";
    script.onload = () => {
      try {
        if (typeof current !== "undefined" && current?.blocks?.some?.(block => block.type === "table")) {
          renderBlocks?.();
        }
      } catch (_) {}
    };
    document.body.appendChild(script);
  }
})();
