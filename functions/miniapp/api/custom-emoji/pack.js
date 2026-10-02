import { json, HttpError, handleError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { telegramApi } from '../../../_lib/telegram-api.js';

function packName(input) {
  const value = String(input || '').trim();
  const link = value.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/addemoji\/([A-Za-z0-9_]{1,64})\/?(?:\?[^\s#]*)?$/i);
  if (link) return link[1];
  const tg = value.match(/^tg:\/\/addemoji\?set=([A-Za-z0-9_]{1,64})$/i);
  if (tg) return tg[1];
  if (/^[A-Za-z0-9_]{1,64}$/.test(value)) return value;
  return null;
}

export async function onRequestGet(context) {
  try {
    await miniAppUser(context);

    const url = new URL(context.request.url);
    const name = packName(url.searchParams.get('set'));
    if (!name) throw new HttpError(400, 'invalid_custom_emoji_pack_link');

    const set = await telegramApi(context.env, 'getStickerSet', {name});
    if (set?.sticker_type !== 'custom_emoji' || !Array.isArray(set.stickers) || !set.stickers.length) {
      throw new HttpError(400, 'not_a_custom_emoji_pack');
    }

    const ids = set.stickers
      .map((sticker) => String(sticker?.custom_emoji_id || '').trim())
      .filter((id) => /^[1-9][0-9]{0,19}$/.test(id));

    if (!ids.length || ids.length !== set.stickers.length) {
      throw new HttpError(502, 'incomplete_custom_emoji_pack');
    }

    const exact = new Map();
    for (let offset = 0; offset < ids.length; offset += 200) {
      const verified = await telegramApi(context.env, 'getCustomEmojiStickers', {
        custom_emoji_ids: ids.slice(offset, offset + 200),
      });
      for (const sticker of Array.isArray(verified) ? verified : []) {
        const id = String(sticker?.custom_emoji_id || '').trim();
        const emoji = String(sticker?.emoji || '').trim();
        if (/^[1-9][0-9]{0,19}$/.test(id) && emoji) exact.set(id, emoji);
      }
    }

    const emojis = ids.map((id) => ({
      custom_emoji_id: id,
      // Use Telegram's exact fallback for this document ID. A placeholder or
      // mismatched emoji can make RichTextCustomEmoji invalid at send time.
      emoji: exact.get(id) || '',
    }));

    if (emojis.some((item) => !item.emoji)) {
      throw new HttpError(502, 'incomplete_custom_emoji_metadata');
    }

    return json({
      ok:true,
      pack:{
        name:String(set.name || name),
        title:String(set.title || name),
        emoji_count:emojis.length,
        emojis,
      },
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ok:false,error:error.message}, error.status);
    }
    return handleError(error);
  }
}

export async function onRequestPost() {
  return new Response('Method Not Allowed', {status:405});
}
