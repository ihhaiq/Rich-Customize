import { requestMiniAppSession } from './_lib/web-session.js';

const MINIAPP_SERVERLESS_ORIGIN = 'https://app8416656269.tgcloud.ai';
const MINIAPP_API_PREFIX = '/miniapp/api/';

function requiresVerifiedEntry(pathname) {
  return pathname === '/editor.html' || pathname === '/editor' || pathname.startsWith('/editor/');
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const isMiniAppApi = url.pathname.startsWith(MINIAPP_API_PREFIX)
    && url.pathname !== '/miniapp/api/bridge/webhook';
  const origin = context.request.headers.get('Origin') || '';
  const allowMiniAppOrigin = isMiniAppApi && origin === MINIAPP_SERVERLESS_ORIGIN;

  if (allowMiniAppOrigin && context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': MINIAPP_SERVERLESS_ORIGIN,
        'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'Content-Type, X-Telegram-Init-Data',
        'access-control-max-age': '600',
        'vary': 'Origin',
      },
    });
  }

  let response;
  if (requiresVerifiedEntry(url.pathname)) {
    const session = await requestMiniAppSession(context.request, context.env.BOT_TOKEN);
    if (!session) {
      const entry = new URL('/', url.origin);
      entry.searchParams.set('continue', 'editor');
      return Response.redirect(entry.toString(), 302);
    }

    response = await context.next();
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store, private');
    headers.set('x-content-type-options', 'nosniff');
    headers.set('referrer-policy', 'no-referrer');
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } else {
    response = await context.next();
  }

  if (allowMiniAppOrigin) {
    const headers = new Headers(response.headers);
    headers.set('access-control-allow-origin', MINIAPP_SERVERLESS_ORIGIN);
    headers.set('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    headers.set('access-control-allow-headers', 'Content-Type, X-Telegram-Init-Data');
    headers.append('vary', 'Origin');
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
  return response;
}
