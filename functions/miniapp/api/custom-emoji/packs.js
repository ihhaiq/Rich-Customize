import { json, readJson, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import {
  customEmojiPackAccess,
  deleteCustomEmojiPack,
  pinCustomEmojiPack,
  reorderCustomEmojiPacks,
} from '../../../_lib/custom-emoji-packs.js';
import { isDeveloper } from '../../../../tgcloud/lib/developer-access.js';

function accessPayload(access, developer) {
  return {
    ok:true,
    access:{
      is_developer:developer,
      custom_emoji_pack_limit:access.limit,
      custom_emoji_pack_count:access.packCount,
      custom_emoji_packs:access.packNames,
    },
  };
}

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const developer = isDeveloper(user.id);
    const access = await customEmojiPackAccess(context.env, user.id, {unlimited:developer});
    return json(accessPayload(access, developer));
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPut(context) {
  try {
    const user = await miniAppUser(context);
    const developer = isDeveloper(user.id);
    const payload = await readJson(context.request);
    const action = String(payload.action || '').trim();

    let access;
    if (action === 'reorder') {
      access = await reorderCustomEmojiPacks(
        context.env,
        user.id,
        payload.names,
        {unlimited:developer},
      );
    } else if (action === 'pin') {
      access = await pinCustomEmojiPack(
        context.env,
        user.id,
        payload.name,
        {unlimited:developer},
      );
    } else {
      throw new HttpError(400, 'invalid_custom_emoji_pack_action');
    }
    return json(accessPayload(access, developer));
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestDelete(context) {
  try {
    const user = await miniAppUser(context);
    const developer = isDeveloper(user.id);
    const payload = await readJson(context.request);
    const access = await deleteCustomEmojiPack(
      context.env,
      user.id,
      payload.name,
      {unlimited:developer},
    );
    return json(accessPayload(access, developer));
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost() {
  return new Response('Method Not Allowed', {status:405});
}
