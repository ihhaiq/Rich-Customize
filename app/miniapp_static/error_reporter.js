(() => {
  const tg = window.Telegram?.WebApp;
  const endpoint = "/miniapp/api/client-error";
  const nativeFetch = window.fetch.bind(window);
  let lastKey = "";
  let lastAt = 0;
  let sentInWindow = 0;
  let windowStarted = 0;

  function compact(value, limit) {
    return String(value ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, limit);
  }

  function normalizeError(value) {
    if (value instanceof Error) {
      return {
        message: compact(value.message || value.name || "Unknown error", 900),
        stack: compact(value.stack || "", 1400),
        code: compact(value.code || "", 120),
      };
    }
    if (value && typeof value === "object") {
      return {
        message: compact(value.message || value.description || JSON.stringify(value), 900),
        stack: compact(value.stack || "", 1400),
        code: compact(value.code || "", 120),
      };
    }
    return {message:compact(value || "Unknown error", 900), stack:"", code:""};
  }

  function allowed(key) {
    const now = Date.now();
    if (!windowStarted || now - windowStarted > 60000) {
      windowStarted = now;
      sentInWindow = 0;
    }
    if (key === lastKey && now - lastAt < 30000) return false;
    if (sentInWindow >= 6) return false;
    lastKey = key;
    lastAt = now;
    sentInWindow += 1;
    return true;
  }

  async function report(error, meta = {}) {
    try {
      if (!tg?.initData) return false;
      const normalized = normalizeError(error);
      if (!normalized.message) return false;

      const source = compact(meta.source || "miniapp", 120);
      const key = source + "|" + normalized.code + "|" + normalized.message;
      if (!allowed(key)) return false;

      const context = Object.entries(meta)
        .filter(([key]) => !["source","page_id"].includes(key))
        .map(([key,value]) => key + "=" + compact(value, 120))
        .join("; ")
        .slice(0, 500);

      await nativeFetch(endpoint, {
        method: "POST",
        headers: {
          "X-Telegram-Init-Data": tg.initData,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          source,
          message: normalized.message,
          stack: normalized.stack,
          code: normalized.code,
          path: location.pathname,
          context: [
            meta.page_id ? "page_id=" + compact(meta.page_id, 64) : "",
            context,
          ].filter(Boolean).join("; ").slice(0, 500),
        }),
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  window.addEventListener("error", event => {
    const filename = compact(event.filename || "", 160);
    const message = compact(event.message || "", 900);
    const hasUsefulError = Boolean(event.error || filename || Number(event.lineno || 0) || Number(event.colno || 0));

    // Browsers/WebViews emit the opaque cross-origin message "Script error."
    // without filename/line/stack. It is not actionable and only pollutes the
    // developer error channel, so ignore that exact empty diagnostic.
    if (!hasUsefulError && /^script error\.?$/i.test(message)) return;

    report(event.error || message || "Window error", {
      source: "window.error",
      file: filename,
      line: Number(event.lineno || 0),
      column: Number(event.colno || 0),
    });
  });

  window.addEventListener("unhandledrejection", event => {
    report(event.reason || "Unhandled promise rejection", {
      source: "unhandledrejection",
    });
  });

  window.RichMiniAppErrors = {report};
})();
