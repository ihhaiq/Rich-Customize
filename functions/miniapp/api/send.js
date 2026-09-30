import { json, readJson, handleError, HttpError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { validatePagePayload } from '../../_lib/pages.js';
import {
  queueDocumentBridgeRequest,
  queueTextBridgeRequest,
} from '../../_lib/b2b-bridge.js';

function pending(requestId) {
  return json({
    ok: true,
    pending: true,
    request_id: requestId,
    action: 'publish',
    beta: '0.4-b2b',
  }, 202);
}

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);

    const kind = String(payload.kind || 'private');
    const destination = { kind };
    if (kind === 'chat') {
      const chatId = Number(payload.chat_id);
      if (!Number.isSafeInteger(chatId)) throw new HttpError(400, 'Invalid chat_id');
      destination.chat_id = chatId;
    } else if (kind !== 'private') {
      throw new HttpError(400, 'Invalid destination kind');
    }

    // New/dirty editor pages are published as an ephemeral RCB1 document.
    // They are never inserted into or written back to rich_pages.
    if (Array.isArray(payload.blocks)) {
      const content = validatePagePayload(payload);
      if (!content.blocks.length) throw new HttpError(400, 'Page must contain at least one block');

      const title = String(payload.title || 'Untitled').trim().slice(0, 64);
      if (!title) throw new HttpError(400, 'Page title is required');

      const requestId = await queueDocumentBridgeRequest(context, {
        action: 'publish',
        userId: user.id,
        payload: {
          title,
          blocks: content.blocks,
          buttons: content.buttons,
          buttons_per_row: content.buttonsPerRow,
          buttons_align: content.buttonsAlign,
          ...destination,
        },
      });
      return pending(requestId);
    }

    // Compatibility path for already-saved, unchanged pages.
    const pageId = String(payload.page_id || '').trim();
    if (!pageId || pageId.length > 64 || /\s/.test(pageId)) {
      throw new HttpError(400, 'Invalid page_id');
    }

    const requestId = await queueTextBridgeRequest(context, {
      action: 'publish',
      userId: user.id,
      pageId,
      extra: destination,
    });
    return pending(requestId);
  } catch (error) {
    return handleError(error);
  }
}
