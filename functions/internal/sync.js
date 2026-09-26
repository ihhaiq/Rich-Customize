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
    if (pages.length > 5000 || chats.length > 10000) throw new HttpError(413, 'sync_too_large');

    let pageCount = 0;
    for (const page of pages) {
      if (!page || typeof page !== 'object') continue;
      const pageId = String(page.page_id ?? page.pageId ?? '');
      const ownerId = Number(page.owner_id ?? page.ownerId);
      if (!pageId || !Number.isSafeInteger(ownerId)) continue;
      const stamp = Number(page.updated_at ?? page.updatedAt ?? Math.floor(Date.now()/1000));
      const created = Number(page.created_at ?? page.createdAt ?? stamp);
      await context.env.DB.prepare(
        `INSERT INTO rich_pages
        (page_id, owner_id, title, blocks, buttons, buttons_per_row, buttons_align, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(page_id) DO UPDATE SET
          owner_id=excluded.owner_id,
          title=excluded.title,
          blocks=excluded.blocks,
          buttons=excluded.buttons,
          buttons_per_row=excluded.buttons_per_row,
          buttons_align=excluded.buttons_align,
          created_at=excluded.created_at,
          updated_at=excluded.updated_at`
      ).bind(
        pageId,
        ownerId,
        String(page.title || pageId),
        JSON.stringify(page.blocks || []),
        JSON.stringify(page.buttons || []),
        Number(page.buttons_per_row ?? page.buttonsPerRow ?? 1),
        String(page.buttons_align ?? page.buttonsAlign ?? 'center'),
        created,
        stamp,
      ).run();
      pageCount += 1;
    }

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
