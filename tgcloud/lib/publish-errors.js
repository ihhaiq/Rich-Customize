// Telegram publishing error normalization shared by manual, Mini App and scheduled delivery.
// Keep SDK-free so classification can be tested without Telegram.
function detail(error) {
  return String(error?.description || error?.response?.description || error?.message || error || '').trim();
}
function status(error) {
  const code = Number(error?.error_code ?? error?.response?.error_code ?? error?.status ?? error?.statusCode);
  if (Number.isSafeInteger(code) && code >= 400 && code <= 599) return code;
  const match = detail(error).match(/BotApiError\s*\[(\d{3})\]/i);
  return match ? Number(match[1]) : null;
}
export function publishFailure(code, message, cause, extra = {}) {
  const err = new Error(String(message || 'Publishing failed.'));
  err.code = String(code || 'PUBLISH_FAILED');
  if (cause) err.cause = cause;
  Object.assign(err, extra);
  return err;
}
export const EXPECTED_PUBLISH_FAILURES = new Set([
  'PUBLISH_CHAT_UNAVAILABLE','PUBLISH_CHAT_MIGRATED','PUBLISH_PRIVATE_UNAVAILABLE',
  'PUBLISH_BOT_BLOCKED','PUBLISH_RIGHTS_MISSING','PUBLISH_RATE_LIMITED',
  'PUBLISH_TOPIC_CLOSED','PUBLISH_TOPIC_DELETED','PUBLISH_THREAD_INVALID',
  'PUBLISH_CONTENT_TOO_LARGE','PUBLISH_TABLE_LIMIT','PUBLISH_MEDIA_INVALID',
  'PUBLISH_BUTTON_INVALID','PUBLISH_CONTENT_INVALID','PUBLISH_FORBIDDEN',
]);
export function normalizePublishError(error, { kind = 'private' } = {}) {
  if (String(error?.code || '').startsWith('PUBLISH_')) return error;
  const d = detail(error), http = status(error);
  const match = d.match(/retry after\s+(\d+)/i);
  const n = Number(error?.parameters?.retry_after ?? error?.response?.parameters?.retry_after
    ?? error?.retry_after ?? error?.retryAfter ?? match?.[1]);
  const seconds = Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
  if (http === 429 || /too many requests|retry after|FLOOD_WAIT/i.test(d))
    return publishFailure('PUBLISH_RATE_LIMITED','Telegram is temporarily rate limiting publishing.',error,
      seconds ? {retry_after:seconds} : {});
  if (/TOPIC_CLOSED|topic is closed|forum topic is closed/i.test(d))
    return publishFailure('PUBLISH_TOPIC_CLOSED','The destination topic is closed.',error);
  if (/TOPIC_DELETED|forum topic was deleted/i.test(d))
    return publishFailure('PUBLISH_TOPIC_DELETED','The destination topic was deleted.',error);
  if (/MESSAGE_THREAD_ID_INVALID|message thread not found|topic not found|invalid message thread/i.test(d))
    return publishFailure('PUBLISH_THREAD_INVALID','The destination topic is unavailable.',error);
  if (/bot was blocked by the user|bot blocked by user/i.test(d))
    return publishFailure('PUBLISH_BOT_BLOCKED','The bot was blocked by the user.',error);
  if (/user is deactivated|user not found/i.test(d) && kind === 'private')
    return publishFailure('PUBLISH_PRIVATE_UNAVAILABLE','The private chat is unavailable.',error);
  if (/group chat was migrated|migrate_to_chat_id/i.test(d) || error?.parameters?.migrate_to_chat_id) {
    const id = Number(error?.parameters?.migrate_to_chat_id ?? error?.response?.parameters?.migrate_to_chat_id);
    return publishFailure('PUBLISH_CHAT_MIGRATED','The group has migrated.',error,
      Number.isSafeInteger(id) ? {migrate_to_chat_id:id} : {});
  }
  if (/chat not found|peer_id_invalid|channel_private|bot was kicked|bot is not a member|not a member of the channel|chat_id_empty/i.test(d))
    return publishFailure(kind === 'chat' ? 'PUBLISH_CHAT_UNAVAILABLE' : 'PUBLISH_PRIVATE_UNAVAILABLE','The bot cannot access the chat.',error);
  if (/not enough rights|have no rights|chat_write_forbidden|not an administrator|administrator rights|required to post|can_post_messages|CHAT_ADMIN_REQUIRED|USER_BANNED_IN_CHANNEL/i.test(d) || http === 403)
    return publishFailure('PUBLISH_RIGHTS_MISSING','Publishing permissions are missing.',error);
  if (/RICH_MESSAGE_TABLE_(COLS|ROWS)_TOO_MANY|TABLE_(COLS|ROWS)_TOO_MANY/i.test(d))
    return publishFailure('PUBLISH_TABLE_LIMIT','A table exceeds Telegram limits.',error);
  if (/message is too long|rich message.{0,30}too long|message_too_long/i.test(d))
    return publishFailure('PUBLISH_CONTENT_TOO_LARGE','The message is too long.',error);
  if (/wrong file identifier|file_reference_expired|file reference expired|wrong file id|failed to get http url content/i.test(d))
    return publishFailure('PUBLISH_MEDIA_INVALID','A media file is invalid.',error);
  if (/BUTTON_(?:DATA|URL)_INVALID|inline keyboard button|reply markup.{0,30}invalid|button.{0,30}invalid/i.test(d))
    return publishFailure('PUBLISH_BUTTON_INVALID','A message button is invalid.',error);
  if (/RICH_MESSAGE_|can't parse rich message|can't parse entities|entity.{0,30}invalid|entity bounds/i.test(d))
    return publishFailure('PUBLISH_CONTENT_INVALID','The rich message formatting was refused.',error);
  return publishFailure('PUBLISH_FAILED','Telegram could not publish the message.',error);
}
export function shouldForgetDestination(code) {
  return ['PUBLISH_CHAT_UNAVAILABLE','PUBLISH_CHAT_MIGRATED','PUBLISH_RIGHTS_MISSING','PUBLISH_FORBIDDEN']
    .includes(String(code || ''));
}
export function isDefinitePublishRejection(error) {
  const e = normalizePublishError(error,{kind:'chat'});
  return EXPECTED_PUBLISH_FAILURES.has(String(e.code || ''))
    || [400,401,403,404,429].includes(status(error));
}
export function publishFailureMessage(error, locale = 'en') {
  const ar = {
    PUBLISH_TOPIC_CLOSED:'الموضوع المستهدف مغلق. افتح الموضوع أو اختر وجهة ثانية.',
    PUBLISH_TOPIC_DELETED:'الموضوع المستهدف محذوف. اختر موضوعاً آخر.',
    PUBLISH_THREAD_INVALID:'الموضوع المستهدف غير موجود أو لم يعد متاحاً.',
    PUBLISH_RIGHTS_MISSING:'البوت ما عنده صلاحية النشر في هذه المحادثة. راجع صلاحياته.',
    PUBLISH_CHAT_UNAVAILABLE:'البوت ما يگدر يوصل لهذه المحادثة. تحقق من عضويته.',
    PUBLISH_CHAT_MIGRATED:'المجموعة انتقلت لمعرّف جديد. أضفها مجدداً.',
    PUBLISH_PRIVATE_UNAVAILABLE:'المحادثة الخاصة غير متاحة للبوت.',
    PUBLISH_BOT_BLOCKED:'المستخدم حاجب البوت.',
    PUBLISH_RATE_LIMITED:'تليكرام قيّد الإرسال مؤقتاً'+(error?.retry_after ? '؛ حاول بعد '+error.retry_after+' ثانية.' : '؛ حاول بعد قليل.'),
    PUBLISH_TABLE_LIMIT:'الجدول يتجاوز حدود تليكرام. قلل عدد الصفوف أو الأعمدة.',
    PUBLISH_CONTENT_TOO_LARGE:'محتوى المنشور يتجاوز الحد المسموح. اختصره.',
    PUBLISH_MEDIA_INVALID:'أحد الملفات غير صالح للإرسال. أعد رفعه أو احذفه.',
    PUBLISH_BUTTON_INVALID:'أحد أزرار المنشور غير صالح. راجع الروابط والأزرار.',
    PUBLISH_CONTENT_INVALID:'تليكرام رفض تنسيق أحد البلوكات. راجع محتوى المنشور.',
    PUBLISH_FORBIDDEN:'تليكرام رفض النشر. تحقق من صلاحيات البوت.',
    PUBLISH_FAILED:'تعذر نشر الرسالة لهذه المحادثة. حاول مجدداً.',
  };
  const en = {
    PUBLISH_TOPIC_CLOSED:'The topic is closed. Open it or choose another destination.',
    PUBLISH_TOPIC_DELETED:'The topic was deleted. Choose another topic.',
    PUBLISH_THREAD_INVALID:'The destination topic is unavailable.',
    PUBLISH_RIGHTS_MISSING:'The bot lacks publishing permissions in this chat.',
    PUBLISH_CHAT_UNAVAILABLE:'The bot cannot access this chat. Check membership.',
    PUBLISH_CHAT_MIGRATED:'The group migrated. Add the new group again.',
    PUBLISH_PRIVATE_UNAVAILABLE:'The private chat is unavailable.',
    PUBLISH_BOT_BLOCKED:'The user blocked the bot.',
    PUBLISH_RATE_LIMITED:'Telegram limited sending'+(error?.retry_after ? '; retry after '+error.retry_after+' seconds.' : '; try later.'),
    PUBLISH_TABLE_LIMIT:'A table exceeds Telegram limits. Reduce rows or columns.',
    PUBLISH_CONTENT_TOO_LARGE:'The post exceeds Telegram size limits.',
    PUBLISH_MEDIA_INVALID:'A media file is invalid. Re-upload or remove it.',
    PUBLISH_BUTTON_INVALID:'A button is invalid. Check its link or callback.',
    PUBLISH_CONTENT_INVALID:'Telegram refused the rich message formatting.',
    PUBLISH_FORBIDDEN:'Publishing was refused. Check permissions.',
    PUBLISH_FAILED:'Publishing failed for this chat. Try again.',
  };
  const dictionary = String(locale).toLowerCase().startsWith('ar') ? ar : en;
  return dictionary[String(error?.code || '')] || dictionary.PUBLISH_FAILED;
}
