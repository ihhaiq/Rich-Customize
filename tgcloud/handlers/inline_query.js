import { api } from 'sdk';
import { savedPageQueryResult, resolveSavedPageReference, ambiguousPageQueryResult } from 'lib/page-delivery';
import { claimUpdate, releaseUpdate } from 'lib/request-guard';
import { resolveUserLanguage } from 'lib/i18n';
import { logError } from 'lib/error-log';

export default async function (query, ctx = {}) {
  const updateId = ctx?.update?.update_id;
  if (!await claimUpdate(updateId)) return;

  try {
    const raw = String(query?.query || '').trim();
    const language = await resolveUserLanguage(query?.from);
    const resolved = await resolveSavedPageReference(raw, query?.from?.id);
    if (resolved.status !== 'found') {
      await api.answerInlineQuery({
        inline_query_id: query.id,
        results: resolved.status === 'ambiguous' ? [ambiguousPageQueryResult(language)] : [],
        cache_time: 0,
        is_personal: true,
      });
      return;
    }
    const pageId = resolved.pageId;

    let result = null;
    try {
      result = await savedPageQueryResult(
        pageId,
        language,
      );
    } catch (error) {
      console.error('Failed to render inline saved page', error);
      await logError('inline_query.render', error, {
        updateId,
        userId: query?.from?.id,
        extra: pageId ? 'page=' + pageId : null,
      });
    }
    await api.answerInlineQuery({
      inline_query_id: query.id,
      results: result ? [result] : [],
      cache_time: 0,
      is_personal: true,
    });
  } catch (error) {
    await logError('inline_query', error, {
      updateId,
      userId: query?.from?.id,
    });
    await releaseUpdate(updateId);
    throw error;
  }
}
