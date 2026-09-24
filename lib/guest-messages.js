import { db } from 'sdk';
import { eq } from 'sdk/db';
import { guestMessages, legacyStates } from 'schema';

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

  let row = await db.select().from(guestMessages)
    .where(eq(guestMessages.inlineMessageId, id)).get();

  if (!row) {
    const legacy = await db.select({ payload: legacyStates.payload })
      .from(legacyStates)
      .where(eq(legacyStates.namespace, 'guest_messages')).get();
    const value = legacy?.payload && typeof legacy.payload === 'object' && !Array.isArray(legacy.payload)
      ? legacy.payload[id]
      : null;
    const chatId = Number(value?.chat_id ?? value?.chatId);
    if (!value || !Number.isSafeInteger(chatId)) return null;

    row = {
      inlineMessageId: id,
      chatId,
      chatType: String(value.chat_type ?? value.chatType ?? ''),
      createdAt: Number(value.created_at ?? value.createdAt ?? 0),
    };
    await db.insert(guestMessages).values(row).onConflictDoUpdate({
      target: guestMessages.inlineMessageId,
      set: {
        chatId: row.chatId,
        chatType: row.chatType,
        createdAt: row.createdAt || nowSeconds(),
      },
    }).run();
  }

  const chatId = Number(row.chatId);
  if (!Number.isSafeInteger(chatId)) return null;
  return {
    inlineMessageId: id,
    chatId,
    chatType: String(row.chatType || ''),
    createdAt: Number(row.createdAt || 0),
  };
}
