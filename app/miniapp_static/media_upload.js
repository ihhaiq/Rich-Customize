const mediaPreviewUrls = new Map();

const MEDIA_ICON_PATHS = {
  photo: '<rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 17 4.5-4.5 3.5 3 2.5-2.5 3.5 4"/>',
  video: '<rect x="3" y="5" width="14" height="14" rx="3"/><path d="m17 10 4-2v8l-4-2"/>',
  animation: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m10 9 5 3-5 3z"/>',
  audio: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  voice: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/>',
  document: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  collage: '<rect x="3" y="4" width="8" height="7" rx="2"/><rect x="13" y="4" width="8" height="7" rx="2"/><rect x="3" y="13" width="8" height="7" rx="2"/><rect x="13" y="13" width="8" height="7" rx="2"/>',
  slideshow: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3zM8 22h8"/>',
  map: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
};

function createMediaIcon(kind) {
  const icon = document.createElement("span");
  icon.className = "media-picker-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = `<svg viewBox="0 0 24 24" role="presentation">${MEDIA_ICON_PATHS[kind] || MEDIA_ICON_PATHS.document}</svg>`;
  return icon;
}

const MEDIA_UPLOADS = {
  photo: {
    accept: "image/jpeg,image/png,image/webp",
    labelKey: "block.photo",
    pickKey: "media.pick_photo",
    preview: "image",
    max: 10 * 1024 * 1024,
  },
  video: {
    accept: "video/*",
    labelKey: "block.video",
    pickKey: "media.pick_video",
    preview: "video",
    max: 50 * 1024 * 1024,
  },
  animation: {
    accept: "image/gif,video/mp4,.gif,.mp4",
    labelKey: "block.animation",
    pickKey: "media.pick_animation",
    preview: "animation",
    max: 50 * 1024 * 1024,
  },
  audio: {
    accept: "audio/*",
    labelKey: "block.audio",
    pickKey: "media.pick_audio",
    preview: "audio",
    max: 50 * 1024 * 1024,
  },
  voice: {
    accept: "audio/*,.ogg,.oga,.opus,.mp3,.m4a,.wav",
    labelKey: "block.voice",
    pickKey: "media.pick_voice",
    preview: "audio",
    max: 50 * 1024 * 1024,
  },
  document: {
    accept: "*/*",
    labelKey: "block.document",
    pickKey: "media.pick_document",
    preview: "file",
    max: 50 * 1024 * 1024,
  },
};

function mediaConfig(kind) {
  const config = MEDIA_UPLOADS[kind];
  return config ? {...config, label: mt(config.labelKey), pick: mt(config.pickKey)} : null;
}

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
  const config = mediaConfig(kind);
  if (!config) throw new Error(mt("media.unsupported"));
  if (!file) throw new Error(mt("media.no_file"));
  if (file.size > config.max) {
    const limitMb = Math.round(config.max / 1024 / 1024);
    throw new Error(mt("media.too_large", {size: limitMb}));
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
  const config = mediaConfig(kind);
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
    toast(mt("media.uploaded", {name: config.label}));
  } catch (error) {
    d._uploading = false;
    renderBlocks();
    toast(mt("media.upload_failed", {error: error.message}));
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
  const config = mediaConfig(block.type);
  const d = block.data || (block.data = {});
  const box = document.createElement("div");
  box.className = `media-placeholder media-picker-card${d.file?.file_id ? "" : " invalid"}`;

  appendLocalPreview(box, block, config);

  const header = document.createElement("div");
  header.className = "media-picker-head";
  const icon = createMediaIcon(block.type);
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = config.label;
  const status = document.createElement("small");
  if (d._uploading) status.textContent = mt("media.uploading_telegram");
  else if (d.file?.file_id) status.textContent = mt("media.ready", {file: d._local_preview_name ? ` · ${d._local_preview_name}` : ""});
  else status.textContent = mt("media.picker_hint");
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
  pickButton.textContent = d._uploading ? mt("media.uploading") : (d.file?.file_id ? mt("media.change", {name: config.label}) : config.pick);
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
    toast(mt("media.choose_images_videos"));
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
    toast(mt("media.added_count", {count: chosen.length}));
  } catch (error) {
    d._uploading = false;
    renderBlocks();
    toast(mt("media.some_failed", {error: error.message}));
  }
}

function containerMediaEditor(block) {
  const d = block.data || (block.data = {});
  const box = document.createElement("div");
  box.className = `media-placeholder media-picker-card${(d.children || []).length ? "" : " invalid"}`;

  const header = document.createElement("div");
  header.className = "media-picker-head";
  const icon = createMediaIcon(block.type);
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = mt(block.type === "collage" ? "block.collage" : "block.slideshow");
  const status = document.createElement("small");
  status.textContent = d._uploading
    ? mt("media.uploading_multiple")
    : mt("media.container_hint", {count: (d.children || []).length});
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
  button.textContent = d._uploading ? mt("media.uploading") : mt("media.add_images_videos");
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
  const icon = createMediaIcon("map");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = mt("media.location");
  const status = document.createElement("small");
  status.textContent = d._locating
    ? mt("media.locating")
    : hasLocation
      ? mt("media.location_set", {lat: Number(d.latitude).toFixed(5), lon: Number(d.longitude).toFixed(5)})
      : mt("media.location_hint");
  copy.append(title, status);
  header.append(icon, copy);

  const button = document.createElement("button");
  button.type = "button";
  button.className = "primary-soft media-pick-btn";
  button.disabled = !!d._locating;
  button.textContent = d._locating ? mt("media.locating") : (hasLocation ? mt("media.update_location") : mt("media.use_location"));
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    selectBlock(block.id);
    if (!navigator.geolocation) {
      toast(mt("media.geolocation_unsupported"));
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
        toast(mt("media.location_success"));
      },
      error => {
        d._locating = false;
        renderBlocks();
        toast(error.code === 1 ? mt("media.location_permission") : mt("media.location_failed"));
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
