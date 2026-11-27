// Manual-save session guard.
// Discard removes the local offline draft before closing and never mutates a saved page.
(() => {
  let discardRunning = false;

  async function discardCurrentWorkAndClose() {
    if (discardRunning) return;
    discardRunning = true;

    const button = document.getElementById("deleteSelectedBtn");
    if (button) button.disabled = true;

    clearTimeout(historyTimer);
    if (!discardOfflineDraftForSession()) {
      discardRunning = false;
      if (button) button.disabled = false;
      updateSaveState(mt("session.discard_failed"));
      toast(mt("session.discard_failed"));
      return;
    }
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
