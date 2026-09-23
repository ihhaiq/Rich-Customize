import { api } from 'sdk';
import { UnsafeMediaError } from 'lib/errors';
export const MAX_SLIDESHOW_IMAGE_BYTES=20*1024*1024;
export const MAX_SLIDESHOW_VIDEO_BYTES=50*1024*1024;
export const MAX_MEDIA_DIMENSION=10000;
export const MAX_IMAGE_PIXELS=40000000;
function validateDimensions(width,height){ if(!width||!height) return; if(Number(width)>MAX_MEDIA_DIMENSION||Number(height)>MAX_MEDIA_DIMENSION) throw new UnsafeMediaError('media dimensions exceed the allowed limit'); if(Number(width)*Number(height)>MAX_IMAGE_PIXELS) throw new UnsafeMediaError('media pixel count exceeds the allowed limit'); }
export function validateSlideshowMessage(message){ if(Array.isArray(message?.photo)&&message.photo.length){ const m=message.photo.at(-1); if(m.file_size&&Number(m.file_size)>MAX_SLIDESHOW_IMAGE_BYTES) throw new UnsafeMediaError('photo is too large'); validateDimensions(m.width,m.height); return; } if(message?.video){ const m=message.video; if(m.file_size&&Number(m.file_size)>MAX_SLIDESHOW_VIDEO_BYTES) throw new UnsafeMediaError('video is too large'); validateDimensions(m.width,m.height); } }
export async function safeTelegramDownload(fileId,{maxBytes=MAX_SLIDESHOW_IMAGE_BYTES}={}){ const payload=await api.getFileContent(fileId); let bytes; if(payload instanceof Uint8Array) bytes=payload; else if(payload instanceof ArrayBuffer) bytes=new Uint8Array(payload); else if(typeof payload==='string') bytes=new TextEncoder().encode(payload); else bytes=new Uint8Array(payload??[]); if(bytes.byteLength>maxBytes) throw new UnsafeMediaError('downloaded Telegram file is too large'); return bytes; }
