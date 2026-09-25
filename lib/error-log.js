import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { legacyStates } from 'schema';

const NAMESPACE = 'error_log';
const MAX_ERROR_TEXT = 3500;

function now() {
  return Math.floor(Date.now() / 1000);
}

function sanitize(value) {
  return String(value ?? '')
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted-token]')
    .replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/gi, 'bot[redacted-token]');
}

function errorSummary(error) {
  const name = sanitize(error?.name || 'Error');
  const code = error?.code == null ? '' : ' [' + sanitize(error.code) + ']';
  const message = sanitize(error?.description || error?.message || error || 'Unknown error');
  return (name + code + ': ' + message).slice(0, 1800);
}

function safeId(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

async function readConfig() {
  try {
    const row = await db.select({ payload: legacyStates.payload })
      .from(legacyStates)
      .where(eq(legacyStates.namespace, NAMESPACE))
      .get();
    const payload = row?.payload;
    if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
      return { enabled: false, chatId: null, title: null, username: null };
    }
    return {
      enabled: Boolean(payload.enabled),
      chatId: safeId(payload.chat_id ?? payload.chatId),
      title: payload.title == null ? null : String(payload.title),
      username: payload.username == null ? null : String(payload.username),
    };
  } catch (error) {
    console.warn('Could not read error-log config', error);
    return { enabled: false, chatId: null, title: null, username: null };
  }
}

async function writeConfig(payload) {
  await db.insert(legacyStates).values({
    namespace: NAMESPACE,
    payload,
    updatedAt: now(),
  }).onConflictDoUpdate({
    target: legacyStates.namespace,
    set: { payload, updatedAt: now() },
  }).run();
}

export async function errorLogConfig() {
  return readConfig();
}

export async function configureErrorLogChannel(target) {
  const raw = String(target || '').trim();
  if (!raw) throw new Error('أرسل ID القناة أو @username.');

  let chatId = raw;
  if (/^-?\d+$/.test(raw)) chatId = Number(raw);
  const chat = await api.getChat({ chat_id: chatId });
  const type = String(chat?.type || '');
  if (type !== 'channel') {
    throw new Error('المحدد ليس قناة Telegram.');
  }

  const resolvedId = safeId(chat?.id);
  if (resolvedId == null) throw new Error('تعذر تحديد ID القناة.');

  const title = String(chat?.title || chat?.username || resolvedId);
  const username = chat?.username ? String(chat.username) : null;

  // Verify write access before persisting the destination.
  await api.sendMessage({
    chat_id: resolvedId,
    text: '✅ تم ربط قناة سجل أخطاء Rich Message Editor.\n\nراح توصل هنا الأخطاء غير المتوقعة بدون محتوى رسائل المستخدمين أو التوكنات.',
    disable_notification: true,
  });

  await writeConfig({
    enabled: true,
    chat_id: resolvedId,
    title,
    username,
    updated_at: now(),
  });
  return { enabled: true, chatId: resolvedId, title, username };
}

export async function disableErrorLogChannel() {
  const current = await readConfig();
  await writeConfig({
    enabled: false,
    chat_id: current.chatId,
    title: current.title,
    username: current.username,
    updated_at: now(),
  });
  return { ...current, enabled: false };
}

export async function testErrorLogChannel() {
  const config = await readConfig();
  if (!config.enabled || config.chatId == null) {
    throw new Error('قناة سجل الأخطاء غير مفعلة.');
  }
  await api.sendMessage({
    chat_id: config.chatId,
    text: '✅ اختبار سجل الأخطاء ناجح.\n\nالقناة مربوطة وتستقبل التنبيهات.',
    disable_notification: true,
  });
  return true;
}

function contextLines(context) {
  const rows = [];
  const updateId = safeId(context?.updateId);
  const userId = safeId(context?.userId);
  const chatId = safeId(context?.chatId);
  if (updateId != null) rows.push('Update: ' + updateId);
  if (userId != null) rows.push('User: ' + userId);
  if (chatId != null) rows.push('Chat: ' + chatId);
  if (context?.callbackData) rows.push('Callback: ' + sanitize(context.callbackData).slice(0, 180));
  if (context?.extra) rows.push('Context: ' + sanitize(context.extra).slice(0, 300));
  return rows;
}

export async function logError(scope, error, context = {}) {
  try {
    const config = await readConfig();
    if (!config.enabled || config.chatId == null) return false;

    const lines = [
      '🚨 Rich Message Editor',
      '',
      'المصدر: ' + sanitize(scope || 'unknown'),
      'الخطأ: ' + errorSummary(error),
      ...contextLines(context),
      'الوقت: ' + new Date().toISOString(),
    ];
    const text = lines.join('\n').slice(0, MAX_ERROR_TEXT);
    await api.sendMessage({
      chat_id: config.chatId,
      text,
      disable_notification: true,
    });
    return true;
  } catch (loggingError) {
    // Never let logging failure hide or recursively reproduce the original error.
    console.error('Could not deliver error-log notification', loggingError);
    return false;
  }
}
