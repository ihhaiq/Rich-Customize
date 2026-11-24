// Centralized, safe explanations for errors from Telegram and the editor.
// No SDK dependency: this stays testable even when Telegram is unreachable.
import { normalizePublishError, publishFailureMessage } from 'lib/publish-errors';

const rawDetail = (error) => String(
  error?.description || error?.response?.description || error?.message || error || '',
);
const codes = (error) => String(error?.code ?? error?.error_code ?? error?.response?.error_code ?? '');

export function isDatabaseFailure(error) {
  const value = [codes(error), rawDetail(error)].join(' ');
  return /\bsqlite(?:3)?\b|\bSQLITE_[A-Z_]+\b|database (?:is )?(?:locked|busy|unavailable|malformed)|no such (?:table|column)/i.test(value);
}

export function isEditorLimitFailure(error) {
  return /(?:^|\s)EDITOR_LIMIT:[a-z_]+:\d+:\d+(?:$|\s)/.test(rawDetail(error));
}

function guide(code, kind, ar, en, reason, action, { silent = false } = {}) {
  return {
    code, kind, silent, expected: kind !== 'internal',
    userMessageAr: ar, userMessageEn: en, reason, action,
  };
}
const BROADCAST_ERROR_GUIDES = {
  BROADCAST_CONTROL_STATUS_INVALID: [
    'internal',
    'تعذر تحديد حالة إشارة الإذاعة بسبب قيمة داخلية غير صالحة.',
    'The broadcast control signal received an invalid internal status.',
    'قيمة الحالة المرسلة إلى تحكم الإذاعة لا تطابق الحالات المدعومة.',
    'راجع القيمة التي يستعملها مسار تفعيل أو إيقاف الإذاعة.',
  ],
  BROADCAST_EXCLUSION_ID_INVALID: [
    'internal',
    'تعذر حفظ استثناء الإذاعة بسبب معرّف وجهة غير صالح.',
    'The broadcast exclusion could not be saved because its destination ID is invalid.',
    'وصل معرّف مستخدم أو محادثة غير صالح إلى سجل استثناءات الإذاعة.',
    'تحقق من مصدر المعرّف قبل حفظ الاستثناء، ولا تتجاوز فحص سلامة البيانات.',
  ],
  BROADCAST_BOT_ID_UNAVAILABLE: [
    'internal',
    'تعذر التحقق من هوية البوت قبل فحص عضويته في القناة.',
    'The bot identity could not be verified before checking its channel membership.',
    'لم يُرجع Telegram معرّفاً صالحاً للبوت.',
    'تحقق من استجابة getMe وإعداد البوت قبل بدء الإذاعة.',
  ],
  BROADCAST_CHANNEL_ADMIN_REQUIRED: [
    'expected',
    'يجب منح البوت صلاحية مشرف في قناة @RichCustomize قبل إذاعة الرسائل الخاصة.',
    'The bot must be an administrator of @RichCustomize before private broadcast can start.',
    'البوت ليس مشرفاً في القناة الرسمية، لذلك لا يمكن استثناء المشتركين بأمان.',
    'أضف البوت مشرفاً في القناة ثم أعد محاولة الإذاعة.',
  ],
  BROADCAST_MEMBERSHIP_STATUS_INVALID: [
    'internal',
    'أعاد Telegram حالة عضوية غير معروفة؛ أُوقفت الإذاعة لتجنب مراسلة المشتركين.',
    'Telegram returned an unknown membership status; the broadcast stopped to avoid messaging subscribers.',
    'صيغة حالة العضوية المستلمة غير مدعومة في الكود.',
    'راجع شكل استجابة getChatMember وأضف الحالة باختبار قبل متابعة الإرسال.',
  ],
  BROADCAST_OUTCOME_CHUNK_INVALID: [
    'internal',
    'تعذر قراءة جزء نتائج الإذاعة بسبب بنية بيانات غير صالحة.',
    'A broadcast result chunk has an invalid data shape.',
    'سجل نتائج الإذاعة لا يحتوي قائمة النتائج المتوقعة.',
    'أوقف حذف السجلات، وافحص بيانات النتيجة ومخطط التخزين قبل استكمال التقرير.',
  ],
  BROADCAST_OUTCOME_CONFLICT: [
    'internal',
    'تعارضت نتيجة الإذاعة الحالية مع نتيجة محفوظة سابقاً.',
    'The current broadcast result conflicts with an already persisted result.',
    'وجد النظام نتيجتين مختلفتين للوجهة نفسها في موضع واحد من سجل النتائج.',
    'حافظ على سجل النتائج وافحص ترتيب الكتابة والاستعادة قبل إعادة التقرير.',
  ],
  BROADCAST_OUTCOME_SEQUENCE_INVALID: [
    'internal',
    'تسلسل نتائج الإذاعة المحفوظ غير متصل.',
    'The persisted broadcast result sequence contains a gap.',
    'لم يطابق موضع النتيجة الجديدة طول الجزء المحفوظ.',
    'افحص مؤشر النتائج والجزء المخزن؛ لا تعِد ترتيب السجلات تلقائياً.',
  ],
  BROADCAST_OUTCOME_MISSING: [
    'internal',
    'تعذر إنشاء تقرير الإذاعة لأن نتيجة محفوظة مفقودة.',
    'A persisted broadcast outcome is missing, so the results report could not be built.',
    'يشير مؤشر نتائج الإذاعة إلى سجل غير موجود أو غير صالح.',
    'تحقق من سجل النتائج ومؤشر التقرير قبل استكمال الحملة.',
  ],
  BROADCAST_SOURCE_UNSUPPORTED: [
    'expected',
    'رسالة المصدر لا تحتوي نصاً أو وسائط قابلة للنسخ؛ اختر رسالة أخرى.',
    'The source message has no copyable text or media. Choose another message.',
    'رسالة المصدر من نوع خدمة أو لا تحتوي حقلاً يدعمه نسخ Telegram.',
    'اختر رسالة نصية أو وسائط قابلة للنسخ قبل تأكيد الإذاعة.',
  ],
};

function explainBroadcastError(error, context) {
  const message = rawDetail(error);
  const marker = message.match(/\bBROADCAST_[A-Z_]+\b/);
  const known = marker && BROADCAST_ERROR_GUIDES[marker[0]];
  if (known) {
    return guide(marker[0], ...known);
  }
  if (context?.scope === 'developer.broadcast.source'
    && /message to copy not found|message_id_invalid|message can't be copied|message can not be copied/i.test(message)) {
    return guide('BROADCAST_SOURCE_UNAVAILABLE','expected',
      'رسالة المصدر لم تعد متاحة للنسخ؛ أُوقفت الإذاعة وأُرسل تقرير بالنتائج السابقة.',
      'The source message is no longer available to copy. The broadcast stopped and a report was sent for prior results.',
      'رفض Telegram نسخ رسالة المصدر لأنها حُذفت أو لم تعد صالحة.',
      'أعد اختيار رسالة مصدر موجودة وقابلة للنسخ قبل بدء حملة جديدة.');
  }
  return null;
}

export function explainOperationalError(error, context = {}) {
  const message = rawDetail(error);
  const code = codes(error);
  const value = [code, message].join(' ');
  const broadcastScope = /^developer\.broadcast\./.test(String(context?.scope || ''))
    || /^dev:broadcast(?::|$)/.test(String(context?.callbackData || ''))
    || /(?:^|[;\s])kind=broadcast(?:$|[;\s])/i.test(String(context?.extra || ''));
  if (broadcastScope) {
    const broadcastError = explainBroadcastError(error, context);
    if (broadcastError) return broadcastError;
  }
  if (isDatabaseFailure(error))
    return guide('DATABASE_UNAVAILABLE','temporary',
      'قاعدة البيانات غير متاحة مؤقتاً. تعذر تأكيد حفظ هذه الخطوة؛ تحقق من حالتها قبل إعادة المحاولة. لا تكرر الدفع أو النشر قبل التحقق.',
      'The database is temporarily unavailable. This step could not be confirmed; check its status before retrying. Do not repeat a payment or publish until you verify the result.',
      'فشل الوصول إلى قاعدة بيانات Telegram Serverless أو إلى مخطط مطلوب.',
      'أوقف العمليات المعتمدة على الحالة، وأظهر تنبيهاً آمناً دون تسجيل الخطأ في قاعدة البيانات المتعطلة.');
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
  if (/BUTTON_USER_INVALID/i.test(value) && /editMessageText/i.test(value))
    return guide('EDITOR_BUTTON_USER_INVALID','expected',
      'رابط الحساب في معاينة المحرر غير صالح. افتح البلوك وعدّل الزر لاستخدام حساب باسم مستخدم عام (@username).',
      'The editor preview contains an invalid account link. Edit the block and use an account with a public @username.',
      'رفض Telegram رابط مستخدم أثناء تعديل رسالة المحرر؛ هذا ليس فشلاً في التعرّف على المستخدم الذي ضغط الزر.',
      'استعمل رابط t.me لاسم مستخدم عام، واترك أدوات تحرير البلوك متاحة لإصلاح الروابط القديمة.');
  if (/PARTICIPANT_ID_INVALID/i.test(value))
    return guide('BROADCAST_MEMBERSHIP_UNKNOWN','expected',
      'تعذر التحقق من عضوية هذا المستخدم في القناة الرسمية؛ لم تُرسل له الرسالة وتابعت الإذاعة بقية المستخدمين.',
      'This user’s membership in the official channel could not be verified. The message was not sent to them, and the broadcast continued.',
      'رفض Telegram معرّف المشارك أثناء فحص العضوية؛ لم تثبت حالة اشتراك هذا المستخدم.',
      'لا ترسل لهذا المستخدم ما دامت العضوية غير مؤكدة؛ سجل الحالة وتابع بقية المستلمين.');
  if (/STICKERSET_INVALID|STICKERSET_NOT_FOUND|STICKER_SET_INVALID|sticker set not found/i.test(value))
    return guide('EMOJI_PACK_UNAVAILABLE','expected','رابط حزمة الإيموجي غير صالح أو انحذفت الحزمة.','The emoji pack link is invalid or the pack was removed.',
      'حزمة الملصقات غير موجودة أو لم يعد الوصول إليها متاحاً.','اطلب رابطاً صالحاً وتأكد من اسم مجموعة الملصقات.');
  if (/RICH_MESSAGE_EMOJI_INVALID|CUSTOM_EMOJI_INVALID|EMOJI_ID_INVALID/i.test(value))
    return guide('RICH_EMOJI_INVALID','expected','أحد الإيموجيات الخاصة غير صالح. أعد اختياره أو استعمل إيموجي عادي.','A custom emoji is invalid. Re-select it or use a standard emoji.',
      'رفض تليكرام معرّف إيموجي مخصص أو لا يملك المستهدف صلاحية استخدامه.','تحقق من ID الإيموجي وصلاحيات الوجهة، واستعمل بديله العادي عند الإمكان.');
  if (/LEGACY_PAGE_READ_ONLY/i.test(value))
    return guide('LEGACY_PAGE_READ_ONLY','expected',
      'هذه الصفحة تتجاوز حدود باقتك الحالية. تگدر تنشرها كما هي، وللتعديل تحتاج باقة تسمح بحجمها.',
      'This saved page exceeds your active plan. You can republish it unchanged; editing requires a plan that covers its contents.',
      'النسخة المحفوظة تتجاوز واحداً أو أكثر من حدود الباقة الحالية؛ مو بسبب تاريخ حفظها.',
      'امنع تعديل النسخة المتجاوزة حتى تتوفر باقة مؤهلة؛ احتفظ بالنسخة المخزونة للنشر دون تغيير.');
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
  if (broadcastScope) {
    const apiCode = Number(error?.code ?? error?.error_code ?? error?.response?.error_code);
    const isTelegramApiError = error?.name === 'BotApiError'
      || /\bBotApiError\s*\[\d{3}\]/i.test(message)
      || (Number.isSafeInteger(apiCode) && apiCode >= 400 && apiCode <= 599);
    return isTelegramApiError
      ? guide('BROADCAST_TELEGRAM_ERROR','internal',
        'عاد خطأ Telegram غير متوقع في مسار الإذاعة؛ راجع رمز Telegram والتفاصيل التقنية.',
        'An unexpected Telegram error occurred in the broadcast flow. Review the Telegram code and technical details.',
        'رد Telegram بخطأ لا يطابق بعدُ حالة معروفة في الإذاعة.',
        'راجع العملية المحددة في المصدر وسجّل رمز Telegram الجديد واختبر التعامل معه قبل تغيير سياسة إعادة المحاولة.')
      : guide('BROADCAST_INTERNAL_ERROR','internal',
        'حدث خطأ تقني غير متوقع في مسار الإذاعة؛ لم يُخفَ الخطأ عن سجل المراجعة.',
        'An unexpected technical error occurred in the broadcast flow and was retained for review.',
        'فشل داخلي في مسار الإذاعة لا يطابق حالياً حالة تقنية معروفة.',
        'راجع المصدر والموضع البرمجي والتفاصيل المسجلة، ثم أضف تصنيفاً واختباراً للحالة الجديدة.');
  }
  return guide('UNCLASSIFIED_ERROR','internal','تعذر إكمال العملية. إذا تكرر الخطأ تواصل مع الدعم.','The operation could not be completed. Contact support if it continues.',
    'خطأ غير مصنف حتى الآن؛ التفاصيل التقنية محفوظة في السجل للمراجعة.',
    'راجع رسالة الاستثناء الأصلية والسياق وأضف معالجة واختبار انحدار للحالة الجديدة.');
}
export function userOperationalError(error, languageCode = 'ar', context = {}) {
  const result = explainOperationalError(error, context);
  return String(languageCode || '').toLowerCase().startsWith('ar')
    ? result.userMessageAr : result.userMessageEn;
}
