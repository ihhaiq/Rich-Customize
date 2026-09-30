import { json, readJson, handleError, HttpError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { sendOneWayBridgeEvent } from '../../_lib/b2b-bridge.js';

function clean(value, limit) {
  return String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, limit);
}

function expectedClientError(source, code, message) {
  if (String(source) !== 'api') return false;
  const normalizedCode = String(code || '').toUpperCase();
  if (/^HTTP_4\d\d$/.test(normalizedCode) && normalizedCode !== 'HTTP_429') return true;
  if (/^(INVALID_|EMPTY_|PAGE_(NOT_FOUND|CONFLICT|LIMIT|BUSY)|BASE_REVISION_REQUIRED|DOCUMENT_REQUIRED|DOCUMENT_TOO_LARGE)/.test(normalizedCode)) return true;
  return /page must contain at least one block|invalid .+| is required|not found|does not belong to this user/i.test(String(message || ''));
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

    if (expectedClientError(source, code, message)) {
      return json({ ok: true, ignored: true, reason: 'expected_client_error' });
    }

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
