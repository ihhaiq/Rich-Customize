import { json, handleError, HttpError } from '../_lib/http.js';
import { requireInternalSecret } from '../_lib/internal-auth.js';
import { bridgeTokenForSetup } from '../_lib/b2b-bridge.js';

function webhookSecret(env) {
  const value = String(env.B2B_WEBHOOK_SECRET || '').trim();
  if (!/^[A-Za-z0-9_-]{16,256}$/.test(value)) {
    throw new HttpError(500, 'B2B_WEBHOOK_SECRET must be 16-256 characters using A-Z a-z 0-9 _ -');
  }
  return value;
}

export async function onRequestPost(context) {
  try {
    requireInternalSecret(context);
    const origin = new URL(context.request.url).origin;
    const webhookUrl = origin + '/miniapp/api/bridge/webhook';
    const token = bridgeTokenForSetup(context.env);

    const response = await fetch('https://api.telegram.org/bot' + token + '/setWebhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: webhookSecret(context.env),
        allowed_updates: ['message'],
        drop_pending_updates: false,
      }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok) {
      throw new HttpError(
        Number(data?.error_code || response.status || 502),
        data?.description || 'Telegram setWebhook failed',
      );
    }

    return json({ ok: true, webhook_url: webhookUrl });
  } catch (error) {
    return handleError(error);
  }
}
