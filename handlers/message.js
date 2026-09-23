import { api } from 'sdk';
import { withIdempotency, slidingWindowAllow, scopeForMessage } from 'lib/runtime/request_guard';
import { isDeveloper } from 'lib/config';
import { PageLimitError } from 'lib/errors';
import {
  storageKeyForMessage,
  loadSession,
  saveSession,
  patchSession,
  resetSession,
  STATE,
} from 'lib/editor/session';
import { editorDashboard, editorKeyboard, welcomeKeyboard, welcomeRichMessage } from 'lib/editor/ui';
import { savePage, renamePage, queryPagesForUser } from 'lib/storage/pages';

function commandOf(text) {
  const first = String(text ?? '').trim().split(/\s+/, 1)[0];
  if (!first.startsWith('/')) return '';
  return first.split('@', 1)[0].toLocaleLowerCase();
}

function simpleTextBlock(text) {
  return {
    id: `txt_${Date.now().toString(36)}`,
    type: 'paragraph',
    position: 0,
    source: 'generated',
    data: { text: String(text), html: String(text) },
  };
}

async function rateLimit(message, state) {
  const rule = scopeForMessage(message?.text ?? '', state ?? '');
  if (!rule || !Number.isSafeInteger(Number(message?.from?.id))) return true;
  const allowed = await slidingWindowAllow({
    ...rule,
    userId: Number(message.from.id),
    member: String(message.message_id ?? Date.now()),
  });
  if (!allowed) {
    await api.sendMessage({ chat_id: message.chat.id, text: 'طلبات كثيرة بسرعة، حاول بعد لحظات.' });
  }
  return allowed;
}

export default async function messageHandler(message, ctx = {}) {
  return withIdempotency(Number(ctx?.update?.update_id), async () => {
    if (!message?.chat) return null;
    const storageKey = storageKeyForMessage(message);
    const session = await loadSession(storageKey);
    const command = commandOf(message.text);
    if (!await rateLimit(message, session.state)) return null;

    if (command === '/dev' && !await isDeveloper(message?.from?.id)) {
      return null;
    }

    if (command === '/start') {
      return api.sendRichMessage({
        chat_id: message.chat.id,
        rich_message: welcomeRichMessage(message.from),
        reply_markup: welcomeKeyboard(),
      });
    }

    if (command === '/editor') {
      await resetSession(storageKey);
      const sent = await api.sendMessage({
        chat_id: message.chat.id,
        text: 'المحرر فارغ. أضف بلوك أو أرسل نصًا جديدًا.',
        reply_markup: editorKeyboard({ blocks: [], message_buttons: [] }),
      });
      await saveSession(storageKey, STATE.MANAGING, {
        blocks: [],
        message_buttons: [],
        buttons_per_row: 1,
        buttons_align: 'center',
        current_page_id: null,
        current_page_title: null,
        management_chat_id: sent.chat.id,
        management_message_id: sent.message_id,
        editor_last_activity_at: Math.floor(Date.now() / 1000),
        pages_search_query: '',
        pages_sort_mode: 'updated',
      });
      return sent;
    }

    if (command === '/pages') {
      const result = await queryPagesForUser(message?.from?.id, { sortMode: 'updated' });
      return api.sendMessage({
        chat_id: message.chat.id,
        text: `صفحاتي: ${result.ownedTotal}\nاستخدم زر صفحاتي من المحرر لإدارتها.`,
      });
    }

    if (session.state === STATE.SAVING_PAGE_NAME) {
      const title = String(message.text ?? '').trim();
      if (!title) {
        return api.sendMessage({ chat_id: message.chat.id, text: 'اسم الصفحة يجب أن يكون نصًا.' });
      }
      try {
        const pageId = await savePage({
          ownerId: message.from.id,
          title,
          blocks: session.data.blocks ?? [],
          buttons: session.data.message_buttons ?? [],
          buttonsPerRow: session.data.buttons_per_row ?? 1,
          buttonsAlign: session.data.buttons_align ?? 'center',
          pageId: session.data.current_page_id ?? null,
        });
        const data = await patchSession(storageKey, {
          current_page_id: pageId,
          current_page_title: title.slice(0, 64),
        }, { state: STATE.MANAGING });
        return api.sendMessage({
          chat_id: message.chat.id,
          text: editorDashboard(data, 'تم حفظ الصفحة.'),
          reply_markup: editorKeyboard(data),
        });
      } catch (error) {
        if (error instanceof PageLimitError) {
          return api.sendMessage({
            chat_id: message.chat.id,
            text: `وصلت حد الصفحات المحفوظة (${error.limit}). احذف صفحة قديمة أولًا.`,
          });
        }
        throw error;
      }
    }

    if (session.state === STATE.RENAMING_PAGE) {
      const title = String(message.text ?? '').trim();
      if (!title) {
        return api.sendMessage({ chat_id: message.chat.id, text: 'اسم الصفحة يجب أن يكون نصًا.' });
      }
      const pageId = String(session.data.rename_page_id ?? '');
      const ok = await renamePage(pageId, message.from.id, title);
      const changes = { rename_page_id: null };
      if (ok && session.data.current_page_id === pageId) changes.current_page_title = title.slice(0, 64);
      await patchSession(storageKey, changes, { state: STATE.MANAGING });
      return api.sendMessage({
        chat_id: message.chat.id,
        text: ok ? 'تم تغيير اسم الصفحة.' : 'الصفحة محذوفة أو لا تخصك.',
      });
    }

    if (session.state === STATE.SEARCHING_PAGE) {
      const query = String(message.text ?? '').trim();
      await patchSession(storageKey, { pages_search_query: query }, { state: STATE.MANAGING });
      return api.sendMessage({
        chat_id: message.chat.id,
        text: query ? `تم حفظ البحث: ${query}\nافتح «صفحاتي» لعرض النتائج.` : 'تم إلغاء البحث.',
      });
    }

    if (!command && typeof message.text === 'string' && message.text.trim()) {
      const blocks = [simpleTextBlock(message.text.trim())];
      const sent = await api.sendMessage({
        chat_id: message.chat.id,
        text: editorDashboard({ blocks, message_buttons: [] }),
        reply_markup: editorKeyboard({ blocks, message_buttons: [] }),
      });
      await saveSession(storageKey, STATE.MANAGING, {
        blocks,
        message_buttons: [],
        buttons_per_row: 1,
        buttons_align: 'center',
        current_page_id: null,
        current_page_title: null,
        management_chat_id: sent.chat.id,
        management_message_id: sent.message_id,
        editor_last_activity_at: Math.floor(Date.now() / 1000),
        pages_search_query: '',
        pages_sort_mode: 'updated',
      });
      return sent;
    }

    return null;
  });
}
