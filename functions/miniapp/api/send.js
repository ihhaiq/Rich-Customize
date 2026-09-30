import { json, readJson, handleError, HttpError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { queueTextBridgeRequest } from '../../_lib/b2b-bridge.js';

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);
    const pageId = String(payload.page_id || '').trim();
    if (!pageId || pageId.length > 64 || /\s/.test(pageId)) {
      throw new HttpError(400, 'Invalid page_id');
    }

    const kind = String(payload.kind || 'private');
    const extra = { kind };

    if (kind === 'chat') {
      const chatId = Number(payload.chat_id);
      if (!Number.isSafeInteger(chatId)) throw new HttpError(400, 'Invalid chat_id');
      extra.chat_id = chatId;
    } else if (kind !== 'private') {
      throw new HttpError(400, 'Invalid destination kind');
    }

    const requestId = await queueTextBridgeRequest(context, {
      action: 'publish',
      userId: user.id,
      pageId,
      extra,
    });

    return json({
      ok: true,
      pending: true,
      request_id: requestId,
      action: 'publish',
      beta: '0.4-b2b',
    }, 202);
  } catch (error) {
    return handleError(error);
  }
}
