import { json, handleError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { customEmojiPackAccess } from '../../_lib/custom-emoji-packs.js';
import { isDeveloper } from '../../../tgcloud/lib/developer-access.js';

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const developer = isDeveloper(user.id);
    const packAccess = await customEmojiPackAccess(context.env, user.id, {unlimited:developer});
    return json({
      ok:true,
      user,
      beta:'0.3',
      is_developer:developer,
      limits:{
        custom_emoji_packs:packAccess.limit,
        // Paid editor entitlements are not yet bridged to Cloudflare.
        // Until verified entitlement data is available here, the Mini App
        // treats regular users as Free. Serverless is authoritative on save.
        table_columns:developer ? 20 : 8,
        table_rows:26,
      },
      custom_emoji_packs:packAccess.packNames,
      custom_emoji_pack_count:packAccess.packCount,
    });
  } catch (error) {
    return handleError(error);
  }
}
