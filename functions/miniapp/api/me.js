import { json, handleError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    return json({ ok: true, user, beta: '0.3' });
  } catch (error) {
    return handleError(error);
  }
}
