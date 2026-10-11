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
2. بالقلم استبدل REPLACE_WITH_EXISTING_DB_NAME باسم D1 واستبدل REPLACE_WITH_EXISTING_D1_DATABASE_ID بمعرفها.
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
4. من Settings → Triggers → Cron Triggers تأكد من * * * * * (مرة كل دقيقة، UTC).
5. افحص Observability / Logs بحثاً عن Schedule reminders. فتح عنوان Worker بالمتصفح يعرض 404 عمداً، ولا يثبت أن Cron يعمل.

## تشغيل Telegram
الكود أصبح في GitHub ولكن Telegram Serverless لم يُهاجَر أو يُنشر هنا.
راجع مخطط tgcloud/schema.js وطبقه قبل نشر كود bot المعدّل. اختبر RCB1 ثم /sup وتذكيرات اشتراك تجريبي قبل التشغيل للجميع.
حد الفحص الحالي عشرة اشتراكات مدفوعة وعشر قسائم كل دقيقة؛ نجاح وصول الجميع في وقتهم يحتاج اختبار ضغط إذا كان العدد كبيراً.

المراجع:
- https://developers.cloudflare.com/workers/ci-cd/builds/
- https://developers.cloudflare.com/workers/ci-cd/builds/advanced-setups/
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/workers/configuration/secrets/
