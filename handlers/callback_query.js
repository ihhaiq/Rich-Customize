import { api } from 'sdk';
import { withIdempotency, slidingWindowAllow, scopeForCallback } from 'lib/runtime/request_guard';
import { isDeveloper } from 'lib/config';
import {
  storageKeyForCallback,
  loadSession,
  patchSession,
  saveSession,
  safeEditText,
  STATE,
} from 'lib/editor/session';
import {
  editorDashboard,
  editorKeyboard,
  pagesKeyboard,
  pagesText,
} from 'lib/editor/ui';
import {
  getPage,
  queryPagesForUser,
  deletePage,
  restorePage,
} from 'lib/storage/pages';

async function answer(callback, text = undefined, showAlert = false) {
  try {
    await api.answerCallbackQuery({
      callback_query_id: callback.id,
      ...(text ? { text } : {}),
      ...(showAlert ? { show_alert: true } : {}),
    });
  } catch {
    // The callback may already be too old; the main action is still allowed.
  }
}

async function editCallbackMessage(callback, text, replyMarkup) {
  if (!callback?.message) return null;
  return safeEditText({
    chatId: callback.message.chat.id,
    messageId: callback.message.message_id,
    text,
    replyMarkup,
  });
}

async function showPages(callback, storageKey, pageIndex = 0) {
  const session = await loadSession(storageKey);
  const query = String(session.data.pages_search_query ?? '');
  const sortMode = String(session.data.pages_sort_mode ?? 'updated');
  const result = await queryPagesForUser(callback.from.id, { query, sortMode });
  const built = pagesKeyboard(result.pages, pageIndex);
  await editCallbackMessage(
    callback,
    pagesText(result.pages, result.ownedTotal, query),
    built.reply_markup,
  );
  await patchSession(storageKey, { pages_page_index: built.index }, { state: STATE.MANAGING });
}

async function rateLimit(callback) {
  const rule = scopeForCallback(callback?.data ?? '');
  if (!rule) return true;
  const allowed = await slidingWindowAllow({
    ...rule,
    userId: Number(callback.from.id),
    member: String(callback.id ?? Date.now()),
  });
  if (!allowed) await answer(callback, 'طلبات كثيرة بسرعة، حاول بعد لحظات.');
  return allowed;
}

export default async function callbackQueryHandler(callback, ctx = {}) {
  return withIdempotency(Number(ctx?.update?.update_id), async () => {
    if (!callback?.from || !callback?.message) {
      await answer(callback);
      return null;
    }
    const data = String(callback.data ?? '');
    if (!await rateLimit(callback)) return null;

    if (data.startsWith('dev:') && !await isDeveloper(callback.from.id)) {
      await answer(callback, 'غير مسموح.', true);
      return null;
    }

    const storageKey = storageKeyForCallback(callback);
    const session = await loadSession(storageKey);

    try {
      if (data === 'r:starteditor') {
        const next = {
          blocks: [],
          message_buttons: [],
          buttons_per_row: 1,
          buttons_align: 'center',
          current_page_id: null,
          current_page_title: null,
          management_chat_id: callback.message.chat.id,
          management_message_id: callback.message.message_id,
          editor_last_activity_at: Math.floor(Date.now() / 1000),
          pages_search_query: '',
          pages_sort_mode: 'updated',
        };
        await saveSession(storageKey, STATE.MANAGING, next);
        await editCallbackMessage(callback, 'المحرر فارغ. أضف بلوك أو أرسل نصًا جديدًا.', editorKeyboard(next));
        return null;
      }

      if (data === 'r:back') {
        await editCallbackMessage(callback, editorDashboard(session.data), editorKeyboard(session.data));
        return null;
      }

      if (data === 'r:savepage') {
        if (!Array.isArray(session.data.blocks) || !session.data.blocks.length) {
          await answer(callback, 'المحرر فارغ.', true);
          return null;
        }
        await patchSession(storageKey, {}, { state: STATE.SAVING_PAGE_NAME });
        await api.sendMessage({ chat_id: callback.message.chat.id, text: 'أرسل اسم الصفحة.' });
        return null;
      }

      if (data === 'r:pages' || data.startsWith('r:pages:')) {
        const raw = data.startsWith('r:pages:') ? data.slice('r:pages:'.length) : '0';
        await showPages(callback, storageKey, Math.max(0, Number.parseInt(raw, 10) || 0));
        return null;
      }

      if (data === 'r:psearch') {
        await patchSession(storageKey, {}, { state: STATE.SEARCHING_PAGE });
        await api.sendMessage({ chat_id: callback.message.chat.id, text: 'أرسل اسم الصفحة أو جزء منه للبحث.' });
        return null;
      }

      if (data.startsWith('r:pageopen:')) {
        const pageId = data.slice('r:pageopen:'.length);
        const page = await getPage(pageId);
        if (!page || Number(page.owner_id) !== Number(callback.from.id)) {
          await answer(callback, 'الصفحة محذوفة أو لا تخصك.', true);
          return null;
        }
        const next = {
          ...session.data,
          blocks: page.blocks ?? [],
          message_buttons: page.buttons ?? [],
          buttons_per_row: page.buttons_per_row ?? 1,
          buttons_align: page.buttons_align ?? 'center',
          current_page_id: pageId,
          current_page_title: page.title || pageId,
          management_chat_id: callback.message.chat.id,
          management_message_id: callback.message.message_id,
        };
        await saveSession(storageKey, STATE.MANAGING, next);
        await editCallbackMessage(callback, editorDashboard(next), editorKeyboard(next));
        await answer(callback, 'تم فتح الصفحة');
        return null;
      }

      if (data.startsWith('r:prename:')) {
        const parts = data.split(':');
        const pageId = parts[2] || '';
        const page = await getPage(pageId);
        if (!page || Number(page.owner_id) !== Number(callback.from.id)) {
          await answer(callback, 'الصفحة محذوفة أو لا تخصك.', true);
          return null;
        }
        await patchSession(storageKey, { rename_page_id: pageId }, { state: STATE.RENAMING_PAGE });
        await api.sendMessage({
          chat_id: callback.message.chat.id,
          text: `أرسل الاسم الجديد للصفحة «${page.title || pageId}».`,
        });
        return null;
      }

      if (data.startsWith('r:pdeleteok:')) {
        const parts = data.split(':');
        const pageId = parts[2] || '';
        const pageIndex = Math.max(0, Number.parseInt(parts[3] ?? '0', 10) || 0);
        const page = await getPage(pageId);
        if (!page || Number(page.owner_id) !== Number(callback.from.id)) {
          await answer(callback, 'الصفحة محذوفة أو لا تخصك.', true);
          return null;
        }
        const deleted = await deletePage(pageId, callback.from.id);
        if (!deleted) {
          await answer(callback, 'تعذر حذف الصفحة.', true);
          return null;
        }
        await patchSession(storageKey, {
          deleted_page_id: pageId,
          deleted_page_snapshot: page,
          deleted_page_index: pageIndex,
          deleted_page_was_current: session.data.current_page_id === pageId,
          ...(session.data.current_page_id === pageId
            ? { current_page_id: null, current_page_title: null }
            : {}),
        }, { state: STATE.MANAGING });
        await editCallbackMessage(callback, 'تم حذف الصفحة ويمكن استرجاعها.', {
          inline_keyboard: [
            [{ text: 'استرجاع', callback_data: 'r:prestore', style: 'success' }],
            [{ text: 'رجوع', callback_data: `r:pages:${pageIndex}` }],
          ],
        });
        return null;
      }

      if (data === 'r:prestore') {
        const pageId = String(session.data.deleted_page_id ?? '');
        const snapshot = session.data.deleted_page_snapshot;
        if (!pageId || !snapshot || typeof snapshot !== 'object') {
          await answer(callback, 'الاسترجاع غير متوفر.', true);
          return null;
        }
        const restored = await restorePage(pageId, callback.from.id, snapshot);
        if (!restored) {
          await answer(callback, 'الاسترجاع غير متوفر.', true);
          return null;
        }
        const pageIndex = Math.max(0, Number(session.data.deleted_page_index) || 0);
        await patchSession(storageKey, {
          deleted_page_id: null,
          deleted_page_snapshot: null,
          deleted_page_index: null,
          deleted_page_was_current: null,
          ...(session.data.deleted_page_was_current
            ? { current_page_id: pageId, current_page_title: snapshot.title || pageId }
            : {}),
        }, { state: STATE.MANAGING });
        await showPages(callback, storageKey, pageIndex);
        await answer(callback, 'تم استرجاع الصفحة');
        return null;
      }

      if (data.startsWith('r:')) {
        await answer(callback, 'هذا الجزء قيد النقل إلى Serverless.');
        return null;
      }

      await answer(callback);
      return null;
    } finally {
      // Stop Telegram's callback spinner even when the action did not explicitly answer.
      await answer(callback);
    }
  });
}
