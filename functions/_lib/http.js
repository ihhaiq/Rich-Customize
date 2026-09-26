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
  if (error instanceof HttpError) return text(error.message, error.status);
  console.error('Mini App API failure', error);
  return text('Internal Server Error', 500);
}
