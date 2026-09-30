import { handleError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { telegramFileResponse } from '../../../_lib/telegram-api.js';

export async function onRequestGet(context) {
  try {
    await miniAppUser(context);
    return await telegramFileResponse(context.env, context.params?.file_id);
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost() {
  return new Response('Method Not Allowed', { status: 405 });
}
