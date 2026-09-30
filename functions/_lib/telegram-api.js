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


export async function telegramFileResponse(env, fileId) {
  const id = String(fileId || '').trim();
  if (!id || id.length > 512 || /\s/.test(id)) throw new HttpError(400, 'invalid_file_id');

  const file = await telegramApi(env, 'getFile', { file_id: id });
  const path = String(file?.file_path || '').trim();
  if (!path) throw new HttpError(404, 'telegram_file_unavailable');

  const token = String(env.BOT_TOKEN || '').trim();
  if (!token) throw new HttpError(500, 'BOT_TOKEN is not configured');

  const response = await fetch('https://api.telegram.org/file/bot' + token + '/' + path, {
    method: 'GET',
  });
  if (!response.ok || !response.body) {
    throw new HttpError(Number(response.status || 502), 'telegram_file_download_failed');
  }

  const headers = new Headers();
  const contentType = response.headers.get('content-type');
  const contentLength = response.headers.get('content-length');
  if (contentType) headers.set('content-type', contentType);
  if (contentLength) headers.set('content-length', contentLength);
  headers.set('cache-control', 'private, max-age=3600');
  headers.set('x-content-type-options', 'nosniff');
  return new Response(response.body, { status: 200, headers });
}
