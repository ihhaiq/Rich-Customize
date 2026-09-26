import { HttpError } from './http.js';

function constantTimeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  if (!a || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export function requireInternalSecret(context) {
  const configured = String(context.env.SYNC_SECRET || '');
  if (!configured) throw new HttpError(500, 'SYNC_SECRET is not configured');
  const auth = String(context.request.headers.get('authorization') || '');
  const supplied = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '';
  if (!constantTimeEqual(configured, supplied)) throw new HttpError(401, 'Unauthorized');
}
