// Beta 0.3.3 — tactile press and long-press interactions with mobile fast path.
(() => {
  const LONG_PRESS_MS = 460;
  const MOVE_CANCEL_PX = 12;
  const PERFORMANCE_MODE = document.documentElement.classList.contains("mobile-performance")
    || window.matchMedia?.("(pointer: coarse)")?.matches
    || window.innerWidth <= 820;

  if (PERFORMANCE_MODE) document.documentElement.classList.add("mobile-performance");

  const PRESS_SELECTOR = [
    "button",
    ".menu-item",
    ".sheet-item",
    ".soft-btn",
    ".primary-soft",
    ".fab",
    ".icon-btn",
    ".media-picker-card",
    ".starter-card",
    ".block",
  ].join(",");

  let active = null;
  let longTimer = null;
  let suppressClickUntil = 0;
  let suppressTarget = null;

  function haptic(kind = "light") {
    try {
      const feedback = window.Telegram?.WebApp?.HapticFeedback;
      if (!feedback) return;
      if (kind === "selection") feedback.selectionChanged?.();
      else feedback.impactOccurred?.(kind);
    } catch (_) {}
  }

  function interactiveTextTarget(target) {
    return Boolean(target.closest(
      'input,textarea,select,[contenteditable="true"],video,audio,a,[data-no-long-press]'
    ));
  }

  function pressTargetFrom(target) {
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
    // Ripple creation/repaint is intentionally skipped on mobile WebViews.
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
        if (typeof selectBlock === "function") selectBlock(el.dataset.id);
        const block = window.current?.blocks?.find?.(item => item.id === el.dataset.id)
          || (typeof current !== "undefined" ? current?.blocks?.find?.(item => item.id === el.dataset.id) : null);
        if (block && typeof openBlockMenu === "function") openBlockMenu(block);
      } catch (_) {}
    }

    suppressClickUntil = Date.now() + 650;
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
      textOrigin:interactiveTextTarget(event.target),
    };

    el.classList.add("press-surface", "is-pressed");
    el.classList.remove("press-release", "long-pressed");
    addRipple(el, event.clientX, event.clientY);

    if (!active.textOrigin) {
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
    if (block && !interactiveTextTarget(event.target)) event.preventDefault();
  });
})();
