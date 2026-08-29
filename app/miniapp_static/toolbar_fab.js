// Bottom floating actions: delete-selected + send (send already wired in app.js via #sendBtn).
document.getElementById("deleteSelectedBtn").addEventListener("click", () => {
  if (typeof selectedBlockId !== "undefined" && selectedBlockId) {
    deleteBlock(selectedBlockId);
  } else {
    toast("اختر بلوك أول عشان تحذفه");
  }
});
