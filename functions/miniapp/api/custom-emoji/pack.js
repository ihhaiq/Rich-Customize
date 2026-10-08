import { json, readJson, HttpError, handleError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { telegramApi } from '../../../_lib/telegram-api.js';
import { claimCustomEmojiPack } from '../../../_lib/custom-emoji-packs.js';
import { isDeveloper } from '../../../../tgcloud/lib/developer-access.js';

function packName(input) {
  const value = String(input || '').trim();
  const link = value.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/addemoji\/([A-Za-z0-9_]{1,64})\/?(?:\?[^\s#]*)?$/i);
  if (link) return link[1];
  const tg = value.match(/^tg:\/\/addemoji\?set=([A-Za-z0-9_]{1,64})$/i);
  if (tg) return tg[1];
  if (/^[A-Za-z0-9_]{1,64}$/.test(value)) return value;
  return null;
}

async function requestedPack(context) {
  if (context.request.method === 'POST') {
    const payload = await readJson(context.request);
    return packName(payload.set);
  }
  const url = new URL(context.request.url);
  return packName(url.searchParams.get('set'));
}

async function servePack(context) {
  try {
    const user = await miniAppUser(context);
    const developer = isDeveloper(user.id);
    const name = await requestedPack(context);
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
        if (!/^[1-9][0-9]{0,19}$/.test(id) || !emoji) continue;
        const previewFileId = String(
          sticker?.thumbnail?.file_id
          || sticker?.thumb?.file_id
          || (!sticker?.is_animated && !sticker?.is_video ? sticker?.file_id : '')
          || ''
        ).trim();
        exact.set(id, {emoji, preview_file_id:previewFileId});
      }
    }

    const emojis = ids.map((id) => ({
      custom_emoji_id:id,
      emoji:exact.get(id)?.emoji || '',
      preview_file_id:exact.get(id)?.preview_file_id || '',
    }));

    if (emojis.some((item) => !item.emoji)) {
      throw new HttpError(502, 'incomplete_custom_emoji_metadata');
    }

    const canonicalName = String(set.name || name);
    const access = await claimCustomEmojiPack(
      context.env,
      user.id,
      canonicalName,
      {unlimited:developer},
    );

    return json({
      ok:true,
      access:{
        is_developer:developer,
        custom_emoji_pack_limit:access.limit,
        custom_emoji_pack_count:access.packCount,
        custom_emoji_packs:access.packNames,
      },
      pack:{
        name:canonicalName,
        title:String(set.title || canonicalName),
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

export async function onRequestGet(context) {
  return servePack(context);
}

export async function onRequestPost(context) {
  return servePack(context);
}
