// Bottom floating actions: delete only the explicitly selected block.
(() => {
  const deleteButton = document.getElementById("deleteSelectedBtn");
  if (!deleteButton) return;

  deleteButton.addEventListener("pointerdown", event => {
    // Do not let the editor canvas interpret the delete control as a block click.
    event.stopPropagation();
  });

  deleteButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();

    if (!current || !Array.isArray(current.blocks)) {
      toast("ماكو صفحة مفتوحة");
      return;
    }

    // Resolve the target from the selected DOM block first, then fall back to state.
    // This prevents a stale selectedBlockId from deleting a different/previous block.
    const selectedElement = blocksEl?.querySelector(".block.selected[data-id]");
    const targetId = selectedElement?.dataset.id || selectedBlockId;
    if (!targetId) {
      toast("حدد بلوك أولًا حتى تحذفه");
      return;
    }

    const index = current.blocks.findIndex(block => block.id === targetId);
    if (index < 0) {
      selectedBlockId = null;
      renderBlocks();
      toast("البلوك المحدد ما عاد موجود");
      return;
    }

    current.blocks.splice(index, 1);
    normalizePositions();
    selectedBlockId = null;
    insertIndex = Math.min(index, current.blocks.length);
    hideMenus();
    renderBlocks();
    markDirty();
    pushHistory();
    toast("تم حذف البلوك المحدد فقط");
  });
})();
