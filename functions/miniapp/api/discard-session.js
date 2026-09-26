import { json, readJson, handleError, HttpError } from '../../_lib/http.js';
import { miniAppUser } from '../../_lib/telegram-auth.js';
import {
  deletePage,
  getPage,
  updatePage,
  validatePagePayload,
} from '../../_lib/pages.js';

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);
    const pageId = String(payload.page_id || '').trim();
    const existedBefore = Boolean(payload.existed_before);

    if (existedBefore) {
      const original = payload.original;
      if (!pageId || !original || typeof original !== 'object' || Array.isArray(original)) {
        throw new HttpError(400, 'invalid_request');
      }
      const current = await getPage(context.env.DB, pageId);
      if (!current || current.owner_id !== user.id) throw new HttpError(404, 'page_not_found');
      const content = validatePagePayload({
        blocks: original.blocks,
        buttons: original.buttons ?? [],
        buttons_per_row: original.buttons_per_row ?? 1,
        buttons_align: original.buttons_align ?? 'center',
      }, current);
      await updatePage(
        context.env.DB,
        user.id,
        pageId,
        String(original.title || pageId).slice(0, 64),
        content,
      );
      return json({ ok: true, action: 'restored', page_id: pageId });
    }

    const deleted = pageId ? await deletePage(context.env.DB, user.id, pageId) : false;
    return json({ ok: true, action: 'discarded', deleted });
  } catch (error) {
    return handleError(error);
  }
}
