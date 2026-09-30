(() => {
  "use strict";

  const overlay = document.getElementById("miniappWaitOverlay");
  const text = document.getElementById("miniappWaitText");
  const subtext = document.getElementById("miniappWaitSubtext");
  const lockTargets = [
    document.getElementById("editorView"),
    document.getElementById("backdrop"),
    document.getElementById("pagesPanel"),
    document.getElementById("sendPanel"),
  ].filter(Boolean);
  if (!overlay || !text) return;

  let depth = 0;
  let leaveTimer = null;
  let previousFocus = null;

  function defaultText(){
    return "انتظر شوية…";
  }

  function lockInterface(){
    clearTimeout(leaveTimer);
    overlay.hidden = false;
    overlay.classList.remove("is-leaving");
    overlay.setAttribute("aria-hidden", "false");
    document.documentElement.classList.add("miniapp-busy");
    document.body.classList.add("miniapp-busy");
    for (const target of lockTargets) target.setAttribute("inert", "");
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (previousFocus && previousFocus !== document.body) {
      try { previousFocus.blur(); } catch {}
    }
  }

  function unlockInterface(){
    overlay.classList.add("is-leaving");
    overlay.setAttribute("aria-hidden", "true");
    document.documentElement.classList.remove("miniapp-busy");
    document.body.classList.remove("miniapp-busy");
    for (const target of lockTargets) target.removeAttribute("inert");

    leaveTimer = setTimeout(() => {
      if (depth > 0) return;
      overlay.hidden = true;
      overlay.classList.remove("is-leaving");
      if (previousFocus?.isConnected) {
        try { previousFocus.focus({preventScroll:true}); } catch {}
      }
      previousFocus = null;
    }, 170);
  }

  function clearErrorState(){
    overlay.classList.remove("is-error");
  }

  function show(message = defaultText(), detail = ""){
    clearErrorState();
    depth += 1;
    text.textContent = String(message || defaultText());
    if (subtext) {
      subtext.textContent = String(detail || "");
      subtext.hidden = !detail;
    }
    lockInterface();
    return depth;
  }

  function hide({force = false} = {}){
    if (force) depth = 0;
    else depth = Math.max(0, depth - 1);
    if (depth === 0) unlockInterface();
    return depth;
  }

  async function run(task, options = {}){
    const message = options.message || defaultText();
    const detail = options.detail || "";
    show(message, detail);
    try {
      return await task();
    } finally {
      hide();
    }
  }

  function setMessage(message, detail = ""){
    clearErrorState();
    text.textContent = String(message || defaultText());
    if (subtext) {
      subtext.textContent = String(detail || "");
      subtext.hidden = !detail;
    }
  }

  function setError(message = "صار حادث", detail = "حاول فدشوية"){
    overlay.classList.add("is-error");
    text.textContent = String(message || "صار حادث");
    if (subtext) {
      subtext.textContent = String(detail || "حاول فدشوية");
      subtext.hidden = false;
    }
    lockInterface();
  }

  // The overlay is visible in HTML before app.js runs, preventing taps while boot/auth starts.
  // Count it as the initial lock so boot() can release it exactly once.
  depth = 1;
  lockInterface();

  window.MiniAppWait = Object.freeze({
    show,
    hide,
    run,
    setMessage,
    setError,
    isActive: () => depth > 0,
  });
})();
