import { json, handleError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import {
  canPublishToChat,
  listManagedChats,
  removeManagedChat,
} from '../../_lib/destinations.js';

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const privateTitle = String(user.first_name || user.username || user.id);
    const destinations = [{
      kind: 'private',
      chat_id: user.id,
      title: privateTitle,
      type: 'private',
    }];

    for (const item of await listManagedChats(context.env.DB, user.id)) {
      const allowed = await canPublishToChat(context.env, item.chat_id, user.id);
      if (!allowed) {
        await removeManagedChat(context.env.DB, user.id, item.chat_id);
        continue;
      }
      destinations.push({
        kind: 'chat',
        chat_id: Number(item.chat_id),
        title: String(allowed.chat?.title || item.title || item.chat_id),
        type: String(allowed.chat?.type || item.type || 'chat'),
      });
    }
    return json({ ok: true, destinations });
  } catch (error) {
    return handleError(error);
  }
}
