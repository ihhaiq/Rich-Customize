// Beta 0.3.9 — Telegram-style toolbar partitioning without duplicated blocks.
(() => {
  const moreBlocksButton = document.getElementById("allBlocksBtn");
  if (!moreBlocksButton) return;

  // Every toolbar section owns its block family. The + bubble is reserved for
  // blocks that do not already have a dedicated Telegram-style section.
  const OTHER_BLOCK_TYPES = ["anchor"];

  moreBlocksButton.setAttribute("aria-label", mt("top.more_blocks"));
  moreBlocksButton.setAttribute("title", mt("top.more_blocks"));

  document.addEventListener("click", event => {
    const target = event.target.closest?.("#allBlocksBtn");
    if (target !== moreBlocksButton) return;

    // app.js still has a legacy onclick that opens the complete catalogue.
    // Capture-phase interception prevents that duplicate catalogue from firing.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.RichTextToolbarMenu?.close?.();
    openSlashMenu("", OTHER_BLOCK_TYPES);
  }, true);

  // Expose the partition for future blocks so new toolbar sections can update
  // one explicit list instead of silently reintroducing duplicates.
  window.RichToolbarSections = {
    text: ["paragraph", "heading", "blockquote", "pullquote", "preformatted", "footer", "divider", "rich_button"],
    lists: ["list", "details"],
    table: ["table"],
    media: ["photo", "video", "animation", "audio", "voice", "document", "collage", "slideshow", "map"],
    math: ["mathematical_expression"],
    other: OTHER_BLOCK_TYPES.slice(),
  };
})();
