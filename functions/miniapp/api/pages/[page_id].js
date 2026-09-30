import { json, readJson, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { validatePagePayload } from '../../../_lib/pages.js';
import {
  queueDocumentBridgeRequest,
  queueTextBridgeRequest,
} from '../../../_lib/b2b-bridge.js';

function requestedPageId(context) {
  const value = String(context.params?.page_id || '').trim();
  if (!value || value.length > 64 || /\s/.test(value)) throw new HttpError(400, 'Invalid page_id');
  return value;
}

function pending(requestId, action) {
  return json({
    ok: true,
    pending: true,
    request_id: requestId,
    action,
    beta: '0.4-b2b',
  }, 202);
}

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const pageId = requestedPageId(context);
    const requestId = await queueTextBridgeRequest(context, {
      action: 'page',
      userId: user.id,
      pageId,
    });
    return pending(requestId, 'page');
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPut(context) {
  try {
    const user = await miniAppUser(context);
    const pageId = requestedPageId(context);
    const payload = await readJson(context.request);
    const content = validatePagePayload(payload);
    if (!content.blocks.length) throw new HttpError(400, 'Page must contain at least one block');

    const title = String(payload.title || pageId).trim().slice(0, 64);
    if (!title) throw new HttpError(400, 'Page title is required');

    const baseUpdatedAt = Number(payload.base_updated_at);
    if (!Number.isSafeInteger(baseUpdatedAt) || baseUpdatedAt <= 0) {
      throw new HttpError(400, 'base_updated_at is required');
    }

    const requestId = await queueDocumentBridgeRequest(context, {
      action: 'save',
      userId: user.id,
      pageId,
      baseUpdatedAt,
      payload: {
        title,
        blocks: content.blocks,
        buttons: content.buttons,
        buttons_per_row: content.buttonsPerRow,
        buttons_align: content.buttonsAlign,
      },
    });
    return pending(requestId, 'save');
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestDelete(context) {
  try {
    const user = await miniAppUser(context);
    const pageId = requestedPageId(context);
    const url = new URL(context.request.url);
    const baseUpdatedAt = Number(url.searchParams.get('base_updated_at') || 0);
    const requestId = await queueTextBridgeRequest(context, {
      action: 'delete',
      userId: user.id,
      pageId,
      ...(baseUpdatedAt > 0 ? { baseUpdatedAt } : {}),
    });
    return pending(requestId, 'delete');
  } catch (error) {
    return handleError(error);
  }
}
