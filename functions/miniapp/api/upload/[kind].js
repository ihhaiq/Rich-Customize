import { json, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { telegramMultipart } from '../../../_lib/telegram-api.js';

const SUPPORTED = new Set(['photo', 'video', 'animation', 'audio', 'voice', 'document']);
const METHODS = {
  photo: 'sendPhoto',
  video: 'sendVideo',
  animation: 'sendAnimation',
  audio: 'sendAudio',
  voice: 'sendVoice',
  document: 'sendDocument',
};
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_MEDIA_BYTES = 50 * 1024 * 1024;

function mediaFromMessage(kind, message) {
  if (kind === 'photo') {
    const photos = Array.isArray(message?.photo) ? message.photo : [];
    return photos.at(-1) || null;
  }
  return message?.[kind] || null;
}

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const kind = String(context.params?.kind || '').toLowerCase();
    if (!SUPPORTED.has(kind)) throw new HttpError(400, 'unsupported');

    const body = await context.request.formData();
    const file = body.get('file');
    if (!(file instanceof File) || file.size <= 0) throw new HttpError(400, 'no_file');

    const limit = kind === 'photo' ? MAX_PHOTO_BYTES : MAX_MEDIA_BYTES;
    if (file.size > limit) throw new HttpError(413, 'too_large');

    const type = String(file.type || 'application/octet-stream').toLowerCase();
    if (kind === 'photo' && !['image/jpeg','image/png','image/webp'].includes(type)) throw new HttpError(400, 'unsupported');
    if (kind === 'video' && !type.startsWith('video/')) throw new HttpError(400, 'unsupported');
    if (kind === 'animation' && !['image/gif','video/mp4'].includes(type)) throw new HttpError(400, 'unsupported');
    if (['audio','voice'].includes(kind) && !type.startsWith('audio/')) throw new HttpError(400, 'unsupported');

    const form = new FormData();
    form.set('chat_id', String(user.id));
    form.set(kind, file, file.name || (kind + '.bin'));
    const message = await telegramMultipart(context.env, METHODS[kind], form);
    const media = mediaFromMessage(kind, message);
    if (!media?.file_id) throw new HttpError(400, 'telegram_upload_failed');

    const response = {
      ok: true,
      kind,
      content_type: type,
      message_id: message?.message_id ?? null,
      file_id: media.file_id,
      file_unique_id: media.file_unique_id,
      file_size: media.file_size,
    };
    for (const key of [
      'width','height','duration','performer','title','file_name',
      'mime_type','supports_streaming'
    ]) {
      if (media[key] != null) response[key] = media[key];
    }
    return json(response);
  } catch (error) {
    return handleError(error);
  }
}
