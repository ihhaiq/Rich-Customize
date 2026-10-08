import { json, readJson, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { validatePagePayload } from '../../../_lib/pages.js';
import { quotaSafeMirrorBaseline } from '../../../_lib/quota-baseline.js';
import {
  queueDocumentBridgeRequest,
  queueTextBridgeRequest,
  queueFullSyncBridgeRequest,
  requireBridgeDb,
} from '../../../_lib/b2b-bridge.js';
import {
  claimMirrorBootstrap,
  getMirrorPage,
  pageMirrorReady,
  markMirrorBootstrapFailed,
} from '../../../_lib/page-mirror.js';

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
    const db = requireBridgeDb(context.env);
    if (await pageMirrorReady(db)) {
      const page = await getMirrorPage(db, user.id, pageId);
      if (!page) throw new HttpError(404, 'Page not found');
      return json({ ok: true, beta: '0.5-mirror', page });
    }

    const bootstrap = await claimMirrorBootstrap(db);
    if (bootstrap.acquired) {
      try {
        await queueFullSyncBridgeRequest(context);
      } catch (error) {
        await markMirrorBootstrapFailed(db, error?.message || error);
      }
    }

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
    // Cloudflare must enforce the quota even while an older Serverless
    // deployment still accepts 25k text. A stale/missing mirror grants nothing.
    const db = requireBridgeDb(context.env);
    const baseline = await quotaSafeMirrorBaseline(db, user.id, pageId, payload, {
      ready: pageMirrorReady,
      getPage: getMirrorPage,
    });
    const content = validatePagePayload(payload, baseline, user.id);
    if (!content.blocks.length) throw new HttpError(400, 'Page must contain at least one block');

    const title = String(payload.title || pageId).trim().slice(0, 64);
    if (!title) throw new HttpError(400, 'Page title is required');

    const baseRevision = Number(payload.base_revision || 0);
    const baseUpdatedAt = Number(payload.base_updated_at || 0);
    if (
      (!Number.isSafeInteger(baseRevision) || baseRevision <= 0)
      && (!Number.isSafeInteger(baseUpdatedAt) || baseUpdatedAt <= 0)
    ) {
      throw new HttpError(400, 'base_revision is required');
    }

    const requestId = await queueDocumentBridgeRequest(context, {
      action: 'save',
      userId: user.id,
      pageId,
      baseUpdatedAt: baseUpdatedAt > 0 ? baseUpdatedAt : null,
      payload: {
        title,
        blocks: content.blocks,
        buttons: content.buttons,
        buttons_per_row: content.buttonsPerRow,
        buttons_align: content.buttonsAlign,
        ...(baseRevision > 0 ? { base_revision: baseRevision } : {}),
        ...(baseUpdatedAt > 0 ? { base_updated_at: baseUpdatedAt } : {}),
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
    const baseRevision = Number(url.searchParams.get('base_revision') || 0);
    const baseUpdatedAt = Number(url.searchParams.get('base_updated_at') || 0);
    if (
      (!Number.isSafeInteger(baseRevision) || baseRevision <= 0)
      && (!Number.isSafeInteger(baseUpdatedAt) || baseUpdatedAt <= 0)
    ) {
      throw new HttpError(400, 'base_revision is required');
    }
    const requestId = await queueDocumentBridgeRequest(context, {
      action: 'delete',
      userId: user.id,
      pageId,
      baseUpdatedAt: baseUpdatedAt > 0 ? baseUpdatedAt : null,
      payload: {
        operation: 'delete',
        ...(baseRevision > 0 ? { base_revision: baseRevision } : {}),
        ...(baseUpdatedAt > 0 ? { base_updated_at: baseUpdatedAt } : {}),
      },
    });
    return pending(requestId, 'delete');
  } catch (error) {
    return handleError(error);
  }
}
