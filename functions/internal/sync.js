import { json, readJson, handleError, HttpError } from '../_lib/http.js';
import { requireInternalSecret } from '../_lib/internal-auth.js';

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

export async function onRequestPost(context) {
  try {
    requireInternalSecret(context);
    const payload = await readJson(context.request);
    const pages = asArray(payload.pages);
    const chats = asArray(payload.managed_chats);
    if (pages.length) {
      throw new HttpError(410, 'Cloudflare page sync is disabled; rich_pages stays in Telegram Serverless');
    }
    if (chats.length > 10000) throw new HttpError(413, 'sync_too_large');

    const pageCount = 0;
    let chatCount = 0;
    for (const chat of chats) {
      if (!chat || typeof chat !== 'object') continue;
      const userId = Number(chat.user_id ?? chat.userId);
      const chatId = Number(chat.chat_id ?? chat.chatId);
      if (!Number.isSafeInteger(userId) || !Number.isSafeInteger(chatId)) continue;
      const key = String(chat.key || (userId + ':' + chatId));
      await context.env.DB.prepare(
        `INSERT INTO managed_chats
        (key, user_id, chat_id, title, type, username, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          user_id=excluded.user_id,
          chat_id=excluded.chat_id,
          title=excluded.title,
          type=excluded.type,
          username=excluded.username,
          updated_at=excluded.updated_at`
      ).bind(
        key,
        userId,
        chatId,
        String(chat.title || chatId),
        String(chat.type || ''),
        chat.username == null ? null : String(chat.username),
        Number(chat.updated_at ?? chat.updatedAt ?? Math.floor(Date.now()/1000)),
      ).run();
      chatCount += 1;
    }

    return json({ ok: true, pages: pageCount, managed_chats: chatCount });
  } catch (error) {
    return handleError(error);
  }
}
