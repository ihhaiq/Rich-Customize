import { json, readJson, handleError, HttpError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { getPage } from '../../_lib/pages.js';
import { canPublishToChat, listManagedChats } from '../../_lib/destinations.js';
import { prepareMessageButtons, buildMessageButtonsKeyboard } from '../../_lib/message-buttons.js';
import { buildInputRichMessage } from '../../_lib/rich-message.js';
import { telegramApi } from '../../_lib/telegram-api.js';

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);
    const pageId = String(payload.page_id || '');
    const page = await getPage(context.env.DB, pageId);
    if (!page || page.owner_id !== user.id) throw new HttpError(404, 'Page not found');

    const kind = String(payload.kind || 'private');
    let targetChatId = user.id;
    if (kind === 'chat') {
      const requested = Number(payload.chat_id);
      if (!Number.isSafeInteger(requested)) throw new HttpError(400, 'Invalid chat_id');
      const known = new Set(
        (await listManagedChats(context.env.DB, user.id)).map((item) => Number(item.chat_id))
      );
      if (!known.has(requested)) throw new HttpError(403, 'Publishing is not allowed in this chat');
      const allowed = await canPublishToChat(context.env, requested, user.id);
      if (!allowed) throw new HttpError(403, 'Publishing is not allowed in this chat');
      targetChatId = requested;
    } else if (kind !== 'private') {
      throw new HttpError(400, 'Invalid destination kind');
    }

    const prepared = await prepareMessageButtons(context.env.DB, page.buttons || []);
    const replyMarkup = prepared.length
      ? buildMessageButtonsKeyboard(prepared, {
          buttonsPerRow: page.buttons_per_row || 1,
          sourcePageId: pageId,
        })
      : undefined;

    const result = await telegramApi(context.env, 'sendRichMessage', {
      chat_id: targetChatId,
      rich_message: buildInputRichMessage(page.blocks || [], { sourcePageId: pageId }),
      ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
    });

    return json({
      ok: true,
      chat_id: targetChatId,
      message_id: result?.message_id ?? null,
    });
  } catch (error) {
    return handleError(error);
  }
}
