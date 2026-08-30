// Beta 0.3.2 — trash means discard the current editing session and close.
(() => {
  const trashButton = document.getElementById("deleteSelectedBtn");
  if (!trashButton) return;

  trashButton.addEventListener("pointerdown", event => {
    event.stopPropagation();
  });

  trashButton.addEventListener("click", async event => {
    event.preventDefault();
    event.stopPropagation();

    if (typeof window.discardCurrentWorkAndClose !== "function") {
      toast(mt("session.discard_prepare_failed"));
      return;
    }
    await window.discardCurrentWorkAndClose();
  });
})();
