import { HttpError, handleError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { telegramApi, telegramFileResponse } from '../../../_lib/telegram-api.js';

export async function onRequestGet(context) {
  try {
    await miniAppUser(context);

    const emojiId = String(context.params?.emoji_id || '').trim();
    if (!/^\d{5,32}$/.test(emojiId)) {
      throw new HttpError(400, 'invalid_custom_emoji_id');
    }

    const stickers = await telegramApi(context.env, 'getCustomEmojiStickers', {
      custom_emoji_ids: [emojiId],
    });
    const sticker = Array.isArray(stickers) ? stickers[0] : null;
    if (!sticker) throw new HttpError(404, 'custom_emoji_not_found');

    const previewFileId = String(
      sticker.thumbnail?.file_id
      || sticker.thumb?.file_id
      || (!sticker.is_animated && !sticker.is_video ? sticker.file_id : '')
      || ''
    ).trim();
    if (!previewFileId) throw new HttpError(404, 'custom_emoji_preview_unavailable');

    const response = await telegramFileResponse(context.env, previewFileId);
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'private, max-age=86400');
    headers.set('x-custom-emoji-id', emojiId);
    return new Response(response.body, {status:response.status, headers});
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost() {
  return new Response('Method Not Allowed', {status:405});
}
