import { api } from 'sdk';
import { savedPageQueryResult, normalizePageCode } from 'lib/page-delivery';
import { claimUpdate, releaseUpdate } from 'lib/request-guard';

export default async function (query, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;

  try {
    const raw = String(query?.query || '').trim();
    const first = raw ? raw.split(/\s+/, 1)[0] : '';
    const pageId = first ? normalizePageCode(first) : null;
    if (!pageId) {
      await api.answerInlineQuery({
        inline_query_id: query.id,
        results: [],
        cache_time: 0,
        is_personal: true,
      });
      return;
    }

    let result = null;
    try {
      result = await savedPageQueryResult(
        pageId,
        query?.from?.language_code || 'en',
      );
    } catch (error) {
      console.error('Failed to render inline saved page', error);
    }
    await api.answerInlineQuery({
      inline_query_id: query.id,
      results: result ? [result] : [],
      cache_time: 0,
      is_personal: true,
    });
  } catch (error) {
    await releaseUpdate(updateId);
    throw error;
  }
}
