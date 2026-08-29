// Beta 0.3.2 — session rollback for the trash button.
// Auto-save may persist editor changes while the Mini App is open. This layer
// remembers the state that was loaded into the editor and can restore it before
// closing, so the trash action means "discard this editing session".
(() => {
  let baseline = null;
  let discardRunning = false;

  function captureBaseline(existedBefore) {
    if (!current) return;
    baseline = {
      existed_before: !!existedBefore,
      page_id: current.page_id || null,
      original: existedBefore ? {
        title: pageTitle.value || current.title || "Untitled",
        blocks: clone(current.blocks || []),
        buttons: clone(current.buttons || []),
        buttons_per_row: Number(current.buttons_per_row || 1),
        buttons_align: current.buttons_align || "center",
      } : null,
    };
  }

  // Capture every fresh draft as an unsaved session origin.
  const baseNewDraft = newDraft;
  newDraft = function(...args) {
    const result = baseNewDraft(...args);
    captureBaseline(false);
    return result;
  };

  // Capture a saved page only after it has actually loaded into the editor.
  const baseOpenPage = openPage;
  openPage = async function(pageId) {
    await baseOpenPage(pageId);
    if (current?.page_id === pageId) captureBaseline(true);
  };

  // app.js starts boot() before this file is parsed. If the first draft was
  // already created, capture it; otherwise wait briefly for boot() to finish.
  if (current) {
    captureBaseline(false);
  } else {
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (current) {
        clearInterval(timer);
        captureBaseline(false);
      } else if (attempts >= 80) {
        clearInterval(timer);
      }
    }, 25);
  }

  async function discardCurrentWorkAndClose() {
    if (discardRunning) return;
    discardRunning = true;

    const button = document.getElementById("deleteSelectedBtn");
    if (button) button.disabled = true;

    // Prevent a queued auto-save from starting after the rollback request.
    clearTimeout(saveTimer);
    clearTimeout(historyTimer);
    dirty = false;
    updateSaveState("جاري إلغاء التغييرات…");

    try {
      // If a save request was already in flight, let it finish first, then
      // restore/delete deterministically on the server.
      try { await saveChain; } catch (_) {}

      const activePageId = current?.page_id || baseline?.page_id || null;
      await api("/miniapp/api/discard-session", {
        method: "POST",
        body: JSON.stringify({
          page_id: activePageId,
          existed_before: !!baseline?.existed_before,
          original: baseline?.original || null,
        }),
      });

      tg?.HapticFeedback?.notificationOccurred?.("success");
      updateSaveState("تم إلغاء التغييرات");

      // Give Telegram one frame to paint the feedback before closing WebView.
      setTimeout(() => tg?.close?.(), 90);
    } catch (error) {
      discardRunning = false;
      if (button) button.disabled = false;
      updateSaveState("تعذر إلغاء التغييرات");
      tg?.HapticFeedback?.notificationOccurred?.("error");
      toast(`تعذر إلغاء العمل: ${error.message}`);
    }
  }

  window.discardCurrentWorkAndClose = discardCurrentWorkAndClose;
})();
