import { json, readJson, handleError, HttpError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { sendOneWayBridgeEvent } from '../../_lib/b2b-bridge.js';

function clean(value, limit) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, limit);
}

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);

    const source = clean(payload.source || 'miniapp', 120);
    const message = clean(payload.message, 900);
    if (!message) throw new HttpError(400, 'Error message is required');

    const stack = clean(payload.stack, 1400);
    const path = clean(payload.path, 240);
    const code = clean(payload.code, 120);
    const contextText = clean(payload.context, 500);

    const requestId = await sendOneWayBridgeEvent(context, {
      action: 'client_error',
      userId: user.id,
      extra: {
        source,
        message,
        ...(stack ? { stack } : {}),
        ...(path ? { path } : {}),
        ...(code ? { code } : {}),
        ...(contextText ? { context: contextText } : {}),
      },
    });

    return json({ ok: true, queued: true, request_id: requestId }, 202);
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestGet() {
  return new Response('Method Not Allowed', { status: 405 });
}
