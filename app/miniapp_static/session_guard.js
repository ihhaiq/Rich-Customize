// Manual-save session guard.
// Unsaved Mini App edits live only in the WebView. Discard therefore closes
// the current local session and never mutates a saved Telegram Serverless page.
(() => {
  let discardRunning = false;

  async function discardCurrentWorkAndClose() {
    if (discardRunning) return;
    discardRunning = true;

    const button = document.getElementById("deleteSelectedBtn");
    if (button) button.disabled = true;

    clearTimeout(saveTimer);
    clearTimeout(historyTimer);
    dirty = false;
    updateSaveState(mt("session.discarded"));

    try {
      window.RichMiniAppResume?.clear?.(current?.page_id || "");
      tg?.HapticFeedback?.notificationOccurred?.("success");
    } catch (_) {}

    setTimeout(() => tg?.close?.(), 90);
  }

  window.discardCurrentWorkAndClose = discardCurrentWorkAndClose;
})();
