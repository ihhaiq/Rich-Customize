import { requestMiniAppSession } from './_lib/web-session.js';

function requiresVerifiedEntry(pathname) {
  return pathname === '/editor.html' || pathname === '/editor' || pathname.startsWith('/editor/');
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  if (!requiresVerifiedEntry(url.pathname)) {
    return context.next();
  }

  const session = await requestMiniAppSession(context.request, context.env.BOT_TOKEN);
  if (!session) {
    const entry = new URL('/', url.origin);
    entry.searchParams.set('continue', 'editor');
    return Response.redirect(entry.toString(), 302);
  }

  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store, private');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
