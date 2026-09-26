import { HttpError } from './http.js';

export async function telegramApi(env, method, payload = {}) {
  const token = String(env.BOT_TOKEN || '').trim();
  if (!token) throw new HttpError(500, 'BOT_TOKEN is not configured');
  const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const message = data?.description || ('Telegram API HTTP ' + response.status);
    throw new HttpError(Number(data?.error_code || response.status || 502), message);
  }
  return data.result;
}

export async function telegramMultipart(env, method, formData) {
  const token = String(env.BOT_TOKEN || '').trim();
  if (!token) throw new HttpError(500, 'BOT_TOKEN is not configured');
  const response = await fetch('https://api.telegram.org/bot' + token + '/' + method, {
    method: 'POST',
    body: formData,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok) {
    const message = data?.description || ('Telegram API HTTP ' + response.status);
    throw new HttpError(Number(data?.error_code || response.status || 502), message);
  }
  return data.result;
}
