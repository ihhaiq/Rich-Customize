export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function text(message, status = 400) {
  return new Response(String(message ?? ''), {
    status,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export async function readJson(request) {
  let value;
  try {
    value = await request.json();
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'JSON object required');
  }
  return value;
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = Number(status) || 500;
  }
}

export function handleError(error) {
  const status = error instanceof HttpError ? error.status : 500;
  // Preserve existing user-input errors; never disclose server configuration,
  // Telegram credentials or internal bridge diagnostics to Mini App clients.
  if (status < 500) return text(error.message, status);
  console.error('Mini App API failure', error);
  return json({
    ok: false,
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'تعذر إكمال الطلب بسبب مشكلة بالخدمة. حاول مجدداً بعد قليل. / Service temporarily unavailable. Please retry.',
    },
    retryable: [502, 503, 504].includes(status),
  }, status);
}
