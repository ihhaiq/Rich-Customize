import { json, readJson, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import { createUserPicker } from '../../../_lib/user-picker.js';
import { telegramApi } from '../../../_lib/telegram-api.js';

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);
    const pageId = String(payload.page_id || '');
    const blockId = String(payload.block_id || '');
    const marker = String(payload.marker || '').trim() || null;
    if (!pageId || !blockId) throw new HttpError(400, 'invalid_request');

    const pending = await createUserPicker(
      context.env.DB,
      user.id,
      pageId,
      blockId,
      marker,
    );

    await telegramApi(context.env, 'sendMessage', {
      chat_id: user.id,
      text: 'اختر المستخدم\n' + pending.title,
      reply_markup: {
        keyboard: [[{
          text: '👤 اختيار · ' + pending.title,
          request_users: {
            request_id: pending.requestId,
            max_quantity: 1,
            request_name: true,
            request_username: true,
            request_photo: true,
          },
        }]],
        resize_keyboard: true,
        one_time_keyboard: true,
        selective: true,
      },
    });

    return json({
      ok: true,
      request_id: pending.requestId,
      page_id: pageId,
    });
  } catch (error) {
    return handleError(error);
  }
}
