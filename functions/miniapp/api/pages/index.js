import { json, readJson, handleError } from '../../../_lib/http.js';
import { miniAppUser } from '../../../_lib/telegram-auth.js';
import {
  createPage,
  listOwnerPages,
  validatePagePayload,
} from '../../../_lib/pages.js';

export async function onRequestGet(context) {
  try {
    const user = await miniAppUser(context);
    const pages = await listOwnerPages(context.env.DB, user.id);
    return json({
      ok: true,
      beta: '0.3',
      pages: pages.map((page) => ({
        page_id: page.page_id,
        title: page.title || page.page_id,
        updated_at: page.updated_at,
        block_count: Array.isArray(page.blocks) ? page.blocks.length : 0,
      })),
    });
  } catch (error) {
    return handleError(error);
  }
}

export async function onRequestPost(context) {
  try {
    const user = await miniAppUser(context);
    const payload = await readJson(context.request);
    const content = validatePagePayload(payload);
    const title = String(payload.title || 'Untitled').slice(0, 64);
    const pageId = await createPage(context.env.DB, context.env, user.id, title, content);
    return json({ ok: true, beta: '0.3', page_id: pageId, title });
  } catch (error) {
    return handleError(error);
  }
}
