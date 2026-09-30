import { json, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import {
  B2B_PROTOCOL,
  bridgeRequestRow,
  downloadBridgeJson,
} from '../../../_lib/b2b-bridge.js';

function requestedId(context) {
  return String(context.params?.request_id || '');
}

function parseStoredJson(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeDocumentResult(row, payload) {
  if (String(payload?.protocol || '') !== B2B_PROTOCOL) {
    throw new HttpError(502, 'Bridge protocol mismatch');
  }
  if (String(payload?.request_id || '') !== String(row.request_id)) {
    throw new HttpError(502, 'Bridge request_id mismatch');
  }
  if (Number(payload?.user_id) !== Number(row.user_id)) {
    throw new HttpError(502, 'Bridge user_id mismatch');
  }

  if (row.action === 'pages') {
    return {
      ok: true,
      beta: '0.4-b2b',
      pages: Array.isArray(payload.pages) ? payload.pages : [],
    };
  }

  if (row.action === 'page') {
    const page = { ...payload };
    delete page.protocol;
    delete page.request_id;
    delete page.action;
    if (String(page.page_id || '') !== String(row.page_id || '')) {
      throw new HttpError(502, 'Bridge page_id mismatch');
    }
    return { ok: true, beta: '0.4-b2b', page };
  }

  throw new HttpError(502, 'Unexpected bridge document response');
}

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const row = await bridgeRequestRow(context.env.DB, requestedId(context), user.id);
    if (!row) throw new HttpError(404, 'Bridge request not found');

    if (row.status === 'pending') {
      return json({
        ok: true,
        pending: true,
        request_id: row.request_id,
        action: row.action,
      }, 202);
    }

    if (row.status === 'error') {
      return json({
        ok: false,
        pending: false,
        request_id: row.request_id,
        error: {
          code: row.error_code || 'BRIDGE_ERROR',
          message: row.error_message || 'Bridge request failed',
        },
      });
    }

    if (row.status !== 'ready') {
      throw new HttpError(502, 'Unknown bridge request state');
    }

    if (row.response_kind === 'document') {
      const payload = await downloadBridgeJson(context.env, row.response_file_id);
      return json(normalizeDocumentResult(row, payload));
    }

    if (row.response_kind === 'ack') {
      const result = parseStoredJson(row.response_json) || {};
      return json({
        ok: true,
        beta: '0.4-b2b',
        ...result,
      });
    }

    throw new HttpError(502, 'Bridge response is incomplete');
  } catch (error) {
    return handleError(error);
  }
}
