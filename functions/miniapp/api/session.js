import { json, handleError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import { createMiniAppSession, miniAppSessionCookie } from '../../_lib/web-session.js';

const SESSION_TTL_SECONDS = 1800;

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const token = await createMiniAppSession(user.id, context.env.BOT_TOKEN, SESSION_TTL_SECONDS);
    return json(
      { ok: true, user: { id: user.id } },
      200,
      { 'set-cookie': miniAppSessionCookie(token, SESSION_TTL_SECONDS) },
    );
  } catch (error) {
    return handleError(error);
  }
}
