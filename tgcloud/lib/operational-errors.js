// Centralized, safe explanations for errors from Telegram and the editor.
// No SDK dependency: this stays testable even when Telegram is unreachable.
import { normalizePublishError, publishFailureMessage } from 'lib/publish-errors';

const rawDetail = (error) => String(
  error?.description || error?.response?.description || error?.message || error || '',
);
const codes = (error) => String(error?.code ?? error?.error_code ?? error?.response?.error_code ?? '');

function guide(code, kind, ar, en, reason, action, { silent = false } = {}) {
  return {
    code, kind, silent, expected: kind !== 'internal',
    userMessageAr: ar, userMessageEn: en, reason, action,
  };
}
export function explainOperationalError(error) {
  const message = rawDetail(error);
  const code = codes(error);
  const value = [code, message].join(' ');
  if (/query is too old|query_id_invalid|query has expired|query id is invalid|QUERY_ID_INVALID/i.test(value))
    return guide('CALLBACK_EXPIRED','benign','انتهت صلاحية الزر. افتح الواجهة من جديد.','This button expired. Reopen the screen.',
      'انتهت صلاحية إجابة Callback قبل وصول الطلب.','لا تعاود إرسال إجابة الـ Callback المنتهي، وافتح الواجهة مجدداً.',{silent:true});
  if (/message is not modified|MESSAGE_NOT_MODIFIED/i.test(value))
    return guide('MESSAGE_NOT_MODIFIED','benign','','','المحتوى المطلوب مطابق للمحتوى الحالي.','تجاهل محاولة التعديل المكررة.',{silent:true});
  if (/canceled by new edit message request/i.test(value))
    return guide('EDIT_SUPERSEDED','temporary','تم استبدال التعديل بطلب أحدث. حدّث الواجهة.','A newer edit superseded this request. Refresh the screen.',
      'تزامن تعديلان للرسالة نفسها وألغى تليكرام الأقدم.','استعمل قفل تعديل لكل رسالة ولا تعاود التعديل القديم تلقائياً.');
  if (/message to edit not found|message can't be edited|message_id_invalid|message to delete not found|message can.t be deleted/i.test(value))
    return guide('MESSAGE_TARGET_UNAVAILABLE','expected','الرسالة القديمة ما عادت قابلة للتعديل. افتح المحرر من جديد.','The old message cannot be edited. Reopen the editor.',
      'الرسالة المستهدفة محذوفة أو انتهت إمكانية تعديلها.','أنشئ رسالة واجهة جديدة وحدّث معرّف الرسالة داخل الجلسة.');
  if (/STICKERSET_INVALID|STICKERSET_NOT_FOUND|STICKER_SET_INVALID|sticker set not found/i.test(value))
    return guide('EMOJI_PACK_UNAVAILABLE','expected','رابط حزمة الإيموجي غير صالح أو انحذفت الحزمة.','The emoji pack link is invalid or the pack was removed.',
      'حزمة الملصقات غير موجودة أو لم يعد الوصول إليها متاحاً.','اطلب رابطاً صالحاً وتأكد من اسم مجموعة الملصقات.');
  if (/RICH_MESSAGE_EMOJI_INVALID|CUSTOM_EMOJI_INVALID|EMOJI_ID_INVALID/i.test(value))
    return guide('RICH_EMOJI_INVALID','expected','أحد الإيموجيات الخاصة غير صالح. أعد اختياره أو استعمل إيموجي عادي.','A custom emoji is invalid. Re-select it or use a standard emoji.',
      'رفض تليكرام معرّف إيموجي مخصص أو لا يملك المستهدف صلاحية استخدامه.','تحقق من ID الإيموجي وصلاحيات الوجهة، واستعمل بديله العادي عند الإمكان.');
  if (/LEGACY_PAGE_READ_ONLY/i.test(value))
    return guide('LEGACY_PAGE_READ_ONLY','expected',
      'هذه صفحة محفوظة قديمة، مسموح تنشرها كما هي لكن ما تگدر تعدلها. افتح مسودة جديدة حتى تنشئ محتوى جديد.',
      'This saved legacy page can be republished unchanged, but cannot be edited. Start a new draft.',
      'النسخة المحفوظة تتجاوز واحدة أو أكثر من حدود الباقة الجديدة.',
      'لا تسمح بالتعديل أو التسمية أو المزامنة؛ استعمل النسخة المخزونة لإعادة النشر.');
  if (/EDITOR_LIMIT:|editor limit exceeded|quota exceeded/i.test(value))
    return guide('EDITOR_LIMIT_REACHED','expected',
      'المحتوى يتجاوز حدود المحرر أو باقتك. قلل المحتوى أو راجع حدود الاشتراك.',
      'The editor or your plan limit was exceeded. Reduce content or check plan limits.',
      'تجاوز حجم الصفحة أو عدد البلوكات أو عنصر من العناصر الحد المسموح.',
      'اعرض الحد الفعلي للمستخدم واحتفظ بمحتواه حتى يقدر يعدله.');
  if (/no reusable (?:file_id|media)|wrong file identifier|file_id.*missing/i.test(value))
    return guide('EDITOR_MEDIA_MISSING','expected','ملف داخل الصفحة ما عاد صالحاً. أعد رفعه أو احذفه.',
      'A file in the page is unavailable. Re-upload or remove it.',
      'بلوك ميديا لا يحتوي معرّف ملف صالحاً لإعادة استخدامه.','تحقق من file_id في البلوك قبل الإرسال أو المعاينة.');
  if (/map coordinates are missing|list block has no items|table block has no cells|block has no children|rich message has no blocks|unsupported rich block type|invalid native rich block payload/i.test(value))
    return guide('EDITOR_BLOCK_INVALID','expected','أحد بلوكات الرسالة ناقص أو غير صالح. راجعه قبل النشر.',
      'A message block is incomplete or invalid. Edit it before publishing.',
      'بلوك فارغ أو بنية محتوى غير مدعومة أو بيانات أساسية ناقصة.',
      'تحقق من بيانات البلوك وحدد نوعه ومسار العنصر المرفوض داخل المحرر.');
  if (/Invalid UTF-8|Invalid Huffman|Truncated stored block|Invalid deflate|Invalid ZIP|ZIP.*invalid|Unexpected end of deflate/i.test(value))
    return guide('BACKUP_CORRUPT','expected','ملف النسخة غير صالح أو تالف. اختر نسخة ZIP أو JSON سليمة.',
      'The backup file is corrupt or invalid. Select a valid ZIP or JSON file.',
      'ملف الاستيراد تالف أو يحتوي بيانات مضغوطة/نصية غير صالحة.',
      'افحص صيغة وحجم الملف، وارفضه دون تعديل قاعدة البيانات.');
  if (/PAGE_NOT_FOUND|page does not exist/i.test(value))
    return guide('PAGE_NOT_FOUND','expected','الصفحة غير موجودة أو انحذفت. حدّث قائمة صفحاتك.',
      'The page no longer exists. Refresh your saved pages.',
      'معرّف الصفحة لم يعد مرتبطاً بصفحة محفوظة.','أعد تحميل الصفحات ولا تنفذ العملية على معرّف قديم.');
  const normalized = normalizePublishError(error, { kind:'chat' });
  if (normalized.code !== 'PUBLISH_FAILED') {
    const actions = {
      PUBLISH_TOPIC_CLOSED:'افتح الموضوع المستهدف أو اختر موضوعاً مفتوحاً.',
      PUBLISH_TOPIC_DELETED:'حدّث معرف الموضوع المحفوظ واختر موضوعاً آخر.',
      PUBLISH_THREAD_INVALID:'افحص message_thread_id قبل الإرسال.',
      PUBLISH_RIGHTS_MISSING:'راجع صلاحيات البوت وعضويته دون تكرار الإرسال.',
      PUBLISH_RATE_LIMITED:'انتظر retry_after، ولا تُعِد إرسال منشور قد تكون نتيجته غير معروفة.',
      PUBLISH_TABLE_LIMIT:'صحح حدود الجداول قبل إرسال Rich Message.',
      PUBLISH_MEDIA_INVALID:'أعد رفع الملفات ذات معرفات Telegram غير الصالحة.',
      PUBLISH_BUTTON_INVALID:'راجع URL وcallback_data للأزرار.',
      PUBLISH_CONTENT_INVALID:'افحص بنية Rich Message والبلوك المرفوض.',
      PUBLISH_CONTENT_TOO_LARGE:'قسم المحتوى أو اختصره قبل إعادة الإرسال.',
      PUBLISH_CHAT_UNAVAILABLE:'راجع وجود الوجهة وصلاحية الوصول.',
    };
    return guide(normalized.code, normalized.code === 'PUBLISH_RATE_LIMITED' ? 'temporary' : 'expected',
      publishFailureMessage(normalized,'ar'),publishFailureMessage(normalized,'en'),
      'تليكرام رفض العملية: '+String(normalized.message || normalized.code),
      actions[normalized.code] || 'راجع بيانات الطلب والوجهة وصلاحيات البوت.');
  }
  if (/timeout|timed out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network error|failed to fetch|fetch failed|connection closed|temporarily unavailable|service unavailable|\b(502|503|504)\b/i.test(value))
    return guide('TRANSPORT_FAILURE','temporary','تعذر الاتصال بتليكرام مؤقتاً. تحقق من نتيجة العملية قبل إعادة المحاولة.','Telegram is temporarily unreachable. Check the result before retrying.',
      'مشكلة شبكة أو مهلة أو عطل مؤقت في الخدمة. نتيجة العمليات التي بدأت قد تكون غير مؤكدة.',
      'لا تعاود الإرسال الأعمى؛ افحص حالة العملية أولاً لتجنب النشر المكرر.');
  if (/ReferenceError|is not defined/i.test(String(error?.name || '')+' '+message))
    return guide('REFERENCE_ERROR','internal','تعذر إكمال العملية بسبب خلل تقني. حاول لاحقاً.','A technical error prevented this operation. Try later.',
      'دالة أو متغير غير معرّف في الكود، وقد يكون استيراداً مفقوداً.',
      'راجع السطر الذي أصدر ReferenceError والاستيرادات قبل النشر.');
  if (/TypeError/i.test(String(error?.name || '')))
    return guide('TYPE_ERROR','internal','تعذر إكمال العملية بسبب خلل تقني. حاول لاحقاً.','A technical error prevented this operation. Try later.',
      'نوع بيانات أو قيمة غير متوقعة داخل التنفيذ.',
      'افحص القيمة والمدخلات والتحقق قبل الوصول للخاصية أو استدعاء الدالة.');
  return guide('UNCLASSIFIED_ERROR','internal','تعذر إكمال العملية. إذا تكرر الخطأ تواصل مع الدعم.','The operation could not be completed. Contact support if it continues.',
    'خطأ غير مصنف حتى الآن؛ التفاصيل التقنية محفوظة في السجل للمراجعة.',
    'راجع رسالة الاستثناء الأصلية والسياق وأضف معالجة واختبار انحدار للحالة الجديدة.');
}
export function userOperationalError(error, languageCode = 'ar') {
  const result = explainOperationalError(error);
  return String(languageCode || '').toLowerCase().startsWith('ar')
    ? result.userMessageAr : result.userMessageEn;
}
