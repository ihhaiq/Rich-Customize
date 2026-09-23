import { api, BotApiError, db, InputFile } from 'sdk';
import { eq, lt, sql } from 'sdk/db';
import { developerStates, legacyStates, maintenanceLocks, richPages, usageUsers } from 'schema';
import { developerAccessConfigured, isDeveloper } from 'lib/developer-access';
import {
  MAX_IMPORT_ARCHIVE_BYTES,
  applyPreparedBackup,
  buildDataExport,
  createPageSnapshot,
  getLegacyState,
  pageSnapshotRestoreDrill,
  prepareBackupImport,
  setLegacyState,
} from 'lib/backup-import';
import { usageSummary, usageUsersPage } from 'lib/usage-stats';

const IMPORT_STATE_TTL_SECONDS = 30 * 60;
const LOCK_SECONDS = 10 * 60;

function now() {
  return Math.floor(Date.now() / 1000);
}

async function getState(userId) {
  const row = await db.select().from(developerStates)
    .where(eq(developerStates.userId, Number(userId))).get();
  if (!row) return null;
  if (now() - Number(row.createdAt || 0) > IMPORT_STATE_TTL_SECONDS) {
    await clearState(userId);
    return null;
  }
  return row;
}

async function setState(userId, state, values = {}) {
  const record = {
    userId: Number(userId),
    state,
    fileId: values.fileId ?? null,
    fileName: values.fileName ?? null,
    createdAt: now(),
    summary: values.summary ?? null,
  };
  await db.insert(developerStates).values(record).onConflictDoUpdate({
    target: developerStates.userId,
    set: {
      state: record.state,
      fileId: record.fileId,
      fileName: record.fileName,
      createdAt: record.createdAt,
      summary: record.summary,
    },
  }).run();
}

async function clearState(userId) {
  await db.delete(developerStates)
    .where(eq(developerStates.userId, Number(userId))).run();
}

async function acquireLock(name, ttlSeconds = LOCK_SECONDS) {
  const stamp = now();
  await db.delete(maintenanceLocks).where(lt(maintenanceLocks.expiresAt, stamp)).run();
  const rows = await db.insert(maintenanceLocks)
    .values({ name, expiresAt: stamp + ttlSeconds })
    .onConflictDoNothing({ target: maintenanceLocks.name })
    .returning({ name: maintenanceLocks.name })
    .run();
  return Array.isArray(rows) && rows.length > 0;
}

async function releaseLock(name) {
  await db.delete(maintenanceLocks).where(eq(maintenanceLocks.name, name)).run();
}

function panelKeyboard() {
  return {
    inline_keyboard: [[
      { text: '📤 رفع واستيراد', callback_data: 'dev:import', style: 'success' },
      { text: '📥 تنزيل وتصدير', callback_data: 'dev:export', style: 'primary' },
    ]],
  };
}

function panelRichMessage(text, extraButtons = []) {
  const blocks = [
    { type: 'heading', text: '🛠 لوحة المطور', size: 2 },
    { type: 'paragraph', text },
    {
      type: 'buttons',
      buttons: [
        { text: 'فحص قاعدة البيانات', callback_data: 'dev:database:check', style: 'primary' },
        { text: 'تحديث قناة المعاينة', callback_data: 'dev:showcase:refresh', style: 'primary' },
        { text: 'بيانات / إحصائيات', callback_data: 'dev:stats', style: 'primary' },
        { text: 'إنشاء Snapshot الآن', callback_data: 'dev:snapshot', style: 'primary' },
      ],
      align: 'center',
    },
  ];
  if (extraButtons.length) {
    blocks.push({ type: 'buttons', buttons: extraButtons, align: 'center' });
  }
  return { blocks, is_rtl: true };
}

async function sendPanel(chatId, text = 'لوحة المطور', extraButtons = []) {
  const replyMarkup = panelKeyboard();
  try {
    await api.sendRichMessage({
      chat_id: chatId,
      rich_message: panelRichMessage(text, extraButtons),
      reply_markup: replyMarkup,
    });
  } catch (error) {
    console.warn('Could not send rich developer panel', error);
    await api.sendMessage({ chat_id: chatId, text, reply_markup: replyMarkup });
  }
}

function formatBytes(value) {
  const size = Number(value);
  if (!Number.isFinite(size) || size < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = size;
  for (const unit of units) {
    if (current < 1024 || unit === units.at(-1)) {
      return unit === 'B' ? Math.floor(current) + ' B' : current.toFixed(1) + ' ' + unit;
    }
    current /= 1024;
  }
  return String(size) + ' B';
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days) return days + 'd ' + hours + 'h ' + minutes + 'm';
  if (hours) return hours + 'h ' + minutes + 'm';
  return minutes + 'm';
}

function formatTime(value) {
  const stamp = Number(value);
  if (!Number.isFinite(stamp) || stamp <= 0) return '—';
  return new Date(stamp * 1000).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
}

function userLabel(user) {
  if (user.username) return '@' + user.username;
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name || String(user.userId || '—');
}

async function databaseSizeBytes() {
  try {
    const pageCount = await db.get(sql.raw('PRAGMA page_count'));
    const pageSize = await db.get(sql.raw('PRAGMA page_size'));
    const count = Number(Object.values(pageCount || {})[0] || 0);
    const size = Number(Object.values(pageSize || {})[0] || 0);
    return count * size;
  } catch {
    return null;
  }
}

async function pageStatistics() {
  const total = await db.$count(richPages);
  const row = await db.get(sql.raw(
    'SELECT COUNT(DISTINCT owner_id) AS owners, MIN(created_at) AS oldest_page, MAX(updated_at) AS latest_page_update FROM rich_pages'
  ));
  return {
    pages: total,
    owners: Number(row?.owners || 0),
    oldestPage: row?.oldest_page == null ? null : Number(row.oldest_page),
    latestPageUpdate: row?.latest_page_update == null ? null : Number(row.latest_page_update),
  };
}

export async function openDeveloperPanel(message) {
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  if (!userId || !chatId) return true;

  if (!developerAccessConfigured()) {
    await api.sendMessage({
      chat_id: chatId,
      text: 'لوحة المطور تحتاج إضافة Telegram ID للمطور في lib/developer-access.js.\n\nTelegram ID مالك: ' + userId,
    });
    return true;
  }
  if (!isDeveloper(userId)) return true;

  await clearState(userId);
  await sendPanel(
    chatId,
    'نسخة Serverless من لوحة المطور. تقدر تستورد/تصدّر نسخة البوت، تفحص قاعدة Serverless، تعرض الإحصائيات، تنشئ Snapshot، وتحدّث كاش قناة المعاينة.\n\nالاستيراد يُفحص ويطلب تأكيدًا قبل الكتابة، وما يحذف صفحات قديمة بسبب حد 12.'
  );
  return true;
}

export async function handleDeveloperPendingMessage(message) {
  const userId = message?.from?.id;
  if (!userId || !developerAccessConfigured() || !isDeveloper(userId)) return false;

  const state = await getState(userId);
  if (!state || state.state !== 'waiting_import') return false;

  const chatId = message.chat?.id;
  if (!chatId) return true;

  if (!message.document) {
    await api.sendMessage({ chat_id: chatId, text: 'أرسل ملف ZIP أو JSON كمستند.' });
    return true;
  }

  const size = Number(message.document.file_size || 0);
  if (size > MAX_IMPORT_ARCHIVE_BYTES) {
    await api.sendMessage({ chat_id: chatId, text: 'حجم الملف أكبر من الحد المسموح وهو 20MB.' });
    return true;
  }

  const fileName = message.document.file_name || 'backup.zip';
  try {
    const bytes = await api.getFileContent(message.document.file_id);
    const prepared = prepareBackupImport(fileName, bytes);
    const summary = {
      pageCount: prepared.pageCount,
      ownerCount: prepared.ownerCount,
      stateNames: prepared.stateNames,
      fileNames: prepared.fileNames,
    };
    await setState(userId, 'confirm_import', {
      fileId: message.document.file_id,
      fileName,
      summary,
    });
    await api.sendMessage({
      chat_id: chatId,
      text:
        '✅ الملف صالح وجاهز للاستيراد.\n\n' +
        'الصفحات: ' + prepared.pageCount + '\n' +
        'المستخدمون أصحاب الصفحات: ' + prepared.ownerCount + '\n' +
        'ملفات البيانات الأخرى: ' + prepared.stateNames.length + '\n\n' +
        'الاستيراد يدمج البيانات ويحافظ على page_id وowner_id. حد 12 لن يحذف أي صفحة قديمة.',
      reply_markup: {
        inline_keyboard: [[
          { text: '✅ تأكيد الاستيراد', callback_data: 'dev:import:confirm', style: 'danger' },
          { text: '❌ إلغاء', callback_data: 'dev:import:cancel' },
        ]],
      },
    });
    try {
      await api.deleteMessage({ chat_id: chatId, message_id: message.message_id });
    } catch {}
  } catch (error) {
    console.error('Developer import validation failed', error);
    await api.sendMessage({
      chat_id: chatId,
      text: '❌ تعذر قبول الملف:\n' + (error?.message || 'خطأ غير معروف'),
    });
  }
  return true;
}

async function confirmImport(query, chatId) {
  const state = await getState(query.from.id);
  if (!state || state.state !== 'confirm_import' || !state.fileId) {
    await clearState(query.from.id);
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'انتهت صلاحية الملف؛ ارفعه مجددًا.',
      show_alert: true,
    });
    return;
  }

  if (!await acquireLock('developer:import')) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'توجد عملية استيراد قيد التنفيذ.',
      show_alert: true,
    });
    return;
  }

  await api.answerCallbackQuery({ callback_query_id: query.id, text: 'جاري الاستيراد…' });
  try {
    const bytes = await api.getFileContent(state.fileId);
    const prepared = prepareBackupImport(state.fileName || 'backup.zip', bytes);

    // The Serverless DB API does not expose a cross-table transaction primitive.
    // Keep a restorable page snapshot before applying a validated, idempotent import.
    await createPageSnapshot();
    const result = await applyPreparedBackup(prepared);
    await clearState(query.from.id);
    await sendPanel(
      chatId,
      '✅ تم استيراد البيانات بنجاح.\n\n' +
      'الصفحات: ' + result.importedPages + '\n' +
      'حالات البيانات الأخرى: ' + result.importedStates + '\n' +
      'مستخدمو الإحصائيات المستوردون: ' + result.importedUsageUsers + '\n\n' +
      'تم الحفاظ على page_id وowner_id، ولم تُحذف صفحات بسبب حد 12.'
    );
  } catch (error) {
    console.error('Developer import failed', error);
    await api.sendMessage({
      chat_id: chatId,
      text: '❌ فشل الاستيراد:\n' + (error?.message || 'خطأ غير معروف'),
    });
  } finally {
    await releaseLock('developer:import');
  }
}

async function exportData(query, chatId) {
  if (!await acquireLock('developer:export')) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'توجد عملية تصدير قيد التنفيذ.',
      show_alert: true,
    });
    return;
  }
  await api.answerCallbackQuery({ callback_query_id: query.id, text: 'جاري تجهيز النسخة…' });
  try {
    const exported = await buildDataExport();
    await api.sendDocument({
      chat_id: chatId,
      document: new InputFile(exported.bytes, exported.filename, { type: 'application/zip' }),
      caption:
        '✅ تم تصدير بيانات البوت.\n' +
        'عدد ملفات البيانات: ' + exported.fileCount + '\n' +
        'حجم ZIP: ' + formatBytes(exported.bytes.length) + '\n\n' +
        'احتفظ بالملف في مكان آمن.',
    });
  } catch (error) {
    console.error('Developer export failed', error);
    await api.sendMessage({ chat_id: chatId, text: '❌ تعذر تصدير البيانات.' });
  } finally {
    await releaseLock('developer:export');
  }
}

async function checkDatabase(query, chatId) {
  await api.answerCallbackQuery({ callback_query_id: query.id, text: 'جاري فحص قاعدة البيانات…' });
  const started = Date.now();
  try {
    const check = await db.get(sql.raw('SELECT 1 AS ok'));
    const latency = Math.max(1, Date.now() - started);
    const pages = await db.$count(richPages);
    const legacy = await db.$count(legacyStates);
    const users = await db.$count(usageUsers);
    const bytes = await databaseSizeBytes();
    await sendPanel(
      chatId,
      '✅ قاعدة Serverless متصلة.\n\n' +
      'الوضع الحالي: Telegram Serverless SQLite\n' +
      'زمن الاستجابة: ' + latency + 'ms\n' +
      'SELECT 1: ' + (Number(check?.ok || 0) === 1 ? 'ناجح' : 'غير متوقع') + '\n' +
      'الصفحات: ' + pages.toLocaleString() + '\n' +
      'مخازن البيانات المرحّلة: ' + legacy.toLocaleString() + '\n' +
      'مستخدمو الإحصائيات: ' + users.toLocaleString() + '\n' +
      'حجم قاعدة البيانات: ' + formatBytes(bytes) + '\n\n' +
      'PostgreSQL/Redis ما عدهن دور هنا؛ قاعدة Serverless نفسها دائمة بين الاستدعاءات.'
    );
  } catch (error) {
    console.error('Serverless database check failed', error);
    await sendPanel(chatId, '❌ فشل فحص قاعدة Serverless.\n\n' + (error?.message || 'خطأ غير معروف'));
  }
}

async function showStats(query, chatId) {
  await api.answerCallbackQuery({ callback_query_id: query.id });
  const stamp = now();
  const summary = await usageSummary(stamp);
  const pageStats = await pageStatistics();
  const dbBytes = await databaseSizeBytes();
  const languageText = summary.languages.length
    ? summary.languages.map((item) => item.code + ': ' + item.count).join('، ')
    : '—';
  const oldestCandidates = [summary.oldestSeen, pageStats.oldestPage]
    .filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
    .map(Number);
  const oldest = oldestCandidates.length ? Math.min(...oldestCandidates) : null;
  const op = summary.operational;

  const text =
    '📊 بيانات / إحصائيات\n\n' +
    '👥 المستخدمون\n' +
    'الإجمالي المعروف: ' + summary.trackedUsers.toLocaleString() + '\n' +
    'لديهم بيانات حساب: ' + summary.profiledUsers.toLocaleString() + '\n' +
    'لديهم username: ' + summary.usersWithUsername.toLocaleString() + '\n' +
    'نشطون آخر ساعة: ' + summary.active1h.toLocaleString() + '\n' +
    'نشطون آخر 24 ساعة: ' + summary.active24h.toLocaleString() + '\n' +
    'نشطون آخر 7 أيام: ' + summary.active7d.toLocaleString() + '\n' +
    'نشطون آخر 30 يوم: ' + summary.active30d.toLocaleString() + '\n' +
    'جدد آخر 24 ساعة: ' + summary.new24h.toLocaleString() + '\n' +
    'جدد آخر 7 أيام: ' + summary.new7d.toLocaleString() + '\n' +
    'أكثر اللغات: ' + languageText + '\n' +
    'إجمالي التفاعلات: ' + summary.events.toLocaleString() + '\n\n' +
    '⚙️ التشغيل والأداء\n' +
    'مدة التتبع: ' + formatDuration(stamp - op.startedAt) + '\n' +
    'Requests هذه الدقيقة: ' + op.requestsCurrentMinute.toLocaleString() + '\n' +
    'متوسط requests/min آخر 5 دقائق: ' + op.requestsPerMinute5m.toFixed(2) + '\n' +
    'متوسط الاستجابة آخر 5 دقائق: ' + op.avgResponseMs5m.toFixed(1) + 'ms\n' +
    'أعلى استجابة مسجلة: ' + op.maxResponseMs.toFixed(1) + 'ms\n' +
    'أخطاء handlers آخر ساعة: ' + op.failuresLastHour.toLocaleString() + '\n' +
    'Preview: ✅ ' + op.previewSuccess.toLocaleString() + ' | ❌ ' + op.previewFailed.toLocaleString() + '\n' +
    'Publish: ✅ ' + op.publishSuccess.toLocaleString() + ' | ❌ ' + op.publishFailed.toLocaleString() + '\n' +
    'Rate-limit events: ' + op.rateLimited.toLocaleString() + '\n\n' +
    '🗄 قاعدة البيانات\n' +
    'الحالة: Telegram Serverless SQLite\n' +
    'حجم قاعدة البيانات: ' + formatBytes(dbBytes) + '\n' +
    'FSM sessions: غير مستخدم حاليًا في النسخة Serverless\n' +
    'المحررات النشطة: تخزين جلسات المحرر بعده ما تحول\n' +
    'الصفحات المحفوظة: ' + pageStats.pages.toLocaleString() + '\n' +
    'مستخدمون لديهم صفحات: ' + pageStats.owners.toLocaleString() + '\n\n' +
    'الفترة المتاحة: ' + formatTime(oldest) + ' → الآن';

  await sendPanel(chatId, text, [
    { text: '👥 إحصائيات المستخدمين', callback_data: 'dev:stats:users:0', style: 'primary' },
    { text: '🔄 تحديث', callback_data: 'dev:stats', style: 'primary' },
  ]);
}

async function showUsers(query, chatId, requestedPage) {
  const result = await usageUsersPage(requestedPage, 10);
  const lines = [
    '👥 إحصائيات المستخدمين',
    'المستخدمون: ' + result.total.toLocaleString(),
    'الصفحة: ' + (result.page + 1) + '/' + (result.maxPage + 1),
    '',
  ];

  for (let offset = 0; offset < result.users.length; offset += 1) {
    const user = result.users[offset];
    const pages = await db.$count(richPages, eq(richPages.ownerId, Number(user.userId)));
    const index = result.page * 10 + offset + 1;
    lines.push(
      index + ') ' + userLabel(user),
      'ID: ' + user.userId,
      'التفاعلات: ' + Number(user.events || 0).toLocaleString() + ' | الصفحات: ' + pages,
      'اللغة: ' + (user.languageCode || '—'),
      'أول ظهور: ' + formatTime(user.firstSeen),
      'آخر ظهور: ' + formatTime(user.lastSeen),
      ''
    );
  }
  if (!result.users.length) lines.push('لا توجد بيانات مستخدمين بعد.');

  const buttons = [];
  if (result.page > 0) {
    buttons.push({ text: '⬅️ السابق', callback_data: 'dev:stats:users:' + (result.page - 1), style: 'primary' });
  }
  buttons.push({ text: '📊 الملخص', callback_data: 'dev:stats', style: 'primary' });
  if (result.page < result.maxPage) {
    buttons.push({ text: 'التالي ➡️', callback_data: 'dev:stats:users:' + (result.page + 1), style: 'primary' });
  }
  await api.answerCallbackQuery({ callback_query_id: query.id });
  await sendPanel(chatId, lines.join('\n'), buttons);
}

async function createSnapshot(query, chatId) {
  if (!await acquireLock('maintenance:page-snapshot')) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'توجد عملية Snapshot قيد التنفيذ.',
      show_alert: true,
    });
    return;
  }
  await api.answerCallbackQuery({ callback_query_id: query.id, text: 'جاري إنشاء النسخة…' });
  try {
    const snapshot = await createPageSnapshot();
    const drill = await pageSnapshotRestoreDrill();
    await sendPanel(
      chatId,
      '✅ تم إنشاء Snapshot للصفحات.\n' +
      'الصفحات: ' + snapshot.pageCount.toLocaleString() + '\n' +
      'اختبار الاستعادة: ' + (drill.ok ? 'ناجح' : 'يحتاج مراجعة') + '\n' +
      'وقت النسخة: ' + formatTime(snapshot.createdAt)
    );
  } catch (error) {
    console.error('Page snapshot failed', error);
    await api.sendMessage({ chat_id: chatId, text: '❌ تعذر إنشاء Snapshot:\n' + (error?.message || 'خطأ غير معروف') });
  } finally {
    await releaseLock('maintenance:page-snapshot');
  }
}

function staleShowcaseError(error) {
  if (!(error instanceof BotApiError) || Number(error.code) !== 400) return false;
  const text = String(error.description || '').toUpperCase();
  return ['MESSAGE_ID_INVALID', 'MESSAGE_NOT_FOUND', 'MESSAGE TO COPY NOT FOUND', 'MESSAGE_TO_COPY_NOT_FOUND']
    .some((marker) => text.includes(marker));
}

async function refreshShowcase(query, chatId) {
  if (!await acquireLock('maintenance:showcase-refresh')) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'توجد عملية تحديث قيد التنفيذ.',
      show_alert: true,
    });
    return;
  }

  await api.answerCallbackQuery({ callback_query_id: query.id, text: 'جاري تحديث قناة المعاينة…' });
  try {
    const payload = await getLegacyState('showcase_channel');
    const channelId = Number(payload?.channel_id || 0);
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];
    if (!channelId) {
      await sendPanel(chatId, 'لا توجد بيانات قناة معاينة مستوردة بعد.');
      return;
    }

    const retained = [];
    const temporary = [];
    let removed = 0;
    let failedChecks = 0;

    for (const item of messages) {
      const sourceId = Number(item?.message_id || 0);
      if (!sourceId) continue;
      try {
        const copied = await api.copyMessage({
          chat_id: chatId,
          from_chat_id: channelId,
          message_id: sourceId,
          disable_notification: true,
        });
        retained.push(item);
        if (copied?.message_id) temporary.push(Number(copied.message_id));
      } catch (error) {
        if (staleShowcaseError(error)) removed += 1;
        else {
          retained.push(item);
          failedChecks += 1;
          console.warn('Could not validate showcase message', sourceId, error);
        }
      }
    }

    for (let offset = 0; offset < temporary.length; offset += 100) {
      const batch = temporary.slice(offset, offset + 100);
      if (!batch.length) continue;
      try {
        await api.deleteMessages({ chat_id: chatId, message_ids: batch });
      } catch (error) {
        console.warn('Could not delete temporary showcase validation messages', error);
      }
    }

    await setLegacyState('showcase_channel', {
      ...payload,
      messages: retained,
      updated_at: now(),
    });

    let text =
      '✅ تم تحديث قناة المعاينة.\n\n' +
      'العناصر قبل الفحص: ' + messages.length + '\n' +
      'المحتوى الحالي: ' + retained.length + '\n' +
      'المحذوف من الكاش: ' + removed;
    if (failedChecks) text += '\nتعذر التحقق مؤقتًا من: ' + failedChecks;
    if (!messages.length) text += '\n\nلا يوجد محتوى محفوظ بعد.';
    await sendPanel(chatId, text);
  } catch (error) {
    console.error('Could not refresh showcase channel cache', error);
    await sendPanel(chatId, '❌ تعذر تحديث قناة المعاينة. تأكد أن البوت ما زال مشرفًا في القناة.');
  } finally {
    await releaseLock('maintenance:showcase-refresh');
  }
}

export async function handleDeveloperCallback(query) {
  const data = String(query?.data || '');
  if (!data.startsWith('dev:')) return false;

  if (!developerAccessConfigured() || !isDeveloper(query.from?.id)) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'هذا الخيار للمطور فقط.',
      show_alert: true,
    });
    return true;
  }

  const chatId = query.message?.chat?.id;
  if (!chatId) {
    await api.answerCallbackQuery({ callback_query_id: query.id });
    return true;
  }

  if (data === 'dev:import') {
    await setState(query.from.id, 'waiting_import');
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'أرسل ملف النسخة.' });
    await api.sendMessage({
      chat_id: chatId,
      text: '📤 أرسل الآن ملف النسخة بصيغة ZIP، أو ملف JSON معروف مثل rich_pages.json.\n\nالحد الأقصى: 20MB.',
    });
    return true;
  }

  if (data === 'dev:import:cancel') {
    await clearState(query.from.id);
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'تم الإلغاء.' });
    await sendPanel(chatId, 'تم إلغاء الاستيراد.');
    return true;
  }

  if (data === 'dev:import:confirm') {
    await confirmImport(query, chatId);
    return true;
  }
  if (data === 'dev:export') {
    await exportData(query, chatId);
    return true;
  }
  if (data === 'dev:database:check') {
    await checkDatabase(query, chatId);
    return true;
  }
  if (data === 'dev:stats') {
    await showStats(query, chatId);
    return true;
  }
  if (data.startsWith('dev:stats:users:')) {
    const requested = Number.parseInt(data.split(':').at(-1), 10);
    await showUsers(query, chatId, Number.isFinite(requested) ? Math.max(0, requested) : 0);
    return true;
  }
  if (data === 'dev:snapshot') {
    await createSnapshot(query, chatId);
    return true;
  }
  if (data === 'dev:showcase:refresh') {
    await refreshShowcase(query, chatId);
    return true;
  }

  await api.answerCallbackQuery({ callback_query_id: query.id });
  return true;
}
