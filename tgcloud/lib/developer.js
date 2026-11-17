import { audienceAndSubscriptionStats } from 'lib/admin-stats';
import { api, BotApiError, db, InputFile } from 'sdk';
import { and, eq, gte, lt, sql } from 'sdk/db';
import { developerStates, editorSessions, legacyStates, maintenanceLocks, richPages, usageUsers } from 'schema';
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
import { syncBotProfiles } from 'lib/bot-profile';
import {
  configureErrorLogChannel,
  disableErrorLogChannel,
  errorLogConfig,
  logError,
  testErrorLogChannel,
  testErrorLogTemplate,
} from 'lib/error-log';

const IMPORT_STATE_TTL_SECONDS = 30 * 60;
const LOCK_SECONDS = 10 * 60;
const BROADCAST_BATCH_SIZE = 20;
const BROADCAST_RESULT_CHUNK_SIZE = 2500;
const BROADCAST_REPORT_PAGE_SIZE = 10000;
const BROADCAST_ACTIVE_NAMESPACE = 'developer_broadcast:v1:active';

const PANEL_ACTIONS = [
  { text: 'فحص قاعدة البيانات', callback_data: 'dev:database:check', style: 'primary' },
  { text: 'تحديث قناة المعاينة', callback_data: 'dev:showcase:refresh', style: 'primary' },
  { text: 'بيانات / إحصائيات', callback_data: 'dev:stats', style: 'primary' },
  { text: '📡 حالة الإذاعة', callback_data: 'dev:broadcast:check', style: 'primary' },
  { text: '📢 بث رسالة', callback_data: 'dev:broadcast', style: 'success' },
  { text: 'إنشاء Snapshot الآن', callback_data: 'dev:snapshot', style: 'primary' },
  { text: 'مزامنة لغات البوت', callback_data: 'dev:languages:sync', style: 'success' },
  { text: 'قناة سجل الأخطاء', callback_data: 'dev:errorlog', style: 'danger' },
];

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
  const expiresAt = stamp + ttlSeconds;
  const rows = await db.insert(maintenanceLocks)
    .values({ name, expiresAt })
    .onConflictDoNothing({ target: maintenanceLocks.name })
    .returning({ name: maintenanceLocks.name })
    .run();
  return Array.isArray(rows) && rows.length > 0 ? { name, expiresAt } : null;
}

async function releaseLock(lock) {
  if (!lock?.name || !Number.isSafeInteger(Number(lock.expiresAt))) return;
  await db.delete(maintenanceLocks)
    .where(and(
      eq(maintenanceLocks.name, String(lock.name)),
      eq(maintenanceLocks.expiresAt, Number(lock.expiresAt)),
    ))
    .run();
}

function panelKeyboard(extraButtons = [], includePanelActions = false) {
  const buttons = [
    { text: '📤 رفع واستيراد', callback_data: 'dev:import', style: 'success' },
    { text: '📥 تنزيل وتصدير', callback_data: 'dev:export', style: 'primary' },
    ...(includePanelActions ? PANEL_ACTIONS : []),
    ...(includePanelActions ? [{
      text: 'اختبار مراقب الأخطاء',
      callback_data: 'dev:errorlog:template-test',
      style: 'danger',
    }] : []),
    ...(Array.isArray(extraButtons) ? extraButtons.filter(Boolean) : []),
  ];
  const rows = [];
  for (let offset = 0; offset < buttons.length; offset += 2) {
    rows.push(buttons.slice(offset, offset + 2));
  }
  return {
    inline_keyboard: rows,
  };
}

function tableTextCell(text, { header = false, align = 'right' } = {}) {
  return {
    text: String(text ?? '—'),
    align,
    valign: 'middle',
    ...(header ? { is_header: true } : {}),
  };
}

function tableButtonCell(button) {
  return {
    text: { type: 'button', button },
    align: 'center',
    valign: 'middle',
  };
}

function buttonTableBlock(buttons, columns = 2) {
  const source = Array.isArray(buttons) ? buttons.filter(Boolean) : [];
  const width = Math.max(1, Math.min(4, Number(columns) || 2));
  const cells = [];
  for (let offset = 0; offset < source.length; offset += width) {
    cells.push(source.slice(offset, offset + width).map(tableButtonCell));
  }
  return cells.length
    ? { type: 'table', cells, is_bordered: true, is_compact: false }
    : null;
}

function statTable(title, items) {
  const cells = [[
    tableTextCell(title, { header: true }),
    tableTextCell('القيمة', { header: true, align: 'center' }),
  ]];
  for (const [label, value] of items) {
    cells.push([
      tableTextCell(label),
      tableTextCell(value, { align: 'center' }),
    ]);
  }
  return { type: 'table', cells, is_bordered: true, is_compact: false };
}

function panelRichMessage(content, extraButtons = []) {
  const blocks = [{ type: 'heading', text: '🛠 لوحة المطور', size: 2 }];
  if (Array.isArray(content)) {
    blocks.push(...content);
  } else if (content != null && String(content)) {
    blocks.push({ type: 'paragraph', text: String(content) });
  }

  const mainActions = buttonTableBlock(PANEL_ACTIONS, 2);
  if (mainActions) blocks.push(mainActions);

  const extraActions = buttonTableBlock(extraButtons, 3);
  if (extraActions) blocks.push(extraActions);

  blocks.push({
    type: 'footer',
    text: [
      {
        type: 'button',
        button: {
          text: 'اختبار مراقب الأخطاء',
          callback_data: 'dev:errorlog:template-test',
          style: 'danger',
        },
      },
    ],
  });
  return { blocks, is_rtl: true };
}

function panelFallbackText(content) {
  if (!Array.isArray(content)) return String(content || 'لوحة المطور');
  const plainText = (value) => {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return String(value);
    if (Array.isArray(value)) return value.map(plainText).filter(Boolean).join('\n');
    if (typeof value !== 'object') return '';
    if (value.type === 'button') return plainText(value.button?.text);
    if (value.button) return plainText(value.button.text);
    if ('text' in value) return plainText(value.text);
    return '';
  };
  const lines = content.flatMap(block => {
    if (block?.type === 'table' && Array.isArray(block.cells)) {
      return block.cells.map(row => row.map(plainText).filter(Boolean).join(' | '));
    }
    return [plainText(block?.text)];
  }).filter(Boolean);
  return lines.length ? lines.join('\n\n') : 'لوحة المطور';
}

function messageNotModified(error) {
  return String(error?.description || error?.message || error)
    .toLowerCase()
    .includes('message is not modified');
}

async function sendPanel(chatId, content = 'لوحة المطور', extraButtons = [], messageId = null) {
  const replyMarkup = panelKeyboard();
  const fallbackMarkup = panelKeyboard(extraButtons, true);
  const richMessage = panelRichMessage(content, extraButtons);

  if (messageId) {
    try {
      await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        rich_message: richMessage,
        reply_markup: replyMarkup,
      });
      return;
    } catch (error) {
      if (messageNotModified(error)) return;
      console.warn('Could not edit rich developer panel; using text fallback', error);
      try {
        await api.editMessageText({
          chat_id: chatId,
          message_id: messageId,
          text: panelFallbackText(content),
          reply_markup: fallbackMarkup,
        });
      } catch (fallbackError) {
        if (messageNotModified(fallbackError)) return;
        console.error('Could not edit developer panel fallback', fallbackError);
        throw fallbackError;
      }
      return;
    }
  }

  try {
    await api.sendRichMessage({
      chat_id: chatId,
      rich_message: richMessage,
      reply_markup: replyMarkup,
    });
  } catch (error) {
    console.warn('Could not send rich developer panel', error);
    await api.sendMessage({
      chat_id: chatId,
      text: panelFallbackText(content),
      reply_markup: fallbackMarkup,
    });
  }
}

async function editImportConfirmation(chatId, messageId, text) {
  const replyMarkup = {
    inline_keyboard: [[
      { text: '✅ تأكيد الاستيراد', callback_data: 'dev:import:confirm', style: 'danger' },
      { text: '❌ إلغاء', callback_data: 'dev:import:cancel' },
    ]],
  };
  try {
    await api.editMessageText({
      chat_id: chatId,
      message_id: messageId,
      text,
      reply_markup: replyMarkup,
    });
    return true;
  } catch (error) {
    if (messageNotModified(error)) return true;
    console.warn('Could not edit developer import confirmation', error);
    return false;
  }
}

function formatBytes(value) {
  if (value == null) return '—';
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
  } catch (error) {
    console.warn('Could not read Serverless database size', error?.name || 'Error');
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

function broadcastJobNamespace(jobId) {
  return 'developer_broadcast:v1:job:' + String(jobId);
}

function positiveSafeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

async function loadBroadcast(namespace) {
  const row = await db.select().from(legacyStates)
    .where(eq(legacyStates.namespace, namespace)).get();
  return row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
    ? row.payload
    : null;
}

async function saveBroadcast(namespace, payload) {
  await db.insert(legacyStates).values({
    namespace,
    payload,
    updatedAt: now(),
  }).onConflictDoUpdate({
    target: legacyStates.namespace,
    set: { payload, updatedAt: now() },
  }).run();
}

async function activeBroadcast() {
  const active = await loadBroadcast(BROADCAST_ACTIVE_NAMESPACE);
  if (!active?.jobId) return null;
  const job = await loadBroadcast(broadcastJobNamespace(active.jobId));
  return job ? { active, job } : null;
}

async function broadcastAudienceSummary() {
  const rows = await db.all(sql.raw(
    `WITH audience AS (
       SELECT user_id FROM usage_users WHERE user_id > 0
       UNION SELECT user_id FROM editor_subscriptions WHERE user_id > 0
       UNION SELECT user_id FROM golden_claims WHERE user_id > 0
       UNION SELECT owner_id AS user_id FROM rich_pages WHERE owner_id > 0
       UNION SELECT user_id FROM editor_sessions WHERE user_id > 0
     )
     SELECT COUNT(*) AS total, COALESCE(MAX(audience.user_id), 0) AS max_user_id,
       COALESCE(SUM(CASE WHEN EXISTS (
         SELECT 1 FROM usage_users
         WHERE usage_users.user_id = audience.user_id
           AND usage_users.private_seen_at IS NOT NULL
       ) THEN 1 ELSE 0 END), 0) AS private_users
     FROM audience`,
  ));
  const row = rows?.[0] || {};
  const total = Math.max(0, Number(row.total) || 0);
  return {
    total,
    maxUserId: positiveSafeInteger(row.max_user_id),
    privateUsers: Math.min(total, Math.max(0, Number(row.private_users) || 0)),
  };
}

function broadcastProgress(job) {
  const total = positiveSafeInteger(job.total);
  const processed = Math.min(total,
    positiveSafeInteger(job.sent)
      + positiveSafeInteger(job.failed)
      + positiveSafeInteger(job.uncertain));
  return {
    total,
    processed,
    pending: Math.max(0, total - processed),
    percentage: total ? Math.floor(processed * 100 / total) : 0,
  };
}

function broadcastReport(job) {
  const progress = broadcastProgress(job);
  const status = job.status === 'done'
    ? (job.finalStatus === 'cancelled' ? 'أوقفت' : 'مكتملة')
    : job.status === 'report_pending'
      ? job.finalStatus === 'cancelled'
        ? 'أوقفت ويجري إرسال تقرير النتائج'
        : job.finalStatus === 'failed'
          ? 'توقفت بسبب رسالة المصدر ويجري إرسال التقرير'
          : 'اكتمل الإرسال ويجري إرسال تقرير النتائج'
      : job.status === 'failed'
        ? 'توقفت بسبب خطأ في رسالة المصدر'
        : job.status === 'cancelled'
          ? 'أوقفت'
          : 'قيد الإرسال';
  return '📢 حالة الإذاعة: ' + status + '\n'
    + 'المستهدفون المعروفون: ' + progress.total.toLocaleString() + '\n'
    + 'المعالجة: ' + progress.processed.toLocaleString() + ' من '
      + progress.total.toLocaleString() + ' (' + progress.percentage + '%)\n'
    + 'بدأوا الخاص المؤكد: ' + Number(job.privateUsers || 0).toLocaleString() + '\n'
    + 'سجلات قديمة/غير مؤكدة الخاص: '
      + Math.max(0, Number(job.total || 0) - Number(job.privateUsers || 0)).toLocaleString() + '\n'
    + 'قبلها Telegram: ' + Number(job.sent || 0).toLocaleString() + '\n'
    + 'تعذر الإرسال: ' + Number(job.failed || 0).toLocaleString() + '\n'
    + 'نتيجة غير مؤكدة: ' + Number(job.uncertain || 0).toLocaleString() + '\n'
    + 'متبقٍ تقريباً: ' + progress.pending.toLocaleString()
    + (job.status === 'done' ? '' : '\nتُعالج الدفعات تلقائياً كل دقيقة؛ القبول لا يثبت قراءة الرسالة.');
}

function broadcastOutcomeNamespace(jobId, chunkIndex) {
  return 'developer_broadcast:v1:outcomes:' + String(jobId) + ':' + Number(chunkIndex);
}

function safeBroadcastErrorDetail(error) {
  return String(error?.description || error?.message || error || 'Unknown error')
    .replace(/\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g, '[redacted-token]')
    .replace(/bot\d{5,}:[A-Za-z0-9_-]{20,}/gi, 'bot[redacted-token]')
    .replace(/(Bearer\s+)[^\s"'<>]+/gi, '$1[redacted]')
    .replace(/([?&](?:token|api_key|access_token|secret)=)[^&#\s]+/gi, '$1[redacted]')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, 140);
}

function broadcastOutcome(userId, status, error) {
  const codeValue = Number(error?.code ?? error?.error_code ?? error?.response?.error_code);
  const apiCode = Number.isSafeInteger(codeValue) ? codeValue : null;
  const detail = safeBroadcastErrorDetail(error);
  const value = detail.toLowerCase();
  let reason = 'TELEGRAM_REJECTED';
  if (/bot was blocked|blocked by the user|bot is blocked/.test(value)) {
    reason = 'BOT_BLOCKED';
  } else if (/user is deactivated|account.*deactivated/.test(value)) {
    reason = 'USER_DEACTIVATED';
  } else if (/chat not found|user not found|bot can't initiate|bot cannot initiate|user never started/.test(value)) {
    reason = 'PRIVATE_CHAT_UNAVAILABLE';
  } else if (/timed out|timeout|etimedout/.test(value)) {
    reason = 'NETWORK_TIMEOUT';
  } else if (/network|socket|connection|fetch failed|econn/.test(value)) {
    reason = 'NETWORK_ERROR';
  } else if (status === 'uncertain') {
    reason = 'OUTCOME_UNKNOWN';
  }
  return [
    positiveSafeInteger(userId),
    status,
    apiCode,
    reason,
    reason === 'TELEGRAM_REJECTED' || status === 'uncertain' ? detail : '',
  ];
}

async function loadBroadcastOutcome(job, index) {
  const chunkIndex = Math.floor(index / BROADCAST_RESULT_CHUNK_SIZE);
  const chunk = await loadBroadcast(broadcastOutcomeNamespace(job.jobId, chunkIndex));
  const recordIndex = index % BROADCAST_RESULT_CHUNK_SIZE;
  return Array.isArray(chunk?.records) ? chunk.records[recordIndex] || null : null;
}

async function persistPendingBroadcastOutcomes(job) {
  const outcomes = Array.isArray(job.pendingOutcomes) ? job.pendingOutcomes : [];
  if (!outcomes.length) return;

  const firstIndex = Math.max(0, Number(job.resultCount) || 0);
  const chunks = new Map();
  for (let offset = 0; offset < outcomes.length; offset += 1) {
    const index = firstIndex + offset;
    const chunkIndex = Math.floor(index / BROADCAST_RESULT_CHUNK_SIZE);
    const recordIndex = index % BROADCAST_RESULT_CHUNK_SIZE;
    const namespace = broadcastOutcomeNamespace(job.jobId, chunkIndex);
    if (!chunks.has(chunkIndex)) {
      const chunk = await loadBroadcast(namespace) || { records: [] };
      if (!Array.isArray(chunk.records)) throw new Error('BROADCAST_OUTCOME_CHUNK_INVALID');
      chunks.set(chunkIndex, { namespace, chunk });
    }

    const chunk = chunks.get(chunkIndex).chunk;
    const outcome = outcomes[offset];
    const existing = chunk.records[recordIndex];
    if (existing) {
      if (Number(existing[0]) !== Number(outcome[0]) || existing[1] !== outcome[1]) {
        throw new Error('BROADCAST_OUTCOME_CONFLICT');
      }
    } else {
      if (chunk.records.length !== recordIndex) throw new Error('BROADCAST_OUTCOME_SEQUENCE_INVALID');
      chunk.records.push(outcome);
    }
  }

  for (const { namespace, chunk } of chunks.values()) {
    await saveBroadcast(namespace, chunk);
  }
  job.resultCount = firstIndex + outcomes.length;
  job.pendingOutcomes = [];
}

function broadcastOutcomeReason(code) {
  const labels = {
    BOT_BLOCKED: 'المستخدم حظر البوت',
    USER_DEACTIVATED: 'حساب المستخدم معطل',
    PRIVATE_CHAT_UNAVAILABLE: 'المحادثة غير متاحة أو لم يبدأ المستخدم الخاص',
    TELEGRAM_REJECTED: 'رفض Telegram الرسالة',
    NETWORK_TIMEOUT: 'انتهت مهلة الاتصال؛ نتيجة الإرسال غير محسومة',
    NETWORK_ERROR: 'خطأ اتصال؛ نتيجة الإرسال غير محسومة',
    OUTCOME_UNKNOWN: 'تعذر تأكيد نتيجة الإرسال؛ لم نكرر الإرسال',
  };
  return labels[String(code || '')] || 'سبب غير مصنف';
}

async function broadcastReportPage(job, start) {
  const end = Math.min(Number(job.resultCount || 0), start + BROADCAST_REPORT_PAGE_SIZE);
  const records = [];
  let chunkIndex = -1;
  let chunkRecords = [];
  for (let index = start; index < end; index += 1) {
    const nextChunkIndex = Math.floor(index / BROADCAST_RESULT_CHUNK_SIZE);
    if (nextChunkIndex !== chunkIndex) {
      const chunk = await loadBroadcast(broadcastOutcomeNamespace(job.jobId, nextChunkIndex));
      chunkRecords = Array.isArray(chunk?.records) ? chunk.records : [];
      chunkIndex = nextChunkIndex;
    }
    const record = chunkRecords[index % BROADCAST_RESULT_CHUNK_SIZE];
    if (!Array.isArray(record) || !positiveSafeInteger(record[0])) {
      throw new Error('BROADCAST_OUTCOME_MISSING');
    }
    records.push(record);
  }
  const lines = [
    'تفاصيل المستخدمين الذين تعذر الإرسال إليهم أو كانت النتيجة غير مؤكدة',
    'User ID\tالحالة\tالسبب\tTelegram code\tالتفصيل',
    ...records.map((record) => [
      Number(record[0]),
      record[1] === 'failed' ? 'تعذر الإرسال' : 'نتيجة غير مؤكدة',
      broadcastOutcomeReason(record[3]),
      record[2] == null ? '—' : String(record[2]),
      String(record[4] || ''),
    ].join('\t')),
  ];
  return { bytes: new TextEncoder().encode(lines.join('\n')), end };
}

async function deleteBroadcastOutcomeChunk(jobId, chunkIndex) {
  await db.delete(legacyStates)
    .where(eq(legacyStates.namespace, broadcastOutcomeNamespace(jobId, chunkIndex)))
    .run();
}

async function completeBroadcastReport(job, jobNamespace) {
  const active = await loadBroadcast(BROADCAST_ACTIVE_NAMESPACE);
  if (active?.jobId !== job.jobId) return false;
  const resultCount = Math.max(0, Number(job.resultCount) || 0);
  const cursor = Math.max(0, Number(job.reportCursor) || 0);

  if (cursor >= resultCount) {
    if (!job.reportSummarySent) {
      const report = broadcastReport(job);
      if (resultCount) {
        await api.sendMessage({
          chat_id: job.actorId,
          text: report + '\n\nأرفقت قائمة المستخدمين المتعذر الوصول إليهم وأسبابها. ستصل بقية الملفات تباعاً إذا كانت القائمة طويلة.',
        });
      } else {
        await api.sendMessage({ chat_id: job.actorId, text: report });
      }
      job.reportSummarySent = true;
    }
    job.status = 'done';
    await saveBroadcast(jobNamespace, job);
    await saveBroadcast(BROADCAST_ACTIVE_NAMESPACE, {
      jobId: job.jobId,
      actorId: job.actorId,
      status: 'done',
    });
    return true;
  }

  const page = await broadcastReportPage(job, cursor);
  const firstPage = !job.reportSummarySent;
  await api.sendDocument({
    chat_id: job.actorId,
    document: new InputFile(
      page.bytes,
      'broadcast_' + String(job.jobId) + '_results_' + String(cursor + 1) + '.txt',
      { type: 'text/plain' },
    ),
    ...(firstPage ? { caption: broadcastReport(job) } : {
      caption: 'تفاصيل نتائج الإذاعة · المستخدمون ' + (cursor + 1) + '–' + page.end,
    }),
  });

  job.reportSummarySent = true;
  job.reportCursor = page.end;
  await saveBroadcast(jobNamespace, job);
  const chunksToDelete = job.reportCursor >= resultCount
    ? Math.ceil(page.end / BROADCAST_RESULT_CHUNK_SIZE)
    : Math.floor(page.end / BROADCAST_RESULT_CHUNK_SIZE);
  for (let index = 0; index < chunksToDelete; index += 1) {
    try {
      await deleteBroadcastOutcomeChunk(job.jobId, index);
    } catch (error) {
      console.warn('Could not remove delivered broadcast report chunk', error?.name || 'Error');
    }
  }
  if (job.reportCursor >= resultCount) {
    job.status = 'done';
    await saveBroadcast(jobNamespace, job);
    await saveBroadcast(BROADCAST_ACTIVE_NAMESPACE, {
      jobId: job.jobId,
      actorId: job.actorId,
      status: 'done',
    });
  }
  return true;
}

function copyableBroadcastMessage(message) {
  const contentFields = [
    'text', 'rich_message', 'photo', 'video', 'animation', 'audio', 'voice', 'video_note',
    'document', 'sticker', 'contact', 'location', 'venue', 'poll', 'dice', 'game',
  ];
  return contentFields.some((field) => message?.[field] != null);
}

async function logBroadcastError(scope, error, context) {
  try {
    await logError(scope, error, context);
  } catch (loggingError) {
    console.warn('Could not report developer broadcast failure', loggingError?.name || 'Error');
  }
}

async function tryCompleteBroadcastReport(job, jobNamespace, stamp = now()) {
  try {
    await persistPendingBroadcastOutcomes(job);
    await saveBroadcast(jobNamespace, job);
    return await completeBroadcastReport(job, jobNamespace);
  } catch (error) {
    await logBroadcastError('developer.broadcast.report', error, {
      userId: job.actorId,
      chatId: job.actorId,
      extra: 'job_id=' + String(job.jobId)
        + '; report_cursor=' + Number(job.reportCursor || 0),
    });
    job.reportAttempts = Number(job.reportAttempts || 0) + 1;
    job.reportRetryAt = stamp + broadcastRetrySeconds(error);
    await saveBroadcast(jobNamespace, job);
    return true;
  }
}

function broadcastRetrySeconds(error) {
  const direct = Number(error?.parameters?.retry_after
    ?? error?.response?.parameters?.retry_after
    ?? error?.retry_after);
  if (Number.isSafeInteger(direct) && direct > 0) return Math.min(3600, direct);
  const match = String(error?.description || error?.message || '')
    .match(/retry after\s+(\d+)/i);
  return match ? Math.min(3600, Math.max(1, Number(match[1]))) : 60;
}

function isBroadcastRateLimit(error) {
  return Number(error?.code) === 429
    || /too many requests|retry after/i.test(String(error?.description || error?.message || ''));
}

function isInvalidBroadcastSource(error) {
  return Number(error?.code) === 400
    && /message to copy not found|message_id_invalid|message can't be copied|message can not be copied/i
      .test(String(error?.description || error?.message || ''));
}

export async function runDeveloperBroadcastTick(minute = Math.floor(Date.now() / 60000)) {
  const tickMinute = Number(minute);
  if (!Number.isSafeInteger(tickMinute) || tickMinute < 1) return false;
  const current = await activeBroadcast();
  if (!current || !['running', 'report_pending'].includes(current.job.status)) return false;

  const lock = await acquireLock('developer:broadcast');
  if (!lock) return false;

  try {
    const activeState = await loadBroadcast(BROADCAST_ACTIVE_NAMESPACE);
    if (activeState?.jobId !== current.active.jobId) return false;
    const jobNamespace = broadcastJobNamespace(current.active.jobId);
    const job = await loadBroadcast(jobNamespace);
    if (
      !job
      || !['running', 'report_pending'].includes(job.status)
      || tickMinute <= Number(job.lastTickMinute || 0)
    ) return false;

    job.lastTickMinute = tickMinute;
    const stamp = now();
    if (Array.isArray(job.pendingOutcomes) && job.pendingOutcomes.length) {
      await persistPendingBroadcastOutcomes(job);
      await saveBroadcast(jobNamespace, job);
    }
    if (job.status === 'report_pending') {
      if (Number(job.reportRetryAt || 0) > stamp) {
        await saveBroadcast(jobNamespace, job);
        return true;
      }
      return tryCompleteBroadcastReport(job, jobNamespace, stamp);
    }
    if (Number(job.retryAt || 0) > stamp) {
      await saveBroadcast(jobNamespace, job);
      return true;
    }

    if (job.inFlightUserId) {
      const userId = positiveSafeInteger(job.inFlightUserId);
      if (!userId) throw new Error('BROADCAST_IN_FLIGHT_USER_INVALID');
      let outcome = await loadBroadcastOutcome(job, Number(job.resultCount) || 0);
      const hasPersistedOutcome = Array.isArray(outcome) && Number(outcome[0]) === userId;
      if (!hasPersistedOutcome) {
        const error = job.inFlightError || {};
        outcome = [
          userId,
          'uncertain',
          Number.isSafeInteger(Number(error.apiCode)) ? Number(error.apiCode) : null,
          String(error.reason || 'OUTCOME_UNKNOWN'),
          String(error.detail || ''),
        ];
        job.pendingOutcomes = Array.isArray(job.pendingOutcomes) ? job.pendingOutcomes : [];
        job.pendingOutcomes.push(outcome);
        await persistPendingBroadcastOutcomes(job);
      } else {
        job.resultCount = Math.max(0, Number(job.resultCount) || 0) + 1;
      }
      if (outcome[1] === 'failed') {
        job.failed = Number(job.failed || 0) + 1;
      } else {
        job.uncertain = Number(job.uncertain || 0) + 1;
      }
      job.attempted = Number(job.attempted || 0) + 1;
      job.cursor = Math.max(Number(job.cursor) || 0, userId);
      job.inFlightUserId = null;
      job.inFlightError = null;
      job.retryAt = 0;
      await saveBroadcast(jobNamespace, job);
    }

    const cursor = Number.isSafeInteger(Number(job.cursor)) ? Math.max(0, Number(job.cursor)) : 0;
    const maxUserId = positiveSafeInteger(job.maxUserId);
    const recipients = await db.all(sql.raw(
      `WITH audience AS (
         SELECT user_id FROM usage_users WHERE user_id > 0
         UNION SELECT user_id FROM editor_subscriptions WHERE user_id > 0
         UNION SELECT user_id FROM golden_claims WHERE user_id > 0
         UNION SELECT owner_id AS user_id FROM rich_pages WHERE owner_id > 0
         UNION SELECT user_id FROM editor_sessions WHERE user_id > 0
       )
       SELECT user_id FROM audience
       WHERE user_id > ${cursor}
         AND user_id <= ${maxUserId}
       ORDER BY user_id ASC LIMIT ${BROADCAST_BATCH_SIZE}`,
    ));
    if (!recipients?.length) {
      job.status = 'report_pending';
      job.finalStatus = 'done';
      job.completedAt = stamp;
      job.retryAt = 0;
      await saveBroadcast(jobNamespace, job);
      await saveBroadcast(BROADCAST_ACTIVE_NAMESPACE, {
        jobId: current.active.jobId,
        actorId: job.actorId,
        status: 'report_pending',
      });
      return tryCompleteBroadcastReport(job, jobNamespace, stamp);
    }

    for (const recipient of recipients) {
      const userId = positiveSafeInteger(recipient?.user_id);
      if (!userId || userId <= cursor || userId > maxUserId) {
        continue;
      }
      job.inFlightUserId = userId;
      job.inFlightError = null;
      await saveBroadcast(jobNamespace, job);
      try {
        await api.copyMessage({
          chat_id: userId,
          from_chat_id: job.sourceChatId,
          message_id: job.sourceMessageId,
        });
        job.cursor = userId;
        job.sent = Number(job.sent || 0) + 1;
        job.inFlightUserId = null;
        job.inFlightError = null;
        job.retryAt = 0;
      } catch (error) {
        if (isInvalidBroadcastSource(error)) {
          await logBroadcastError('developer.broadcast.source', error, {
            userId: job.actorId,
            chatId: job.actorId,
            extra: 'source_message_id=' + Number(job.sourceMessageId || 0),
          });
          job.status = 'report_pending';
          job.finalStatus = 'failed';
          job.inFlightUserId = null;
          job.inFlightError = null;
          job.completedAt = stamp;
          await saveBroadcast(jobNamespace, job);
          await saveBroadcast(BROADCAST_ACTIVE_NAMESPACE, {
            jobId: current.active.jobId,
            actorId: job.actorId,
            status: 'report_pending',
          });
          return tryCompleteBroadcastReport(job, jobNamespace, stamp);
        }
        if (isBroadcastRateLimit(error)) {
          job.inFlightUserId = null;
          job.inFlightError = null;
          job.retryAt = stamp + broadcastRetrySeconds(error);
          job.rateLimited = Number(job.rateLimited || 0) + 1;
          await saveBroadcast(jobNamespace, job);
          return true;
        }
        if (error instanceof BotApiError && [400, 403].includes(Number(error.code))) {
          const outcome = broadcastOutcome(userId, 'failed', error);
          job.pendingOutcomes = Array.isArray(job.pendingOutcomes) ? job.pendingOutcomes : [];
          job.pendingOutcomes.push(outcome);
          job.cursor = userId;
          job.failed = Number(job.failed || 0) + 1;
          job.inFlightUserId = null;
          job.inFlightError = null;
          job.retryAt = 0;
        } else {
          await logBroadcastError('developer.broadcast.delivery', error, {
            userId,
            chatId: job.actorId,
            extra: 'source_message_id=' + Number(job.sourceMessageId || 0),
          });
          const outcome = broadcastOutcome(userId, 'uncertain', error);
          job.inFlightError = {
            apiCode: outcome[2],
            reason: outcome[3],
            detail: outcome[4],
          };
          job.retryAt = stamp + 60;
          await saveBroadcast(jobNamespace, job);
          return true;
        }
      }
      job.attempted = Number(job.attempted || 0) + 1;
      await saveBroadcast(jobNamespace, job);
    }
    await persistPendingBroadcastOutcomes(job);
    await saveBroadcast(jobNamespace, job);
    return true;
  } finally {
    await releaseLock(lock);
  }
}

export async function openDeveloperPanel(message) {
  const userId = message?.from?.id;
  const chatId = message?.chat?.id;
  if (!userId || !chatId) return true;
  if (message.chat.type !== 'private') {
    await api.sendMessage({
      chat_id: chatId,
      text: 'لحماية النسخ الاحتياطية والإعدادات، افتح المحادثة الخاصة مع البوت واستخدم /dev هناك.',
    });
    return true;
  }

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
    'لوحة أدوات المحرر التشغيلية: النسخ الاحتياطي، قاعدة البيانات، النشاط، قناة المعاينة وسجل الأخطاء.\n\nلإدارة الاشتراكات وإهداء Golden Ticket افتح /dev في @richDonateBot.\n\nالاستيراد يُفحص ويطلب تأكيدًا قبل الكتابة.'
  );
  return true;
}

async function sendPendingNotice(chatId, panelChatId, panelMessageId, text) {
  if (panelChatId && panelMessageId) {
    await sendPanel(panelChatId, text, [], panelMessageId);
    return;
  }
  await api.sendMessage({ chat_id: chatId, text });
}

export async function handleDeveloperPendingMessage(message) {
  const userId = message?.from?.id;
  if (!userId || !developerAccessConfigured() || !isDeveloper(userId)) return false;

  const state = await getState(userId);
  if (!state) return false;

  const chatId = message.chat?.id;
  if (!chatId) return true;
  if (message.chat.type !== 'private') return false;

  const savedPanelChatId = Number(state.summary?.panelChatId || 0) || null;
  const waitingPanelChatId = savedPanelChatId === Number(chatId) ? chatId : null;
  const waitingPanelMessageId = waitingPanelChatId
    ? Number(state.summary?.panelMessageId || 0) || null
    : null;

  if (state.state === 'waiting_error_log_channel') {
    const target = String(message.text || '').trim();
    if (!target) {
      const text = 'أرسل ID القناة مثل -1001234567890 أو @username لقناة عامة.';
      await sendPendingNotice(chatId, waitingPanelChatId, waitingPanelMessageId, text);
      return true;
    }
    try {
      const config = await configureErrorLogChannel(target);
      await clearState(userId);
      const label = config.username ? '@' + config.username : String(config.chatId);
      await sendPanel(
        waitingPanelChatId || chatId,
        '✅ تم ربط قناة سجل الأخطاء.\n\nالقناة: ' + config.title + '\nالمعرف: ' + label,
        [
          { text: '🧪 اختبار', callback_data: 'dev:errorlog:test', style: 'primary' },
          { text: 'تعطيل', callback_data: 'dev:errorlog:disable', style: 'danger' },
        ],
        waitingPanelMessageId,
      );
    } catch (error) {
      await sendPanel(
        waitingPanelChatId || chatId,
        '❌ تعذر ربط القناة.\n\n' + String(error?.message || error),
        [{ text: 'إعادة المحاولة', callback_data: 'dev:errorlog:set', style: 'primary' }],
        waitingPanelMessageId,
      );
    }
    return true;
  }

  if (state.state === 'waiting_broadcast_message') {
    if (Number(chatId) !== Number(userId)) {
      await sendPendingNotice(chatId, waitingPanelChatId, waitingPanelMessageId,
        'أرسل رسالة الإذاعة في محادثتك الخاصة مع البوت.');
      return true;
    }
    const sourceMessageId = Number(message.message_id);
    if (!Number.isSafeInteger(sourceMessageId) || sourceMessageId <= 0
      || !copyableBroadcastMessage(message)) {
      await logBroadcastError(
        'developer.broadcast.source',
        new Error('BROADCAST_SOURCE_UNSUPPORTED: message has no copyable content field'),
        {
          userId,
          chatId,
          extra: 'source_message_id=' + (Number.isSafeInteger(sourceMessageId) ? sourceMessageId : 0)
            + '; forward_origin=' + String(message?.forward_origin?.type || 'none'),
        },
      );
      await sendPendingNotice(chatId, waitingPanelChatId, waitingPanelMessageId,
        'أرسل نصاً منسقاً أو حوّل رسالة نصية/وسائط قابلة للنسخ؛ لا تقبل رسائل الخدمة.');
      return true;
    }

    let copied;
    try {
      copied = await api.copyMessage({
        chat_id: chatId,
        from_chat_id: chatId,
        message_id: sourceMessageId,
        disable_notification: true,
      });
    } catch (error) {
      console.warn('Broadcast source message cannot be copied', error?.code || error?.name || 'Error');
      await logBroadcastError('developer.broadcast.source', error, {
        userId,
        chatId,
        extra: 'source_message_id=' + sourceMessageId
          + '; forward_origin=' + String(message?.forward_origin?.type || 'none'),
      });
      await sendPendingNotice(chatId, waitingPanelChatId, waitingPanelMessageId,
        'تعذر نسخ هذه الرسالة المحوّلة. أرسلها من جديد أو اختر نصاً أو وسائط قابلة للنسخ.');
      return true;
    }
    if (Number.isSafeInteger(Number(copied?.message_id))
      && Number(copied.message_id) > 0
      && Number(copied.message_id) !== sourceMessageId) {
      try {
        await api.deleteMessage({ chat_id: chatId, message_id: Number(copied.message_id) });
      } catch (error) {
        console.warn('Could not remove temporary broadcast source check', error?.code || error?.name || 'Error');
        await logBroadcastError('developer.broadcast.source_cleanup', error, {
          userId,
          chatId,
          extra: 'source_message_id=' + sourceMessageId
            + '; copied_message_id=' + Number(copied.message_id),
        });
      }
    }

    const audience = await broadcastAudienceSummary();
    if (!audience.total) {
      await clearState(userId);
      await sendPendingNotice(chatId, waitingPanelChatId, waitingPanelMessageId,
        'لا توجد حسابات مستخدمين مسجلة للإذاعة.');
      return true;
    }
    await setState(userId, 'confirm_broadcast', {
      summary: {
        panelChatId: waitingPanelChatId,
        panelMessageId: waitingPanelMessageId,
        sourceChatId: Number(chatId),
        sourceMessageId,
        targetCount: audience.total,
        privateCount: audience.privateUsers,
      },
    });
    await sendPanel(chatId,
      'وصلت رسالة الإذاعة. سيحافظ Telegram على النص والتنسيق والوسائط عند نسخها.\n\n'
      + 'المستهدفون المعروفون: ' + audience.total.toLocaleString()
      + '\nبدأوا محادثة خاصة مؤكدة: ' + audience.privateUsers.toLocaleString()
      + '\nسجلات قديمة/غير مؤكدة الخاص: '
      + Math.max(0, audience.total - audience.privateUsers).toLocaleString()
      + '\n\nقد تشمل السجلات القديمة من تفاعلوا بالمجموعات فقط؛ ستظهر حالات رفض Telegram في التقرير. '
      + 'تبدأ الدفعات تلقائياً بعد التأكيد، بحد أقصى ' + BROADCAST_BATCH_SIZE + ' مستخدماً في الدقيقة.',
      [
        { text: '✅ تأكيد الإذاعة', callback_data: 'dev:broadcast:confirm', style: 'danger' },
        { text: '❌ إلغاء', callback_data: 'dev:broadcast:cancel-input' },
      ],
      waitingPanelMessageId,
    );
    return true;
  }

  if (state.state !== 'waiting_import') return false;

  if (!message.document) {
    await sendPendingNotice(
      chatId,
      waitingPanelChatId,
      waitingPanelMessageId,
      'أرسل ملف ZIP أو JSON كمستند.',
    );
    return true;
  }

  const size = Number(message.document.file_size || 0);
  if (size > MAX_IMPORT_ARCHIVE_BYTES) {
    await sendPendingNotice(
      chatId,
      waitingPanelChatId,
      waitingPanelMessageId,
      'حجم الملف أكبر من الحد المسموح وهو 20MB.',
    );
    return true;
  }

  const fileName = message.document.file_name || 'backup.zip';
  try {
    const bytes = await api.getFileContent(message.document.file_id);
    const prepared = prepareBackupImport(fileName, bytes);
    const panelChatId = Number(state.summary?.panelChatId || 0) || null;
    const panelMessageId = Number(state.summary?.panelMessageId || 0) || null;
    const summary = {
      pageCount: prepared.pageCount,
      ownerCount: prepared.ownerCount,
      stateNames: prepared.stateNames,
      fileNames: prepared.fileNames,
      managedChatCount: prepared.managedChatCount,
      managedPanelCount: prepared.managedPanelCount,
      panelChatId,
      panelMessageId,
    };
    await setState(userId, 'confirm_import', {
      fileId: message.document.file_id,
      fileName,
      summary,
    });
    const confirmationText =
      '✅ الملف صالح وجاهز للاستيراد.\n\n' +
      'الصفحات: ' + prepared.pageCount + '\n' +
      'المستخدمون أصحاب الصفحات: ' + prepared.ownerCount + '\n' +
      'المحادثات المدارة: ' + prepared.managedChatCount + '\n' +
      'لوحات النشر المحفوظة: ' + prepared.managedPanelCount + '\n' +
      'ملفات البيانات الأخرى: ' + prepared.stateNames.length + '\n\n' +
      'الاستيراد يدمج البيانات ويحافظ على page_id وowner_id. حد 12 لن يحذف أي صفحة قديمة.';
    const edited = panelChatId && panelMessageId
      ? await editImportConfirmation(panelChatId, panelMessageId, confirmationText)
      : false;
    if (!edited) {
      await api.sendMessage({
        chat_id: chatId,
        text: confirmationText,
        reply_markup: {
          inline_keyboard: [[
            { text: '✅ تأكيد الاستيراد', callback_data: 'dev:import:confirm', style: 'danger' },
            { text: '❌ إلغاء', callback_data: 'dev:import:cancel' },
          ]],
        },
      });
    }
    try {
      await api.deleteMessage({ chat_id: chatId, message_id: message.message_id });
    } catch (error) {
      console.warn('Could not delete uploaded developer backup message', error?.name || 'Error');
    }
  } catch (error) {
    console.error('Developer import validation failed', error);
    const text = '❌ تعذر قبول الملف:\n' + (error?.message || 'خطأ غير معروف');
    await sendPendingNotice(chatId, waitingPanelChatId, waitingPanelMessageId, text);
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

  const operationLock = await acquireLock('developer:import');
  if (!operationLock) {
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
      'المحادثات المدارة: ' + result.importedManagedChats + '\n' +
      'لوحات النشر: ' + result.importedManagedPanels + '\n' +
      'حالات البيانات الأخرى: ' + result.importedStates + '\n' +
      'مستخدمو الإحصائيات المستوردون: ' + result.importedUsageUsers + '\n\n' +
      'تم الحفاظ على page_id وowner_id، ولم تُحذف صفحات بسبب حد 12.\n' +
      'صفحات Mini App محفوظة مباشرة في Telegram Serverless ولا تحتاج مزامنة إلى Cloudflare.',
      [],
      query.message?.message_id || null,
    );
  } catch (error) {
    console.error('Developer import failed', error);
    await sendPanel(
      chatId,
      '❌ فشل الاستيراد:\n' + (error?.message || 'خطأ غير معروف'),
      [],
      query.message?.message_id || null,
    );
  } finally {
    await releaseLock(operationLock);
  }
}

async function exportData(query, chatId) {
  const operationLock = await acquireLock('developer:export');
  if (!operationLock) {
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
    await sendPanel(
      chatId,
      '✅ تم تجهيز وإرسال النسخة الاحتياطية.\n\n' +
      'عدد ملفات البيانات: ' + exported.fileCount + '\n' +
      'حجم ZIP: ' + formatBytes(exported.bytes.length),
      [],
      query.message?.message_id || null,
    );
  } catch (error) {
    console.error('Developer export failed', error);
    await sendPanel(
      chatId,
      '❌ تعذر تصدير البيانات.',
      [],
      query.message?.message_id || null,
    );
  } finally {
    await releaseLock(operationLock);
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
      'PostgreSQL/Redis ما عدهن دور هنا؛ قاعدة Serverless نفسها دائمة بين الاستدعاءات.',
      [],
      query.message?.message_id || null,
    );
  } catch (error) {
    console.error('Serverless database check failed', error);
    await sendPanel(
      chatId,
      '❌ فشل فحص قاعدة Serverless.\n\n' + (error?.message || 'خطأ غير معروف'),
      [],
      query.message?.message_id || null,
    );
  }
}

async function showStats(query, chatId) {
  await api.answerCallbackQuery({ callback_query_id: query.id });
  const stamp = now();
  const summary = await usageSummary(stamp);
  let audience=null;
  try { audience=await audienceAndSubscriptionStats(stamp); }
  catch(error) { console.warn('Subscription and reachability statistics unavailable',error); }
  const pageStats = await pageStatistics();
  const dbBytes = await databaseSizeBytes();
  const editorSessionCount = await db.$count(editorSessions);
  const activeEditors = await db.$count(editorSessions, gte(editorSessions.lastActivityAt, stamp - 2 * 60 * 60));
  const broadcast = await activeBroadcast();
  const broadcastProgressSummary = broadcast ? broadcastProgress(broadcast.job) : null;
  const languageText = summary.languages.length
    ? summary.languages.map((item) => item.code + ': ' + item.count).join('، ')
    : '—';
  const oldestCandidates = [summary.oldestSeen, pageStats.oldestPage]
    .filter((value) => Number.isFinite(Number(value)) && Number(value) > 0)
    .map(Number);
  const oldest = oldestCandidates.length ? Math.min(...oldestCandidates) : null;
  const op = summary.operational;

  const blocks = [
    { type: 'heading', text: '📊 بيانات / إحصائيات', size: 3 },
    statTable('👥 المستخدمون', [
      ['الإجمالي المعروف', summary.trackedUsers.toLocaleString()],
      ['بدأوا الخاص مع البوت', Number(summary.privateUsers || 0).toLocaleString()],
      ['سجلات دون إثبات محادثة خاصة', Number(summary.unverifiedPrivateUsers || 0).toLocaleString()],
      ['المتاحون تقديرياً', audience ? Number(audience.estimatedAvailable || 0).toLocaleString() : 'غير متاح'],
      ['تعذر الوصول مؤكداً', audience ? Number(audience.unavailable || 0).toLocaleString() : 'غير متاح'],
      ['قبل تليكرام رسائلهم', audience ? Number(audience.confirmedReachable || 0).toLocaleString() : 'غير متاح'],
      ['لم يُختبر وصولهم', audience ? Number(audience.unverified || 0).toLocaleString() : 'غير متاح'],
      ['لديهم بيانات حساب', summary.profiledUsers.toLocaleString()],
      ['لديهم username', summary.usersWithUsername.toLocaleString()],
      ['نشطون آخر ساعة', summary.active1h.toLocaleString()],
      ['نشطون آخر 24 ساعة', summary.active24h.toLocaleString()],
      ['نشطون آخر 7 أيام', summary.active7d.toLocaleString()],
      ['نشطون آخر 30 يوم', summary.active30d.toLocaleString()],
      ['جدد آخر 24 ساعة', summary.new24h.toLocaleString()],
      ['جدد آخر 7 أيام', summary.new7d.toLocaleString()],
      ['أكثر اللغات', languageText],
      ['إجمالي التفاعلات', summary.events.toLocaleString()],
    ]),
    { type: 'paragraph', text: 'عدد «بدأوا الخاص» يعتمد على تحديثات خاصة منذ تفعيل التتبع؛ السجلات الأقدم لا يمكن تصنيفها بأثر رجعي. المتاحون تقديرياً لا يثبتون قابلية الإرسال حالياً، والقبول لا يثبت قراءة الرسالة.' },
    statTable('📦 الاستحقاقات الفعالة', [
      ['مجاني', Number(audience?.tiers?.free || 0).toLocaleString()],
      ['Plus', Number(audience?.tiers?.plus || 0).toLocaleString()],
      ['Golden', Number(audience?.tiers?.golden || 0).toLocaleString()],
      ['هدايا Golden', Number(audience?.tiers?.gift || 0).toLocaleString()],
      ['المطورون', Number(audience?.tiers?.developer || 0).toLocaleString()],
    ]),
    statTable('⚙️ التشغيل والأداء', [
      ['مدة التتبع', formatDuration(stamp - op.startedAt)],
      ['Requests هذه الدقيقة', op.requestsCurrentMinute.toLocaleString()],
      ['متوسط requests/min آخر 5 دقائق', op.requestsPerMinute5m.toFixed(2)],
      ['متوسط الاستجابة آخر 5 دقائق', op.avgResponseMs5m.toFixed(1) + 'ms'],
      ['أعلى استجابة مسجلة', op.maxResponseMs.toFixed(1) + 'ms'],
      ['أخطاء handlers آخر ساعة', op.failuresLastHour.toLocaleString()],
      ['Preview', '✅ ' + op.previewSuccess.toLocaleString() + ' | ❌ ' + op.previewFailed.toLocaleString()],
      ['Publish', '✅ ' + op.publishSuccess.toLocaleString() + ' | ❌ ' + op.publishFailed.toLocaleString()],
      ['Rate-limit events', op.rateLimited.toLocaleString()],
    ]),
    statTable('🗄 قاعدة البيانات', [
      ['الحالة', 'Telegram Serverless SQLite'],
      ['الحجم', formatBytes(dbBytes)],
      ['جلسات المحرر', editorSessionCount.toLocaleString()],
      ['المحررات النشطة (آخر ساعتين)', activeEditors.toLocaleString()],
      ['الصفحات المحفوظة', pageStats.pages.toLocaleString()],
      ['مستخدمون لديهم صفحات', pageStats.owners.toLocaleString()],
      ['الفترة المتاحة', formatTime(oldest) + ' → الآن'],
    ]),
    statTable('📢 إذاعة الرسائل', [
      ['الحالة', broadcast ? (broadcast.job.status === 'running' ? 'قيد الإرسال' : broadcast.job.status) : 'لا توجد إذاعة'],
      ['المستهدفون', Number(broadcast?.job?.total || 0).toLocaleString()],
      ['نسبة المعالجة', broadcast
        ? broadcastProgressSummary.percentage + '% ('
          + broadcastProgressSummary.processed.toLocaleString() + ' / '
          + broadcastProgressSummary.total.toLocaleString() + ')'
        : '—'],
      ['قبلها Telegram', Number(broadcast?.job?.sent || 0).toLocaleString()],
      ['تعذر / غير مؤكد', Number(broadcast?.job?.failed || 0).toLocaleString()
        + ' / ' + Number(broadcast?.job?.uncertain || 0).toLocaleString()],
      ['المتبقي', broadcast
        ? Math.max(0, Number(broadcast.job.total || 0)
          - Number(broadcast.job.sent || 0)
          - Number(broadcast.job.failed || 0)
          - Number(broadcast.job.uncertain || 0)).toLocaleString()
        : '—'],
    ]),
    { type: 'footer', text: 'آخر تحديث: ' + formatTime(stamp) },
  ];

  await sendPanel(chatId, blocks, [
    { text: '📡 حالة الإذاعة', callback_data: 'dev:broadcast:check', style: 'primary' },
    { text: '👥 إحصائيات المستخدمين', callback_data: 'dev:stats:users:0', style: 'primary' },
    { text: '🔄 تحديث', callback_data: 'dev:stats', style: 'primary' },
  ], query.message?.message_id || null);
}

async function showUsers(query, chatId, requestedPage) {
  const result = await usageUsersPage(requestedPage, 10);
  const ownerIds = [...new Set(result.users
    .map(user => Number(user.userId))
    .filter(userId => Number.isSafeInteger(userId) && userId > 0))];
  const pageCounts = ownerIds.length
    ? await db.all(sql.raw(
      'SELECT owner_id, COUNT(*) AS page_count FROM rich_pages '
        + 'WHERE owner_id IN (' + ownerIds.join(',') + ') GROUP BY owner_id',
    ))
    : [];
  const pagesByOwner = new Map(pageCounts.map(row => [
    Number(row.owner_id),
    Number(row.page_count || 0),
  ]));
  const cells = [[
    tableTextCell('#', { header: true, align: 'center' }),
    tableTextCell('المستخدم', { header: true }),
    tableTextCell('النشاط', { header: true, align: 'center' }),
    tableTextCell('التوقيت', { header: true, align: 'center' }),
  ]];

  for (let offset = 0; offset < result.users.length; offset += 1) {
    const user = result.users[offset];
    const pages = pagesByOwner.get(Number(user.userId)) || 0;
    const index = result.page * 10 + offset + 1;
    cells.push([
      tableTextCell(index, { align: 'center' }),
      tableTextCell(
        userLabel(user)
        + '\nID: ' + user.userId
        + '\nاللغة: ' + (user.languageCode || '—')
        + '\nالخاص: ' + (user.privateSeenAt ? 'مثبت' : 'غير مثبت'),
      ),
      tableTextCell(
        'التفاعلات: ' + Number(user.events || 0).toLocaleString()
        + '\nالصفحات: ' + pages,
        { align: 'center' },
      ),
      tableTextCell(
        'أول: ' + formatTime(user.firstSeen)
        + '\nآخر: ' + formatTime(user.lastSeen),
        { align: 'center' },
      ),
    ]);
  }

  const blocks = [
    { type: 'heading', text: '👥 إحصائيات المستخدمين', size: 3 },
    {
      type: 'paragraph',
      text:
        'المستخدمون: ' + result.total.toLocaleString()
        + ' · الصفحة: ' + (result.page + 1) + '/' + (result.maxPage + 1),
    },
  ];
  if (result.users.length) {
    blocks.push({ type: 'table', cells, is_bordered: true, is_compact: false });
  } else {
    blocks.push({ type: 'paragraph', text: 'لا توجد بيانات مستخدمين بعد.' });
  }
  blocks.push({ type: 'footer', text: 'آخر تحديث: ' + formatTime(now()) });

  const buttons = [];
  if (result.page > 0) {
    buttons.push({ text: '⬅️ السابق', callback_data: 'dev:stats:users:' + (result.page - 1), style: 'primary' });
  }
  buttons.push({ text: '📊 الملخص', callback_data: 'dev:stats', style: 'primary' });
  if (result.page < result.maxPage) {
    buttons.push({ text: 'التالي ➡️', callback_data: 'dev:stats:users:' + (result.page + 1), style: 'primary' });
  }
  await api.answerCallbackQuery({ callback_query_id: query.id });
  await sendPanel(chatId, blocks, buttons, query.message?.message_id || null);
}

async function createSnapshot(query, chatId) {
  const operationLock = await acquireLock('maintenance:page-snapshot');
  if (!operationLock) {
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
      'وقت النسخة: ' + formatTime(snapshot.createdAt),
      [],
      query.message?.message_id || null,
    );
  } catch (error) {
    console.error('Page snapshot failed', error);
    await sendPanel(
      chatId,
      '❌ تعذر إنشاء Snapshot:\n' + (error?.message || 'خطأ غير معروف'),
      [],
      query.message?.message_id || null,
    );
  } finally {
    await releaseLock(operationLock);
  }
}

function staleShowcaseError(error) {
  if (!(error instanceof BotApiError) || Number(error.code) !== 400) return false;
  const text = String(error.description || '').toUpperCase();
  return ['MESSAGE_ID_INVALID', 'MESSAGE_NOT_FOUND', 'MESSAGE TO COPY NOT FOUND', 'MESSAGE_TO_COPY_NOT_FOUND']
    .some((marker) => text.includes(marker));
}

async function refreshShowcase(query, chatId) {
  const operationLock = await acquireLock('maintenance:showcase-refresh');
  if (!operationLock) {
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
      await sendPanel(
        chatId,
        'لا توجد بيانات قناة معاينة مستوردة بعد.',
        [],
        query.message?.message_id || null,
      );
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
    await sendPanel(chatId, text, [], query.message?.message_id || null);
  } catch (error) {
    console.error('Could not refresh showcase channel cache', error);
    await sendPanel(
      chatId,
      '❌ تعذر تحديث قناة المعاينة. تأكد أن البوت ما زال مشرفًا في القناة.',
      [],
      query.message?.message_id || null,
    );
  } finally {
    await releaseLock(operationLock);
  }
}

async function beginBroadcast(query, chatId) {
  const state = await getState(query.from.id);
  if (!state || state.state !== 'confirm_broadcast') {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'انتهت صلاحية تأكيد الإذاعة؛ ابدأ من جديد.',
      show_alert: true,
    });
    return;
  }
  const active = await activeBroadcast();
  if (active && ['running', 'report_pending'].includes(active.job.status)) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'توجد إذاعة قيد التنفيذ.',
      show_alert: true,
    });
    await sendPanel(chatId, broadcastReport(active.job), [
      ...(active.job.status === 'running'
        ? [{ text: 'إيقاف الإذاعة', callback_data: 'dev:broadcast:cancel:' + active.job.jobId, style: 'danger' }]
        : []),
    ], query.message?.message_id || null);
    return;
  }

  const lock = await acquireLock('developer:broadcast');
  if (!lock) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'توجد عملية إذاعة أو استعادة قيد التنفيذ.',
      show_alert: true,
    });
    return;
  }

  try {
    const latestActive = await activeBroadcast();
    if (latestActive && ['running', 'report_pending'].includes(latestActive.job.status)) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'بدأت إذاعة أخرى للتو.',
        show_alert: true,
      });
      return;
    }

    const sourceChatId = Number(state.summary?.sourceChatId);
    const sourceMessageId = Number(state.summary?.sourceMessageId);
    if (sourceChatId !== Number(chatId) || sourceChatId !== Number(query.from.id)
      || !Number.isSafeInteger(sourceMessageId) || sourceMessageId <= 0) {
      await clearState(query.from.id);
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'تعذر التحقق من رسالة المصدر؛ أرسلها مجدداً.',
        show_alert: true,
      });
      return;
    }

    const audience = await broadcastAudienceSummary();
    if (!audience.total || !audience.maxUserId) {
      await clearState(query.from.id);
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'لا توجد حسابات مستخدمين مسجلة للإذاعة.',
        show_alert: true,
      });
      return;
    }

    const jobId = Date.now().toString(36) + '_'
      + Number(query.from.id).toString(36) + '_'
      + Math.random().toString(36).slice(2, 8);
    const job = {
      jobId,
      actorId: Number(query.from.id),
      sourceChatId,
      sourceMessageId,
      maxUserId: audience.maxUserId,
      total: audience.total,
      privateUsers: audience.privateUsers,
      cursor: 0,
      sent: 0,
      failed: 0,
      uncertain: 0,
      rateLimited: 0,
      attempted: 0,
      inFlightUserId: null,
      retryAt: 0,
      lastTickMinute: 0,
      status: 'running',
      startedAt: now(),
    };
    await saveBroadcast(broadcastJobNamespace(jobId), job);
    await saveBroadcast(BROADCAST_ACTIVE_NAMESPACE, {
      jobId,
      actorId: Number(query.from.id),
      status: 'running',
    });
    await clearState(query.from.id);
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'تم اعتماد الإذاعة؛ تبدأ الدفعات تلقائياً مع Cron.',
    });
    await sendPanel(chatId,
      '✅ بدأت الإذاعة المجدولة.\n\n' + broadcastReport(job)
      + '\n\nتبدأ الدفعات في Cron القادم، بمعدل أقصاه ' + BROADCAST_BATCH_SIZE + ' حساباً في الدقيقة.',
      [
        { text: 'إيقاف الإذاعة', callback_data: 'dev:broadcast:cancel:' + jobId, style: 'danger' },
        { text: '🔄 تحديث حالة الإذاعة', callback_data: 'dev:broadcast:check', style: 'primary' },
        { text: '📊 الإحصائيات', callback_data: 'dev:stats', style: 'primary' },
      ],
      query.message?.message_id || null,
    );
  } finally {
    await releaseLock(lock);
  }
}

async function cancelBroadcast(query, chatId, jobId) {
  const lock = await acquireLock('developer:broadcast');
  if (!lock) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'دفعة الإذاعة تعمل الآن؛ أعد المحاولة بعد قليل.',
      show_alert: true,
    });
    return;
  }
  try {
    const current = await activeBroadcast();
    if (!current || current.active.jobId !== jobId || current.job.status !== 'running') {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'هذه الإذاعة ليست قيد التنفيذ.',
        show_alert: true,
      });
      return;
    }
    current.job.status = 'report_pending';
    current.job.finalStatus = 'cancelled';
    current.job.completedAt = now();
    await saveBroadcast(broadcastJobNamespace(jobId), current.job);
    await saveBroadcast(BROADCAST_ACTIVE_NAMESPACE, {
      jobId,
      actorId: current.job.actorId,
      status: 'report_pending',
    });
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'تم إيقاف الدفعات التالية.' });
    await sendPanel(chatId, broadcastReport(current.job), [
      { text: '📊 الإحصائيات', callback_data: 'dev:stats', style: 'primary' },
    ], query.message?.message_id || null);
    await tryCompleteBroadcastReport(current.job, broadcastJobNamespace(jobId));
  } finally {
    await releaseLock(lock);
  }
}

async function showBroadcastStatus(query, chatId, jobId) {
  const job = await loadBroadcast(broadcastJobNamespace(jobId));
  if (!job) {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'سجل الإذاعة غير موجود.',
      show_alert: true,
    });
    return;
  }
  await api.answerCallbackQuery({ callback_query_id: query.id });
  await sendPanel(chatId, broadcastReport(job), [
    ...(job.status === 'running'
      ? [{ text: 'إيقاف الإذاعة', callback_data: 'dev:broadcast:cancel:' + jobId, style: 'danger' }]
      : []),
    ...(job.status === 'running' || job.status === 'report_pending'
      ? [{ text: '🔄 تحديث حالة الإذاعة', callback_data: 'dev:broadcast:check', style: 'primary' }]
      : []),
    { text: '📊 الإحصائيات', callback_data: 'dev:stats', style: 'primary' },
  ], query.message?.message_id || null);
}

async function showCurrentBroadcastStatus(query, chatId) {
  const current = await activeBroadcast();
  await api.answerCallbackQuery({ callback_query_id: query.id });
  if (!current) {
    await sendPanel(chatId, '📢 لا توجد إذاعة مسجلة حالياً.', [
      { text: '🔄 فحص مجدداً', callback_data: 'dev:broadcast:check', style: 'primary' },
      { text: 'بدء إذاعة', callback_data: 'dev:broadcast', style: 'success' },
    ], query.message?.message_id || null);
    return;
  }

  const { job } = current;
  await sendPanel(chatId, broadcastReport(job), [
    ...(job.status === 'running'
      ? [{ text: 'إيقاف الإذاعة', callback_data: 'dev:broadcast:cancel:' + job.jobId, style: 'danger' }]
      : []),
    ...(job.status === 'running' || job.status === 'report_pending'
      ? [{ text: '🔄 تحديث حالة الإذاعة', callback_data: 'dev:broadcast:check', style: 'primary' }]
      : []),
    { text: '📊 الإحصائيات', callback_data: 'dev:stats', style: 'primary' },
  ], query.message?.message_id || null);
}

async function showErrorLogSettings(query, chatId) {
  const config = await errorLogConfig();
  const status = config.enabled && config.chatId != null ? 'مفعل' : 'معطل';
  const destination = config.chatId == null
    ? 'غير محددة'
    : (config.username ? '@' + config.username : String(config.chatId));
  const title = config.title || '—';
  const buttons = [
    { text: config.enabled ? 'تغيير القناة' : 'تعيين القناة', callback_data: 'dev:errorlog:set', style: 'primary' },
  ];
  if (config.enabled && config.chatId != null) {
    buttons.push(
      { text: '🧪 اختبار', callback_data: 'dev:errorlog:test', style: 'success' },
      { text: 'تعطيل', callback_data: 'dev:errorlog:disable', style: 'danger' },
    );
  }
  await api.answerCallbackQuery({ callback_query_id: query.id });
  await sendPanel(
    chatId,
    '🚨 سجل الأخطاء\n\nالحالة: ' + status + '\nالقناة: ' + title + '\nالمعرف: ' + destination
      + '\n\nيتم إرسال الأخطاء غير المتوقعة فقط، بدون نص رسائل المستخدمين أو التوكنات.',
    buttons,
    query.message?.message_id || null,
  );
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
  if (query.message?.chat?.type !== 'private') {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'افتح لوحة المطور في محادثة خاصة مع البوت.',
      show_alert: true,
    });
    return true;
  }

  if (data.startsWith('dev:golden:') || data.startsWith('dev:stats:subscribers:')) {
    await api.answerCallbackQuery({callback_query_id:query.id,show_alert:true,
      text:'تم نقل إدارة الاشتراكات والإهداء إلى @richDonateBot. افتح /dev هناك.'});
    return true;
  }
  if (data === 'dev:errorlog') {
    await showErrorLogSettings(query, chatId);
    return true;
  }
  if (data === 'dev:errorlog:template-test') {
    try {
      await testErrorLogTemplate();
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'تم إرسال قالب اختبار إلى قناة الأخطاء.',
      });
    } catch (error) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: String(error?.message || error).slice(0, 180),
        show_alert: true,
      });
    }
    return true;
  }
  if (data === 'dev:errorlog:set') {
    await setState(query.from.id, 'waiting_error_log_channel', {
      summary: {
        panelChatId: chatId,
        panelMessageId: query.message?.message_id || null,
      },
    });
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'أرسل ID القناة أو @username.',
    });
    await sendPanel(
      chatId,
      'أرسل ID قناة سجل الأخطاء مثل -1001234567890.\n\nإذا القناة عامة تقدر ترسل @username. لازم البوت يقدر يرسل رسائل داخلها.',
      [],
      query.message?.message_id || null,
    );
    return true;
  }
  if (data === 'dev:errorlog:test') {
    try {
      await testErrorLogChannel();
      await api.answerCallbackQuery({ callback_query_id: query.id, text: 'تم إرسال رسالة اختبار.' });
      const config = await errorLogConfig();
      const destination = config.username ? '@' + config.username : String(config.chatId || '—');
      await sendPanel(
        chatId,
        '🚨 سجل الأخطاء\n\nالحالة: مفعل\nالقناة: ' + (config.title || '—') + '\nالمعرف: ' + destination
          + '\n\n✅ تم إرسال رسالة الاختبار بنجاح.',
        [
          { text: 'تغيير القناة', callback_data: 'dev:errorlog:set', style: 'primary' },
          { text: '🧪 اختبار', callback_data: 'dev:errorlog:test', style: 'success' },
          { text: 'تعطيل', callback_data: 'dev:errorlog:disable', style: 'danger' },
        ],
        query.message?.message_id || null,
      );
    } catch (error) {
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: String(error?.message || error).slice(0, 180),
        show_alert: true,
      });
    }
    return true;
  }
  if (data === 'dev:errorlog:disable') {
    await disableErrorLogChannel();
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'تم تعطيل سجل الأخطاء.' });
    await sendPanel(
      chatId,
      'تم تعطيل إرسال الأخطاء إلى القناة.',
      [{ text: 'تعيين قناة', callback_data: 'dev:errorlog:set', style: 'primary' }],
      query.message?.message_id || null,
    );
    return true;
  }

  if (data === 'dev:broadcast') {
    const active = await activeBroadcast();
    if (active && ['running', 'report_pending'].includes(active.job.status)) {
      await api.answerCallbackQuery({ callback_query_id: query.id });
      await sendPanel(chatId, broadcastReport(active.job), [
        ...(active.job.status === 'running'
          ? [{ text: 'إيقاف الإذاعة', callback_data: 'dev:broadcast:cancel:' + active.job.jobId, style: 'danger' }]
          : []),
        ...(active.job.status === 'running' || active.job.status === 'report_pending'
          ? [{ text: '🔄 تحديث حالة الإذاعة', callback_data: 'dev:broadcast:check', style: 'primary' }]
          : []),
        { text: '📊 الإحصائيات', callback_data: 'dev:stats', style: 'primary' },
      ], query.message?.message_id || null);
      return true;
    }
    await setState(query.from.id, 'waiting_broadcast_message', {
      summary: {
        panelChatId: chatId,
        panelMessageId: query.message?.message_id || null,
      },
    });
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'أرسل الرسالة التي تريد إذاعتها.',
    });
    await sendPanel(chatId,
      '📢 أرسل الآن نص الرسالة بتنسيقه أو حوّل رسالة مستخدم/بوت/قناة، أو أرسل الوسائط.\n\n'
      + 'سأعرض عدد الحسابات قبل البدء. لن تُرسل الرسالة إلا بعد تأكيدك، '
      + 'ويمكن إيقاف الدفعات من اللوحة.',
      [{ text: 'إلغاء', callback_data: 'dev:broadcast:cancel-input' }],
      query.message?.message_id || null,
    );
    return true;
  }
  if (data === 'dev:broadcast:cancel-input') {
    await clearState(query.from.id);
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'تم إلغاء الإذاعة.' });
    await sendPanel(chatId, 'تم إلغاء إعداد الإذاعة؛ لم تُرسل أي رسالة.',
      [], query.message?.message_id || null);
    return true;
  }
  if (data === 'dev:broadcast:confirm') {
    await beginBroadcast(query, chatId);
    return true;
  }
  if (data.startsWith('dev:broadcast:cancel:')) {
    await cancelBroadcast(query, chatId, data.slice('dev:broadcast:cancel:'.length));
    return true;
  }
  if (data.startsWith('dev:broadcast:status:')) {
    await showBroadcastStatus(query, chatId, data.slice('dev:broadcast:status:'.length));
    return true;
  }
  if (data === 'dev:broadcast:check') {
    await showCurrentBroadcastStatus(query, chatId);
    return true;
  }

  if (data === 'dev:import') {
    await setState(query.from.id, 'waiting_import', {
      summary: {
        panelChatId: chatId,
        panelMessageId: query.message?.message_id || null,
      },
    });
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'أرسل ملف النسخة.' });
    await sendPanel(
      chatId,
      '📤 أرسل الآن ملف النسخة بصيغة ZIP، أو ملف JSON معروف مثل rich_pages.json.\n\nالحد الأقصى: 20MB.',
      [],
      query.message?.message_id || null,
    );
    return true;
  }

  if (data === 'dev:import:cancel') {
    await clearState(query.from.id);
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'تم الإلغاء.' });
    await sendPanel(
      chatId,
      'تم إلغاء الاستيراد.',
      [],
      query.message?.message_id || null,
    );
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
  if (data === 'dev:miniapp:sync') {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'صفحات Mini App محفوظة في Telegram Serverless ولا تحتاج مزامنة إلى Cloudflare.',
      show_alert: true,
    });
    return true;
  }
  if (data === 'dev:languages:sync') {
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: 'جاري مزامنة اللغات…',
    });
    try {
      const result = await syncBotProfiles({ force: true });
      await sendPanel(
        chatId,
        '✅ تمت مزامنة لغات البوت.\n\n'
          + 'اللغات: ' + result.locales
          + '\nالتغييرات: ' + result.changed
          + '\nالمحذوفة: fr, fa, ku, he',
        [],
        query.message?.message_id || null,
      );
    } catch (error) {
      console.error('Could not sync bot localization profiles', error);
      await sendPanel(
        chatId,
        '❌ فشلت مزامنة لغات البوت.\n\n' + String(error?.message || error),
        [],
        query.message?.message_id || null,
      );
    }
    return true;
  }

  await api.answerCallbackQuery({ callback_query_id: query.id });
  return true;
}
