import { json, handleError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { queueTextBridgeRequest } from '../../_lib/b2b-bridge.js';

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const requestId = await queueTextBridgeRequest(context, {
      action: 'destinations',
      userId: user.id,
    });

    return json({
      ok: true,
      pending: true,
      request_id: requestId,
      action: 'destinations',
      beta: '0.4-b2b',
    }, 202);
  } catch (error) {
    return handleError(error);
  }
}
