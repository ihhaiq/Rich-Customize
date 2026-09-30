import { json, text } from '../../../_lib/http.js';
import {
  bridgeChatMatches,
  bridgeWebhookSecretMatches,
  recordBridgeWebhookResult,
  verifyAndPinMainBotIdentity,
} from '../../../_lib/b2b-bridge.js';

function responseText(message) {
  return String(message?.text || message?.caption || '').trim();
}

function fields(source) {
  const result = {};
  for (const line of String(source || '').split(/\r?\n/)) {
    const index = line.indexOf(':');
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const value = line.slice(index + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

function responseAction(source) {
  const value = String(source || '').toUpperCase();
  if (value.includes('GET_PAGES_OK')) return 'pages';
  if (value.includes('GET_PAGE_OK')) return 'page';
  if (value.includes('GET_DESTINATIONS_OK')) return 'destinations';
  if (value.includes('CREATE_PAGE_OK')) return 'create';
  if (value.includes('SAVE_PAGE_OK')) return 'save';
  if (value.includes('DELETE_PAGE_OK')) return 'delete';
  if (value.includes('PUBLISH_OK')) return 'publish';
  if (value.includes('USER_PICKER_OK')) return 'user_picker';
  if (value.includes('PONG')) return 'ping';
  return null;
}

function smallResult(action, parsed) {
  const result = { status: 'ok', action };
  if (parsed.user_id) result.user_id = Number(parsed.user_id);
  if (parsed.page_id) result.page_id = parsed.page_id;
  if (parsed.updated_at) result.updated_at = Number(parsed.updated_at);
  if (parsed.bridge_bot_id) result.bridge_bot_id = Number(parsed.bridge_bot_id);
  if (parsed.chat_id) result.chat_id = Number(parsed.chat_id);
  if (parsed.message_id) result.message_id = Number(parsed.message_id);
  if (parsed.user_picker_request_id) result.user_picker_request_id = Number(parsed.user_picker_request_id);
  return result;
}

export async function onRequestPost(context) {
  const secret = context.request.headers.get('X-Telegram-Bot-Api-Secret-Token') || '';
  if (!bridgeWebhookSecretMatches(context.env, secret)) return text('Unauthorized', 401);

  let update;
  try {
    update = await context.request.json();
  } catch {
    return text('Invalid JSON', 400);
  }

  const message = update?.message;
  if (!message) return json({ ok: true, ignored: 'no_message' });
  if (!bridgeChatMatches(context.env, message?.chat?.id)) {
    return json({ ok: true, ignored: 'wrong_chat' });
  }
  if (!await verifyAndPinMainBotIdentity(context.env.DB, context.env, message?.from)) {
    return json({ ok: true, ignored: 'wrong_sender' });
  }

  const source = responseText(message);
  const parsed = fields(source);
  const requestId = String(parsed.request_id || '').trim();
  if (!requestId) return json({ ok: true, ignored: 'no_request_id' });

  const pending = await context.env.DB.prepare(
    'SELECT request_id, user_id, action, page_id, status FROM miniapp_bridge_pending WHERE request_id = ?'
  ).bind(requestId).first();
  if (!pending) return json({ ok: true, ignored: 'unknown_request' });

  if (/^❌\s*RCB1\s+ERROR/i.test(source)) {
    await recordBridgeWebhookResult(context.env.DB, {
      requestId,
      status: 'error',
      errorCode: parsed.code || 'BRIDGE_ERROR',
      errorMessage: parsed.detail || 'Telegram Serverless bridge request failed',
    });
    return json({ ok: true, request_id: requestId, status: 'error' });
  }

  const action = responseAction(source);
  if (!action) return json({ ok: true, ignored: 'unknown_response', request_id: requestId });
  if (String(pending.action) !== action) {
    await recordBridgeWebhookResult(context.env.DB, {
      requestId,
      status: 'error',
      errorCode: 'ACTION_MISMATCH',
      errorMessage: 'Bridge response action does not match pending request',
    });
    return json({ ok: true, request_id: requestId, status: 'error' });
  }

  if (String(pending.status) !== 'pending') {
    return json({ ok: true, request_id: requestId, status: String(pending.status) });
  }

  if (action !== 'ping' && Number(parsed.user_id) !== Number(pending.user_id)) {
    await recordBridgeWebhookResult(context.env.DB, {
      requestId,
      status: 'error',
      errorCode: 'USER_MISMATCH',
      errorMessage: 'Bridge response user_id does not match pending request',
    });
    return json({ ok: true, request_id: requestId, status: 'error' });
  }

  if (
    pending.page_id != null
    && String(parsed.page_id || '') !== String(pending.page_id)
    && !message.document?.file_id
  ) {
    await recordBridgeWebhookResult(context.env.DB, {
      requestId,
      status: 'error',
      errorCode: 'PAGE_MISMATCH',
      errorMessage: 'Bridge response page_id does not match pending request',
    });
    return json({ ok: true, request_id: requestId, status: 'error' });
  }

  if (message.document?.file_id) {
    await recordBridgeWebhookResult(context.env.DB, {
      requestId,
      status: 'ready',
      responseKind: 'document',
      responseFileId: message.document.file_id,
    });
    return json({ ok: true, request_id: requestId, status: 'ready' });
  }

  await recordBridgeWebhookResult(context.env.DB, {
    requestId,
    status: 'ready',
    responseKind: 'ack',
    responseJson: smallResult(action, parsed),
  });
  return json({ ok: true, request_id: requestId, status: 'ready' });
}

export async function onRequestGet() {
  return text('Method Not Allowed', 405);
}
