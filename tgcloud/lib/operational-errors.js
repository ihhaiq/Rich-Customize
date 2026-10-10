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
