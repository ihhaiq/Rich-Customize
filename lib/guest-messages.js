import { db } from 'sdk';
import { eq } from 'sdk/db';
import { guestMessages } from 'schema';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

export async function rememberGuestMessage(inlineMessageId, chatId, chatType) {
  const id = String(inlineMessageId || '');
  const numericChatId = Number(chatId);
  if (!id || !Number.isSafeInteger(numericChatId)) return;
  await db.insert(guestMessages).values({
    inlineMessageId: id,
    chatId: numericChatId,
    chatType: String(chatType || ''),
    createdAt: nowSeconds(),
  }).onConflictDoUpdate({
    target: guestMessages.inlineMessageId,
    set: {
      chatId: numericChatId,
      chatType: String(chatType || ''),
      createdAt: nowSeconds(),
    },
  }).run();
}

export async function getGuestMessage(inlineMessageId) {
  const id = String(inlineMessageId || '');
  if (!id) return null;
  const row = await db.select().from(guestMessages)
    .where(eq(guestMessages.inlineMessageId, id)).get();
  if (!row) return null;
  const chatId = Number(row.chatId);
  if (!Number.isSafeInteger(chatId)) return null;
  return {
    inlineMessageId: id,
    chatId,
    chatType: String(row.chatType || ''),
    createdAt: Number(row.createdAt || 0),
  };
}
