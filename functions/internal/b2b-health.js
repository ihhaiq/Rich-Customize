import { json, handleError } from '../_lib/http.js';
import { requireInternalSecret } from '../_lib/internal-auth.js';
import {
  bridgeHealthSnapshot,
  requireBridgeDb,
} from '../_lib/b2b-bridge.js';

export async function onRequestGet(context) {
  try {
    requireInternalSecret(context);
    const db = requireBridgeDb(context.env);
    const health = await bridgeHealthSnapshot(db, context.env);
    return json({ ok: true, bridge: health });
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost(context) {
  return onRequestGet(context);
}
