import { json, readJson, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { validatePagePayload } from '../../../_lib/pages.js';
import {
  queueDocumentBridgeRequest,
  queueTextBridgeRequest,
  queueFullSyncBridgeRequest,
  requireBridgeDb,
} from '../../../_lib/b2b-bridge.js';
import {
  claimMirrorBootstrap,
  markMirrorBootstrapFailed,
} from '../../../_lib/page-mirror.js';

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
    const db = requireBridgeDb(context.env);
    // Always refresh gift state from Serverless along with the user's pages.
    // The advisory page mirror does not contain live entitlement state.
    const bootstrap = await claimMirrorBootstrap(db);
    if (bootstrap.acquired) {
      try {
        await queueFullSyncBridgeRequest(context);
      } catch (error) {
        await markMirrorBootstrapFailed(db, error?.message || error);
      }
    }

    const requestId = await queueTextBridgeRequest(context, {
      action: 'pages',
      userId: user.id,
    });
    return pending(requestId, 'pages');
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);
    const content = validatePagePayload(payload, null, user.id);
    if (!content.blocks.length) throw new HttpError(400, 'Page must contain at least one block');

    const title = String(payload.title || 'Untitled').trim().slice(0, 64);
    if (!title) throw new HttpError(400, 'Page title is required');

    const requestId = await queueDocumentBridgeRequest(context, {
      action: 'create',
      userId: user.id,
      payload: {
        title,
        blocks: content.blocks,
        buttons: content.buttons,
        buttons_per_row: content.buttonsPerRow,
        buttons_align: content.buttonsAlign,
      },
    });
    return pending(requestId, 'create');
  } catch (error) {
    return handleError(error);
  }
}
