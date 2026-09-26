import { telegramApi } from './telegram-api.js';

const ADMIN = new Set(['administrator', 'creator']);

export async function canPublishToChat(env, chatId, userId) {
  try {
    const me = await telegramApi(env, 'getMe');
    const [botMember, userMember, chat] = await Promise.all([
      telegramApi(env, 'getChatMember', { chat_id: Number(chatId), user_id: Number(me.id) }),
      telegramApi(env, 'getChatMember', { chat_id: Number(chatId), user_id: Number(userId) }),
      telegramApi(env, 'getChat', { chat_id: Number(chatId) }),
    ]);
    if (!ADMIN.has(String(botMember?.status || ''))) return false;
    if (!ADMIN.has(String(userMember?.status || ''))) return false;
    if (String(chat?.type || '') === 'channel' && botMember?.can_post_messages === false) return false;
    return { ok: true, chat };
  } catch {
    return false;
  }
}

export async function listManagedChats(db, userId) {
  const result = await db.prepare(
    'SELECT * FROM managed_chats WHERE user_id = ? ORDER BY lower(title), chat_id'
  ).bind(Number(userId)).all();
  return result.results || [];
}

export async function removeManagedChat(db, userId, chatId) {
  await db.prepare('DELETE FROM managed_chats WHERE user_id = ? AND chat_id = ?')
    .bind(Number(userId), Number(chatId)).run();
}
