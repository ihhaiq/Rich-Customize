# إعداد Cloudflare عبر كروم فقط — Rich Customize

هذه الخطوات لإعداد Worker التذكيرات عبر المتصفح، من دون استعمال الطرفية. Bot المحرر يبقى داخل Telegram Serverless.

## D1
1. افتح https://dash.cloudflare.com ثم **Storage & databases → D1 SQL database**.
2. افتح **قاعدة D1 الحالية نفسها** المرتبطة بمشروع Rich Customize Pages، وسجّل الاسم والمعرف.
3. افتح **Console**. انسخ SQL الموجود في [0002-schedule-reminders.sql](https://github.com/ihhaiq/Rich-Customize/blob/serverless-cleanup/cloudflare/d1/migrations/0002-schedule-reminders.sql)، ثم **Execute**.
4. تحقق بالاستعلام: SELECT name FROM sqlite_master WHERE name='schedule_reminders';
5. لا تنشئ قاعدة بديلة، ولا تعِد تنفيذ المخطط الكامل على D1 القائمة.

## تعديل إعدادات Worker من المتصفح
1. افتح [wrangler.toml](https://github.com/ihhaiq/Rich-Customize/blob/serverless-cleanup/workers/schedule-reminders/wrangler.toml) على GitHub، فرع serverless-cleanup.
2. تأكد أن قاعدة D1 المضبوطة هي `rich-customize-miniapp` ومعرفها هو المعرف الذي نسخته من Cloudflare؛ القيم تم تعيينها من قبل صاحب المشروع بالفعل. لا تعِد كتابة الـ UUID إذا لم يتغير.
3. احفظ في الفرع ذاته. **لا تضع أي توكن داخل GitHub**.

## ربط Worker بـ GitHub من Cloudflare
1. Workers & Pages → Create application → Import a repository.
2. اختر ihhaiq/Rich-Customize، الفرع serverless-cleanup.
3. Root directory: workers/schedule-reminders
4. Worker name: rich-customize-schedule-reminders (يطابق الإعدادات).
5. استخدم أمر النشر الافتراضي في إعداد Builds؛ Cloudflare ينفذه تلقائياً دون Terminal منك. اضغط Save and Deploy.
6. إذا Worker موجود أصلاً، افتحه ثم Settings → Builds → Connect لنفس المستودع بدلاً من تكراره.

## الأسرار والجدولة
1. Worker → Settings → Variables and Secrets → Add → Secret.
2. الاسم B2B_BOT_TOKEN والقيمة **توكن @Richminiappsbot فقط**، لا توكن المحرر. احفظ ثم انشر.
3. من Bindings تأكد أن DB مرتبط بنفس D1 المذكورة أعلاه.
4. من Settings → Triggers → Cron Triggers تأكد من **وجود مشغّلين منفصلين** يعرفهما `wrangler.toml`: `* * * * *` لتنفيذ المنشورات والمهام المستحقة كل دقيقة، و`0 9 * * *` لبدء فحص الاشتراكات اليومي الساعة 09:00 UTC (12:00 بغداد). لا تضف تكرارات يدوياً إذا ظهرت تلقائياً من الملف.
5. افحص Observability / Logs بحثاً عن Schedule reminders. فتح عنوان Worker بالمتصفح يعرض 404 عمداً، ولا يثبت أن Cron يعمل.

## تشغيل Telegram
الكود أصبح في GitHub ولكن Telegram Serverless لم يُهاجَر أو يُنشر هنا.
راجع مخطط tgcloud/schema.js وطبقه قبل نشر كود bot المعدّل. اختبر RCB1 ثم /sup وتذكيرات اشتراك تجريبي قبل التشغيل للجميع.
تبدأ حملة الاشتراكات مرة يومياً فقط. إذا بقي مشتركون أو محاولات إرسال مؤجلة، يسجّل Serverless مهمة متابعة بالمعرّف والمُراجعة في نفس جدول `schedule_reminders`، ويتابعها Worker كل دقيقة **فقط عندما تحين المهمة**. كل دفعة تفحص بحد أقصى 10 اشتراكات مدفوعة و10 قسائم؛ لا يعني ذلك رسالة يومية من Worker لكل مستخدم. الأداء وسقف الإنجاز قبل نهاية اليوم يحتاجان اختبار ضغط مع الأعداد الكبيرة. لا تحتاج ترحيل D1 جديد لهذا التعديل.

المراجع:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/workers/configuration/secrets/
