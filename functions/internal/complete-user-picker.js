import { json, readJson, handleError, HttpError } from '../_lib/http.js';
import { requireInternalSecret } from '../_lib/internal-auth.js';
import { completeUserPicker } from '../_lib/user-picker.js';

export async function onRequestPost(context) {
  try {
    requireInternalSecret(context);
    const payload = await readJson(context.request);
    const ownerId = Number(payload.owner_id);
    const requestId = Number(payload.request_id);
    const selectedUserId = Number(payload.selected_user_id);
    if (![ownerId, requestId, selectedUserId].every(Number.isSafeInteger)) {
      throw new HttpError(400, 'invalid_request');
    }
    const result = await completeUserPicker(
      context.env.DB,
      ownerId,
      requestId,
      selectedUserId,
      payload.username || null,
    );
    if (!result) throw new HttpError(404, 'request_not_found');
    return json({ ok: true, result });
  } catch (error) {
    return handleError(error);
  }
}
