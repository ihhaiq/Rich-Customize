import { json, readJson, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { queueTextBridgeRequest } from '../../../_lib/b2b-bridge.js';

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);
    const pageId = String(payload.page_id || '').trim();
    const blockId = String(payload.block_id || '').trim();
    const marker = String(payload.marker || '').trim() || null;

    if (!pageId || pageId.length > 64 || /\s/.test(pageId)) {
      throw new HttpError(400, 'invalid_page_id');
    }
    if (!blockId || blockId.length > 128) {
      throw new HttpError(400, 'invalid_block_id');
    }

    const requestId = await queueTextBridgeRequest(context, {
      action: 'user_picker',
      userId: user.id,
      pageId,
      extra: {
        block_id: blockId,
        ...(marker ? { marker } : {}),
      },
    });

    return json({
      ok: true,
      pending: true,
      request_id: requestId,
      action: 'user_picker',
      beta: '0.4-b2b',
    }, 202);
  } catch (error) {
    return handleError(error);
  }
}
