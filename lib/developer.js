import { api, db } from 'sdk';
import { eq } from 'sdk/db';
import { developerStates, richPages } from 'schema';
import { developerAccessConfigured, isDeveloper } from 'lib/developer-access';
import {
  MAX_IMPORT_ARCHIVE_BYTES,
  importPreparedPages,
  prepareBackupImport,
} from 'lib/backup-import';

const IMPORT_STATE_TTL_SECONDS = 30 * 60;

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
  await db.delete(developerStates).where(eq(developerStates.userId, Number(userId))).run();
}

function panelKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: '📤 رفع واستيراد', callback_data: 'dev:import', style: 'success' },
        { text: '🗄 فحص قاعدة البيانات', callback_data: 'dev:database:check', style: 'primary' },
      ],
    ],
  };
}

async function sendPanel(chatId, text = 'لوحة المطور') {
  const replyMarkup = panelKeyboard();
  try {
    await api.sendRichMessage({
      chat_id: chatId,
      rich_message: {
        blocks: [
          { type: 'heading', text: 'لوحة المطور', size: 2 },
          { type: 'paragraph', text },
          { type: 'divider' },
          {
            type: 'footer',
            text: 'الاستيراد الحالي يرجّع الصفحات إلى قاعدة Serverless بدون حذف الصفحات القديمة بسبب حد 12 صفحة.',
          },
        ],
        is_rtl: true,
      },
      reply_markup: replyMarkup,
    });
  } catch (error) {
    console.warn('Could not send rich developer panel', error);
    await api.sendMessage({ chat_id: chatId, text, reply_markup: replyMarkup });
  }
}

export async function openDeveloperPanel(message) {
  const userId = message.from?.id;
  if (!userId || !message.chat?.id) return true;

  if (!developerAccessConfigured()) {
    await api.sendMessage({
      chat_id: message.chat.id,
      text: `لوحة المطور بعده تحتاج تهيئة ID المطور في Serverless.\n\nTelegram ID مالك: ${userId}`,
    });
    return true;
  }

  if (!isDeveloper(userId)) return true;
  await clearState(userId);
  await sendPanel(
    message.chat.id,
    'استيراد نسخة Railway القديمة وفحص قاعدة Serverless. بقية أدوات /dev راح نرجعها تدريجيًا أثناء الترحيل.',
  );
  return true;
}

export async function handleDeveloperImportDocument(message) {
  const userId = message.from?.id;
  if (!userId || !isDeveloper(userId) || !message.document) return false;

  const state = await getState(userId);
  if (!state || state.state !== 'waiting_import') return false;

  const size = Number(message.document.file_size || 0);
  if (size > MAX_IMPORT_ARCHIVE_BYTES) {
    await api.sendMessage({ chat_id: message.chat.id, text: 'حجم الملف أكبر من الحد المسموح وهو 20MB.' });
    return true;
  }

  const fileName = message.document.file_name || 'backup.zip';
  try {
    const bytes = await api.getFileContent(message.document.file_id);
    const prepared = prepareBackupImport(fileName, bytes);
    const summary = {
      pageCount: prepared.pageCount,
      ownerCount: prepared.ownerCount,
      otherFiles: prepared.otherFiles,
    };
    await setState(userId, 'confirm_import', {
      fileId: message.document.file_id,
      fileName,
      summary,
    });

    const otherText = prepared.otherFiles.length
      ? `\nملفات أخرى محفوظة للترحيل لاحقًا: ${prepared.otherFiles.length}`
      : '';
    await api.sendMessage({
      chat_id: message.chat.id,
      text: `✅ الملف صالح.\n\nالصفحات: ${prepared.pageCount}\nالمستخدمون: ${prepared.ownerCount}${otherText}\n\nهسه راح نستورد rich_pages فقط. ما راح نحذف أي صفحة لأن مالكها فوق حد 12.`,
      reply_markup: {
        inline_keyboard: [[
          { text: 'استيراد', callback_data: 'dev:import:confirm', style: 'success' },
          { text: 'إلغاء', callback_data: 'dev:import:cancel', style: 'danger' },
        ]],
      },
    });
  } catch (error) {
    console.error('Developer import validation failed', error);
    await api.sendMessage({
      chat_id: message.chat.id,
      text: `❌ تعذر قبول الملف:\n${error?.message || 'خطأ غير معروف'}`,
    });
  }
  return true;
}

export async function handleDeveloperCallback(query) {
  const data = String(query.data || '');
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
      text: '📤 أرسل هسه ملف النسخة بصيغة ZIP أو ملف rich_pages.json.\n\nالحد الأقصى: 20MB.',
    });
    return true;
  }

  if (data === 'dev:import:cancel') {
    await clearState(query.from.id);
    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'تم الإلغاء.' });
    await sendPanel(chatId, 'تم إلغاء الاستيراد.');
    return true;
  }

  if (data === 'dev:database:check') {
    const pages = await db.$count(richPages);
    await api.answerCallbackQuery({
      callback_query_id: query.id,
      text: `قاعدة Serverless تعمل. الصفحات: ${pages}`,
      show_alert: true,
    });
    return true;
  }

  if (data === 'dev:import:confirm') {
    const state = await getState(query.from.id);
    if (!state || state.state !== 'confirm_import' || !state.fileId) {
      await clearState(query.from.id);
      await api.answerCallbackQuery({
        callback_query_id: query.id,
        text: 'انتهت صلاحية الملف؛ ارفعه مجددًا.',
        show_alert: true,
      });
      return true;
    }

    await api.answerCallbackQuery({ callback_query_id: query.id, text: 'جاري الاستيراد…' });
    try {
      const bytes = await api.getFileContent(state.fileId);
      const prepared = prepareBackupImport(state.fileName || 'backup.zip', bytes);
      const imported = await importPreparedPages(prepared);
      await clearState(query.from.id);
      await sendPanel(
        chatId,
        `✅ تم استيراد ${imported} صفحة وربطها بأصحابها مع الحفاظ على page_id.\n\nحد 12 لا يحذف الصفحات القديمة؛ يطبّق لاحقًا فقط عند إنشاء صفحة جديدة.`,
      );
    } catch (error) {
      console.error('Developer import failed', error);
      await api.sendMessage({
        chat_id: chatId,
        text: `❌ فشل الاستيراد:\n${error?.message || 'خطأ غير معروف'}`,
      });
    }
    return true;
  }

  await api.answerCallbackQuery({ callback_query_id: query.id });
  return true;
}
