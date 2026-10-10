# Historical reference — superseded

This file is archived as historical evidence, not an implementation or deployment instruction. Use the active documentation index in `docs/README.md` and root `sups.md`.

# تقرير تنفيذ Managed Bots

التاريخ: ٨ أكتوبر ٢٠٢٦. الفرع: `serverless-cleanup`. نقطة البداية: `20f5d9b`.

## النتيجة

نُفذ مسار تسجيل بوت بترخيص موثوق، تشفير التوكن، التأكيد والتفعيل والإيقاف وتغيير التوكن وإلغاء الربط، إعداد ترحيب، قراءة صفحة من Serverless وإرسالها بهوية البوت، واجهة عربية وإدارة أوامر ومراقبة مهام. المحرك متعدد المستأجرين مشترك؛ `rich_pages` لم تنقل ولم يتغير `tgcloud/schema.js` أو `AGENTS.md`.

**النجاح المثبت محلياً:** اختبارات SQLite فعلية وHTTP Telegram محاكى تغطي التسجيل المرخص والتزامن والتفعيل وربط الصفحة والإرسال وعزل المالك. ليست تجربة BotFather أو دفع أو إرسال إلى حسابات حقيقية.

## الاختبارات المنفذة ونتائجها

| الفحص | النتيجة |
| --- | --- |
| اختبارات Serverless بعد تصحيح مسارات النقل | ٣٦/٣٦ |
| `npm test` النهائي، Node 24، منها ٢٢ اختبار Managed Bots | ٥٨/٥٨، صفر فشل أو تخطي |
| تجميع كل Pages Functions باستخدام Wrangler 4.148.0 | نجح |
| `node --check` والتحقق من الاستيرادات النسبية/الداخلية | ١٢٠ وحدة بلا خطأ |
| فحص صياغة managed-bots.js للواجهة | نجح |
| `git diff --check` | نجح |
| فحص CLI 0.2.0 بـ`tgcloud --help` | نجح، يدعم `tgcloud/`؛ لم يشغل push/migrate/run |
| مراجعة الواجهة داخل Chromium | تعذرت: المتصفح غير مثبت وفشل تنزيله؛ لا ادعاء بمعاينة بصرية أو اختبار جوال حي |
| إرسال/دفع/مهاجرات في الإنتاج | لم تُنفذ |

الاختبارات الجديدة تشمل تشفير GCM وتعديله ومفتاحه الخاطئ، التوكن غير الصحيح والبوتات المحجوزة، ترخيص واحد تحت التزامن، تسجيل بوت مكرر، رفض هوية عميل مزورة، منع جميع إجراءات المالك الآخر، takeover، عدم حذف اتصال خارجي، تغيير التوكن، سر Webhook، تكرار update، فصل بوتين، `/start` و`/admin`، انتهاء الترخيص، 429 وانقطاع الاتصال وفشل حفظ إيصال ناجح، استعادة العالق، الصفحة الغنية والـcallbacks وصلاحيات القنوات، نقل بايتات ملف إلى مرفق جديد، إلغاء الربط، توقيع الاستحقاقات وإعادة الأحداث وترحيل السجلات القديمة.

## إصلاحات الأمان والاعتمادية

- أزيل تسجيل الإدارة الذي كان يسمح بتجاوز الترخيص. واجهة المتصفح لا تستقبل مفاتيح الإدارة.
- ربط الترخيص والتكرار تحميه قيود قاعدة البيانات وفحص صلاحية الترخيص داخل INSERT.
- كل إجراءات المالك مقيدة بـid وowner؛ مصدر المالك initData الموثق.
- إصلاح تقسيم الأمر `/\s+/` والتعامل مع توجيه الأمر لبوت آخر.
- قفل إجراءات البوت ومعالجة وظائفه، lease وإعادة فحص ملكية القفل قبل الإرسال، وفحص الترخيص عند التنفيذ.
- `uncertain` تمنع تكرار إرسال ذي نتيجة غير معروفة؛ لا ادعاء exactly-once.
- إيقاف المعالجة قبل حذف Webhook، والتحقق من ملكية URL قبل الحذف، وعدم تغيير اتصال خارجي عند التسجيل.
- timeout ورسائل خطأ منقحة بلا توكن، وتشفير التوكن وأجسام التحديثات، وقيود طلبات المالك والبوت.
- إصلاح استيرادات Cloudflare واختبارات المحرر التي ظلت تشير إلى `lib/` السابق، مع الحفاظ على الهيكل الجديد.

## إعدادات ومهاجرات وأوامر النشر

راجع [دليل التشغيل](../managed-bots.md) لقائمة Secrets والـflags كاملة والأوامر بالترتيب. جميع خطوات النشر التالية تنتظر موافقة منفصلة:

1. D1 binding باسم `DB` وSecrets التشفير والإدارة ومصدر التراخيص، أصل HTTPS والأرقام الداخلية المحجوزة؛ إعدادات الجسر الحالية تبقى.
2. `cloudflare/d1/managed_bots.sql` ثم `cloudflare/d1/migrations/0001-managed-bots-runtime.sql` مرة واحدة بعد النسخة الاحتياطية ومراجعة البيانات. لا تغييرات على schema الخاص بـServerless.
3. نشر وحدات `tgcloud/` إلى المحرر الحالي ونشر Pages بعد الموافقة، دون إنشاء deployments إضافية.
4. مجدول موثوق يستدعي مسار الاستعادة كل دقيقة، ومراقبة حالات uncertain/failed وتجربة فعلية ببوت اختبار.

**حالة الرفع الفعلية:** رفضت المراجعة الآلية `git push` لأن الفرع مرتبط بالإنتاج ولم تعتبر بادئة تخطي البناء ضماناً كافياً. لم يُرفع commit ولم تُحاول طريقة بديلة لتجاوز الرفض. يلزم تعطيل النشر التلقائي وتأكيد الإذن بالرفع. العمل مكتمل محلياً ومعه ملف patch قابل للتطبيق.

رفع Git منفصل عن النشر: فرع الإنتاج نفسه مرتبط بـCloudflare Pages؛ رسالة commit تبدأ `[CF-Pages-Skip]` وفق وثائق Cloudflare لمنع نشر هذا الرفع. لا تُشغّل إعادة البناء يدوياً من دون الموافقة.

## ما يمنع إعلان جاهزية الإنتاج

- مصدر دفع Stars والتحقق المالي والمصالحة والاسترداد لم يكتمل؛ مهايئ الأحداث ليس معالج دفع. يبقى التسجيل العام ومصدر التراخيص مغلقين افتراضياً، ولم تمنح تراخيص وهمية خارج الاختبارات المحلية.
- Secrets وmigration والمجدول والنشر واختبار التكامل الحقيقي تنتظر الإعداد والموافقة.
- callbacks المخصصة تعطي إقراراً فقط؛ لا لغة تنفيذ مخصصة. بعض أنواع الأزرار غير المحمولة معطلة، والرسالة ذات revision قديم تطلب فتح النسخة الجديدة.
- الوسائط ضمن حدود ٢٠ MiB للملف و٤٠ MiB إجمالاً و٢٠ ملفاً. المصادر التي لا يستطيع بوت المحرر/الترحيل تنزيلها تحتاج إعادة رفع. فقد إيصال الرسالة بعد إرسالها يحتاج مراجعة يدوية.
- لم تتم مراجعة بصرية داخل متصفح بسبب عائق تنزيل Chromium. لا اختبار أداء بحمل إنتاجي.

## الملفات المتغيرة

- `app/miniapp_static/editor.html`
- `app/miniapp_static/index.html`
- `app/miniapp_static/managed-bots.css`
- `app/miniapp_static/managed-bots.html`
- `app/miniapp_static/managed-bots.js`
- `cloudflare/d1/migrations/0001-managed-bots-runtime.sql`
- `docs/managed-bots-report.md`
- `docs/managed-bots.md`
- `functions/_lib/b2b-bridge.js`
- `functions/_lib/managed-bot-jobs.js`
- `functions/_lib/managed-bot-licenses.js`
- `functions/_lib/managed-bot-media.js`
- `functions/_lib/managed-bot-pages.js`
- `functions/_lib/managed-bot-runtime.js`
- `functions/_lib/managed-bot-service.js`
- `functions/_lib/managed-bots.js`
- `functions/_lib/pages.js`
- `functions/internal/managed-bots.js`
- `functions/internal/managed-licenses.js`
- `functions/managed-bots/[botKey].js`
- `functions/miniapp/api/bridge/webhook.js`
- `functions/miniapp/api/custom-emoji/pack.js`
- `functions/miniapp/api/custom-emoji/packs.js`
- `functions/miniapp/api/managed-bots.js`
- `functions/miniapp/api/me.js`
- `functions/miniapp/api/performance.js`
- `package.json`
- `sups.md`
- `tests/serverless/developer-limits.test.mjs`
- `tests/serverless/harness.mjs`
- `tests/serverless/managed-bots.test.mjs`
- `tests/serverless/marketing-copy.test.mjs`
- `tests/serverless/premium-emoji.test.mjs`
- `tests/serverless/subscription-policy.test.mjs`
- `tgcloud/handlers/message.js`
- `tgcloud/lib/managed-pages.js`
- `tgcloud/lib/miniapp-bridge.js`
- `tgcloud/lib/welcome.js`
