import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { legacyStates } from 'schema';

const NAMESPACE = 'error_log';
const MAX_ERROR_TEXT = 3500;
const DUPLICATE_COOLDOWN_SECONDS = 60;

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
      return {
        enabled: false,
        chatId: null,
        title: null,
        username: null,
        lastErrorKey: null,
        lastErrorAt: 0,
      };
    }
    return {
      enabled: Boolean(payload.enabled),
      chatId: safeId(payload.chat_id ?? payload.chatId),
      title: payload.title == null ? null : String(payload.title),
      username: payload.username == null ? null : String(payload.username),
      lastErrorKey: payload.last_error_key == null ? null : String(payload.last_error_key),
      lastErrorAt: safeId(payload.last_error_at) ?? 0,
    };
  } catch (error) {
    console.warn('Could not read error-log config', error);
    return {
      enabled: false,
      chatId: null,
      title: null,
      username: null,
      lastErrorKey: null,
      lastErrorAt: 0,
    };
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
    last_error_key: null,
    last_error_at: 0,
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

function errorTypeTitle(scope) {
  const value = String(scope || 'unknown');
  const titles = {
    message: 'خطأ معالجة رسالة',
    callback_query: 'خطأ معالجة زر',
    guest_message: 'خطأ وضع الضيف',
    inline_query: 'خطأ البحث Inline',
    'inline_query.render': 'خطأ عرض صفحة Inline',
    channel_post: 'خطأ منشور قناة',
    edited_channel_post: 'خطأ تعديل منشور قناة',
    my_chat_member: 'خطأ صلاحيات أو عضوية البوت',
    'welcome.idle_rich_fallback': 'خطأ رسالة الترحيب',
    'welcome.start_rich_fallback': 'خطأ /start',
    'editor.home_rich_fallback': 'خطأ واجهة المحرر',
    'editor.preview.block': 'خطأ معاينة بلوك',
    'editor.preview.result': 'خطأ معاينة النتيجة',
    'editor.preview.peek': 'خطأ المعاينة السريعة',
    'showcase.message': 'خطأ Showcase',
    'showcase.callback': 'خطأ Showcase',
    'page_navigation.render': 'خطأ عرض صفحة',
    'page_navigation.open': 'خطأ فتح صفحة',
    'page_navigation.back': 'خطأ الرجوع بين الصفحات',
    'page_navigation.home': 'خطأ الصفحة الرئيسية',
    'page_navigation.restore': 'خطأ استعادة رسالة Ephemeral',
    'publish.send': 'خطأ نشر',
  };
  return titles[value] || ('خطأ: ' + value.replace(/[._-]+/g, ' '));
}

function tableCell(text, header = false) {
  return {
    text: String(text ?? '—'),
    align: 'right',
    valign: 'middle',
    ...(header ? { is_header: true } : {}),
  };
}

function detailRows(scope, error, context) {
  const rows = [
    ['المصدر', sanitize(scope || 'unknown')],
    ['الخطأ', errorSummary(error)],
  ];
  const updateId = safeId(context?.updateId);
  const chatId = safeId(context?.chatId);
  if (updateId != null) rows.push(['Update ID', updateId]);
  if (chatId != null) rows.push(['Chat ID', chatId]);
  if (context?.callbackData) rows.push(['Callback', sanitize(context.callbackData).slice(0, 220)]);
  if (context?.extra) rows.push(['السياق', sanitize(context.extra).slice(0, 420)]);
  return rows;
}

function buildErrorRichMessage(scope, error, context, isoTime) {
  const cells = [[tableCell('التفصيل', true), tableCell('القيمة', true)]];
  for (const [label, value] of detailRows(scope, error, context)) {
    cells.push([tableCell(label), tableCell(value)]);
  }

  const footer = ['الوقت: ' + isoTime];
  const userId = safeId(context?.userId);
  if (userId != null) {
    footer.push(
      '\nالمستخدم: ',
      {
        type: 'button',
        button: {
          text: 'فتح المستخدم · ' + userId,
          url: 'tg://user?id=' + userId,
          style: 'primary',
        },
      },
    );
  }

  return {
    blocks: [
      { type: 'heading', text: '🚨 ' + errorTypeTitle(scope), size: 1 },
      { type: 'table', cells, is_bordered: true, is_compact: false },
      { type: 'footer', text: footer },
    ],
    is_rtl: true,
  };
}

function plainErrorFallback(scope, error, context, isoTime) {
  const lines = [
    '🚨 ' + errorTypeTitle(scope),
    '',
    ...detailRows(scope, error, context).map(([label, value]) => label + ': ' + value),
  ];
  const userId = safeId(context?.userId);
  if (userId != null) lines.push('User ID: ' + userId);
  lines.push('الوقت: ' + isoTime);
  return lines.join('\n').slice(0, MAX_ERROR_TEXT);
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

    const scopeText = sanitize(scope || 'unknown');
    const summary = errorSummary(error);
    const stamp = now();
    const fingerprint = (scopeText + '|' + summary).slice(0, 1200);
    if (
      config.lastErrorKey === fingerprint
      && stamp - Number(config.lastErrorAt || 0) < DUPLICATE_COOLDOWN_SECONDS
    ) {
      return false;
    }

    const isoTime = new Date().toISOString();
    try {
      await api.sendRichMessage({
        chat_id: config.chatId,
        rich_message: buildErrorRichMessage(scopeText, error, context, isoTime),
        disable_notification: true,
      });
    } catch (richError) {
      console.warn('Could not send rich error log; using text fallback', richError);
      await api.sendMessage({
        chat_id: config.chatId,
        text: plainErrorFallback(scopeText, error, context, isoTime),
        disable_notification: true,
      });
    }
    await writeConfig({
      enabled: true,
      chat_id: config.chatId,
      title: config.title,
      username: config.username,
      updated_at: stamp,
      last_error_key: fingerprint,
      last_error_at: stamp,
    });
    return true;
  } catch (loggingError) {
    // Never let logging failure hide or recursively reproduce the original error.
    console.error('Could not deliver error-log notification', loggingError);
    return false;
  }
}
