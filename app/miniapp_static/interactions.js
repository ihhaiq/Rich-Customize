// Beta 0.3.21 — tactile press + reliable long-press actions for media blocks.
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

  const MEDIA_CARD_SELECTOR = ".media-picker-card,.media-placeholder";
  const MEDIA_PASS_THROUGH_SELECTOR = "button,input,textarea,select,a,[contenteditable=\"true\"],[data-inline-rich-button],[data-no-long-press]";

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

  function mediaBlockTarget(target) {
    const card = target?.closest?.(MEDIA_CARD_SELECTOR);
    if (!card) return null;

    // Real form controls keep their own interaction. Native media players are
    // intentionally excluded here: a short tap still plays/seeks normally,
    // while holding for LONG_PRESS_MS opens the parent Block menu.
    if (target.closest?.(MEDIA_PASS_THROUGH_SELECTOR)) return null;
    return card.closest?.(".block") || null;
  }

  // Editable rich text and ordinary form controls keep their native selection /
  // interaction gesture. Audio/video inside a media Block are special: they
  // still receive short taps, but may also trigger the Block menu on hold.
  function nativeControlTarget(target, pressEl = null) {
    const isMediaBlockPress = Boolean(
      pressEl?.classList?.contains("block")
      && target?.closest?.(MEDIA_CARD_SELECTOR)
    );
    if (isMediaBlockPress && target.closest?.("audio,video,.media-live-preview,.audio-live-preview")) {
      return false;
    }
    return Boolean(target.closest(
      'input,textarea,select,video,audio,a,[contenteditable="true"],[data-inline-rich-button],[data-no-long-press]'
    ));
  }

  function pressTargetFrom(target) {
    // A media card is merely the visual surface of its parent Block. Promoting
    // it here makes long-press consistent with paragraph/table/details blocks.
    const mediaBlock = mediaBlockTarget(target);
    if (mediaBlock) return mediaBlock;

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
        const block = typeof current !== "undefined"
          ? current?.blocks?.find?.(item => String(item.id) === String(el.dataset.id))
          : null;
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
    const mediaSurface = event.target.closest?.(MEDIA_CARD_SELECTOR);
    const isNativeMedia = Boolean(event.target.closest?.("audio,video,.media-live-preview,.audio-live-preview"));
    if ((mediaSurface && isNativeMedia) || !nativeControlTarget(event.target, block)) event.preventDefault();
  });
})();
