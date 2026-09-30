import { json, handleError } from '../_lib/http.js';
import { requireInternalSecret } from '../_lib/internal-auth.js';
import {
  bridgeHealthSnapshot,
  requireBridgeDb,
} from '../_lib/b2b-bridge.js';
import { pageMirrorStatus } from '../_lib/page-mirror.js';

export async function onRequestGet(context) {
  try {
    requireInternalSecret(context);
    const db = requireBridgeDb(context.env);
    const health = await bridgeHealthSnapshot(db, context.env);
    const mirror = await pageMirrorStatus(db);
    return json({ ok: true, bridge: health, page_mirror: mirror });
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost(context) {
  return onRequestGet(context);
}
