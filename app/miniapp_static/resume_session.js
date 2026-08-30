// Beta 0.3.29 — resume the exact editor page after Telegram-native pickers close the Mini App.
(() => {
  const STORAGE_KEY = "rich_customize_resume_page";
  const tgApp = window.Telegram?.WebApp;

  function normalizePageId(value) {
    const text = String(value || "").trim();
    return /^[A-Za-z0-9_-]{1,64}$/.test(text) ? text : "";
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    return String(input?.url || "");
  }

  function remember(pageId) {
    const id = normalizePageId(pageId);
    if (!id) return;
    try { localStorage.setItem(STORAGE_KEY, id); } catch (_) {}
    try { tgApp?.CloudStorage?.setItem?.(STORAGE_KEY, id, () => {}); } catch (_) {}
  }

  function clear(pageId = "") {
    const expected = normalizePageId(pageId);
    try {
      const stored = normalizePageId(localStorage.getItem(STORAGE_KEY));
      if (!expected || !stored || stored === expected) localStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    try { tgApp?.CloudStorage?.removeItem?.(STORAGE_KEY, () => {}); } catch (_) {}
  }

  function queryPage() {
    try { return normalizePageId(new URLSearchParams(location.search).get("page")); }
    catch (_) { return ""; }
  }

  function directLinkPage() {
    try {
      const fromInitData = String(tgApp?.initDataUnsafe?.start_param || "");
      const fromQuery = String(new URLSearchParams(location.search).get("tgWebAppStartParam") || "");
      const raw = fromInitData || fromQuery;
      if (!raw.startsWith("page_")) return "";
      return normalizePageId(raw.slice(5));
    } catch (_) {
      return "";
    }
  }

  function localPage() {
    try { return normalizePageId(localStorage.getItem(STORAGE_KEY)); }
    catch (_) { return ""; }
  }

  // Intercept only the successful native user-picker request. requestUser() saves
  // the page before this endpoint is called, so storing its page_id here means
  // closing Telegram cannot send the editor back to a blank draft on next open.
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init = {}) {
    const response = await nativeFetch(input, init);
    try {
      const url = requestUrl(input);
      if (
        response.ok
        && url.includes("/miniapp/api/rich-buttons/user-picker")
        && String(init?.method || "GET").toUpperCase() === "POST"
      ) {
        const payload = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        remember(payload?.page_id);
      }
    } catch (_) {}
    return response;
  };

  window.RichMiniAppResume = {remember, clear};

  const initialPage = directLinkPage() || queryPage() || localPage();
  const baseNewDraft = typeof newDraft === "function" ? newDraft : null;
  let blockingBootDraft = Boolean(initialPage && baseNewDraft);

  // app.js starts boot() immediately and used to call newDraft() unconditionally.
  // Hold that one blank-draft call while a resume target exists.
  if (blockingBootDraft) {
    newDraft = function(...args) {
      if (blockingBootDraft) return;
      return baseNewDraft?.(...args);
    };
  }

  async function openResume(pageId) {
    const id = normalizePageId(pageId);
    if (!id || typeof openPage !== "function") return false;
    try {
      await openPage(id);
      const success = String(current?.page_id || "") === id;
      if (success) {
        clear(id);
        try { history.replaceState(null, "", location.pathname); } catch (_) {}
        try { toast(mt("session.restored")); } catch (_) {}
      }
      return success;
    } catch (_) {
      return false;
    }
  }

  async function startResume(pageId) {
    const success = await openResume(pageId);
    blockingBootDraft = false;
    if (!success && !current && baseNewDraft) baseNewDraft();
  }

  if (initialPage) {
    queueMicrotask(() => startResume(initialPage));
  } else if (tgApp?.CloudStorage?.getItem) {
    // CloudStorage is a fallback for WebViews that clear ordinary localStorage.
    try {
      tgApp.CloudStorage.getItem(STORAGE_KEY, value => {
        const cloudPage = normalizePageId(value);
        if (cloudPage) startResume(cloudPage);
      });
    } catch (_) {}
  }
})();
