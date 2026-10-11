import { goldenGiftAccess } from '../../_lib/golden-gift-access.js';
import { json, handleError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { customEmojiPackAccess } from '../../_lib/custom-emoji-packs.js';
import { isDeveloper } from '../../../tgcloud/lib/developer-access.js';

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const gift = await goldenGiftAccess(context.env,user.id);
    const developer = isDeveloper(user.id);
    const packAccess = await customEmojiPackAccess(context.env, user.id, {unlimited:developer});
    return json({
      ok:true,
      user,
      beta:'0.3',
      is_developer:developer,
      Golden_ticket:gift.Golden_ticket,
      golden_gift:gift,
      limits:{
        custom_emoji_packs:packAccess.limit,
        // Gift access is mirrored from trusted Serverless responses and expires locally.
        table_columns:developer || gift.Golden_ticket ? 20 : 8,
        table_rows:26,
      },
      custom_emoji_packs:packAccess.packNames,
      custom_emoji_pack_count:packAccess.packCount,
    });
  } catch (error) {
    return handleError(error);
  }
}
