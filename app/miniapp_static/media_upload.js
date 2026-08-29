const mediaPreviewUrls = new Map();

const MEDIA_UPLOADS = {
  photo: {
    accept: "image/jpeg,image/png,image/webp",
    icon: "🖼",
    label: "صورة",
    pick: "اختيار صورة من المعرض",
    preview: "image",
    max: 10 * 1024 * 1024,
  },
  video: {
    accept: "video/*",
    icon: "🎬",
    label: "فيديو",
    pick: "اختيار فيديو من المعرض",
    preview: "video",
    max: 50 * 1024 * 1024,
  },
  animation: {
    accept: "image/gif,video/mp4,.gif,.mp4",
    icon: "GIF",
    label: "GIF",
    pick: "اختيار GIF أو MP4",
    preview: "animation",
    max: 50 * 1024 * 1024,
  },
  audio: {
    accept: "audio/*",
    icon: "🎵",
    label: "ملف صوتي",
    pick: "اختيار ملف صوتي",
    preview: "audio",
    max: 50 * 1024 * 1024,
  },
  voice: {
    accept: "audio/*,.ogg,.oga,.opus,.mp3,.m4a,.wav",
    icon: "🎙",
    label: "رسالة صوتية",
    pick: "اختيار تسجيل أو ملف صوتي",
    preview: "audio",
    max: 50 * 1024 * 1024,
  },
  document: {
    accept: "*/*",
    icon: "📄",
    label: "ملف",
    pick: "اختيار ملف من الجهاز",
    preview: "file",
    max: 50 * 1024 * 1024,
  },
};

function rememberPreview(key, file) {
  const previous = mediaPreviewUrls.get(key);
  if (previous) URL.revokeObjectURL(previous);
  const url = URL.createObjectURL(file);
  mediaPreviewUrls.set(key, url);
  return url;
}

function mediaFileData(data, file) {
  return {
    file_id: data.file_id,
    file_unique_id: data.file_unique_id || undefined,
    file_size: data.file_size || file.size || undefined,
    width: data.width || undefined,
    height: data.height || undefined,
    duration: data.duration || undefined,
    performer: data.performer || undefined,
    title: data.title || undefined,
    file_name: data.file_name || file.name || undefined,
    mime_type: data.mime_type || data.content_type || file.type || undefined,
    supports_streaming: data.supports_streaming || undefined,
  };
}

async function uploadOneMedia(file, kind, previewKey) {
  const config = MEDIA_UPLOADS[kind];
  if (!config) throw new Error("نوع الوسائط غير مدعوم");
  if (!file) throw new Error("ما تم اختيار ملف");
  if (file.size > config.max) {
    const limitMb = Math.round(config.max / 1024 / 1024);
    throw new Error(`حجم الملف أكبر من ${limitMb} MB`);
  }

  if (previewKey) rememberPreview(previewKey, file);

  const form = new FormData();
  form.append("file", file, file.name || `${kind}.bin`);
  const response = await fetch(`/miniapp/api/upload/${encodeURIComponent(kind)}`, {
    method: "POST",
    headers: {"X-Telegram-Init-Data": tg?.initData || ""},
    body: form,
  });
  if (!response.ok) throw new Error((await response.text()) || `HTTP ${response.status}`);
  return response.json();
}

async function uploadMediaToTelegram(file, block) {
  const kind = block.type;
  const config = MEDIA_UPLOADS[kind];
  if (!config) return;

  const d = block.data || (block.data = {});
  d._uploading = true;
  d._local_preview_name = file?.name || config.label;
  renderBlocks();

  try {
    const data = await uploadOneMedia(file, kind, block.id);
    d.file = mediaFileData(data, file);
    d._draft = false;
    d._uploading = false;
    markDirty();
    renderBlocks();
    pushHistory();
    toast(`تم رفع ${config.label} وربطه بـ Telegram`);
  } catch (error) {
    d._uploading = false;
    renderBlocks();
    toast(`فشل الرفع: ${error.message}`);
  }
}

function appendLocalPreview(box, block, config) {
  const url = mediaPreviewUrls.get(block.id);
  if (!url) return;

  if (config.preview === "image" || (config.preview === "animation" && block.data?._local_content_type?.startsWith("image/"))) {
    const image = document.createElement("img");
    image.className = "media-live-preview";
    image.src = url;
    image.alt = block.data?._local_preview_name || config.label;
    box.appendChild(image);
    return;
  }

  if (config.preview === "video" || config.preview === "animation") {
    const video = document.createElement("video");
    video.className = "media-live-preview";
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    box.appendChild(video);
    return;
  }

  if (config.preview === "audio") {
    const audio = document.createElement("audio");
    audio.className = "audio-live-preview";
    audio.src = url;
    audio.controls = true;
    audio.preload = "metadata";
    box.appendChild(audio);
  }
}

function pickerMediaEditor(block) {
  const config = MEDIA_UPLOADS[block.type];
  const d = block.data || (block.data = {});
  const box = document.createElement("div");
  box.className = `media-placeholder media-picker-card${d.file?.file_id ? "" : " invalid"}`;

  appendLocalPreview(box, block, config);

  const header = document.createElement("div");
  header.className = "media-picker-head";
  const icon = document.createElement("span");
  icon.className = "media-picker-icon";
  icon.textContent = config.icon;
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = config.label;
  const status = document.createElement("small");
  if (d._uploading) status.textContent = "جاري الرفع إلى Telegram…";
  else if (d.file?.file_id) status.textContent = `جاهز للإرسال${d._local_preview_name ? ` · ${d._local_preview_name}` : ""}`;
  else status.textContent = "اختَر من المعرض أو مستكشف الملفات؛ البوت يحصل file_id تلقائيًا.";
  copy.append(title, status);
  header.append(icon, copy);

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = config.accept;
  picker.className = "gallery-picker";
  picker.disabled = !!d._uploading;
  picker.setAttribute("aria-label", config.pick);

  const pickButton = document.createElement("button");
  pickButton.type = "button";
  pickButton.className = "primary-soft media-pick-btn";
  pickButton.disabled = !!d._uploading;
  pickButton.textContent = d._uploading ? "جاري الرفع…" : (d.file?.file_id ? `تغيير ${config.label}` : config.pick);
  pickButton.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    selectBlock(block.id);
    picker.click();
  });

  picker.addEventListener("change", () => {
    const file = picker.files?.[0];
    if (!file) return;
    d._local_content_type = file.type || "";
    uploadMediaToTelegram(file, block);
  });

  box.append(header, pickButton, picker);
  return box;
}

async function addContainerMedia(block, files) {
  const d = block.data || (block.data = {});
  const chosen = Array.from(files || []).filter(file => file.type.startsWith("image/") || file.type.startsWith("video/"));
  if (!chosen.length) {
    toast("اختَر صور أو فيديوهات");
    return;
  }

  d._uploading = true;
  renderBlocks();
  try {
    for (const file of chosen) {
      const kind = file.type.startsWith("video/") ? "video" : "photo";
      const child = defaultBlock(kind);
      const data = await uploadOneMedia(file, kind, child.id);
      child.data.file = mediaFileData(data, file);
      child.data._draft = false;
      child.data._local_preview_name = file.name || info(kind).label;
      child.position = (d.children || []).length;
      (d.children || (d.children = [])).push(child);
    }
    d._draft = !(d.children || []).length;
    d._uploading = false;
    markDirty();
    renderBlocks();
    pushHistory();
    toast(`تمت إضافة ${chosen.length} من الوسائط`);
  } catch (error) {
    d._uploading = false;
    renderBlocks();
    toast(`فشل رفع بعض الوسائط: ${error.message}`);
  }
}

function containerMediaEditor(block) {
  const d = block.data || (block.data = {});
  const box = document.createElement("div");
  box.className = `media-placeholder media-picker-card${(d.children || []).length ? "" : " invalid"}`;

  const header = document.createElement("div");
  header.className = "media-picker-head";
  const icon = document.createElement("span");
  icon.className = "media-picker-icon";
  icon.textContent = block.type === "collage" ? "🖼" : "🎞";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = block.type === "collage" ? "Collage" : "Slideshow";
  const status = document.createElement("small");
  status.textContent = d._uploading
    ? "جاري رفع الوسائط…"
    : `${(d.children || []).length} عنصر · تگدر تختار أكثر من صورة/فيديو دفعة وحدة`;
  copy.append(title, status);
  header.append(icon, copy);

  const picker = document.createElement("input");
  picker.type = "file";
  picker.accept = "image/*,video/*";
  picker.multiple = true;
  picker.className = "gallery-picker";
  picker.disabled = !!d._uploading;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-soft media-pick-btn";
  button.textContent = d._uploading ? "جاري الرفع…" : "إضافة صور أو فيديوهات";
  button.disabled = !!d._uploading;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    selectBlock(block.id);
    picker.click();
  });
  picker.addEventListener("change", () => addContainerMedia(block, picker.files));
  box.append(header, button, picker);
  return box;
}

function locationEditor(block) {
  const d = block.data || (block.data = {});
  const box = document.createElement("div");
  const hasLocation = Number.isFinite(Number(d.latitude)) && Number.isFinite(Number(d.longitude)) && !(Number(d.latitude) === 0 && Number(d.longitude) === 0);
  box.className = `media-placeholder media-picker-card${hasLocation ? "" : " invalid"}`;

  const header = document.createElement("div");
  header.className = "media-picker-head";
  const icon = document.createElement("span");
  icon.className = "media-picker-icon";
  icon.textContent = "📍";
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "الموقع";
  const status = document.createElement("small");
  status.textContent = d._locating
    ? "جاري تحديد موقعك…"
    : hasLocation
      ? `تم تحديد الموقع · ${Number(d.latitude).toFixed(5)}, ${Number(d.longitude).toFixed(5)}`
      : "استخدم موقع الجهاز بدل كتابة الإحداثيات يدويًا.";
  copy.append(title, status);
  header.append(icon, copy);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-soft media-pick-btn";
  button.disabled = !!d._locating;
  button.textContent = d._locating ? "جاري تحديد الموقع…" : (hasLocation ? "📍 تحديث موقعي" : "📍 استخدام موقعي الحالي");
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    selectBlock(block.id);
    if (!navigator.geolocation) {
      toast("الجهاز أو WebView ما يدعم تحديد الموقع");
      return;
    }
    d._locating = true;
    renderBlocks();
    navigator.geolocation.getCurrentPosition(
      position => {
        d.latitude = position.coords.latitude;
        d.longitude = position.coords.longitude;
        d._draft = false;
        d._locating = false;
        markDirty();
        renderBlocks();
        pushHistory();
        toast("تم تحديد الموقع");
      },
      error => {
        d._locating = false;
        renderBlocks();
        toast(error.code === 1 ? "اسمح للتطبيق بالوصول إلى الموقع" : "تعذر تحديد الموقع");
      },
      {enableHighAccuracy: true, timeout: 15000, maximumAge: 30000},
    );
  });

  box.append(header, button);
  return box;
}

const fallbackMediaEditor = mediaEditor;
mediaEditor = function(block) {
  if (MEDIA_UPLOADS[block.type]) return pickerMediaEditor(block);
  if (block.type === "collage" || block.type === "slideshow") return containerMediaEditor(block);
  if (block.type === "map") return locationEditor(block);
  return fallbackMediaEditor(block);
};
