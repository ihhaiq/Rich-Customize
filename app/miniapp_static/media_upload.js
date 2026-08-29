async function uploadPhotoToTelegram(file, block) {
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    toast("اختَر ملف صورة فقط");
    return;
  }
  if (file.size > 10 * 1024 * 1024) {
    toast("حجم الصورة أكبر من 10 MB");
    return;
  }

  const d = block.data || (block.data = {});
  d._uploading = true;
  renderBlocks();

  try {
    const form = new FormData();
    form.append("file", file, file.name || "photo.jpg");
    const response = await fetch("/miniapp/api/upload/photo", {
      method: "POST",
      headers: {"X-Telegram-Init-Data": tg?.initData || ""},
      body: form,
    });
    if (!response.ok) {
      throw new Error((await response.text()) || `HTTP ${response.status}`);
    }
    const data = await response.json();
    d.file = {
      ...(d.file || {}),
      file_id: data.file_id,
      file_unique_id: data.file_unique_id || undefined,
      width: data.width || undefined,
      height: data.height || undefined,
      file_size: data.file_size || file.size,
    };
    d._draft = false;
    d._uploading = false;
    d._local_preview_name = file.name || "صورة";
    markDirty();
    renderBlocks();
    pushHistory();
    toast("تم رفع الصورة وربطها بـ Telegram");
  } catch (error) {
    d._uploading = false;
    renderBlocks();
    toast(`فشل رفع الصورة: ${error.message}`);
  }
}

const originalMediaEditor = mediaEditor;
mediaEditor = function(block) {
  if (block.type !== "photo") return originalMediaEditor(block);

  const d = block.data || (block.data = {});
  const box = document.createElement("div");
  box.className = `media-placeholder${d.file?.file_id ? "" : " invalid"}`;

  const title = document.createElement("strong");
  title.textContent = "▧ صورة";

  const status = document.createElement("div");
  status.className = "photo-upload-status";
  if (d._uploading) status.textContent = "جاري رفع الصورة إلى Telegram…";
  else if (d.file?.file_id) status.textContent = `✓ مرتبطة بـ Telegram${d._local_preview_name ? ` · ${d._local_preview_name}` : ""}`;
  else status.textContent = "اختَر صورة من المعرض، والبوت راح يرسلها إلك تلقائيًا ويحصل file_id.";

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*";
  picker.className = "gallery-picker";
  picker.disabled = !!d._uploading;
  picker.setAttribute("aria-label", "اختيار صورة من المعرض");

  const pickButton = document.createElement("button");
  pickButton.type = "button";
  pickButton.className = "primary-soft photo-pick-btn";
  pickButton.disabled = !!d._uploading;
  pickButton.textContent = d._uploading ? "جاري الرفع…" : (d.file?.file_id ? "تغيير الصورة" : "🖼 اختيار من المعرض");
  pickButton.addEventListener("click", event => {
    event.stopPropagation();
    selectBlock(block.id);
    picker.click();
  });

  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    if (file) uploadPhotoToTelegram(file, block);
  });

  box.append(title, status, pickButton, picker);
  return box;
};
