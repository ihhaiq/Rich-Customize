# جدولة المنشورات — متاحة

آخر مراجعة: 2026-10-25. أكد المالك أن خيار الجدولة ظاهر ويستخدمه فعلياً.
يوثق هذا الملف الكود الحالي والقيود المتبقية؛ تأكيد الإتاحة لا يعني وجود
ضمان زمني بالثانية أو ضمان exactly-once.

## السلوك المتاح

- من إعدادات النشر في المحرر يحدد المستخدم الوجهات ثم يختار «جدولة المنشور»،
  ويرسل الموعد في الخاص بصيغة `MM-DD hh:mm AM/PM` حسب توقيت بغداد (GMT+3)،
  مثال `10-28 10:19 PM`. السنة تستنتج تلقائياً؛ إذا كان التاريخ قد مضى
  يعتمد النظام السنة التالية.
- يقبل النظام موعداً بعد 60 ثانية على الأقل. المجاني محدود بأربعة أيام،
  والاشتراك النشط Plus أو Golden يسمح بموعد حتى شهرين تقويميين.
- تظهر للمستفيدين من إزالة الحقوق، سواء بالشراء الدائم أو اشتراك نشط،
  أداة إظهار/إخفاء الحقوق في المحرر وإعدادات النشر. الاختيار تفضيل دائم
  للحساب؛ يبدأ المستفيد والحقوق مخفية، ويعرض الزر الإجراء التالي.
- عند إنشاء الجدولة تُحفظ حالة الحقوق الحالية ضمن لقطة الرسالة؛ تغيير
  التفضيل لاحقاً لا يغيّر مهمة مجدولة موجودة.
- عند طلب موعد يظهر زر «إلغاء» بدلاً من طلب إرسال أمر؛ يبقى `/cancel`
  و`إلغاء` مدعومين للتوافق، ويقبل زر لوحة المفاتيح أيضاً `Cancel`.
- يحفظ Telegram Serverless نسخة ثابتة من الرسالة والأزرار وخيارات النشر؛
  تعديلات الصفحة بعد إنشاء المهمة لا تغيّر محتواها المجدول.
- يعرض `/scheduled` آخر عشر مهام، مع زر إلغاء للمهام التي ما زالت
  `registering` أو `pending`. لا يدعم تعديل موعد مهمة موجودة.
- الحد المجاني وجهتان لكل منشور. حدود Plus=5 وGolden=15 مطبقة في الكود
  حالياً كقيم مؤقتة بانتظار اعتماد المنتج النهائي؛ لا تعاملها كحدود بيع مؤكدة.
- الإرسال الفوري مستقل عن حصص الجدولة. إعفاء المطور من الحصص لا يتجاوز
  صلاحيات الوجهة أو حدود Telegram.

## التنفيذ والمعمارية

- `tgcloud/lib/schedule-policy.js` يتحقق من الوجهات والموعد والاستحقاق
  الموثوق من Serverless؛ لا تُقبل خطة يرسلها العميل.
- `tgcloud/lib/scheduled-publish.js` ينشئ المهام ويحفظ المحتوى والوجهات
  في Telegram Serverless، ويتحقق من الصلاحيات عند الإنشاء والتنفيذ، ويعالج
  الإلغاء والنتائج لكل وجهة.
- Cloudflare D1 يحفظ بيانات التذكير التشغيلية فقط: معرّف المهمة وإصدارها
  وموعدها وحالتها ومحاولاتها؛ لا يحفظ محتوى المنشور أو الوجهات.
- `workers/schedule-reminders/worker.js` يستخدم Cloudflare Cron كل دقيقة،
  ويرسل تذكير التنفيذ عبر RCB1 إلى Serverless. عامل النشر نفسه يبقى في
  Telegram Serverless، لا في Cloudflare.
- تعتمد المهام على تأكيد `REGISTERED` قبل اعتبار التسجيل `pending`. وعند
  `DUE` يتحقق Serverless من المالك والإصدار والموعد والصلاحيات، ويستخدم
  CAS/lease لمنع تنفيذ المهمة بالتوازي.
- يقرأ Serverless تفضيل الحقوق من `branding_preferences`، وهو جدول إعدادات
  منفصل عن سجلات الدفع. يحتاج الجدول إلى migration قبل نشر هذا السلوك؛
  تعديل schema في المستودع وحده لا يثبت أن الإنتاج يملكه.

## الاعتمادية والقيود المتبقية

- دقة Cron بالدقائق وقد يتأخر التنفيذ بسبب ازدحام عامل التذكير أو أعطال
  Telegram/الترحيل؛ لا يوجد SLA بموعد دقيق بالثانية.
- يرسل Worker حتى 10 تذكيرات في دورة الدقيقة لتقليل الضغط على RCB1. يلزم
  قياس الحمل إذا زاد عدد المهام المتزامنة.
- إذا لم يصل `REGISTERED` تبقى المهمة `registering`؛ استعادة التسجيلات
  العالقة التي لم تتلق ACK تحتاج تحسيناً قبل اعتبار كل حالات الفشل مستعادة تلقائياً.
- إلغاء إدخال الموعد متاح بزر لوحة المفاتيح؛ إلغاء المنشور المجدول نفسه
  متاح قبل بدء التنفيذ فقط، وتعديل وقت مهمة قائمة غير منفذ.
- إذا انقطع الاتصال بعد احتمال إرسال الرسالة وقبل حفظ النتيجة، تصنف الوجهة
  `uncertain` ولا يعاد إرسالها تلقائياً تفادياً للتكرار. هذا ليس ضمان
  exactly-once؛ قد يحتاج المستخدم إلى تسوية النتيجة الملتبسة.
- توجد اختبارات وحدة وتكامل للمسارات والـrelay، لكن يلزم استكمال اختبار
  ضغط للمهام المتزامنة، والإلغاء أثناء بدء التنفيذ، وتعطل Worker واستعادته،
  وانقطاع النقل في الحالات الملتبسة. استخدام المالك يؤكد عمل المسار المعتاد،
  ولا يثبت اجتياز اختبارات الضغط أو كل حالات الأعطال.

## اشتراكات وتذكيرات أخرى

يستخدم Worker نفسه أيضاً تذكيراً يومياً لمسح إشعارات انتهاء الاشتراك،
وهذا مسار منفصل عن جدولة منشورات المستخدمين. تفاصيل الإرسال المحدود،
المتابعة، ومعالجة الحالات الملتبسة موثقة في [subscription-rollout.md](./subscription-rollout.md).

## Golden gift recovery and repeat reminders — 2026-10-12

`gfb_` reminders recover exhausted rows and keep retrying until Serverless
returns a terminal result, with backoff up to 15 minutes. Each revision
processes a bounded recipient batch. A deployed Cron, D1 and authenticated
RCB1 relay are required; this does not keep a Serverless process alive.

Gift activation has **no deadline**, including previously issued unclaimed
gifts. The old 12-hour policy is superseded. The subscription lasts 30 days
from first activation. Expiry timestamps still enforce the active period.

Pressing the gift button while a broadcast is pending repairs/resumes it.
After completion, it starts a new numbered reminder round, skips activated
recipients, and does not reset claims. Each round has its own delivery ledger
and completion report. Campaign audience remains the users known at issuance.

New callback buttons carry a campaign identity. Multiple monthly campaigns
issued while the user's gift was unclaimed resolve to the earliest pending
gift; activation consumes those pending offers as one month. Old callbacks
cannot claim a later independent campaign, including after the gift expires.
A genuinely new campaign issued after activation remains a separate offer
under the existing monthly campaign policy, usable after current gift expiry.

Completion notices retry definite retryable rejections. Ambiguous sends
remain uncertain to avoid duplicates. This is not an exactly-once delivery
guarantee or proof that users read the notification.

### Gift-reminder rollout checks

1. Preserve existing delivery rows when applying the Serverless schema
   migration for `golden_broadcasts.round` and `golden_announcements.round`.
2. Deploy Serverless code with the callback handler, claim resolution,
   recipient ledger and developer panel before using the repeat button.
3. The separate Cloudflare reminder Worker must also include the persistent
   retry behavior; Pages deployment alone does not deploy that Worker.
4. Live-check a real test campaign, old/new notification callbacks for one
   recipient, and unchanged `/sup` expiry. Local tests do not prove this
   production acceptance.
