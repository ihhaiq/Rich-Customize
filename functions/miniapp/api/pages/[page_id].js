import { json, readJson, handleError, HttpError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import {
  getPage,
  updatePage,
  validatePagePayload,
} from '../../../_lib/pages.js';

function requestedPageId(context) {
  return String(context.params?.page_id || '');
}

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const pageId = requestedPageId(context);
    const page = await getPage(context.env.DB, pageId);
    if (!page || page.owner_id !== user.id) throw new HttpError(404, 'Page not found');
    return json({ ok: true, page: { page_id: pageId, ...page } });
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPut(context) {
  try {
    const user = await miniAppUser(context);
    const pageId = requestedPageId(context);
    const current = await getPage(context.env.DB, pageId);
    if (!current || current.owner_id !== user.id) throw new HttpError(404, 'Page not found');

    const payload = await readJson(context.request);
    const content = validatePagePayload(payload, current);
    const title = String(payload.title || current.title || pageId).slice(0, 64);
    await updatePage(context.env.DB, user.id, pageId, title, content);
    return json({ ok: true, beta: '0.3', page_id: pageId, title });
  } catch (error) {
    return handleError(error);
  }
}
