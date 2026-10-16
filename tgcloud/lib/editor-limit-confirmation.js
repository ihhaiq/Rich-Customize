import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { richPages } from 'schema';
import { editorQuotaUsage, trimEditorBlocksToLimits } from 'lib/editor-blocks';
import {
  acquireEditorMutationLock,
  loadEditorSession,
  rememberEditorState,
  releaseEditorMutationLock,
  updateEditorSession,
} from 'lib/editor-session';
import { getEditorEntitlement } from 'lib/editor-subscriptions';
import { isLegacySavedPage } from 'lib/saved-page-policy';
import { logError } from 'lib/error-log';
import { resolveLanguage, tr } from 'lib/i18n';

const CONFIRMATION_KIND = 'editor_limit_confirmation';
const PLAN_LINK = 'https://t.me/richDonateBot?start=rich_plans_limits';

const LIMIT_NAMES = Object.freeze({
  blocks: ['عدد البلوكات', 'blocks'],
  characters: ['عدد الأحرف', 'characters'],
  nesting_depth: ['مستويات التداخل', 'nesting levels'],
  media_attachments: ['مرفقات الوسائط', 'media attachments'],
  table_columns: ['أعمدة الجدول', 'table columns'],
  table_rows: ['صفوف الجدول', 'table rows'],
});

function confirmationText(limit, languageCode) {
  const locale = resolveLanguage(languageCode);
  const [arabicName, englishName] = LIMIT_NAMES[limit.code] || ['المحتوى', 'content'];
  const name = locale === 'ar' ? arabicName : tr(locale, englishName);
  const amount = locale === 'ar'
    ? '\nالحد: ' + limit.limit + ' · الموجود: ' + limit.actual + ' · ' + name
    : '\nLimit: ' + limit.limit + ' · Current: ' + limit.actual + ' · ' + name;
  const message = locale === 'ar'
    ? limit.source === 'plan'
      ? 'وصلت للحد الخاص بالخطة عندك، راح أعتمد الحد والمحتوى الزائد يتم تجاهله.'
      : 'المحتوى يتجاوز حدود تليكرام، راح أحذف الزائد وأكمل بالمسموح.'
    : limit.source === 'plan'
      ? tr(locale, 'Your plan limit has been reached. I will keep only the allowed content and remove the excess.')
      : tr(locale, 'This content exceeds Telegram limits. I will remove the excess and continue within the allowed limits.');
  return message + amount;
}

function confirmationKeyboard(limit, languageCode) {
  const locale = resolveLanguage(languageCode);
  const approve = limit.source === 'plan'
    ? (locale === 'ar' ? 'موافق' : tr(locale, 'Agree'))
    : (locale === 'ar' ? 'إكمال بالمسموح' : tr(locale, 'Continue within limits'));
  const rows = [];
  if (limit.source === 'plan') {
    rows.push([
      { text: locale === 'ar' ? 'ترقية الحدود' : tr(locale, 'Upgrade limits'), url: PLAN_LINK },
      { text: approve, callback_data: 'r:limit:accept' },
    ]);
  } else {
    rows.push([{ text: approve, callback_data: 'r:limit:accept' }]);
  }
  rows.push([{
    text: locale === 'ar' ? 'رفض' : tr(locale, 'Reject'),
    callback_data: 'r:limit:reject',
  }]);
  return { inline_keyboard: rows };
}

function resetChanges(changes = {}) {
  const allowed = new Set([
    'currentBlockId',
    'blockScrollOffset',
    'blockScrollEnabled',
    'nestedDetailsId',
    'nestedChildId',
    'nestedAction',
  ]);
  return Object.fromEntries(
    Object.entries(changes).filter(([key]) => allowed.has(key)),
  );
}

function pendingCleanup(session) {
  return {
    state: 'managing',
    currentBlockId: null,
    pendingAddType: null,
    pendingChildType: null,
    addStep: null,
    addPayload: {},
    expectedType: null,
    editField: null,
    headingSize: null,
    nestedDetailsId: null,
    nestedChildId: null,
    nestedAction: null,
    addPromptChatId: null,
    addPromptMessageId: null,
    pendingUserState: null,
    resumingUserButtons: 0,
    blockScrollEnabled: 1,
    ...(session?.blockScrollOffset != null
      ? { blockScrollOffset: session.blockScrollOffset }
      : {}),
  };
}

async function deleteQuietly(chatId, messageId) {
  if (!chatId || !messageId) return;
  try {
    await api.deleteMessage({ chat_id: chatId, message_id: messageId });
  } catch {}
}

async function clearCapturedInput(pending) {
  await deleteQuietly(pending.inputChatId, pending.inputMessageId);
  await deleteQuietly(pending.addPromptChatId, pending.addPromptMessageId);
}

function limitError(limit) {
  const error = new Error(
    'EDITOR_LIMIT:' + limit.code + ':' + limit.actual + ':' + limit.limit,
  );
  error.editorLimit = {
    code: String(limit.code),
    actual: Number(limit.actual),
    limit: Number(limit.limit),
    source: String(limit.source || 'telegram'),
  };
  return error;
}

async function logLimitPrompt(userId, session, limit, entitlement) {
  const usage = editorQuotaUsage(session.blocks || []);
  await logError('editor.limit.confirmation', limitError(limit), {
    userId,
    chatId: session.chatId,
    extra: [
      'source=' + String(limit.source || 'telegram'),
      'plan=' + String(entitlement?.plan || 'free'),
      'quota=' + String(limit.code),
      'actual=' + Number(limit.actual),
      'limit=' + Number(limit.limit),
      'blocks=' + usage.blocks,
      'text=' + usage.text,
      'media=' + usage.mediaAttachments,
      'depth=' + usage.nestingDepth,
    ].join('; '),
  });
}

export async function requestEditorLimitConfirmation({
  userId,
  session,
  candidateBlocks,
  limit,
  languageCode = 'en',
  action = 'commit',
  changes = {},
  inputMessage = null,
  query = null,
  callbackAlreadyAnswered = false,
}) {
  if (!limit || limit.ok || !['plan', 'telegram'].includes(limit.source)) return false;
  if (session?.pendingUserState != null) {
    if (query && !callbackAlreadyAnswered) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: tr(resolveLanguage(languageCode), 'Finish the current action first.'),
        show_alert: true,
      });
    } else {
      await api.sendMessage({
        chat_id: userId,
        text: tr(resolveLanguage(languageCode), 'Finish the current action first.'),
      });
    }
    return false;
  }

  const entitlement = await getEditorEntitlement(userId);
  if (session.currentPageId) {
    const page = await db.select().from(richPages)
      .where(eq(richPages.pageId, String(session.currentPageId))).get();
    if (page && Number(page.ownerId) === Number(userId) && isLegacySavedPage(page, userId, entitlement)) {
      await api.sendMessage({
        chat_id: userId,
        text: tr(
          resolveLanguage(languageCode),
          'This saved page is read-only under your current plan. Its content was not changed.',
        ),
      });
      if (query && !callbackAlreadyAnswered) {
        await api.answerCallbackQuery({ callback_query_id: query.id });
      }
      return false;
    }
  }

  const pending = {
    kind: CONFIRMATION_KIND,
    action: action === 'preview' ? 'preview' : 'commit',
    candidateBlocks: JSON.parse(JSON.stringify(candidateBlocks || [])),
    baseBlocks: action === 'preview'
      ? null
      : JSON.parse(JSON.stringify(session.blocks || [])),
    changes: resetChanges(changes),
    inputChatId: Number(inputMessage?.chat?.id || 0) || null,
    inputMessageId: Number(inputMessage?.message_id || 0) || null,
    addPromptChatId: Number(session.addPromptChatId || 0) || null,
    addPromptMessageId: Number(session.addPromptMessageId || 0) || null,
    createdAt: Math.floor(Date.now() / 1000),
    promptMessageId: null,
  };

  await updateEditorSession(userId, {
    ...pendingCleanup(session),
    state: 'confirming_limit',
    pendingUserState: pending,
  });
  const sent = await api.sendMessage({
    chat_id: userId,
    text: confirmationText(limit, languageCode),
    reply_markup: confirmationKeyboard(limit, languageCode),
  });
  pending.promptMessageId = Number(sent?.message_id || 0) || null;
  await updateEditorSession(userId, { pendingUserState: pending });
  await logLimitPrompt(userId, session, limit, entitlement);
  if (query && !callbackAlreadyAnswered) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
  }
  return true;
}

export async function handleEditorLimitConfirmation(query) {
  const action = String(query?.data || '').slice('r:limit:'.length);
  if (!['accept', 'reject'].includes(action)) return false;
  const userId = Number(query?.from?.id);
  const lock = await acquireEditorMutationLock(userId);
  if (!lock) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return { handled: true };
  }

  try {
    const session = await loadEditorSession(userId);
    const pending = session?.pendingUserState;
    if (
      !session
      || session.state !== 'confirming_limit'
      || pending?.kind !== CONFIRMATION_KIND
      || Number(pending.promptMessageId) !== Number(query.message?.message_id)
    ) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: tr(resolveLanguage(query.from?.language_code), 'This confirmation has expired.'),
        show_alert: true,
      });
      return { handled: true };
    }

    if (action === 'reject') {
      await updateEditorSession(userId, pendingCleanup(session));
      await clearCapturedInput(pending);
      await deleteQuietly(query.message?.chat?.id, query.message?.message_id);
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: tr(resolveLanguage(query.from?.language_code), 'Operation cancelled.'),
      });
      return { handled: true, action: 'rejected', session, notice: tr(resolveLanguage(query.from?.language_code), 'Operation cancelled.') };
    }

    const currentBlocks = JSON.stringify(session.blocks || []);
    const expectedBlocks = pending.baseBlocks == null
      ? JSON.stringify(pending.candidateBlocks || [])
      : JSON.stringify(pending.baseBlocks);
    if (currentBlocks !== expectedBlocks) {
      await updateEditorSession(userId, pendingCleanup(session));
      await clearCapturedInput(pending);
      await deleteQuietly(query.message?.chat?.id, query.message?.message_id);
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: tr(resolveLanguage(query.from?.language_code), 'The editor changed. Review the current content and try again.'),
        show_alert: true,
      });
      return { handled: true, action: 'rejected', session };
    }

    const entitlement = await getEditorEntitlement(userId);
    const trimmed = trimEditorBlocksToLimits(
      pending.candidateBlocks,
      userId,
      { entitlement },
    );
    await rememberEditorState(userId, session);
    const updated = await updateEditorSession(userId, {
      ...pendingCleanup(session),
      ...pending.changes,
      blocks: trimmed.blocks,
      state: 'managing',
      pendingUserState: null,
    });
    await clearCapturedInput(pending);
    await deleteQuietly(query.message?.chat?.id, query.message?.message_id);
    if (pending.action !== 'preview') {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: tr(resolveLanguage(query.from?.language_code), 'Completed within the allowed limit; excess content was removed.'),
      });
      return {
        handled: true,
        action: 'committed',
        session: updated,
        notice: tr(resolveLanguage(query.from?.language_code), 'Completed within the allowed limit; excess content was removed.'),
      };
    }
    return { handled: true, action: 'preview', session: updated };
  } finally {
    await releaseEditorMutationLock(lock);
  }
}
