## 2026-10-30 — استكمال ترجمة بلوكة الزر الكبير

- **السبب:** طلب المالك نشر بلوكة الزر الكبير والتأكد من تزامن مفاتيح اللغات؛ المراجعة وجدت أن الروسية مستثناة من fallback وتفتقد مفتاحَي اسم ووصف البلوكة.
- **التغيير:** إضافة الترجمات الروسية لـ`button.large` و`button.large_desc`، وإضافة اختبار يتحقق من حل مفاتيح البلوكة وإجراءاتها في اللغات العشرين المدعومة. تحديث إصدار `miniapp_i18n.js` لمنع استخدام نسخة مخزنة قديمة.
- **الملفات:** `app/miniapp_static/miniapp_i18n.js`, `app/miniapp_static/editor.html`, `tests/serverless/large-button-block.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** نجحت الاختبارات المركزة مع تغطية مفاتيح البلوكة في جميع اللغات المدعومة (`large-button-block` و`publish-validation`: 14/14)، ونجح `node --check` و`git diff --check`.
- **GitHub/النشر:** نُشرت أصول Mini App الثابتة على Telegram Serverless (13 ملفاً، 345.5 KB؛ الحالة تؤكد 67 أصلاً متزامناً والـwebhook متزامن)، ثم دُفع commit `2bb73d4` إلى `serverless-cleanup`. أعاد Cloudflare HTTP 200 للأصل وظهرت الترجمات العربية والروسية؛ فحص مخطط `--local --dry-run` أكد عدم الحاجة إلى ترحيل.

## 2026-10-30 — استعادة فحوص الإصدار قبل النشر

- **السبب:** أثناء التحقق من طلب نشر كل التغييرات، تبيّن أن تعديل manifest حذف أوامر CI، وأن اختبار الحركة يفشل بسبب تهريب regex غير صحيح.
- **التغيير:** استعادة نوع وحدات ESM وأوامر الاختبار والتحقق في `package.json`، وتصحيح نمط reduced-motion في الاختبار ليطابق CSS الحالي.
- **الملفات:** `package.json`, `tests/serverless/miniapp-motion.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** نجح `npm run test:ci`: فحص كتالوج الخطط وفحص الأصول الثابتة (57 أصلاً) والاختبارات كاملة (327/327).
- **GitHub/النشر:** ضُمّ التصحيح إلى commit `2bb73d4` المنشور على `serverless-cleanup`؛ لم يُنفذ ترحيل قاعدة بيانات.

## 2026-10-30 — إصلاح مسارات نشر Mini App ورفع الوسائط

- **السبب:** أظهر فحص ما قبل النشر أن النشر من checkout نظيف لا يبني مجلد الأصول الذي يتطلبه Serverless، وأن طلبات رفع الوسائط عبر XHR لا تتبع fallback إلى Cloudflare على أصل Telegram.
- **التغيير:** ربط `npm run deploy` ببناء الأصول ثم `tgcloud push`؛ توجيه XHR من أصل Telegram إلى Cloudflare مع الحفاظ على ترويسة `initData`، وتحديث cache-busting للأصول المعدلة. تصحيح اختبار الحركة الذي كان يبحث عن تهريب regex حرفي بدل المسافات.
- **الملفات:** `package.json`, `app/miniapp_static/editor.html`, `app/miniapp_static/media_upload.js`, `app/miniapp_static/miniapp_serverless_api.js`, `tests/serverless/miniapp-motion.test.mjs`, `md_files/docs/cloudflare-pages-miniapp.md`, `md_files/docs/miniapp-serverless-migration.md`, `md_files/log.md`.
- **التحقق الفعلي:** نجح `npm run test:ci` (328/328)، وبناء أصول Serverless، وفحص `git diff --check`. فحص مخطط الإنتاج التجريبي أكد أن قاعدة البيانات متزامنة؛ لم يُنفذ ترحيل.
- **GitHub/النشر:** دفع `tgcloud` الأصول الثابتة (13 ملفاً، 345.5 KB؛ 67 ملفاً متزامناً). لم يتغير كود runtime في ذلك الدفع. دُفع commit `2bb73d4` إلى `serverless-cleanup`، وتأكد HTTP 200 للأصول ونجاح CORS preflight للرفع من أصل Telegram. لم يُختبر الإرسال أو رفع ملف داخل Telegram WebView الحي.

## 2026-10-28 — إضافة بلوكة زر كبير لمحرر Mini App

- **السبب:** طلب المالك بلوكة زر كبيرة مستقلة في المحرر، مختلفة عن الأزرار الصغيرة المضمّنة داخل النص.
- **التغيير:** إضافة نوع بلوك `buttons` إلى قائمة Mini App؛ تتيح البلوكة إضافة زر واحد كبير أو تعديله أو حذفه، وتعيد استخدام حوار أنواع الأزرار الحالي. تُحفظ الأزرار الكبيرة كبلوك Rich Message مستقل ومحاذى للوسط، ويُحوَّل رابط الصفحة إلى Callback صالح عند النشر. أُبقيت الأزرار الأصلية متعددة العناصر قابلة للعرض دون فرض تعديل مدعوم عليها. أُضيف تحقق قبل النشر والخادم، واحتساب نص الزر في حدود النص وقصّه عند تطبيق الحصة، مع تسميات عربية وإنجليزية وتغطية fallback لباقي اللغات. تحديث إصدارات الأصول في `editor.html`.
- **الملفات:** `app/miniapp_static/app.js`, `app/miniapp_static/editor_features.js`, `app/miniapp_static/media_upload.js`, `app/miniapp_static/media_upload.css`, `app/miniapp_static/miniapp_i18n.js`, `app/miniapp_static/miniapp_i18n_coverage.js`, `app/miniapp_static/publish_validation.js`, `app/miniapp_static/editor.html`, `tgcloud/lib/editor-renderer.js`, `tgcloud/lib/editor-blocks.js`, `tests/serverless/large-button-block.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** نجحت الاختبارات المركزة (`large-button-block` و`publish-validation`: 13/13)، وفحوص `node --check` للملفات المعدلة و`git diff --check`. مجموعة Serverless الكاملة: 325/326؛ الفشل الوحيد اختبار `miniapp-motion.test.mjs` الذي لا يطابق تعبيره النمطي تنسيق `@media` في `interactions.css`؛ هذا الملف غير معدّل لهذه الميزة.
- **GitHub/النشر:** تغييرات محلية فقط؛ لا commit أو push أو نشر Telegram/Cloudflare أو ترحيل بيانات.

## 2026-10-28 — نقل إدارة الإيموجي المخصص إلى Serverless محلياً

- **السبب:** طلب المالك نقل تفاصيل الإيموجي المخصص من Cloudflare إلى Telegram Serverless كجزء من تشغيل التطبيق المصغّر على Serverless.
- **التغيير:** توجيه استيراد الحزم وقراءتها وترتيبها وتثبيتها وحذفها ومعايناتها إلى endpoint Serverless موثق بهوية Telegram. حفظ أسماء الحزم وترتيبها والحزمة المثبتة في `legacy_states` مع CAS وحصة موثوقة، وجلب صور المعاينة من Telegram وإرجاعها بحد 512 KiB. عند أول استخدام، يستورد العميل أسماء وترتيب/تثبيت الحزم القديمة من D1 إلى Serverless؛ لا تُحذف بيانات D1.
- **الملفات:** `AGENTS.md`, `tgcloud/lib/miniapp-custom-emoji.js`, `tgcloud/lib/miniapp-bridge.js`, `tgcloud/lib/request-guard.js`, `app/miniapp_static/miniapp_serverless_api.js`, `app/miniapp_static/apple_emoji_picker.js`, `app/miniapp_static/editor.html`, `app/miniapp_static/index.html`, `functions/_lib/custom-emoji-packs.js`, `functions/miniapp/api/custom-emoji/packs.js`, `tests/serverless/harness.mjs`, `tests/serverless/miniapp-custom-emoji.test.mjs`, `tests/serverless/miniapp-serverless-client.test.mjs`, `md_files/docs/miniapp-serverless-cloudflare-dependencies.md`, `md_files/docs/miniapp-serverless-migration.md`, `md_files/log.md`.
- **التحقق الفعلي:** نجحت الاختبارات المركزة 14/14، ونجحت بقية مجموعة Serverless 319/319 عند استثناء `miniapp-motion.test.mjs`. المجموعة كاملة سجلت 322/323؛ الاختبار الوحيد الفاشل اختبار حركة غير متعلق يرفض صياغة `prefers-reduced-motion` الموجودة في CSS، والـCSS لم يتغير بهذه المهمة. نجحت فحوص `node --check` لكل ملفات JavaScript المعدلة و`git diff --check`. الاختبارات غطت ملكية البيانات، الاستيراد لمرة واحدة، عدم استبدال السجل بعد الاستيراد، التثبيت/الترتيب/الحذف، metadata، معاينة الصورة، وتوجيه العميل.
- **GitHub/النشر:** تغييرات محلية فقط؛ لا commit أو push أو نشر Telegram/Cloudflare أو تغيير BotFather أو ترحيل/حذف بيانات D1. استيراد D1 الفعلي يحتاج CORS المقيّد منشوراً؛ لم يُختبر Mini App داخل Telegram WebView.

## 2026-10-28 — تثبيت نطاق نقل Mini App إلى Serverless

- **السبب:** أكد المالك أن الهدف هو تشغيل التطبيق المصغّر على Telegram Serverless، وأن الجدولة والتذكيرات والخدمات المرتبطة بها لا يلزم نقلها.
- **التغيير:** توضيح أن الجدولة والتذكيرات والبنية المرتبطة بها استثناء مقصود وتبقى على Cloudflare، وأن نطاق النقل هو واجهة Mini App وعمليات المحرر.
- **الملفات:** `md_files/docs/miniapp-serverless-migration.md`, `md_files/docs/miniapp-serverless-cloudflare-dependencies.md`, `md_files/log.md`.
- **التحقق الفعلي:** مراجعة نطاق النقل الحالي في الوثيقتين؛ لم تُجرَ اختبارات لأن التغيير توثيقي فقط.
- **GitHub/النشر:** تغييرات توثيق محلية فقط؛ لا commit أو push أو نشر Cloudflare/Telegram أو تغيير BotFather.

## 2026-10-28 — إصلاح إضافة البلوكات والوسائط في محرر Mini App

- **السبب:** كانت مزامنة مواضع عناصر «التفاصيل» تعيد فرز العنصر الجديد ذي الموضع الافتراضي صفر إلى بداية القائمة، كما أن اختيار ملفات الوسائط نفسها ثانية لا يطلق حدث تغيير قبل إعادة ضبط منتقي الملفات. وعند فشل رفع جزء من الدفعة، بقيت الوسائط التي نجح رفعها في الحالة دون تعليم الصفحة كمتغيرة أو إضافتها إلى سجل التراجع.
- **التغيير:** مزامنة مواضع التفاصيل وفق ترتيب القائمة الحالي بعد الإضافة والاستبدال والتحريك؛ إعادة ضبط منتقي الوسائط بعد أخذ نسخة من الملفات لتمكين الإضافة المتكررة؛ وحفظ الوسائط الناجحة من الدفعات الجزئية كتغييرات قابلة للحفظ والتراجع. تحديث إصدارات ملفات JavaScript في `editor.html` لكسر التخزين المؤقت.
- **الملفات:** `app/miniapp_static/details_nested_editor.js`, `app/miniapp_static/media_upload.js`, `app/miniapp_static/editor.html`, `tests/serverless/miniapp-composite-blocks.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** نجحت `node --experimental-vm-modules --test tests/serverless/*.test.mjs` (314/314)؛ نجحت `node --check` لملفات JavaScript المعدلة و`git diff --check`. لم يُشغّل بناء الأصول لأن مجلد `.tgcloud-miniapp-static` موجود مسبقاً، وسكربت البناء يحذفه تكرارياً قبل إنشائه.
- **GitHub/النشر:** تغييرات محلية فقط؛ لا commit أو push أو `tgcloud push` أو نشر Telegram/Cloudflare أو ترحيل بيانات.

## 2026-10-27 — توثيق نواقص Mini App المعتمدة على Cloudflare

- **السبب:** طلب المالك ملف Markdown يشرح الوظائف التي لم تنتقل بعد من Cloudflare إلى Telegram Serverless.
- **التغيير:** توثيق مسارات رفع/عرض الوسائط، إدارة ومعاينة الإيموجي المخصص، وقياس الأداء التي يوجهها العميل إلى Cloudflare، مع آثار تعطلها وخطوات القبول وحدود ما لم يُختبر. توضيح أن CORS المعدّل محلياً غير مثبت النشر، وأن الاشتراكات والتذكيرات والجدولة تبقى خارج نطاق نقل المحرر.
- **الملفات:** `md_files/docs/miniapp-serverless-cloudflare-dependencies.md`, `md_files/docs/miniapp-serverless-migration.md`, `docs/README.md`, `md_files/log.md`.
- **التحقق الفعلي:** مراجعة طبقة توجيه Serverless وواجهات Cloudflare الخاصة بالرفع والملفات والإيموجي والقياس؛ نجح `git diff --check`.
- **GitHub/النشر:** تغييرات توثيق محلية فقط؛ لا commit أو push، ولا نشر Cloudflare/Telegram أو تغيير BotFather أو تعديل بيانات.

## 2026-10-27 — بدء خطة نقل التطبيق المصغر إلى Telegram Serverless

- **السبب:** كان التطبيق يعرض «افتح التطبيق من تيليجرام» لكل من غياب `initData` وفشل طلب `/miniapp/api/session`، لذلك لا تثبت الرسالة أن المستخدم فتحه خارج Telegram. وبالتزامن، أضاف Telegram Serverless استضافة Mini App وواجهات endpoints بتاريخ ٦ أكتوبر ٢٠٢٦، بينما ظل المستودع موثقاً ومهيأً على مسار Cloudflare القديم.
- **التغيير:** توثيق مساري إعادة التوجيه المؤكدين دون ادعاء معرفة سبب جلسة الإنتاج، ووضع خطة مراحل لنقل الواجهة وواجهات API والمصادقة والبيانات المرحلية. أكد المالك إبقاء التذكيرات والاشتراكات والجدولة وكل ما يتطلب تذكيراً على Cloudflare؛ عُدلت حدود النقل لتجنب تعطيلها أو إيقاف Cloudflare بالكامل. تحديث ملاحظات Serverless وفهرس الوثائق و`soon.md`.
- **الملفات:** `md_files/docs/miniapp-serverless-migration.md`, `md_files/docs/serverless.md`, `docs/README.md`, `md_files/soon.md`, `md_files/log.md`.
- **التحقق الفعلي:** مراجعة `app/miniapp_static/index.html`, `functions/miniapp/api/session.js`, `functions/_lib/telegram-auth.js`, `tgcloud.jsonc`, وحصر مسارات `functions/`. مطابقة إمكانات الاستضافة و`Telegram.WebApp.Serverless.call` مع توثيق Telegram Serverless الحالي. شغّل `npx.cmd tgcloud status` وأظهر اتصال التطبيق `app8416656269` على revision 111 وWebhook متزامناً؛ أظهر `npx.cmd tgcloud diff` عدم وجود تغييرات قابلة للنشر، كما لا يحدد `tgcloud.jsonc` حالياً أي ملفات static. لا اختبارات مطلوبة لتغيير توثيقي فقط.
- **GitHub/النشر:** تغييرات توثيق محلية فقط؛ لا commit أو push، ولا `tgcloud push` أو `migrate` أو تغيير BotFather أو تعطيل Cloudflare. النشر ليس جاهزاً لأن واجهة Mini App لم تُنقل بعد إلى static hosting وServerless endpoints.

## 2026-10-27 — ربط عمليات المحرر الأولية باستضافة Serverless

- **السبب:** بعد موافقة المالك على إبقاء الاشتراكات والتذكيرات والجدولة وكل ما يتطلب تذكيراً على Cloudflare، بقيت نقطة الدخول وعمليات المحرر غير موصولة باستضافة Telegram Serverless.
- **التغيير:** إضافة عميل fetch يوجّه هوية المحرر وقراءة الصفحات والوجهات والإنشاء والحفظ والحذف والنشر ومنتقي المستخدم وبلاغات الأخطاء إلى endpoint الموثق بهوية `ctx.initData` عند تشغيل الواجهة على `tgcloud.ai`. تحفظ الواجهة معرّف الإنشاء محلياً لإعادة استخدامه عند غموض نتيجة الشبكة. تبقى المسارات غير المنقولة على Cloudflare عبر CORS يسمح لأصل الاستضافة المحدد فقط. ضبط static source وإضافة script يبني أصول الواجهة مع مسارات جذر متوافقة ويحذف ملف Cloudflare `_redirects` من البناء، وتمييز فشل الاتصال بالخدمة عن فتح التطبيق خارج Telegram. نقل صور الدليل التعليمي إلى أصول الاستضافة الجديدة. لا تغيير في جداول أو عامل الجدولة أو منطق الاشتراكات والتذكيرات.
- **الملفات:** `app/miniapp_static/miniapp_serverless_api.js`, `app/miniapp_static/index.html`, `app/miniapp_static/editor.html`, `app/miniapp_static/app.js`, `app/miniapp_static/open-in-telegram.html`, `app/miniapp_static/tutorial-assets/manifest.json`, `scripts/build-miniapp-serverless.mjs`, `tgcloud.jsonc`, `.gitignore`, `functions/_middleware.js`, `tgcloud/endpoints/miniapp.js`, `tgcloud/lib/miniapp-bridge.js`, `tgcloud/lib/request-guard.js`, `tgcloud/lib/editor-import.js`, `md_files/docs/miniapp-serverless-migration.md`, `md_files/docs/serverless.md`, `md_files/soon.md`, `md_files/log.md`, `tests/serverless/miniapp-serverless-client.test.mjs`, `tests/serverless/miniapp-serverless-endpoint.test.mjs`, `tests/serverless/harness.mjs`.
- **التحقق الفعلي:** نجح `node --check` للعميل والبناء و`functions/_middleware.js` و`app.js` و`editor-import.js`. نجح بناء `node scripts/build-miniapp-serverless.mjs` وفحص 67 ملفاً ثابتاً وأربع صفحات HTML دون مراجع محلية مفقودة، كما لم يُنسخ `_redirects` الخاص بـCloudflare. نجحت مجموعة Serverless الحالية 310/310، ونجحت اختبارات العميل وCORS والـendpoint الموثق بالهوية 5/5. نجح `git diff --check`. أظهر `npx.cmd tgcloud status` اتصال `app8416656269` على revision 111 وWebhook متزامناً، وأظهر كل ملفات static الجديدة وendpoint بوضوح على أنها غير منشورة. لا يزال اختبار الواجهة داخل Telegram وCORS الحي ورفع الوسائط غير منفذ.
- **GitHub/النشر:** تغييرات محلية فقط؛ لا commit أو push أو `tgcloud push` أو `migrate` أو تغيير BotFather. لم يُنشر إصدار تجريبي أو يُجرَ قبول حي.

## 2026-10-27 — تجهيز تجربة Mini App على Serverless

- **السبب:** طلب المالك تجربة التطبيق المصغر على Telegram Serverless، وأكد أن مشروع البوتات المُدارة ملغى ويجب حذف ذكره من وثائق النقل.
- **التغيير:** حذف الإشارات إلى البوتات المُدارة من وثائق Serverless والهجرة. نقل قراءة معلومات المستخدم الأساسية `/me` إلى endpoint Serverless باستخدام هوية Telegram والاستحقاق الموثوق، كي لا يتوقف فتح المحرر على جلسة Cloudflare. عمليات الوسائط والإيموجي المخصص ما زالت غير منقولة؛ تجربة المحرر محدودة حتى يتم ذلك.
- **الملفات:** `tgcloud/lib/miniapp-bridge.js`, `app/miniapp_static/miniapp_serverless_api.js`, `tests/serverless/miniapp-serverless-client.test.mjs`, `tests/serverless/miniapp-serverless-endpoint.test.mjs`, `md_files/docs/miniapp-serverless-migration.md`, `md_files/docs/serverless.md`, `md_files/log.md`.
- **التحقق الفعلي:** نجحت الاختبارات المركزة 6/6 و`git diff --check`. ظهر Telegram Cloud على revision 112 قبل نشر الواجهة، مع endpoint وملفات Serverless مطابقة؛ أظهر `tgcloud status` أن ملف العميل الثابت وحده ما زال مختلفاً. نُشر `.tgcloud-miniapp-static/` وحده، ثم أكد `tgcloud status` revision 113 و67 ملفاً ثابتاً محدثاً، وأعاد طلب الملف `miniapp_serverless_api.js` HTTP 200 وتضمن تحويل `/miniapp/api/me` إلى Serverless. لا يثبت ذلك تشغيل WebView أو قبول المستخدم.
- **GitHub/النشر:** نُشرت الملفات الثابتة فقط إلى Telegram Serverless revision 113؛ لم يتغير رابط BotFather أو Webhook أو المخطط، ولم يُنفذ `migrate` أو push لباقي الشيفرة أو commit/push إلى GitHub. يتطلب اختبار التطبيق داخل Telegram ربط زر/رابط Mini App بعنوان Serverless؛ لم يُنفذ تغيير BotFather.

## 2026-10-25 — إصلاح عرض معلومات مرسل الأمر في المجموعة والضيف

- **السبب:** صيغة `@RichCustomizebot /info` في وضع الضيف لم تكن تُصنّف كطلب معلومات؛ كانت تسقط لمسار البحث عن الصفحات ولا تعرض معلومات المرسل. كما كان مسار `/info` بلا هدف يقرأ سجل `usage_users` قبل عرض المرسل، ويشترط الاسم الأول/الأخير لبناء النتيجة.
- **التغيير:** توجيه `@RichCustomizebot /info` و`/id` إلى معلومات المرسل، واستخدام هوية `from` التي يرفقها Telegram مباشرة عند عدم وجود هدف بدلاً من اشتراط سجل استخدام سابق. إذا لم يتوفر اسم عرض، يُستخدم اسم المستخدم أو ID بدلاً من اعتبار الحساب مجهولاً. وعند الرد على رسالة لا تحمل هوية مستخدم، يعود الأمر إلى مرسل `/info`.
- **الحد المعروف:** هذا يصلح عرض معلومات الحساب الذي أرسل الأمر من أي username وصل ضمن تحديث Telegram؛ لا يربط تلقائياً alias NFT غير الوارد ضمن `from.username` إلى ID، ولا يغيّر البحث عن مستخدم آخر باسم غير مخزّن.
- **الملفات:** `tgcloud/lib/user-info.js`, `tgcloud/lib/user-info-copy.js`, `tests/serverless/user-info.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** نجحت اختبارات `user-info.test.mjs` (19/19)، وفحوص `node --check` للملفات المعدلة، و`git diff --check`.
- **GitHub/النشر:** لا commit أو push إلى GitHub. نُشر `tgcloud/lib/user-info.js` و`tgcloud/lib/user-info-copy.js` إلى Telegram Cloud revision 111؛ أكد `tgcloud fetch/status` تطابق شجرة العمل مع اللقطة وWebhook in sync. أبلغ CLI عن خطأ محلي في كتابة snapshot بعد نجاح رفع الملفين؛ جرى التحقق من النشر بجلب revision 111.

## 2026-10-25 — جعل معرّف المستخدم قابلاً للنسخ

- **السبب:** رقم المستخدم كان يظهر كنص عادي في رسالة معلومات الحساب، ما يصعّب نسخه على الهاتف.
- **التغيير:** إضافة زر نسخ يحمل رمز النسخ ورقم الحساب، ويضع الرقم وحده في `copy_text` حتى يُنسخ كما هو دون عنوان أو تنسيق إضافي. يظهر في كل مسارات رسالة معلومات المستخدم، ومنها Guest.
- **الملفات:** `tgcloud/lib/user-info-copy.js`, `tests/serverless/user-info.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** نجحت اختبارات `user-info.test.mjs` (17/17) و`git diff --check`.
- **GitHub/النشر:** محلي فقط؛ لا commit أو push أو Telegram deployment.

## 2026-10-25 — معالجة منع إرسال صور الحساب في وضع الضيف

- **السبب:** عند البحث عن مستخدم من Guest داخل مجموعة تمنع البوت من إرسال الصور، كان `answerGuestQuery` يفشل بـ`CHAT_SEND_PHOTOS_FORBIDDEN` فتُسجّل معالجة Guest استثناءً بدلاً من عرض معلومات الحساب.
- **التغيير:** إعادة استخدام مصنف صلاحيات الصور من مسار `/info`؛ عند رفض صورة ملف الحساب يعيد Guest إرسال نتيجة المعلومات نفسها بلا صورة وبلا بلوك التفاصيل الخاص بها. الأخطاء الأخرى، أو فشل المحاولة البديلة، ما زالت تُسجّل ولا تُخفى.
- **الملفات:** `tgcloud/lib/user-info.js`, `tgcloud/handlers/guest_message.js`, `tests/serverless/harness.mjs`, `tests/serverless/user-info.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** نجح `node --experimental-vm-modules --test tests/serverless/user-info.test.mjs` (17/17)، ونجحت فحوص `node --check` للمعالج والمكتبة والاختبار، و`git diff --check`.
- **GitHub/النشر:** محلي فقط؛ لا commit أو push أو Telegram deployment.

## 2026-10-25 — مواءمة توثيق الاشتراكات والوصول المبكر

- **السبب:** كانت وثائق الاشتراك تصف الوصول المبكر بأنه بلا ميزات مسماة فقط، ولا تشرح أن Golden يتيح التجربة مجاناً قبل الإطلاق العام؛ كما لم تفصل بين وجود حدود الباقات في السياسة وبين إنفاذها الكامل في جميع مسارات المحرر.
- **التغيير:** تحديث مواصفة الاشتراك وحالة التنفيذ و`soon.md`: توضيح أن أهلية Golden للوصول المبكر موجودة في سياسة الاستحقاق والعرض ورسالة `/sup`، لكن لا توجد ميزة تجريبية مسماة مربوطة بها بعد. تعريف أن تجربة Golden لا تكلف رسوماً إضافية أثناء الاشتراك النشط، وأن كل ميزة تتبع باقتها النهائية المعلنة عند الإطلاق العام. توثيق استمرار بعض حدود المحرر الأقدم، وإضافة أربعة مقترحات وصول مبكر مع وسمها بوضوح بأنها غير معتمدة/غير منفذة.
- **الملفات:** `md_files/sups.md`, `md_files/docs/subscription-rollout.md`, `md_files/soon.md`, `md_files/log.md`.
- **التحقق الفعلي:** مراجعة نصية مقابل `tgcloud/lib/subscription-policy.js`, `tgcloud/lib/editor-subscriptions.js`, `tgcloud/lib/subscription-rich.js`, `app/miniapp_static/subscription_offers.js` وتعليمات المشروع. لا اختبارات مطلوبة لتغيير التوثيق فقط.
- **GitHub/النشر:** تحديث محلي فقط؛ لا commit أو push أو نشر أو migration.

## 2026-10-25 — إصلاح انحدار نشر الجسر وتدقيق الاختبارات

- **السبب:** كشف تشغيل اختبارات Serverless الكامل أن جسر النشر يستدعي `shouldIncludeBranding` بعد تغيير الاستيرادات من دون استيراد الدالة؛ كان ذلك يسبب `ReferenceError` في النشر عبر الجسر، بما يشمل النشر المباشر وفحوص الحصة والتسجيل بعد نجاح Telegram.
- **التغيير:** إعادة استيراد دالة قرار الحقوق في `tgcloud/lib/publish.js`. أصلحت إعداد fixture لقائمة المشتركين ليحتوي جدول `usage_users` الذي يستعلمه التنفيذ، وعدّلت اختبار استجابة المشتركين ليتحقق من بيانات ترقيم الصفحات (`page` و`max_page`) بدلاً من افتراض أن هذا الجسر ينشئ `callback_data` بنفسه. كما حُفظت أولوية اسم الصفحة المملوك في البحث العام/inline مع بقاء أولوية الكود للرمز المستقل الصريح في Guest.
- **الملفات:** `tgcloud/lib/publish.js`, `tests/serverless/subscriber-list.test.mjs`, `tests/serverless/admin-stats.test.mjs`, `tgcloud/lib/page-delivery.js`, `tgcloud/handlers/guest_message.js`, `tgcloud/lib/user-info.js`, `tests/serverless/page-name-delivery.test.mjs`, `tests/serverless/user-info.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** بعد إصلاح الاستيراد نجحت اختبارات الجسر/الإدارة المركزة (21/21)، ثم نجحت مجموعة Serverless كاملة (302/302). نجح `node --check` على `publish.js` و`page-delivery.js` و`git diff --check`.
- **GitHub/النشر:** التعديلات محلية فقط؛ لا commit أو push ولا Telegram deployment أو migration. لا تدّعي نتائج الاختبار نجاح النشر الإنتاجي.

## 2026-10-25 — فصل استدعاء صفحة الضيف عن البحث عن مستخدم

- **السبب:** وضع Guest كان يعامل كلمات الاسم متعددة الكلمات كأكواد منفصلة، ويعامل منشن البوت متبوعاً بأي قيمة كطلب معلومات مستخدم؛ نتج عن ذلك تصادم أسماء الصفحات/أكوادها مع أسماء المستخدمين والمعرفات الرقمية.
- **التغيير:** قُصر مطابقة كود الصفحة على مرجع كامل من رمز واحد، مع أولوية الكود المطابق تماماً على الاسم عند التصادم. أضيف `@RichCustomizebot /page <name>` لفرض البحث بالاسم حتى لو شابه الاسم كوداً أو يوزراً. يظل منشن البوت مع `@username` بحث مستخدم، وتُطلب هوية المستخدم الرقمية بصيغة `/info <id>`، فلا تُفسر الأرقام المجردة كـIDs. حدّث توثيق صيغ الإدخال.
- **الملفات:** `tgcloud/lib/page-delivery.js`, `tgcloud/lib/user-info.js`, `tgcloud/handlers/guest_message.js`, `tests/serverless/page-name-delivery.test.mjs`, `tests/serverless/user-info.test.mjs`, `md_files/docs/serverless.md`, `md_files/log.md`.
- **التحقق الفعلي:** اختبارات `page-name-delivery.test.mjs` و`user-info.test.mjs` نجحت 20/20؛ فحوص `node --check` و`git diff --check` نجحت. بعد النشر، أكد `tgcloud fetch/status` revision 109 وظهور Working directory clean، وأكد `tgcloud webhook` أن `guest_message` مسموح ولا توجد تحديثات معلقة.
- **GitHub/النشر:** نُشرت الوحدات المحددة فقط `page-delivery.js`, `user-info.js`, `guest_message.js` إلى Telegram Cloud revision 109؛ Webhook متزامن. لا commit أو push إلى GitHub ولا migration.

## 2026-10-25 — حفظ تفضيل إظهار الحقوق للحساب

- **السبب:** طلب المالك أن يبدأ المستحقون والحقوق مخفية، وأن يبدّل الزر بين «إظهار الحقوق» و«إخفاء الحقوق» مع بقاء الاختيار محفوظاً للحساب، مع استمرار رابط الشراء لغير المستحقين.
- **التغيير:** إضافة `branding_preferences` كجدول إعدادات منفصل عن سجل الدفع، وإعادة استخدام الاستحقاق الموثوق أو شراء إزالة الحقوق للتحقق من صلاحية التبديل. صار الوضع الافتراضي للمستحقين مخفياً، والأزرار تحمل الهدف صراحةً لمنع قلب الحالة عند إعادة الطلب. رُبط التفضيل بالمعاينات والنشر والجدولة القائمة عبر `shouldIncludeBranding`، وتلتقط الجدولة حالة الحقوق الحالية في نسختها. عُدّلت رسائل الدفع لتوضح أن الإخفاء افتراضي ويمكن عكسه.
- **الملفات:** `tgcloud/schema.js`, `tgcloud/lib/branding.js`, `tgcloud/lib/editor-block-ui.js`, `tgcloud/lib/editor-block-flow.js`, `tgcloud/lib/editor-premium-emoji.js`, `tgcloud/lib/publish.js`, `tests/serverless/harness.mjs`, `tests/serverless/branding-cart-link.test.mjs`, `tests/serverless/branding-preferences.test.mjs`, `AGENTS.md`, `md_files/docs/scheduling.md`, `md_files/docs/subscription-rollout.md`, `md_files/log.md`.
- **التحقق الفعلي:** `node --experimental-vm-modules --test tests/serverless/branding-preferences.test.mjs tests/serverless/branding-cart-link.test.mjs tests/serverless/golden-announcements.test.mjs tests/serverless/schedule-policy.test.mjs tests/serverless/scheduling-reminders.test.mjs` نجح 37/37؛ `node --check` لوحدات JavaScript الستة المعدلة وملفي الاختبار نجح؛ `git diff --check` نجح (مع تحذير line endings مسبق على `package.json` المتغير محلياً).
- **GitHub/النشر:** محلي فقط؛ لا commit أو push أو Telegram deployment أو migration. يتطلب الجدول الجديد مراجعة وترحيلاً إنتاجياً منفصلاً قبل استخدام هذا الكود إنتاجياً.

## 2026-10-25 — إضافة توجيه هندسي نقدي ومتمحور حول التوسع

- **السبب:** طلب المالك أن تكون مراجعات المشروع مباشرة ونقدية، وأن تستهدف استقراراً قابلاً للقياس قبل استقبال ٢٥٠ ألف إلى مليون مستخدم.
- **التغيير:** أضيف إلى `AGENTS.md` توجيه دائم بعدم المجاملة أو الادعاء بجاهزية بلا دليل، وفحص المخاطر ذات الصلة بكل مهمة، والتمييز بين العيوب المثبتة والمخاطر غير المتحققة. عُرّف رقم المستخدمين كطموح وليس وعد سعة أو تزامن، وربط ادعاء الجاهزية بنموذج حمل واختبارات ضغط/استدامة وحدود المنصات وSLOs وخطة استعادة ومراقبة وتكلفة.
- **الملفات:** `AGENTS.md`, `md_files/log.md`.
- **التحقق الفعلي:** مراجعة صياغة التعليمات مع مرجع تعليمات Copilot؛ `git diff --check`.
- **GitHub/النشر:** تعديل محلي فقط؛ لا commit أو push أو نشر.

## 2026-10-25 — تحديث زر الحقوق وتجربة جدولة المنشورات

- **السبب:** طلب المالك إخفاء زر شراء إزالة الحقوق عن أصحاب الاستحقاق، وإتاحة إظهار الحقوق أو إخفائها لكل منشور، وتحسين إدخال موعد الجدولة وحدودها.
- **التغيير:** حلّ زر «إظهار / إخفاء الحقوق» محل رابط الشراء للمشتركيْن Plus/Golden النشطين وأصحاب الشراء الدائم، مع حفظ الاختيار في النشر الفوري ولقطة المنشور المجدول. أصبح الإدخال `MM-DD hh:mm AM/PM` بتوقيت بغداد `GMT+3` مع استنتاج السنة وزر إلغاء؛ المجاني أربعة أيام، والاشتراك النشط شهران تقويميان. لا تتجاوز الاستحقاقات فحوص الخادم.
- **الملفات:** `tgcloud/lib/branding.js`, `tgcloud/lib/editor-block-flow.js`, `tgcloud/lib/editor-block-ui.js`, `tgcloud/lib/editor-guard.js`, `tgcloud/lib/editor-premium-emoji.js`, `tgcloud/lib/publish.js`, `tgcloud/lib/request-guard.js`, `tgcloud/lib/schedule-policy.js`, `tgcloud/lib/scheduled-publish.js`, `tests/serverless/branding-cart-link.test.mjs`, `tests/serverless/schedule-policy.test.mjs`, `AGENTS.md`, `md_files/docs/scheduling.md`, `md_files/soon.md`, `md_files/sups.md`, `md_files/log.md`.
- **التحقق الفعلي:** نجح `node --experimental-vm-modules --test tests/serverless/schedule-policy.test.mjs tests/serverless/branding-cart-link.test.mjs tests/serverless/premium-emoji.test.mjs tests/serverless/scheduling-reminders.test.mjs tests/serverless/subscription-schedule.test.mjs tests/serverless/golden-scheduler.test.mjs tests/serverless/static-error-guards.test.mjs` (41/41)، و`node --check` للوحدات التسع، و`git diff --check`.
- **GitHub/النشر:** رُفعت الوحدات التسع المحددة فقط إلى Telegram Cloud، revision 107؛ أكد `tgcloud fetch` و`tgcloud status` أن اللقطة محدثة وWebhook متزامن. أبلغ `tgcloud push` عن TypeError عند كتابة اللقطة المحلية بعد نجاح رفع الوحدات؛ جرى التحقق من النشر عبر fetch/status. لم يتغير `tgcloud/schema.js` ولم تُنفذ migration. لا commit أو push إلى GitHub.

## 2026-10-25 — تصحيح حالة جدولة المنشورات في الوثائق

- **السبب:** أفاد المالك أن زر الجدولة ظاهر وأنه يستخدم الميزة؛ وصفها السابق بأنها غير مفعلة/مؤجلة كان قديماً ومخالفاً للحالة الفعلية المبلغ عنها.
- **التغيير:** مزامنة وثائق الجدولة وخطة العمل ومواصفة الاشتراكات وتعليمات الوكلاء مع الكود الحالي وتأكيد الإتاحة. توثيق حد المجاني، وحدود Plus/Golden المؤقتة، والإلغاء دون إعادة جدولة، وتعليق التسجيل بلا ACK، وحد Cron، والنتائج الملتبسة دون الادعاء بضمان SLA أو exactly-once. تحديث تعليق `schedule-policy.js` الذي وصف الميزة خطأً بأنها غير فعالة.
- **الملفات:** `md_files/docs/scheduling.md`, `md_files/docs/subscription-rollout.md`, `md_files/docs/cloudflare-pages-miniapp.md`, `md_files/ROADMAP.md`, `md_files/soon.md`, `md_files/sups.md`, `AGENTS.md`, `tgcloud/lib/schedule-policy.js`, `md_files/log.md`.
- **التحقق الفعلي:** `node --experimental-vm-modules --test tests/serverless/schedule-policy.test.mjs tests/serverless/scheduling-reminders.test.mjs tests/serverless/subscription-schedule.test.mjs tests/serverless/golden-scheduler.test.mjs` نجح 13/13؛ نجح `node --check tgcloud/lib/schedule-policy.js` و`git diff --check`.
- **GitHub/النشر:** توثيق وتعليق كود محليان فقط؛ لم يُنفذ commit أو push أو نشر أو migration.

## 2026-10-25 — إخفاء قسم الصورة عند غيابها أو منع إرسالها

- **السبب:** طلب المالك أن يظهر رد `/info` كالمعتاد دون تنبيه عند عدم وجود صورة أو منع المجموعة إرسال الصور، وأن تُفتح تفاصيل الصورة تلقائياً عند توفرها.
- **التغيير:** عند غياب صورة الملف الشخصي، يعرض الرد معلومات المستخدم فقط دون نص أو فاصل أو بلوك صورة. إذا رفض Telegram الصورة بسبب صلاحيات المجموعة، يعيد البوت إرسال معلومات المستخدم دون الصورة وقسم التفاصيل أو رسالة خطأ للمستخدم. تُفتح بلوكة تفاصيل الصورة افتراضياً عند نجاح إرسالها. بقيت رسالة خطأ جلب الصورة الفعلية مترجمة كما كانت.
- **الملفات:** `tgcloud/lib/user-info-copy.js`, `tgcloud/lib/user-info.js`, `tests/serverless/user-info.test.mjs`, `md_files/docs/serverless.md`, `md_files/log.md`.
- **التحقق الفعلي:** `node --experimental-vm-modules --test tests/serverless/user-info.test.mjs` نجح 15/15؛ نجحت `node --check` لوحدات JavaScript المعدلة و`git diff --check`.
- **GitHub/النشر:** تغييرات محلية فقط؛ لم يُنفذ commit أو push أو نشر Telegram.

## 2026-10-25 — إصلاح رتبة المطور وعرض صورة `/info`

- **السبب:** كان مسار `/info` يحوّل رتبة المطور الموثقة إلى «مجاني»، كما كان رفض Telegram للوسائط يستبدل الرسالة الغنية بصمت بنص عادي، فتختفي التفاصيل والفاصل.
- **التغيير:** يعرض `/info` رتبة Developer الموثقة عبر `subscriptionSnapshot` بدل تحويلها إلى Free. لا يعود إرسال `/info` إلى `sendMessage` عند فشل الرسالة الغنية. عند رفض Telegram للصورة وحدها برمز 400 موثوق، يعيد البوت المحاولة كـRich Message دون الوسائط للمحافظة على بلوكات التفاصيل والفاصل؛ أما أخطاء الإرسال الأخرى فتمر لمسار معالجة الأخطاء. شكل كتلة الصورة يطابق توثيق `InputRichBlockPhoto`: `photo: { type: 'photo', media: file_id }`.
- **الملفات:** `tgcloud/lib/user-info.js`, `tests/serverless/user-info.test.mjs`, `tests/serverless/harness.mjs`, `md_files/docs/serverless.md`, `md_files/log.md`.
- **التحقق الفعلي:** `node --experimental-vm-modules --test tests/serverless/user-info.test.mjs tests/serverless/developer-limits.test.mjs` نجح 18/18؛ فحوص `node --check` للملفات المعدلة و`git diff --check` نجحت. آخر اختبار شامل قبل هذا الإصلاح سجل 279/282؛ الإخفاقات الثلاثة في اختبارات إدارة المشتركين.
- **GitHub/النشر:** نُشرت وحدة `tgcloud/lib/user-info.js` وحدها. أظهر CLI خطأً أثناء تحديث snapshot المحلي بعد تأكيد رفع الوحدة؛ جرى `tgcloud fetch` ثم أكد `tgcloud status` revision 100 و`Webhook: in sync` و`Working directory clean`. لم يُنفذ migration أو commit/push إلى GitHub. بقيت التغييرات السابقة في `package.json` و`tgcloud/lib/admin-stats.js` دون تعديل.

## 2026-10-25 — تصحيح نوع RichText في رد `/info`

- **السبب:** أبلغ Telegram عن `Unsupported rich text type` أثناء إرسال معلومات المستخدم؛ اسم المستخدم كان مغلفًا بالنوع `text_link`، وهو نوع Message Entity وليس نوع RichText مقبولاً في InputRichBlock.
- **التغيير:** استُبدل الغلاف بـRichText `url` المدعوم مع الإبقاء على رابط الحساب والاسم القابل للنقر. أضيف تأكيد اختبار يمنع رجوع `text_link` في بنية الرسالة الغنية.
- **الملفات:** `tgcloud/lib/user-info-copy.js`, `tests/serverless/user-info.test.mjs`, `md_files/log.md`.
- **التحقق الفعلي:** `node --experimental-vm-modules --test tests/serverless/user-info.test.mjs` نجح 11/11؛ `node --check` للملفين المعدلين و`git diff --check` نجحت.
- **GitHub/النشر:** رُفعت وحدة `tgcloud/lib/user-info-copy.js` وحدها. ظهر خطأ CLI أثناء كتابة snapshot المحلي بعد تأكيد رفع الوحدة؛ أكد `tgcloud fetch` revision 101 و`Webhook: in sync` و`Working directory clean`. لم تُنفذ migrations أو تغييرات webhook أو commit/push إلى GitHub.

## 2026-10-25 — تبسيط عرض معلومات `/info` ومعالجة تعذر الصورة

- **السبب:** طلب المالك أن تظهر التفاصيل كقائمة نقطية عادية، ثم أوضح أن «وضع الضيف» هو Guest Mode الرسمي الذي يسمح بالرد في مجموعة دون عضوية البوت.
- **التغيير:** صارت معلومات الحساب أربعة بلوكات فقرة عادية، وأصبحت بلوكة `details` مخصصة للصورة وحدها. عند فشل طلب صورة Telegram أو رفض إرسالها، تُرسل معلومات الحساب مع تذييل خطأ مترجم؛ وعند عدم وجود صورة يضاف تذييل يوضح ذلك. جرت مزامنة مفاتيح رسائل `/info` وأخطاء الضيف في اللغات العشرين. أضيف `/id` لعرض معلومات المرسل. رُبط `/info` و`/id` بمعالج `guest_message.js`، حيث يحول نتيجة المعلومات إلى InlineQueryResult article ويرسل الرد الوحيد عبر `answerGuestQuery`؛ استجابة تحديد المعدل تمر أيضاً عبر guest query بدلاً من `sendMessage`. فشل التحضير يسجل تحت `guest_message` ويرجع تشخيصاً آمناً متعدد اللغات مع مرجع التحديث.
- **الملفات:** `tgcloud/handlers/message.js`, `tgcloud/handlers/guest_message.js`, `tgcloud/lib/request-guard.js`, `tgcloud/lib/user-info-copy.js`, `tgcloud/lib/user-info.js`, `tests/serverless/harness.mjs`, `tests/serverless/user-info.test.mjs`, `md_files/docs/serverless.md`, `md_files/log.md`.
- **التحقق الفعلي:** `node --experimental-vm-modules --test tests/serverless/user-info.test.mjs` نجح 14/14، ويشمل محاكاة guest update دون عضوية البوت والتحقق من رد واحد عبر `answerGuestQuery` يحمل قائمة المعلومات والصورة، مع غياب `sendMessage`/`sendRichMessage`. نجحت فحوص `node --check` للمعالج والوحدات والاختبار و`git diff --check`. يلزم اختبار حي بعد تفعيل Guest Mode في BotFather.
- **GitHub/النشر:** تحديث revision 104 شمل `user-info-copy.js` و`handlers/message.js` فقط. ربط Guest Mode وتغييرات `request-guard.js` ما زالت محلية ولم تُنشر. لا migrations أو commit/push.

## 2026-10-23 — إضافة أمر /info للبحث عن الحسابات

- **السبب:** طلب إظهار معرّف المستخدم واسمه كرابط لحسابه واسم المستخدم، مع رد مترجم عند عدم العثور على الحساب.
- **التغيير:** أضيف `/info @username` و`/info <user-id>` في المحادثات الخاصة والمجموعات، مع دعم الرد على رسالة مستخدم أو عرض بيانات مرسل الأمر دون وسيط. يعتمد البحث على بيانات الملفات الشخصية الموجودة في تحديثات Telegram وجدول `usage_users`، وتُعرض حالة عدم وجود اسم مستخدم علناً بدل اختلاقه. رسالة الحساب غير المعروف مترجمة للغات العشرين المدعومة.
- **الملفات:** `tgcloud/handlers/message.js`, `tgcloud/lib/user-info.js`, `tgcloud/lib/user-info-copy.js`, `tests/serverless/user-info.test.mjs`, `md_files/docs/serverless.md`, `md_files/log.md`.
- **التحقق الفعلي:** اختبارات `user-info.test.mjs` نجحت 5/5؛ `npm.cmd test` نجح 279/279؛ `node --check` لوحدات التنفيذ ومعالج الرسائل و`git diff --check` نجحت.
- **GitHub/النشر:** نُشرت وحدات `/info` الثلاث إلى Telegram Serverless في revision 89، وأظهر الفحص أن webhook متزامن. أعاد CLI خطأً محلياً بعد تأكيد رفع الوحدات أثناء تحديث snapshot؛ جرى جلب snapshot والتحقق من revision 89 وعدم بقاء تغييرات محلية لهذه الوحدات. لم يُنفذ migration أو commit أو push إلى GitHub، ولم تُرفع التغييرات الأخرى في مساحة العمل.

## 2026-10-17 — استجابة آمنة عند تعذر SQLite

- **السبب:** فشل `claimUpdate` كان يحدث قبل `try/catch` في معالجات الرسائل والأزرار، ومحاولة تسجيل الخطأ في SQLite المتعطلة قد تمنع المستخدم من رؤية أي رد.
- **التغيير:** تصنيف أخطاء SQLite/المخطط، وإرسال تنبيه مؤقت مترجم للرسائل الخاصة أو callback، مع إيقاف العمل المعتمد على البيانات وعدم محاولة كتابة سجل الخطأ في القاعدة المتعطلة. تبقى الصفحات والجلسات معتمدة على Telegram Serverless؛ لم يُنفذ بعد محرر كامل دون اتصال أو مخزن مسودات في Cloudflare.
- **الملفات:** `tgcloud/lib/operational-errors.js`, `tgcloud/lib/request-guard.js`, `tgcloud/handlers/message.js`, `tgcloud/handlers/callback_query.js`, `tests/serverless/operational-errors.test.mjs`, `md_files/docs/serverless.md`, `md_files/log.md`.
- **التحقق الفعلي:** `node --experimental-vm-modules --test tests/serverless/operational-errors.test.mjs` نجح 11/11؛ `npm.cmd test` نجح 274/274؛ `node --check` للملفات الأربعة و`git diff --check` نجحا.
- **GitHub/النشر:** لا commit أو push إلى GitHub، ولا `tgcloud push` أو `migrate` أو نشر Telegram. تغييرات الكود محلية؛ لم يُعد تشغيل الترحيل الفاشل.

## 2026-10-17 — خفض وحدات Serverless مع حفظ كتالوجات اللغات

- **السبب:** طلب المالك خفض عدد الوحدات المنشورة من 100 إلى 95 احتياطاً من حد الملفات، مع عدم فقد أي ترجمة. هذا لا يفسر وحده خطأ SQLite؛ حالة التطبيق الحالية revision 86 والـwebhook متزامن.
- **التغيير:** جُمعت كتالوجات DE/NL وES/IT/PT وPL/RU/UK في ثلاث وحدات، مع الإبقاء على قيم الرسائل ودليل الترجمة لكل لغة كما هي. انخفض العدد الصافي 5 وحدات (8 ملفات إلى 3)، دون إزالة لغة أو مفتاح.
- **الملفات:** `tgcloud/lib/i18n.js`, `tgcloud/lib/lang/germanic.js`, `tgcloud/lib/lang/romance.js`, `tgcloud/lib/lang/slavic.js`, ملفات اللغات الثمانية السابقة، `tests/serverless/premium-emoji.test.mjs`, `md_files/docs/I18N_GUIDE.md`, `md_files/log.md`.
- **التحقق الفعلي:** `npm.cmd run test:ci` نجح: فحوص الخطة وMini App، و274/274 اختباراً؛ جرى التحقق من تطابق بيانات الكتالوجات المجمعة مع الأصول قبل حذف الملفات المنفصلة، ومن العدد النهائي 95، ونجح `node --check` و`git diff --check`.
- **GitHub/النشر:** التغييرات محلية فقط؛ يجب اختبارها قبل أي `tgcloud push`. لم تُلمس قاعدة البيانات.

## 2026-10-16 — إصلاح أزرار «خيارات إضافية» في الدليل

- **السبب:** Telegram رفض تحديث رسالة الدليل لأن `InputRichBlock` لا يقبل `type: "button"` مباشرة ضمن `details.blocks`؛ الرفض أعاد خطأ 400 عند callback.
- **التغيير:** صارت أزرار الخيارات أبناءً لنص `paragraph` بصيغة RichText المعتمدة، بدلاً من إرسالها كأنواع بلوكات مستقلة. بقيت callbacks والإجراءات كما هي. أضيف تأكيد بنيوي يمنع إعادة هذا الشكل غير المدعوم.
- **الملفات:** `tgcloud/lib/editor-renderer.js`, `tests/serverless/tutorial.test.mjs`, `md_files/tutorial.md`, `md_files/log.md`.
- **التحقق الفعلي:** اختبارات الدليل والتوطين 22/22؛ `node --check tgcloud/lib/editor-renderer.js` و`git diff --check` ناجحان. لم يُشغّل CI كاملاً لهذه الدفعة.
- **GitHub/النشر:** لا commit أو push إضافي لهذه المعالجة. لا `tgcloud push` أو migration؛ التصحيح محلي بانتظار الإذن/الإجراء المنفصل لنشر Telegram.

## 2026-10-16 — تبسيط تنقل الدليل ومراجعة المقترحات

- **السبب:** طلب المستخدم تقليل ازدحام أزرار الدليل، إصلاح الرجوع الذي لا يعيد الشاشة السابقة، وجعل تطبيق النصائح مطابقاً لما تعرضه.
- **التغيير:** تثبيت كل زر من لوحة الدليل في صف مستقل مع إبقاء الحفظ وCBD والضيف والنشر ظاهرة من البداية. يستعيد زر الرجوع الشاشة السابقة وسياقها، ويُحفظ سجل التنقل خلال التحرير والحفظ. تعرض شاشة الرأي معاينة الناتج قبل التطبيق؛ تُمنع إضافة تفاصيل جدول أو تذييل مكرر، ويُضاف محتوى أساسي عندما لا يتجاوز المنشور عنواناً.
- **الملفات:** `tgcloud/lib/editor-core.js`, `tgcloud/lib/editor-import.js`, `tgcloud/lib/editor-renderer.js`, `tgcloud/lib/editor-session.js`, `tests/serverless/tutorial.test.mjs`, `tests/serverless/tutorial-i18n.test.mjs`, `md_files/tutorial.md`, `md_files/log.md`.
- **التحقق:** اختبارات الدليل والتوطين المركزة 21/21؛ `npm.cmd run test:ci` نجح بفحوص الخطط وMini App و272/272 اختباراً؛ `node --check` للوحدات الثلاث و`git diff --check` نجحا.
- **النشر:** أكد المالك تنفيذ `npx tgcloud push` بنجاح للوحدات الخمس `editor-block-ui.js`, `editor-core.js`, `editor-import.js`, `editor-renderer.js`, `editor-session.js`. وأكد `npx tgcloud migrate` أن لا تغييرات مخطط وأن قاعدة البيانات متزامنة. اختبار القبول الحي للمستخدم ما زال مطلوباً؛ لم يؤكد هذا الإخراج رفع GitHub.

## 2026-10-16 — إصلاح إيموجي زر الحفظ وتنظيف رسالة اختيار تعديل القناة

- أصبح زر حفظ الصفحة يرسل نصه كـRichText يتضمن عقدة `custom_emoji` بمعرّف `5188563846415014158` بدلاً من تضمين وسم HTML كنص؛ هذا يسمح للعميل بعرض الإيموجي المخصص فعلياً.
- تُحذف رسالة اختيار تعديل/استيراد المنشور بعد فتح المحرر بنجاح. عند الحاجة إلى تأكيد استبدال مسودة، يُحتفظ بمعرّف الرسالة حتى إكمال التأكيد أو الإلغاء ثم تُحذف كي لا تبقى عناصر اختيار قديمة.
- الملفات: `tgcloud/lib/editor-block-ui.js`, `tgcloud/lib/editor-core.js`, `tests/serverless/channel-post-edit-import.test.mjs`, `md_files/docs/channel-post-edit-import-plan.md`, `md_files/log.md`. لا schema change أو migration.
- التحقق الفعلي: الاختبارات المركزة `channel-post-edit-import.test.mjs` نجحت 11/11؛ `npm.cmd run test:ci` نجح بفحوصات الخطط وMini App و269/269 اختباراً؛ `node --check` و`git diff --check` نجحا. لا deployment أو GitHub.

## 2026-10-16 — استعادة واجهة البلوك وإظهار موضعه الحي

- عند فشل تعديل معاينة البلوك لأن Telegram لم يعثر على رسالة الواجهة، يُرسل المحرر المعاينة المحدّثة وأزرارها برسالة جديدة ويحدّث معرّفها في الجلسة؛ أخطاء Telegram الأخرى تبقى ظاهرة ولا تتحول إلى نجاح صامت.
- تعرض معاينة البلوك موضعه الحالي وترتيب جميع البلوكات مع تمييز العنصر المحدد. تعرض أزرار التحريك نسبة الموضع الحالية وتتجدد بعد كل حركة.
- الملفات: `tgcloud/lib/editor-block-flow.js`, `tgcloud/lib/editor-block-ui.js`, `tests/serverless/editor-block-flow-recovery.test.mjs`, `md_files/log.md`. لا schema change أو migration.
- التحقق الفعلي: الاختبارات المركزة 3/3؛ `npm.cmd run test:ci` نجح بفحوصات الخطط وMini App و268/268 اختباراً؛ فحص JavaScript و`git diff --check` ناجحان. لا deployment أو GitHub.

## 2026-10-16 — توضيح زر حفظ الصفحة غير المحفوظة

- تعرض لوحة المحرر «حفظ» مع الإيموجي المخصص `5188563846415014158` عندما لا تكون الصفحة محفوظة بعد؛ بعد نجاح الحفظ يعاد بناء اللوحة فيظهر زر «مزامنة الصفحة». يبقى زر «تعديل المنشور» أعلى أولوية عند وجود هدف قناة.
- أضيف اختبار لعلامة الحفظ والإيموجي المحددين ولتحول الزر بعد الحفظ؛ وحدثت خطة تعديل/استيراد منشور القناة لتوثيق ترتيب الأزرار.
- الملفات: `tgcloud/lib/editor-block-ui.js`, `tests/serverless/channel-post-edit-import.test.mjs`, `md_files/docs/channel-post-edit-import-plan.md`, `md_files/log.md`. لا schema change أو migration.
- التحقق الفعلي: اختبارات `channel-post-edit-import.test.mjs` نجحت 10/10. لا deployment أو GitHub؛ النشر يحتاج تفويضاً منفصلاً.

## 2026-10-16 — حذف تحذير إغلاق المحرر وإبقاء سياق تعديل المنشور

- صارت رسالة تحذير إغلاق المحرر تُحذف بعد قبول الإغلاق أو رفضه. وبعد نجاح تعديل المنشور يبقى مرجع القناة/المنشور في الجلسة، فيظل زر «تعديل المنشور» ظاهراً بدلاً من زر مزامنة الصفحة في التعديلات اللاحقة.
- أضيفت اختبارات تثبت حذف رسالة التحذير في الخيارين، بقاء سياق الهدف بعد التعديل وزر التعديل في لوحة المحرر، مع الحفاظ على مسار رفض إغلاق المحرر.
- الملفات: `tgcloud/lib/editor-core.js`, `tests/serverless/channel-post-edit-import.test.mjs`, `md_files/docs/channel-post-edit-import-plan.md`, `md_files/log.md`. لا schema change أو migration.
- التحقق الفعلي: الاختبارات المركزة 10/10؛ `npm.cmd run test:ci` نجح مع check:plans وcheck:miniapp و264/264 اختباراً؛ `node --check` و`git diff --check` نجحا. رُفع `tgcloud/lib/editor-core.js` وحده؛ أكد `npm.cmd run status` revision 78، والـwebhook in sync وWorking directory clean. لا migration أو GitHub.

## 2026-10-16 — فصل إشعار تحويل القناة عن المحرر

- أصبح كل تحويل مؤهل لمنشور قناة يرسل رسالة خيار جديدة بدلاً من استبدال رسالة لوحة المحرر. إذا كانت هناك مسودة أو عملية تحرير نشطة، يظهر تحذير وموافقة إضافيان قبل إغلاق المحرر وحذف محتواه غير المحفوظ؛ الصفحات المحفوظة تبقى كما هي. الرفض يعيد جلسة التحرير كما كانت، والموافقة تتابع بخياري التعديل/الاستيراد.
- أضيفت مفاتيح وتحذيرات مترجمة للغات العشرين واختبارات لتدفق الإغلاق والرفض، وعدم استبدال رسالة اللوحة، ومواصلة الاستيراد.
- الملفات: `tgcloud/lib/editor-core.js`, `tgcloud/lib/i18n-keys.js`, `tgcloud/lib/lang/*.js`, `tests/serverless/channel-post-edit-import.test.mjs`, `md_files/docs/channel-post-edit-import-plan.md`, `md_files/log.md`. لا schema change أو migration.
- التحقق الفعلي: اختبارات مسار القناة والوسائط 10/10؛ `npm.cmd run test:ci` نجح مع فحوصات الخطط وMini App و264/264 اختباراً؛ `node --check` لكل كتالوجات اللغة والوحدات المعدلة و`git diff --check` نجحت. رُفعت 22 وحدة محددة؛ أكد `npm.cmd run status` revision 77، والـwebhook in sync وWorking directory clean. لا migration أو GitHub.

## 2026-10-16 — تنفيذ تعديل منشور القناة أو استيراده

- نُفذ مسار المنشور المحوّل من القناة: عند امتلاك المستخدم والبوت صلاحية تعديل المنشورات يظهر اختيار تعديل المنشور أو استيراده. يبقى الاستيراد مسودة مستقلة؛ أما التعديل فيحمّل المحتوى للمحرر ويحوّل زر مزامنة الصفحة إلى تعديل المنشور. لا يتغير الأصل إلا بعد تحذير وموافقة نهائية، مع فحص الصلاحيات مرة أخرى. فقدان الصلاحية يلغي هدف التعديل؛ إلغاء التحذير لا يغيّره.
- حد Telegram المعروف: لا تتيح Bot API قراءة النسخة الحالية للمنشور أو شرط CAS بعد التحويل. أكد المالك قبول هذا القيد وطلب تحذيراً وموافقة صريحة أخيرة؛ قد يستبدل التعديل محتوى أحدث إذا تغيّر المصدر بعد التحويل.
- الملفات: `tgcloud/lib/editor-core.js`, `tgcloud/lib/editor-session.js`, `tgcloud/lib/editor-block-ui.js`, `tgcloud/lib/editor-guard.js`, `tgcloud/handlers/callback_query.js`, `tgcloud/lib/i18n-keys.js`, `tgcloud/lib/lang/*.js`, `tests/serverless/channel-post-edit-import.test.mjs`, `md_files/docs/channel-post-edit-import-plan.md`, `docs/README.md`, `md_files/log.md`. لا schema change أو migration.
- التحقق الفعلي: اختبارات القناة ونسخ الوسائط 8/8؛ `npm.cmd run test:ci` نجح مع فحوصات الخطط وMini App و262/262 اختباراً؛ `node --check` للوحدات المعدلة و`git diff --check` نجحا. رُفعت 29 وحدة محددة عبر `npm.cmd run deploy -- ...`، وأكد `npm.cmd run status` revision 76، والـwebhook in sync وWorking directory clean. لا migration أو GitHub.

## 2026-10-16 — إصلاح نشر المجموعات وترجمة رسائل الوسائط وخطة تحرير منشور القناة

- تجاهل وجهة الموضوع المحفوظة عند تعطيل وضع الموضوعات في المجموعة، مع الاحتفاظ بالإعداد لاحتمال إعادة تفعيلها. أُضيف اختبار انحدار يثبت عدم إرسال `message_thread_id` لمجموعة لم تعد منتدى، مع بقاء رفض المنتدى النشط بلا موضوع افتراضي.
- أُضيفت تسع رسائل مترجمة إلى اللغات العشرين: توجيهات رفع الكولاج وعرض الشرائح، إنهاء الدفعة وأزرار الوسائط، ورسائل إضافة البوت وصلاحيات النشر. رُبطت المفاتيح بمسارات الوسائط ولوحة وجهات النشر، وأُضيف اختبار يغطي القيم والعناصر النائبة في كل اللغات.
- أُنشئت خطة Markdown مستقلة لمسار تعديل منشور القناة أو استيراده، ورُبطت بفهرس الوثائق. لم يبدأ تنفيذ هذه الميزة.
- الملفات: `tgcloud/lib/forum-topics.js`, `tests/serverless/forum-default.test.mjs`, `tgcloud/lib/i18n-keys.js`, `tgcloud/lib/lang/*.js`, `tgcloud/lib/editor-extra-blocks.js`, `tgcloud/lib/publish.js`, `tests/serverless/workflow-copy.test.mjs`, `md_files/docs/channel-post-edit-import-plan.md`, `docs/README.md`, `md_files/log.md`.
- التحقق الفعلي: `node --experimental-vm-modules --test tests/serverless/forum-default.test.mjs tests/serverless/workflow-copy.test.mjs tests/serverless/publish-validation.test.mjs tests/serverless/tutorial-i18n.test.mjs` نجح، 20/20. لم يُنفذ `tgcloud push` أو migration أو تغيير webhook؛ لم يُحدّث GitHub.

## 2026-10-16 — إصلاح ابتلاع callback إضافة البلوك

- سبب توقف زر الإضافة: `handleEditorLimitConfirmation` كانت ترجع `{ handled: false }` للـcallbacks غير التابعة لتأكيد الحد. هذا كائن truthy، فكان مسار التوجيه يعتبر `r:add:*` قد عولج ويخرج دون تشغيل معالجه أو إظهار استثناء؛ لذلك لم يظهر تنبيه في قناة الأخطاء.
- أصبح callback غير المطابق يرجع `false` حتى يستمر التوجيه الطبيعي، وأضيف اختبار يثبت أن callback إضافة فقرة لا يُستهلك بواسطة معالج تأكيد الحد.
- التحقق الفعلي: `node --experimental-vm-modules --test tests/serverless/editor-limit-trim.test.mjs` نجح 4/4. نُشر التعديل المحدد عبر `npx.cmd tgcloud push tgcloud/lib/editor-limit-confirmation.js` بنجاح؛ أكد `npm.cmd run status` revision 75، والـwebhook in sync وWorking directory clean. لا تغيير للمخطط أو GitHub.

## 2026-10-16 — ربط ونشر تأكيد تجاوز الحد داخل المحرر

- أُضيف مسار تأكيد تجاوز الحد إلى callbacks المحرر بحيث تُعرف `r:limit:*` كاستجابة جلسة محرر وتُعرض رسالة تأكيد قبل حذف المحتوى الزائد أو اعتماد الحد. تم ربط هذا المسار مع فتحات إضافة/استبدال البلوك، بحيث يظهر خيار ترقية الحدود / موافق / رفض، وتبقى المسودة سليمة حتى الموافقة.
- تم توسيع فحص الـ editor guard لتشمل `r:limit:` وربط ردّ التأكيد في `callback_query.js`. لا تغييرات على المخطط أو بيانات الإنتاج.
- التحقق الفعلي: `npm.cmd run test:ci` نجح؛ فحوصات الخطط وMini App ناجحة و252/252 اختباراً بلا فشل أو تخطٍ. تم تنفيذ `npm.cmd run deploy` بنجاح، ورفع 7 وحدات إلى Telegram Serverless. أكد `npm.cmd run status` أن النسخة المحلية 74، وبيئة العمل المنشورة متزامنة، والـ webhook in sync. لم يُحدّث GitHub.

## 2026-10-16 — تمييز تجاوز حد الوسائط في معاينة النتيجة

- سبب التنبيه: فشلت معاينة نتيجة فيها 11 مرفق وسائط مقابل حد 10 الفعّال للحساب. هذا رفض متوقع، وليس خللاً في بلوك الجدول الذي يعرض تفاصيل سجل الأخطاء.
- بقي حد المعاينة كما هو، وتظل المسودة محفوظة؛ تعرض لوحة المعاينة الآن سبب الحد المحدد، ولا يُرسل تجاوز `EDITOR_LIMIT` المتوقع إلى قناة الأعطال. ينطبق تصنيف التجاوز نفسه على معاينة البلوك المفرد. بقية أخطاء المعاينة تستمر في التسجيل.
- التحقق الفعلي: `node --experimental-vm-modules --test tests/serverless/operational-errors.test.mjs` نجح، 10/10. لم يُنفذ `tgcloud push` أو نشر Telegram؛ GitHub لم يُحدّث.

## 2026-10-14 — تبسيط الدليل وتعليم النشر

- صار زر «عرض كل البلوكات» داخل الدليل يستخدم callback `r:showcase` نفسه لمسار `/draft`، مع إبقاء المسودة نشطة عند الضغط من مرساتها فقط والحفاظ على callback `catalog` القديم. استُبدل تعريف البلوك التقني باختيار مبسط للبداية.
- أضيف درس «شلون أنشر؟» الاختياري إلى «تريد المزيد؟» وترجم في اللغات الـ18. يشرح أدوات المحرر، اختيار قناة/مجموعة، إعدادات الإرسال والتأكيد، ويظهر الإرشاد على لوحة المحرر بعد تسليم المسودة. لا ينفذ الدليل نشراً دون اختيار المستخدم.
- التحقق الفعلي: اختبارات الدليل والتوطين والقياس 21/21؛ `npm.cmd run test:ci` ناجح مع check:plans وcheck:miniapp و248/248 اختباراً بلا فشل أو تخطٍ. لم يجرِ نشر Telegram لهذه المتابعة. تأكيد المالك لنجاح النشر يخص إصدار تقليل الوحدات السابق فقط.
## 2026-10-14 — تقليل وحدات Telegram Serverless مع حفظ الدليل

- أثبت ماسح `@tgcloud/cli` 0.2.0 وجود 124 وحدة محلية مقابل 99 في snapshot المرتبط بـrevision 71، منها 25 وحدة جديدة و8 معدلة قبل هذا الإصلاح. الماسح يرسل كل ملفات JavaScript ضمن مجلدات الوحدات؛ لا يقتصر على imports المستخدمة. لا توثيق رسمي أو capability descriptor متاح يحدد الرقم الأعلى الدقيق، لذلك لم يُفترض حد 100.
- نُقلت كتالوجات اللغات الـ18 كـnamed exports إلى ملفات اللغة القائمة، وأُدمج اختيار اللغة والنصوص في `i18n.js`. نُقلت وظائف الدليل إلى `editor-core.js` و`editor-import.js` و`editor-renderer.js` و`editor-session.js` و`marketing-campaign.js`، وحُدثت imports والاختبارات. حُذفت 25 وحدة مصدرية زائدة بعد مقارنة الكتالوجات واختبار عدم سقوط المفاتيح؛ لم تُحذف ميزة أو ترجمة أو أصل صورة.
- التحقق الفعلي: `npm.cmd run test:ci` ناجح؛ `check:plans` و`check:miniapp` ناجحان و247/247 اختباراً بلا فشل أو تخطٍ. الاختبارات المركزة للدليل نجحت 20/20. `git diff --check` والنتيجة النهائية لـCLI موثقان بعد إتمام الفحص.
- عدد الوحدات وفق scanner/snapshot: 99 قبل التحديث و99 في manifest الحالي؛ `tgcloud status` لا يعرض وحدات جديدة. هذا يعيد التطبيق إلى مجموعة منشورة سابقاً، ولا يزعم كشف السقف العددي الدقيق أو نجاح نشر جديد.
- حُفظت نسخة الملف المحلي السابق `app/miniapp_static/plan_catalog.generated.js` خارج المستودع وتطابق SHA-256؛ لم يُعدّل الملف. الفرع `fix/tgcloud-module-limit`، HEAD الحالي `18e9d5bc40826155742ff8c6512eda42bcccfbd5`؛ لا commit جديد ولا GitHub push ولا `tgcloud push` أو migration أو webhook.

## 2026-10-13 — إكمال لغات الدليل وتنبيه CBD وتقرير المراحل

- اكتملت 90 رسالة للدليل وقوالبه في 20 لغة مدعومة؛ أضيفت 18 كتالوجاً تحت `tgcloud/lib/lang/tutorial/` ومسار `tutorial-i18n.js` مشترك لاختيار اللغة. العربية والإنجليزية محفوظتان، والأمثلة التقنية قابلة للنسخ كما هي.
- رجع تنبيه CBD للمشتركين فقط إلى نص main الأصلي «انت مو من المقربين ابتعد عني .... » في العربية، مع بقاء فحص العضوية وباقي اللغات. لا تغيير لمسارات الإنلاين أو صلاحيات النشر.
- أضيف تقرير مراحل الدليل إلى إحصائيات الحملات، بأعداد مستخدمين فريدة لكل مرحلة ومصدر. `tutorial-metrics.js` يجمع داخل SQL دون إخراج المسودات. إحصائيات النشر مربوطة بإرسال Telegram الناجح من المحرر أو التطبيق المصغر فقط؛ إيصالات مستقلة insert-only تمنع التكرار ولا تتنافس مع CAS المسودة. العودة تعني يوم UTC لاحق خلال 7 أيام، فلا يحتسب إرسال اليوم نفسه عودة.
- اختبارات جديدة لاكتمال الترجمة وصيغ الأمثلة وRTL، نافذة الاشتراك، SQL الفعلي، dedupe وحدود سبعة أيام، وفصل فشل telemetry عن نجاح النشر. حُدث اختبار admin-stats القديم ليتحقق من النقل الموجود مسبقاً إلى @richDonateBot بدلاً من أزرار ملغاة؛ لا تعديل سلوك الاشتراكات.
- التحقق الفعلي: `npm run test:ci` ناجح، 247/247 بلا فشل أو تخطي، مع نجاح check:plans وcheck:miniapp. `git diff --check` نظيف. ملفات الصور المنشورة أعادت HTTP 200، وتحميل PNG لكلتا الوصفتين يطابق SHA-256 للملفات المحلية.
- GitHub: رُفعت النواة والوثائق والصور في 72cf253؛ رُفعت دفعة الإكمال بنجاح في f83de30760603ee2c6af14095bbbf408ca868b11 إلى serverless-cleanup، بشجرة تطابق الملفات المختبرة. نجح تحديث الفرع بشرط الرأس السابق ودون force. هذا التحديث التوثيقي يسجل نتيجة الرفع. لا نشر Telegram أو migrate أو webhook؛ اختبار الهاتف والضيف والتحويل نص/سلايدشو ما زال يتطلب نشر المالك.
- تحديث نقطة الاستئناف في `md_files/tutorial.md` القسم 19 وAGENTS وفهرس الوثائق، مع تعريف المؤشرات وحدود التحقق. التغطية هنا لنصوص الدليل الجديدة؛ ليست ادعاء تدقيق بشري لكل الترجمات القديمة في البوت.

## 2026-10-13 — تنفيذ محلي للدليل التفاعلي والقوالب

- أُضيفت خمس وحدات tutorial تفصل الحالة والعرض والنماذج والنصوص والتحكم، وربط الدليل بالترحيب والإعلانات الثلاثة. زر المجموعة بجانب بدء المحرر، والكتالوج داخل قائمة الدليل ذات الأزرار الثلاثة بصفين.
- رسالة دليل واحدة بمعاينة بين فاصلتين، بناء يدوي، اقتراحات «تريد رأيي؟»، خمسة قوالب، تعديل العناصر المتداخلة، وتفاصيل «تريد المزيد👀؟» للحفظ وCBD والضيف. صورتا وصفة الطعام ثابتتان مولدتان للمشروع مع manifest؛ تحتاجان نشر Pages لاحقاً.
- مسودة مستقلة دائمة في legacy_states تحمي الصفحة المفتوحة وتتفادى انتهاء editorSessions بعد ساعتين. فحص المالك/الخاص/epoch/revision ومعرف الرسالة، CAS وقفل المستخدم، dedupe وترتيب إدخالات الألبوم، cooldown عند 429، وفصل فشل العرض عن نجاح تغيير المحتوى.
- تصدير persistPage مع خيار حجز ID وتحقق revision يتيح إعادة استعمال الحفظ الحالي بأمان؛ تصدير فاحص الحمولة النهائي لفحص غلاف الدليل. لا تعديل مخطط DB، الباقات، الإنلاين أو سلوك النشر الفعلي.
- التحقق: 15/15 اختبار دليل ناجحاً. آخر test:ci كامل قبل الاختبار الخامس عشر: 240/241، والفشل الوحيد اختبار admin-stats الذي يتوقع أزراراً أزيلت سابقاً؛ أُثبت فشله على baseline a79c8b9 أيضاً. فحوص الكتالوج وMini App ناجحة. لا اختبار حي في Telegram.
- تفاصيل الإنجاز والحدود وخطوة الاستئناف في md_files/tutorial.md القسم 18. العربية والإنجليزية جاهزتان؛ بقية ترجمة النصوص الجديدة ولوحة تجميع مراحل الدليل واختبارات الهاتف ما زالت مطلوبة.
- الحالة: تنفيذ محلي فقط؛ لم يُرفع إلى GitHub ولم ينشر إلى Telegram/Cloudflare. لا migration مطلوبة لهذه الدفعة. الموافقة الصريحة على الرفع الخارجي ما زالت معلقة بعد الرفض السابق؛ لم تعاد محاولة الرفع.

## 2026-10-13 — خطة الدليل التفاعلي وجمع وثائق Markdown

- أُنشئ `md_files/tutorial.md` أولاً لتثبيت قرارات المالك: ترتيب الترحيب، ثلاثة أزرار للدليل بصفين، نقطة دخول الحملات A/B/C، مرساة رسالة واحدة ومعاينة بين فاصلتين، «تريد رأيي؟»، القوالب الخمسة ومنها وصفة الطعام، ودروس الحفظ/CBD/الضيف داخل «تريد المزيد👀؟».
- الخطة تفصل المتطلبات المؤكدة عن الاقتراحات والفحوص المتبقية، وتحدد إعادة استعمال خدمات المحرر، حماية المسودة/الملكية/revision، منع التكرار، أخطاء التحرير والاستئناف والوسائط، التوطين، مراحل التنفيذ واختبارات القبول. لا ذكر للإنلاين في الدليل ولا تعديل لمساراته.
- نُقل 28 ملف Markdown إلى `md_files/` مع الاحتفاظ بتسلسل docs/archive. استُثنيت README وAGENT/AGENTS من النقل، وحُدثت روابطها. هذا الملف هو سجل التغيير النشط بموقعه الجديد. بقيت ملفات الاختبارات المؤرشفة غير Markdown في مواقعها.
- عُدلت الروابط المحلية داخل الملفات المنقولة لتظل تشير إلى ملفات التشغيل والأرشيف الصحيحة؛ لم يتغير runtime أو schema أو منطق المنتج.
- التحقق: نجح فحص جميع روابط Markdown المحلية (لا روابط مكسورة)، وتحقق نقل الملفات الـ28 وبقاء الملفات المستثناة فقط خارج md_files، ونجح git diff --check. التغييرات كلها توثيقية؛ لم تشغّل اختبارات البوت لأن كود التشغيل لم يتغير.
- الحالة: حُفظت الدفعة محلياً بالالتزام dd7a3ae. رفضت المراجعة التلقائية git push إلى origin/serverless-cleanup لأنها اعتبرت تفويض الطلب خاصاً بالتوثيق المحلي لا النشر الخارجي لوثائق قد تكون خاصة؛ لم تُعَد محاولة الرفع. بانتظار إذن صريح من المالك لرفع الدفعة. لا تنفيذ تتوريال أو توليد صور أو tgcloud push/migrate أو نشر يدوي إلى Cloudflare.

## 2026-10-12 — نقل لوحة الاشتراكات والإهداء إلى بوت التبرع (تجهيز تكاملي)

- المحرر يحافظ على قاعدة الاستحقاقات والهدايا الحالية مصدرَ الحقيقة وعلى إرسال الرسائل الخاصة إلى المستخدمين المعروفين؛ نقل الإدارة والواجهة لبوت التبرع لا يعني نقل دفعات الدفع أو حذف السجلات.
- أُضيف `lib/donate-console.js`: مستقبل B2B يتحقق من هوية @richDonateBot وTelegram ID المثبت والخاص، ويخدم `/sup` والإحصائيات والمشتركين وتقرير الإهداء وأسبابه، ويحصر العمليات الجماعية بالمطور فقط. سجل idempotency دائم للطلبات يمنع تكرار منح/إرسال الجولة بسبب إعادة إرسال طلب واحد.
- أُزيلت أزرار الهدايا والمشتركين من لوحة المطور في المحرر، والأزرار القديمة تظهر تنبيهاً بالانتقال إلى بوت التبرع من دون إنشاء جولة جديدة.
- الأخطاء الجديدة تُسجل برمز فئة لكل مستلم في `legacy_states` تحت namespace `golden_delivery:` دون تفاصيل نصوص Telegram أو إضافة أعمدة إنتاجية، ويظهر تجميعها للمالك من بوت التبرع. الـ73 إخفاقاً القديمين لا يمكن تصنيفهم بأثر رجعي.
- إشعارات تقرير انتهاء الإرسال وأخطاء التشغيل تُوجّه إلى بوت التبرع عبر B2B، مع تراجع إلى رسالة مطور المحرر عند رفض قناة B2B مؤكد.
- الفحص: تم إجراء فحص تركيب JavaScript للملفات المعدّلة عبر V8؛ أُضيف اختبار تجريبي لتصنيف الأخطاء وعدّلت توقعات الاختبارات القديمة لواجهة الإهداء الجديدة. **لم تُشغّل اختبارات npm أو إرسال حي، ولم يُنفّذ Telegram push أو تغيير DB.**
- متطلبات التشغيل: يجب نشر المحرر وبوت التبرع معاً، وترحيل قاعدة بوت التبرع أولاً، وتفعيل Bot-to-Bot Communication Mode لكلا البوتين؛ Cloudflare Worker الحالي يظل هو مجدول الإشعارات ويحتاج العمل بشكل مستقل.

## 2026-10-12 — تفعيل بلا مهلة وجولات تذكير لا تضاعف الهدية

- طلب المالك إلغاء مهلة التفعيل وإتاحة ضغط زر الإهداء مرة أخرى، من دون أن تتحول الإشعارات المتكررة لغير المفعّلين إلى أشهر إضافية. أُلغيت مهلة 12 ساعة للهدايا غير المفعلة القديمة والجديدة، وبقيت مدة الاشتراك 30 يوماً من أول تفعيل.
- الأزرار الجديدة مربوطة بالحملة؛ الأزرار القديمة العامة مرتبطة بأقدم حملة مؤهلة. الحملات الصادرة أثناء انتظار التفعيل تُسوّى بهدية واحدة عند التفعيل، مع مفتاح claim واحد ومقاومة الضغط المتزامن. حملة مستقلة تصدر بعد التفعيل تبقى ضمن السياسة الشهرية السابقة ولا يمكن تفعيلها من زر قديم.
- الزر يستأنف الطابور القائم؛ بعد اكتماله يبدأ جولة تذكير جديدة لغير المفعّلين. رقم الجولة يفصل سجل التسليم وإشعار الاكتمال ولا يغير مدة مستخدم مفعّل أو اشتراكاً مدفوعاً. أضيفت أعمدة round بقيمة افتراضية 1 في جدولَي الحملات المرسلة وسجل الإشعارات.
- الملفات: `golden-gifts.js` و`golden-announcements.js` و`developer.js` و`schema.js`، نص تنبيه Mini App، اختبارات الهدايا والإرسال، دليل الجدولة وهذا السجل.
- التحقق: اختبارات التفعيل المؤجل 200 يوم، ضغط إشعاري حملتين بالتزامن، إعادة الضغط بعد انتهاء الباقة، منع زر قديم من تفعيل حملة لاحقة، جولات الإرسال والتخطي والتقارير. `npm run test:ci`: 226/226 ناجحة بالفحص النهائي، مع نجاح git diff --check.
- النشر: رفع GitHub مأذون من المالك؛ لا نشر Telegram أو Worker ولا تغيير بيانات إنتاج. **يلزم migrate لإضافة عمودي round قبل tgcloud push**، مع الحفاظ على البيانات القديمة. نشر Pages لا يكفي لعامل Cron المستقل. الاختبارات المحلية لا تثبت تسليماً حياً 100%.

## 2026-10-12 — لوحة المشتركين ومراجعة تسليم الإهداء

- لوحة الإحصائيات تعرض الباقتين Plus وGolden Ticket فقط، وزر «المشتركون وباقاتهم» يفتح قائمة بمعرف المستخدم والباقة ونهاية الاستحقاق الحالي، 10 حسابات في الصفحة، مع تحديث وتنقل وحالة فارغة وخطأ تحميل واضح. المسار محمي بحارس المطور الموجود.
- تجميع الاستحقاقات من السجلات المدفوعة الموثقة والهدايا الفعالة مباشرة، بما يشمل الحسابات التي لا تملك ملف نشاط بعد. استبعاد المنتهية وغير الموثقة والمطورين. الهدية Golden لها أولوية الاستحقاق دون تكرار حساب المستخدم أو تغيير اشتراكه المدفوع.
- الإهداء: fallback نصي بنفس زر التفعيل عند رفض تنسيق الرسالة الغنية رفضاً مؤكداً فقط؛ لا إعادة عمياء بعد timeout. التحقق من نجاح تحديث قفل الحملة قبل تسجيل الدفعة التالية أو إنهائها. التقرير يميز من لم تُرسل لهم الرسالة قبل إغلاق الحملة عن المنتظرين في طابور نشط.
- نافذة التفعيل الحالية 12 ساعة محفوظة؛ انتهاء المهلة أو حظر البوت أو النتائج المبهمة تمنع ضمان تسليم 100%. لا اختبار إرسال فعلي أو إطلاق حملة جديدة ضمن هذه المراجعة.
- الملفات: `tgcloud/lib/{admin-stats,developer,golden-announcements}.js`، اختبارات `admin-stats` و`golden-announcements` و`subscriber-list`، وهذا السجل.
- الاختبارات: `npm run test:ci` نجح 222/222، تتضمن استعلامات SQLite فعلية للتصفية وعدم التكرار والصفحات والانتهاء، واختبارات fallback وعدم تكرار الرسائل المبهمة.
- الحالة: تغييرات محلية محفوظة؛ رفع GitHub السابق رفضته المراجعة التلقائية لغياب إذن صريح بالنشر الخارجي. لم نعد محاولة الرفع، ولم ننشر Telegram أو Worker أو ننفذ migration.

## 2026-10-12 — إصلاح إحصائيات الباقات واستمرار حملة Golden

- إصلاح `ReferenceError` في `admin-stats.js`: كان الحقل `unavailable` يشير إلى متغير غير معرّف بدل `unreachable`، فيتعذر عرض الإحصائيات. إضافة إجمالي أصحاب الباقات وإجمالي Golden مع إبقاء تقسيم المدفوع/الهدية وعدم احتساب الشخص مرتين.
- `functions/_lib/scheduling-reminders.js`: استعادة تذكيرات `gfb_` المنهكة واستمرار محاولات إيقاظ Serverless بعد ثماني محاولات بتباعد يصل إلى 15 دقيقة. التذكيرات تتوقف عند نتيجة البوت؛ انتهاء نافذة التفعيل ما زال مفروضاً من Serverless. لم تنقل بيانات المستخدمين إلى Cloudflare.
- `golden-announcements.js`: تقرير انتهاء واضح؛ تأخير نتيجة إغلاق مهمة Cloudflare إلى ما بعد معالجة الإشعار. الرفض المؤكد القابل للمحاولة يُحفظ لإعادة المحاولة، مع قفل يمنع إرسالين متزامنين. النتائج المبهمة والانقطاع أثناء إرسال فعلي تُسجل غير مؤكدة ولا يعاد إرسالها عشوائياً. العلامات القديمة محفوظة لتجنب تكرار إشعارات سابقة.
- الملفات: وحدات الإحصاء ولوحة المطور والإهداء والمجدول، اختبارات `admin-stats` و`golden-announcements` و`golden-scheduler` ومحاكاة API، وهذا السجل ودليل الجدولة.
- التحقق: `npm run test:ci` نجح، 217/217. تشمل اختبارات SQLite فعلية استعادة مهمة منهكة، انقطاع relay، غياب ACK، وتوقف التذكير بعد النتيجة، إضافة إلى اختبارات إشعار المطور والتزامن.
- النشر: هذه دفعة GitHub على `serverless-cleanup`؛ لا نشر Telegram ولا Worker من الجلسة، ولا migration مطلوبة لهذا الفرق. يلزم نشر كود Serverless وعامل التذكير المستقل؛ نشر Pages وحده لا ينشر Worker. لا توجد بيانات اعتماد Cloudflare في البيئة. لم نطلق حملة جديدة أو نرسل للمستخدمين أثناء الاختبارات.

## 2026-10-12 — حالة طابور إهداء القسيمة، تقارير المطور، وإحصائيات الباقات

- **الحاجة:** كان زر «إهداء» يثبت إنشاء حملة وطلب جدولة فقط، وليس تسليم كل الرسائل. الدفعات بحد 20 مستلماً/8 ثوانٍ، ويُفترض أن يُوقظها Cloudflare Worker كل دقيقة؛ لهذا قد يستغرق 10 آلاف مستخدم حوالي 8 ساعات و20 دقيقة في الظروف المثالية، مقابل 12 ساعة لصلاحية تفعيل القسيمة.
- **تقرير الحملة:** إضافة `birthdayCampaignStatus` و`birthdayReportText` في `tgcloud/lib/golden-announcements.js` لعرض أحدث حملة في `/dev` بزر «📨 حالة الإهداء»، مع أعداد المؤهلين والرسائل التي قبلها تليكرام، والمتعذرة، وغير المؤكدة، والمعلّقة. قبول الإرسال لا يثبت قراءة الرسالة.
- **التنبيهات:** إرسال تقرير **خاص للمطور** عند انتهاء معالجة الحملة، وتنبيه مرة واحدة لكل حملة عند فشل دفعة لأسباب تشغيلية، مع `logError` لسجل الأخطاء. تُخزَّن علامة محاولة الإشعار في `legacy_states` لتجنب الإرسال المكرر. حالات منع/حظر المستخدمين تُجمع في التقرير بدلاً من إرسال تنبيه لكل فشل فردي. إن لم يعمل Cloudflare Worker مطلقاً، لن يتلقى Serverless أحداث `due`، ولا يمكن ضمان وصول تنبيه؛ فحص حالة Worker مطلوب منفصلاً.
- **عدد المستخدمين المتاحين:** إضافة `tgcloud/lib/admin-stats.js` لإظهار «المتاحون تقديرياً» على أساس المستخدمين المعروفين minus آخر فشل وصول مؤكد `unavailable` ولم يتبعه نشاط من المستخدم؛ مع «قبل تليكرام رسائلهم»، «تعذر الوصول مؤكداً»، «لم يُختبر وصولهم». هذا **ليس** إثباتاً لإمكان إرسال رسالة لجميع المعروفين.
- **الباقات:** تقسيم مستخدمي `usage_users` بحسب *الاستحقاق الفعلي* إلى مجاني، بلص، غولدن مدفوع، غولدن هدية، مطور. مصدر الدفع يجب `richdonate:verified` مع حالة active وعدم انتهاء الاشتراك؛ الهدية الفعالة لها الأولوية على المدفوع فلا يُحسب الشخص مرتين. لم تُنشأ باقات مزيفة اعتماداً على بيانات Mini App.
- **البيانات:** إعادة تصنيف أخطاء المستخدم المحظور/المحادثة الخاصة المتعذرة إلى `unavailable` داخل سجل الإعلانات النصي الموجود، من دون تعديل مخطط قاعدة البيانات. لا يمكن استنتاج حالة جميع الحسابات دون محاولة إرسال حقيقية. أضيفت اختبارات للتقارير ومنع التكرار والإحصائيات، وتعديلات بسيطة لاختبار `harness`.
- **النشر:** التغييرات على GitHub فرع `serverless-cleanup` فقط؛ لم تُنشر إلى Telegram أو Cloudflare ولم يتم `migrate`. انتظر نتائج `npm run test:ci` قبل النشر. تحقق من تشغيل Cloudflare Worker وربط `DB` و`B2B_BOT_TOKEN` خارج هذا التحديث.

## 2026-10-12 — توحيد عنوان إهداء عيد الميلاد العربي والإنجليزي

- **الخلل:** رسالة الإهداء العربية كانت بلوكة `paragraph` واحدة تتضمن «عيد ميلادي اليوم 🎂» والنص والزر، بينما الإنجليزية تستخدم عنوان `heading` بحجم 1 وتذييلاً منفصلاً.
- **الإصلاح:** في `tgcloud/lib/golden-announcements.js` تحوّل السطر العربي «عيد ميلادي اليوم 🎂!» إلى `heading` بحجم 1، ونُقل «وصلت الك باقة golden ticket» وزر التفعيل إلى `footer`. اللغة الإنجليزية دون تغيير، والعربية تحتفظ باتجاه `is_rtl`.
- **التغطية:** تعديل اختبار `golden-announcements.test.mjs` ليتحقق من بلوكتَي H1 وfooter في كل اللغات المختبرة، وموقع الكعكة والزر والنص واتجاه RTL، مع بقاء الاختبار الخاص بالمطور يستخدم نفس الدالة.
- **النشر:** GitHub فرع `serverless-cleanup` فقط؛ لم تُنشر الوحدات إلى Telegram ولم تتغير قاعدة البيانات أو Cloudflare. يلزم تشغيل `npm run test:ci` قبل `tgcloud push`.

## 2026-10-12 — إصلاح اختبار معاينة إهداء القسيمة

- **العرض:** `npm run test:ci` نجح في 209/210؛ اختبار `developer preview sends one private rich gift announcement with inert activation and no broadcast` فشل عند `deepStrictEqual` رغم تطابق بنية ومحتوى الرسالة.
- **السبب:** اختبار `harness` يُنفّذ الكود داخل `vm` بــ Object/Array prototypes مختلفة عن الكائن المحوّل عبر محاكاة Telegram API إلى بيئة Node؛ `assert.deepEqual` حساس لهذا الاختلاف.
- **الإصلاح:** تحويل الرسالة المتوقعة إلى بيانات JSON عادية في Node قبل المقارنة، مع إبقاء التحقق الدقيق لجميع البلوكات والزر التجريبي كما هو. **لم يتغيّر أي كود إنتاج أو مسار إرسال**.
- **التحقق:** تعديل مرفوع إلى `serverless-cleanup`؛ نتيجة الفحص المحلي الجديد بانتظار `npm run test:ci` من جهاز المستخدم. لا `push` أو `migrate`.

## 2026-10-12 — إزالة زر القسيمة من الترحيب وإضافة اختبار إهداء خاص بالمطور

- **السبب:** كان زر «🎁 قسيمتي الذهبية» مكتوباً مباشرة في `buildWelcomeKeyboard` رغم طلب إزالته؛ زر الإهداء في لوحة المطور طويل، ولا توجد وسيلة لمعاينة الرسالة قبل إصدار الحملة.
- **الترحيب:** إزالة `gift:show` من `tgcloud/lib/welcome.js` نهائياً ضمن لوحة أزرار الترحيب. الاحتفاظ بمعالج `gift:show` لخدمة أزرار الرسائل القديمة دون إنشاء أزرار ترحيب جديدة.
- **لوحة المطور:** تغيير اسم زر الإهداء إلى «🎁 إهداء (مرة بالشهر)» مع الاحتفاظ بمساره الحقيقي `dev:golden:gift`، وإضافة «🧪 اختبار الإهداء» بمسار مستقل `dev:golden:preview`.
- **عزل الاختبار:** `sendBirthdayAnnouncementTest` يتحقق من هوية المطور ويرسل **رسالة غنية واحدة حصراً إلى Telegram ID الخاص به**. يستخدم نفس نص الإعلان العربي/الإنجليزي وإيموجي الكعكة، لكن زر التفعيل يحمل `dev:golden:preview:activate` ويعرض إشعار معاينة غير فعّال. لا يصدر `goldenCampaigns` أو `goldenClaims`، ولا يسجل `goldenBroadcasts` أو ترحيلات/مهام جدولة، ولا يرسل إلى `usageUsers`.
- **الاختبارات:** إضافة اختبارات حصر المستلم بالمطور، رفض غير المطور، تباين زر التفعيل الحقيقي والتجريبي، خلو مخازن الحملة من الأثر، وتحقق إزالة زر الترحيب وظهور زري المطور.
- **النشر:** التغييرات مرفوعة إلى GitHub فرع `serverless-cleanup` فقط؛ لا ترحيل قاعدة جديد ولا نشر Telegram/Cloudflare بعد. يجب فحص `npm run test:ci` ونجاح `tgcloud push` لاحقاً.

## 2026-10-12 — إصلاح استيرادات Telegram Serverless بعد فشل التجميع

- **المشكلة:** بعد تطابق قاعدة البيانات ونجاح 207 اختباراً محلياً، أعاد `npx tgcloud push` الرسالة `Error: Compilation failed` دون تفاصيل. لا تأكيد على نشر أي ملف من الدفعة.
- **المخالفة المكتشفة:** أربعة استيرادات جديدة استخدمت اسم الوحدة `lib/name.js`، بينما صيغة Serverless الموثّقة لاسم الوحدة هي `lib/name` (دون امتداد)، ويُسمح بالامتداد فقط في المسار النسبي مثل `./name.js`. هذه مخالفة محتملة كمسبب لتوقف التجميع، وليست بعدُ إثباتاً نهائياً لسبب استجابة الخادم.
- **الملفات المصححة:** `tgcloud/lib/miniapp-bridge.js` (`subscription-reminders`)، `tgcloud/handlers/message.js` (`subscription-status`)، `tgcloud/lib/subscription-reminders.js` و`tgcloud/lib/subscription-status.js` (`subscription-rich`). حُفظت الاستيرادات النسبية الصحيحة دون تغيير.
- **منع التكرار:** إضافة اختبار `tests/serverless/serverless-import-paths.test.mjs` لرفض اسم وحدة محلية ينتهي بـ`.js` والتحقق من امتداد المسارات النسبية.
- **الخطوة التالية:** سحب الفرع وتشغيل `npm run test:ci` ثم تجربة `tgcloud run` لتشخيص التجميع دون نشر؛ إن ظل الخطأ، اجمع تفاصيل `--debug` بعد مراجعة مخاطره. لا تعاود الترحيل، ولا تستعمل `--force`.

## 2026-10-12 — تصحيح قرار المالك: تعديل الصفحة حسب الاستحقاق لا تاريخ الحفظ

- **توضيح المالك:** المستخدم يستطيع تعديل أي صفحة محفوظة، قديمة أو جديدة، إن كانت ضمن حدود باقته الحالية. إذا تجاوزت هذه الحدود ولم يملك اشتراكاً فعالاً يغطيها، تُقفل عمليات التعديل والحفظ وتغيير الاسم والمزامنة، مع السماح بعرضها وإعادة نشر نسختها المحفوظة دون حذف/تقليص. اشتراك Plus/Golden الموثق قد يعيد فتحها، وتنتهي الصلاحية بانتهاء الاستحقاق.
- **سبب التصحيح:** `isLegacySavedPage` في `tgcloud/lib/saved-page-policy.js` كان يعامل كل صف بــ `quotaVersion < 2` على أنه غير قابل للتعديل ولو كان 1 بلوك فقط. قيمة `quota_version=1` هي علامة ترحيل تاريخية وليست حد صلاحيات.
- **التنفيذ:** إنشاء فاحص `isSavedPageOverQuota` يقارن محتوى DB الموثق بحصة الاستحقاق الحالي المقروءة من Serverless، واحتفاظ `isLegacySavedPage` كاسم بديل للتوافق مع مسارات وجسر الأخطاء الحالية. `legacyPagePublishOptions` يمرّر `technicalOnly` فقط للصفحات المتجاوزة، مع استمرار الحدود التقنية. لا تعديل للسجلات المخزنة.
- **الرسائل والواجهة:** تعديل إشعارات Mini App وعمليات الحفظ/التسمية/المزامنة وخطأ `LEGACY_PAGE_READ_ONLY` والنشر لتوضيح تجاوز الباقة بدل قدم الصفحة، مع إبقاء رمز الخطأ وسمة `legacy_read_only` للتوافق.
- **الاختبارات:** إضافة سيناريو صفحة قديمة ضمن Free تقبل التعديل والمزامنة، وصفحة قديمة بـ12 عموداً لا يسمح Free بتعديلها، ويعيد Plus موثق القدرة على تعديلها، ثم يعيد انتهاء الاشتراك قفلها؛ تحافظ اختبارات حماية النسخة المتجاوزة وأمان النشر على سلوكها.
- **حد التطبيق المصغر:** عرض الواجهة لأهلية Plus/Golden ما يزال يحتاج مزامنة كاملة مع اشتراكات Serverless؛ بوابة Serverless تُجري القرار الفعلي عند الحفظ. تظل أدوات بعض حصص Mini App معتمدة على بيانات Cloudflare/القسائم حالياً.
- **التحقق:** تغييرات GitHub فقط، ولم تُشغّل مجموعة `npm test` بعد هذا التعديل. الفحص النهائي ينتظر السحب والتشغيل على جهاز المستخدم.
- **النشر:** لا `tgcloud migrate` أو `tgcloud push`، ولا نشر Cloudflare حتى تمر الاختبارات ويفحص أثر الترحيل.

## 2026-10-12 — تصحيح آخر 4 اختبارات بعد 201/205 ناجحة

- **سجل المستخدم:** `npm test` بعد تحديث 12 أكتوبر أعطى 205 اختبارات، 201 ناجحاً و4 فاشلة.
- **الخلل الفعلي:** `publishBridgePageContent` في `tgcloud/lib/publish.js` يستدعي `publishErrorDetail` دون تعريف أو استيراد. عند فشل تكوين رسالة غنية (مثل `EDITOR_LIMIT`)، يتحول السبب الأصلي إلى `ReferenceError` ويخفي التفسير الصحيح. تصحيح: تصدير `publishErrorDetail` من `tgcloud/lib/publish-errors.js` الذي يستخدم نفس منطق استخراج التفاصيل، واستيراده في `tgcloud/lib/publish.js`؛ يُعاد الآن رمي الخطأ الأصلي بعد التفريق بين تنسيق/وسائط.
- **اختبارا قديمان:** عينات المطور في `tests/serverless/developer-limits.test.mjs` صارت 51 بلوكاً لكن فحص طول مزامنة الصفحة وحفظها ظل يتوقع 31. جرى توحيد المتوقع إلى 51 دون تغيير حدود المنتج.
- **اختبار وقائي:** `tests/serverless/publish-errors.test.mjs` يحتوي سيناريوهات استخراج خطأ الحد النصي وتفاصيل `response.description` وأخطاء الوسائط.
- **التحقق:** تمت قراءة أحدث ملفات الفرع، وتجربة دالة التصنيف مباشرة في JavaScript، والتحقق من ربط import ومن تطابق الفرضيات. جميع الفحوص المحددة نجحت. **لم** يتسن تنفيذ `npm test` الكامل أو `test:ci` هنا بسبب عدم توفر نسخة المشروع في بيئة Node؛ النتيجة النهائية تنتظر تشغيل المستخدم.
- **النشر:** تعديل مصدر GitHub على فرع `serverless-cleanup` فقط. لا ترحيل قواعد بيانات ولا نشر Serverless/Cloudflare.

## 2026-10-12 — تدقيق إخفاقات اختبارات الاشتراكات والقيود (بعد 182/202)

- **السبب:** 20 اختباراً فاشلاً بعد تحديث A1. منها اختبارات تتوقع حدوداً أُلغيَت (30 بلوك، 50 صفاً/25 عموداً، 32,000 حرف ذهبي)، أو تسمح بتعديل محتوى محفوظ قديم، بينما `md_files/sups.md` يعتمد Free 50/20,000 وGolden 32,768 وحماية الصفحات القديمة للعرض/النشر فقط.
- **حد الثقة:** Cloudflare يفحص سقف نقل Telegram التقني فقط، ولا يمنح حصة Free/Plus/Golden من مدخلات المتصفح؛ Telegram Serverless هو جهة قرار الاشتراك والنشر. تم تعديل اختبارات التكامل للتحقق من هذا الفصل بدلاً من افتراض أن Cloudflare يرفض تجاوز 20,000 حرف.
- **إصلاح إنتاج حقيقي:** `tgcloud/lib/editor-renderer.js` صار يعيد فحص حصص الباقة على **حمولة Rich النهائية** بعد إضافة تذييل الحقوق وأزرار التنقل؛ وكان يفحص الحدود التقنية العامة فقط بعد إضافتها. المطوّر وإعادة نشر صفحة قديمة موثقة يستثنيان من حصص المنتج دون استثناء من سقف Telegram.
- **إصلاحات الاختبار:** تحميل `plan_catalog.generated.js` قبل `subscription_offers.js` في اختبار واجهة الباقات، واحترام استيرادات `lib/name.js`، وتصحيح افتراضات حدود النص والجداول والبلوكات وتجمد الصفحات القديمة واختبار إضافة إيموجي عند 20,000 حرف. تمت إضافة 3 اختبارات لمنع تجاوز الحصص النهائية.
- **التحقق المنفذ:** مقارنة تغييرات الفرع، فحص تركيب ملفات الاختبار الممكنة، تقييم واجهة العروض والكتالوج في V8 بدون اتصال خارجي، وتقييم فاحص الحمولة النهائية بسيناريوهات Free 50+تذييل، Free 20k+تذييل، Plus وDeveloper وLegacy. نجحت هذه الفحوص المركزة.
- **غير مثبت بعد:** تشغيل `npm test` الكامل بعد التصحيحات في Node، وGitHub Actions وبيئة Telegram الفعلية. سجل الجهاز السابق كان 182 ناجحاً/20 فاشلاً **قبل** التصحيح؛ لا تدّعِ نجاح 205/205 دون إعادة تشغيله.
- **النشر:** تحديثات على GitHub فرع `serverless-cleanup` فقط؛ **لا** `tgcloud migrate` أو `tgcloud push` أو Cloudflare production deploy.

## 2026-10-12 — فصل فحص الاشتراكات اليومي عن جدولة المنشورات
- **القرار:** Cron كل دقيقة يبقى فقط لمهام النشر والجدولة المسجلة؛ Cron `0 9 * * *` يبدأ فحص انتهاء الاشتراكات مرة يومياً (09:00 UTC / 12:00 بغداد).
- **تفادي فقدان الرسائل:** إذا لم تكتمل دفعة اشتراكات (10 مدفوعة + 10 قسائم) أو بقيت إعادة محاولة مؤكدة 429، يُسجّل Serverless مهمة متابعة `sub_` في نفس جدول D1 للمجدول؛ Worker يوقظها فقط عند استحقاقها، ويحفظ Serverless مؤشرات تقدم مستقلة لليوم ونسخ المهمة.
- **السبب:** إلغاء نبض الاشتراكات كل دقيقة من دون تخفيض الحد اليومي إلى عشرة مستخدمين فقط.
- **ملفات:** Worker + wrangler.toml + lib/subscription-reminders.js + miniapp-bridge.js + functions/_lib/scheduling-reminders.js + اختبارات ووثائق.
- **اختبارات:** فحص بنية JavaScript وسلوك مشغل Worker بالدقيقة واليوم وفحص قبول RCB1 للدفعات. محاكاة Serverless بقاعدة وهمية (13 اشتراكاً مستحقاً) أرسلت 10 ثم 3، وإعادة تسليم الدفعة المكتملة لم تكرر أياً من الرسائل. اختبار CI والإنتاج لم يُنفذا بعد.
- **النشر:** GitHub فقط. لا نشر إلى Cloudflare ولا ترحيل/رفع Telegram Serverless في هذه الخطوة.

## 2026-10-12 — Cloudflare from browser
- **Change:** Added Chrome-only guide for D1 Console, GitHub import, DB binding, secret and Cron setup.
- **Reason:** Owner explicitly requested Cloudflare website configuration, not CLI steps.
- **Files:** docs/cloudflare-worker-from-browser.md and log.md.
- **Tests:** Checked against official Cloudflare instructions; no live deployment.
- **Deployment:** GitHub only.

## 2026-10-12 — 429 retry recovery
- **Change:** Retry definitively rate-limited subscription reminders with a bounded delay (five attempts), but never replay unknown Telegram outcomes.
- **Reason:** Avoid losing five-day reminders to transient API throttling.
- **Files:** lib/subscription-reminders.js, schema.js, rollout docs.
- **Tests:** JavaScript syntax check. CI run was rejected before starting steps; live checks pending.
- **Deployment:** GitHub only. Migrations and Worker setup still required.

## 2026-10-12 — /sup and five-day subscription expiry notices
- **Change:** Added H1/Details/Footer /sup, complete 20-language display
  catalog, trusted paid/gift expiry inspection and independent per-user notices
  through the existing authenticated Cloudflare Cron→RCB1→Serverless relay.
  Added bounded daily scans and a no-blind-retry delivery ledger.
- **Reason:** Each person's 5-day expiry window differs; status must report
  their actual effective plan, not a client-supplied tier.
- **Files:** tgcloud/lib/subscription-{copy,rich,status,reminders}.js,
  handlers/message.js, lib/miniapp-bridge.js, schema.js,
  workers/schedule-reminders/worker.js, new subscription tests and rollout docs.
- **Tests:** Source/static validation pending GitHub CI and live bot/Cloudflare
  execution. GitHub update does not run tgcloud migrate/push or deploy Worker.
- **Deployment:** GitHub branch only; production migration and Cron setup remain pending.

# 2026-10-12 — إعلان هدية عيد الميلاد بالعربي والإنكليزي

- طلب المالك إرسال إعلان بسيط تلقائياً عند إصدار الهدية، بدلاً من الاكتفاء بإظهار القسيمة في الترحيب. أضيف `golden-announcements.js` وربطه بزر الإصدار والتذكير الموثّق RCB1. لم تُصدر هدية ولم تُرسل رسائل حقيقية خلال التطوير.
- العربي للغة `ar` ولهجاتها: «عيد ميلادي اليوم 🎂! وصلت الك باقة golden ticket فعلها.» كلمة «فعلها» زر غني داخل النص يفعّل القسيمة مباشرة. باقي اللغات تستلم عنوان H1 (`size:1`) «It's my BIRTHDAY 🎂,» ثم footer بالنص المطلوب وكلمة `Active` زر غني. الإيموجي Custom Emoji ID هو `5427201480740321598`. لا تُرسل علامات Markdown أو وسوم footer كنص خام.
- رد التفعيل وحالة القسيمة أصبحا عربيين/إنكليزيين أيضاً. الضغط لا يتجاوز نافذة ١٢ ساعة أو حماية التفعيل المكرر الموجودة.
- أضيفت جداول `golden_broadcasts` و`golden_announcements` في Serverless. طابور دائم بترتيب user_id وقاطع زمني، دفعات أقصاها ٢٠ مستلماً وميزانية ٨ ثوانٍ بين الطلبات؛ Cloudflare يحمل `gfb_` ومعرّف النسخة/الوقت فقط ويوقظ الدفعة التالية. يبقى مصدر المستخدمين والنصوص Serverless. يلزم ترحيل المخطط قبل رفع الكود، وإعداد ونشر Worker الموجود قبل عمل الإعلان الآلي.
- سجلات مستقلة تمنع إعادة إرسال الإعلان عند تكرار التذكير أو استئناف عملية منقطعة. الحظر/الرفض يتسجل failed ويستمر الباقون؛ الطلب غير المؤكد يتسجل uncertain دون إعادة إرسال عمياء. 429 يحفظ المستلم retry ويؤجل الدفعة حسب retry_after. كل هذه الحالات محفوظة للمراجعة؛ لا يوجد ضمان exactly-once عبر Telegram/DB. التذكير القديم يعيد تسجيل النسخة الجديدة ولا يعيد الدفعة. لا نرسل إعلان تفعيل بعد انتهاء نافذته؛ عند جمهور كبير أو أعطال قد تنتهي النافذة قبل اكتمال الجميع.
- انتهاء الهدية: تم اختبار سحب إزالة الحقوق التي كانت ناشئة عن الهدية تلقائياً مع الرجوع للمجاني، والرجوع إلى Plus إن كان الاشتراك ما زال صالحاً. شراء إزالة الحقوق المستقل لا يُحذف، وPlus الصالح يبقى شاملاً لها وفق السياسة المعتمدة. لا نمدد اشتراك Plus أو نعيد اشتراكاً انتهت مدته أثناء الهدية.
- التحقق: ١٦/١٦ اختباراً مركّزاً ناجحاً، يشمل اللغة وH1/footer والزر والإيموجي والتكرار/التوازي والدفعات و429 والحظر والانقطاع والانتهاء وإزالة الحقوق. `npm run test:ci`: ١٧٦/١٩٥ ناجحاً، نفس ١٩ فشلاً سابقة دون فشل جديد؛ فحص Mini App وتوليد الباقات ناجحان. `git diff --check` ناجح.
- النشر: تغييرات مصدر إلى فرع `serverless-cleanup` ضمن الإذن المستمر بالرفع. Telegram/Cloudflare Worker لم ينشرا ولم تجر migrations إنتاجية؛ لم تُثبت تجربة إعلان واقعية أو نجاح Pages auto-deploy. تشغيل الإعلان ليس جاهزاً بمجرد رفع ملفات Serverless دون تهيئة Worker والمخطط.

# 2026-10-12 — قسيمة ذهبية شهرية يفعّلها المستخدم يدوياً

- **تأكيد الرفع:** تم تحديث فرع GitHub `serverless-cleanup` إلى `c7c26802c162485c4f4513ae76e767ecec68eadc` عبر اتصال GitHub بعد موافقة المالك. تعذر Git CLI لغياب بيانات تسجيل الدخول المحلية. لم يُنشر Telegram أو Worker ولم يُثبت نجاح Pages auto-deploy.

- **حالة الرفع:** اكتملت التعديلات والـcommit محلياً. رفضت المراجعة الآلية `git push origin serverless-cleanup` لأن وجهة GitHub لم تُعتبر مصرحاً بها صراحةً لنقل تغييرات المصدر. لم نتجاوز الرفض أو نستخدم وسيلة رفع بديلة. الفرع المحلي متقدم بcommit واحد؛ وافق المالك صراحةً بتاريخ ٢٠٢٦-١٠-١٢ على الرفع إلى `ihhaiq/Rich-Customize` / `serverless-cleanup`؛ أُجيزت إعادة محاولة الرفع إلى هذه الوجهة. لا تعني هذه الموافقة نشر Telegram أو ترحيل قاعدة الإنتاج.

- فحص الفرع `serverless-cleanup` عند `e48fa77`: لم تكن ميزة هدايا Golden Ticket موجودة.
- أضيف زر إهداء للجميع في لوحة المطور، محمي بهوية المطور ومنع ذري لتكرار الإصدار خلال الشهر التقويمي بتوقيت بغداد. القسيمة تشمل الحسابات المسجلة في `usage_users` قبل الإصدار؛ لا ننفذ حلقة إرسال جماعي أو تفعيل تلقائي. زر «قسيمتي الذهبية» في الترحيب يعرض العرض وزر تفعيله.
- نافذة التفعيل ١٢ ساعة بالضبط. سجل حملات دائم يجعل العرض متاحاً لكل مستحق دون إدخال آلاف السجلات؛ سجلات التفعيل مستقلة لكل مستخدم ومفتاحها الشهر/المستخدم يمنع إعادة التفعيل والتمديد عند الطلبات المتزامنة. تُقرأ حملة الشهر السابق أيضاً عند عبور نهاية الشهر.
- مدة الهدية ٣٠ يوماً من تفعيل المستخدم، استناداً إلى مدة Golden المعتمدة في sups.md لأن الطلب لم يحدد مدة أخرى. المدة ظاهرة قبل التفعيل. لا تعدّل الهدية الاشتراك المدفوع أو حقوق إزالة العلامة الدائمة؛ عند انتهائها يعود الاستحقاق المدفوع الساري أو المجاني.
- أضيفت `golden_campaigns` و`golden_claims` إلى مخطط Serverless. مصدر الاستحقاق الحقيقي هو هذه الجداول مع فحص الوقت عند كل طلب؛ التأخر في Cron لا يطيل الاشتراك.
- يستخدم Cloudflare مسار التذكير RCB1 الموثّق الحالي بمعرّفات `gft_` عشوائية وتواريخ فقط، لموعد إغلاق العرض ولانتهاء كل تفعيل منفصل. دعم ٣٠ يوماً لهذه المعرفات فقط مع إبقاء حد المنشورات ٤ أيام. بقيت مصادقة المجموعة وهوية البوت وACK وإعادة المحاولات كما هي. يعاد إرسال التسجيل غير المؤكد عند فتح حالة القسيمة؛ ACK يثبت التسجيل. تذكير مبكر لا ينهي القسيمة؛ التكرار آمن. الباقي يُحسب من وقت الانتهاء ولا يخزن كعداد يتقادم.
- رد الصفحات الموثّق يحمل `Golden_ticket` وحالة القسيمة. Cloudflare يتحقق من ربط الرد بمعرّف الطلب والمستخدم ويخزن مرآة استحقاق محدودة في `golden_gift_access`؛ إنشاؤها آمن وغير هدّام عند أول رد صحيح. `/me` وحصص حزم الإيموجي يقرآن هذه المرآة مع فحص الانتهاء. لا يوجد مسار يقبل Golden_ticket من المتصفح. يحافظ Serverless على إعادة فحص الاستحقاق عند الحفظ والنشر.
- تحميل الصفحات عند بدء Mini App يرجع إلى Serverless لتحديث حالة الهدية بدلاً من الاكتفاء بمرآة الصفحات. تظهر ملاحظة العرض المتاح أو تاريخ انتهاء التفعيل، وتتحدث حصة الأعمدة والحزم. العلم في الواجهة للعرض فقط؛ تغيير قيمته لا يمنح صلاحية سيرفر.
- الملفات: `tgcloud/lib/golden-gifts.js`، مخطط القاعدة، استحقاقات المحرر، لوحة المطور، الترحيب، معالج الأزرار، جسر Mini App؛ مسارات Cloudflare me/pages/bridge ومرآة الهدية وحزم الإيموجي والتذكير؛ `app/miniapp_static/app.js`؛ اختبار القسائم وتهيئة مفاتيح الاختبار.
- التحقق: ٩/٩ اختبارات مركّزة للقسائم والتذكير ناجحة، تشمل الصلاحيات والتكرار والحد الزمني وتواريخ مستقلة والرجوع للاشتراك المدفوع وACK وفشل Cloudflare المغلق. `npm run test:ci`: فحص توليد الباقات وفحص Mini App ناجحان؛ المجموعة الكاملة ١٨٨ اختباراً، ١٦٩ ناجحاً و١٩ فاشلاً. شُغّلت نسخة الأساس في worktree منفصل: نفس أسماء الفشل الـ١٩ قبل التعديلات (١٦٣/١٨٢ ناجحة). لا ندّعي أن المجموعة العامة خضراء. `git diff --check` ناجح.
- حالة التشغيل: تغييرات مستودع فقط، لا منح فعلي للمستخدمين ولا رسائل جماعية أثناء التنفيذ. ترحيل مخطط Serverless مطلوب قبل رفع كوده بواسطة المالك. لم يتم `tgcloud migrate` أو `tgcloud push`، التزاماً بتعليمات المستودع. Worker التذكير الموجود يحتاج استبدال قيم D1 الافتراضية وربط أسرار B2B ونشره؛ لا تتوفر إعداداته الإنتاجية هنا. Pages Git auto-deploy مسموح، لكن نجاح نشر Pages/Worker/Telegram واختبار RCB1 الحقيقي لم يُثبت في هذه الجلسة. لا تعادل الاختبارات المحاكية تجربة تزامن قاعدة الإنتاج.

# سجل التعديلات — Rich Customize

## 2026-10-11 — إصلاح زر الإرسال المعطّل بعد فتح صفحة محفوظة
- **السبب:** محرر العرض الحي `live_preview.js` يستبدل `renderBlocks()` ولا يستدعي `updatePublishValidity()` بعد فتح الصفحة أو استعادة المسودة؛ فيبقى `sendBtn` معطلاً من القيمة الابتدائية في HTML، حتى لو كانت ملفات GIF مرفوعة وحالة البلوك «جاهز للإرسال». إذا كان بلوك آخر ناقصاً كان زر الإرسال يُعطّل صامتاً ولا يشرح السبب.
- **التصحيح:** إعادة تقييم صلاحية النشر فور انتهاء رسم البلوكات؛ زر الإرسال يبقى قابلاً للنقر مهما كانت نتيجة الفحص، لكنه **لا يتجاوز الفحص**. عند وجود مشاكل ينفذ `openPublishIssues()` ويعرض موضع البلوك وسبب المنع، مع مؤشر بصري على زر الإرسال، بدلاً من تعطيل الزر؛ إذا كان المحتوى صالحاً يفتح وجهات النشر بالطريقة الاعتيادية.
- **الأمان:** لا تغيير على فحص الحمولة قبل الإرسال ولا على سياسات الباقات أو خادم Telegram. إزالة صفة `disabled` القديمة من HTML وتحديث كاش ملفات `app.js` و`live_preview.js` و`send_validation.css` إلى `0.3.97`.
- **الملفات:** `app/miniapp_static/app.js`، `live_preview.js`، `send_validation.css`، `editor.html`، `tests/serverless/publish-validation.test.mjs` و`md_files/log.md`.
- **الاختبارات:** نجحت ١٠ من ١٠ فحوص محاكاة JavaScript، تشمل صفحة GIF صالحة وبلوك ناقص بجانبه وإعادة الفحص عند فتح صفحة أو مسودة، ونجح فحص صياغة JavaScript لملفي الواجهة. لم يُجر اختبار جهاز Android WebView حقيقي أو `npm test` الكامل.
- **النشر:** رفع GitHub على فرع `serverless-cleanup` فقط؛ التغيير واجهة Mini App ولا يحتاج `tgcloud push`. نشر Cloudflare Pages التلقائي غير مؤكّد.

## 2026-10-11 — تعيين موضوع نشر المجموعة بواسطة /default
- **الطلب:** مسؤول المجموعة يرسل `/default` داخل الموضوع ليصبح الوجهة الوحيدة للمنشورات. إذا كان موضوع مجموعة مغلقاً أو غير متاح تُتخطى تلك المجموعة وتكمل المجموعات الأخرى مع سبب فشل واضح.
- **التنفيذ:** إضافة `lib/forum-topics.js` و`forum_topic_defaults` بمفتاح `chat_id` لتخزين `thread_id` واحد مشترك لكل المجموعة؛ قبول مالك المجموعة/المسؤول الحقيقي والمسؤول المخفي الذي ينشر باسم المجموعة، ورفض غير المسؤول. دعم `/default status` و`/default clear`، ودعم التعيين الصريح لـ«العام» بلا إعادة توجيه تلقائي إليه عند فشل موضوع آخر.
- **مسارات الإرسال:** إضافة `message_thread_id` إلى `sendRichMessageSafe` في النشر المباشر وRCB1، واستعلام الإعداد عند موعد نشر الجدولة. لا يتغير مسار القنوات والمجموعات العادية. موضوع المنتدى الذي لا يملك إعداداً يرجع `PUBLISH_TOPIC_NOT_SET` ويمنع النشر لهذه المجموعة فقط.
- **التقارير:** `publish-errors.js` يعرض أسباب `TOPIC_CLOSED` و`TOPIC_DELETED` و`THREAD_INVALID` وعدم ضبط الموضوع برسائل عربية وإنجليزية، مع تعليمات `/default`. قائمة نتائج النشر المباشر تُظهر أسباباً لما يصل إلى ١٢ وجهة. الجداول تحتفظ بـ`failure_code` لكل وجهة وتعرض عنوان المجموعة وسبب الإخفاق في رسالة النتيجة النهائية؛ الأخطاء المتوقعة لا تُرسل كإنذارات برمجية غامضة.
- **الملفات:** `tgcloud/schema.js`، `lib/forum-topics.js`، `handlers/message.js`، `lib/publish.js`، `lib/scheduled-publish.js`، `lib/publish-errors.js`، `lib/miniapp-bridge.js`، `app/miniapp_static/app.js`، `tests/serverless/harness.mjs`، `tests/serverless/forum-default.test.mjs`، `md_files/docs/forum-default.md`.
- **التحقق:** ١٤ فحص V8 مستقل نجح لحالات تعيين وتغيير الموضوع والصلاحيات والإلغاء والإرسال للوجهة المختارة دون تحويل ضمني، مع إضافة ٦ اختبارات Node انحدارية تشمل المسارات الثلاثة. لم تُجرَ اختبارات `npm test` الكاملة أو اختبار تليكرام/Cloudflare على الإنتاج.
- **النشر الآمن:** رفع GitHub فقط. **لا `tgcloud push` قبل مراجعة وتنفيذ `tgcloud migrate`** بسبب جدول `forum_topic_defaults` وعمود `scheduled_post_destinations.failure_code` الجديدين، ومراعاة ترحيل `quota_version` السابق في نفس الفرع. لا تغييرات على قاعدة الإنتاج أو Webhooks خلال هذه الجلسة.

## 2026-10-11 — اعتماد /default لمواضيع المجموعات والتخطي الجزئي
- **الهدف:** مسؤول المجموعة يرسل `/default` داخل موضوع فيربطه بشكل مشترك بجميع منشورات المحرر الغني لتلك المجموعة. `/default status` يعرض الوجهة، و`/default clear` يلغيها ويوقف النشر إليها حتى تعيين موضوع جديد. المسؤول المجهول مدعوم بعد التحقق من `sender_chat` الحقيقي للمجموعة.
- **الحماية:** التخزين الخادمي في جدول `forum_topic_defaults` حسب `chat_id` وليس لكل مستخدم. مجموعة بمواضيع دون إعداد تُرفض `PUBLISH_TOPIC_NOT_SET`، ولا يوجد تحويل تلقائي إلى General. يمكن للمسؤول تعيين General صراحة (الموضوع 0 أو 1). لا يُقبل معرّف موضوع يختاره العميل أثناء النشر.
- **النشر المتعدد:** في مسار `r:postsend` كل مجموعة مستقلة؛ `TOPIC_CLOSED` أو حذف الموضوع أو تعطل المعرف تؤدي إلى تخطي المجموعة فقط وتظهر نتائج الناجح/الفاشل وأسباب فشل الوجهات دون فقدان الوجهات الأخرى.
- **Mini App والجدولة:** تطبيق `message_thread_id` إلى `sendRichMessage` من قاعدة بيانات Serverless فقط؛ رسائل فشل RCB1 الخاصة بالمواضيع متوقعة وقابلة للفهم ولا تستدعي تنبيه مطور عن عملية مستخدم عادية. الجدولة تعيد حل الموضوع الافتراضي عند التنفيذ، وتحتفظ برمز الخطأ وتُرسل تقريراً تفصيلياً لصاحب المهمة للمجموعات الناجحة والفاشلة.
- **الفحص:** أُضيفت `tests/serverless/forum-default.test.mjs`، ونجحت 10 تجارب V8 مع قاعدة بيانات وAPI محاكيين لسيناريوهات المسؤول وتغيير الإعداد والعام والإلغاء والموضوع المغلق. **اختبارات Node الشاملة، Telegram الحي وترحيل قاعدة البيانات لم تُنفذ بعد.**
- **النشر:** رفع GitHub فقط على `serverless-cleanup`؛ يتطلب `tgcloud push` ثم مراجعة `tgcloud migrate` (جدول `forum_topic_defaults` إضافة آمنة غالباً، لكن يجب فحص كل فروقات المخطط). لم تُشغّل أوامر نشر أو تعديل قاعدة الإنتاج في هذه الجلسة.

## 2026-10-11 — إصلاح اختفاء رأس المحرر واتساع الجدول
- **العطل المرئي:** بعد إصلاح التمرير كانت إزاحة `scrollLeft` تُطبّق على `editor-topbar` و`composer-toolbar` بالكامل، فاختفيا أفقياً من شاشة الهاتف. `telegram-table-contextual` كان بارتفاع محدود (`380–420px`) مع تمرير عمودي داخلي وحدود مستديرة، فيظهر الجدول كمربع مستقل ويُحدث انفصالاً بصرياً وفراغات عند تحريك الصفحة.
- **التصحيح:** إلغاء `--table-pan-x` والتحويل الأفقي لرأس المحرر؛ تثبيت `.editor-head` في أعلى منطقة التحرير مع عرض لا يتجاوز الشاشة. إبقاء الجدول داخل تدفق الصفحة الطبيعي من غير `max-height` أو صندوق مستقل، وإزالة الحدود الخارجية المستديرة. التمرير الأفقي محصور بالأعمدة، والتمرير العمودي للصفحة نفسها؛ التمرير الأفقي اليدوي لا يوقف سحب الصفحة عمودياً.
- **العرض:** ضبط `editor-main` إلى عرض أقصى `720px` وهوامش شاشة الهاتف، تصفير `min-width` لعناصر التخطيط، وتحديد عرض خلايا الجدول إلى نحو `88px` على الهاتف حتى لا توسّع مساحة التحرير؛ إزالة الخلفية الصندوقية ل`content-flow` عند احتوائه على جدول فقط من دون تغيير الصفحات النصية.
- **الثبات:** الحفاظ على وظيفة النقر الأول لتحديد الخلية، والنقر الثاني للتحرير، ومنع الفتح عند السحب. لا تغيير في بيانات المستخدمين أو حدود الباقات.
- **الفحص:** ٨ اختبارات تفاعلية عبر V8 محاكاة ونجاح فحص JavaScript النحوي؛ لا يُعدّ هذا اختبار WebView فعلي على أندرويد أو اختبار `npm test` الكامل.
- **النشر:** تغييرات على `app/miniapp_static/app.js` و`live_preview.js` و`table_touch_scroll.css` و`editor.html` و`tests/serverless/miniapp-table-scroll.test.mjs` على فرع `serverless-cleanup` في GitHub؛ لا تنفيذ `tgcloud push` أو `migrate`. إصدار الأصول `0.3.96` لتجاوز الكاش.

## 2026-10-11 — إصلاح سحب الجدول الفعلي في Mini App
- **المشكلة المثبتة:** `live_preview.js` كان يستبدل `tableEditor` الموجود في `app.js` مرتين، ومنها `enhancedTableEditor` الذي يربط تحديد الخلية مباشرة بـ`pointerdown` ويُنشئ عناصر `contenteditable=true`. إصلاح `table-preview` السابق لم يؤثر على الجدول الذي يظهر للمستخدم.
- **الحل:** أصبح `enhancedTableEditor` هو محرر الجدول الحي الوحيد. تعيين `contenteditable=false` حتى النقر الثاني، والنقر الأول يحدد الخلية ويعرض مقبض خياراتها. سحب الإصبع بإزاحة تزيد على ٧px يتعامل معه `touchmove` غير سلبي ويضبط `scrollLeft/scrollTop` صراحةً (مع `preventDefault`)، ويمنع النقرات الوهمية وتحديد النص أثناء السحب.
- **الواجهة:** حاوية `telegram-table-contextual` بتمرير مستقل بالاتجاهين وارتفاع محدود، و`touch-action:none` لدعم لمس WebView، وحساب `scrollLeft` بإحداثيات LTR ثابتة مع بقاء خلايا الجدول بترتيب RTL. الرأس الأول ثابت عمودياً ويتحرك أفقياً مع الجدول. حفظ موضع التمرير عند إعادة الرسم، وإبقاء الصفحة القديمة بوضع قراءة فقط.
- **منع التعارض:** استثناء `.telegram-table-contextual` من معالج الضغط المطوّل العام، وإزالة تعريف جدول سابق مكرر من `live_preview.js`. رفع إصدار أصول `live_preview.js` و`interactions.js` و`table_touch_scroll.css` لكسر كاش WebView.
- **الاختبارات:** نجحت ٧ اختبارات بمحاكاة DOM وV8 تشمل سحب لمس أفقي/عمودي، منع `click` بعد السحب، النقر الأول والثاني في المحرر الفعلي، إعادة موضع التمرير، والتحقق من ملفات CSS والاستثناءات. لا يثبت ذلك نجاح اللمس على جهاز حقيقي، ولا يُعد بديلاً عن `npm test` الكامل.
- **النشر:** التغييرات على GitHub فرع `serverless-cleanup`، دون إجراء `tgcloud push` أو `migrate`؛ لا يوجد تأكيد في هذه الجلسة لاكتمال نشر Cloudflare Pages التلقائي.

## 2026-10-11 — مزامنة العنوان والشريط مع الجدول وتحسين اللمس والزجاج
- **السبب:** صور الهاتف أظهرت أن العنوان والشريط العلوي لا يتزامنان أفقياً مع سحب الجدول، وأن لوائح إعدادات الخلية والبلوك تظهر كطبقة شفافة أكثر من اللازم، وأن أول نقرة على الخلية تدخل وضع التحرير أو تحديد النص.
- **السلوك الجديد:** أثناء تمرير الجدول أفقياً يحدث إزاحة متزامنة للعنوان والشريط العلوي بواسطة `--table-pan-x`، دون تغيير حركتهما العمودية. صف عناوين الجدول يظل داخل نفس جدول التمرير، ويتحرك معه أفقياً ويثبت رأسياً.
- **اللمس:** أول نقرة تختار الخلية وتبرز حدودها فقط، والثانية تبدأ تعديل النص؛ السحب داخل الجدول يمرر أفقياً أو عمودياً دون الضغط المطول أو اختيار النص. تستعاد حالة تحديد الخلية والتمرير بعد إعادة الرسم وتُصفّر عند فتح صفحة أخرى.
- **المظهر:** طبقة زجاجية داكنة متزنة (صبغة 86%، blur 19px، حافة ولمعة ظل خفيف) لقوائم البلوكات والخلايا وأدواتها، بدل صبغة 6% السابقة التي كانت تُظهر صفوف الجدول بوضوح خلف القائمة. يبقى محتوى الجدول دون blur.
- **الملفات:** `app/miniapp_static/app.js`، `table_touch_scroll.css`، `editor.html`، `tests/serverless/miniapp-table-scroll.test.mjs`، `md_files/log.md`.
- **الاختبارات:** فحص JavaScript النحوي مرّ، ونجحت ٤ اختبارات سلوك DOM محاكية: حجم ٢٠×٢٦، فصل النقر عن السحب، تحديث التمرير ونمط الزجاج، ومزامنة إزاحة العنوان والأدوات. لا يمكن اعتبارها اختبار WebView الفعلي على هاتف سامسونغ.
- **النشر:** التغييرات على فرع `serverless-cleanup` في GitHub فقط؛ لا `tgcloud push` ولا `migrate` لهذه التعديلات الأمامية. تحقق من نشر Cloudflare Pages المرتبط بالفرع.

## 2026-10-11 — إصلاح تمرير جداول المحرر في الهاتف
- **المشكلة:** جداول Mini App طويلة وعريضة بلا نطاق تمرير عمودي مستقل. كل خلية `input` تتلقى لمس المستخدم مباشرة، فيتحول السحب إلى تحديد نص أو تفعيل خلية. معالج الضغط المطول العام للبلوك يتدخل أيضاً.
- **الحل:** `tableEditor` يبني `thead` من أول صف و`tbody` لبقية الصفوف؛ واجهة الجدول داخل `table-preview` متحركة أفقياً وعمودياً وبحد ارتفاع متناسب مع شاشة الهاتف. رأس الجدول ثابت أثناء التمرير العمودي، بدون ضغط ٢٠ عموداً بعرض الهاتف.
- **لمس وتعديل:** طبقة غير مرئية لكل خلية غير نشطة تجعل السحب يمرّ للتمرير الطبيعي. النقر المتعمد أو Enter/Space يفعّل `input` للتحرير؛ عند تحريك الجدول يعود لوضع التمرير. استثناء التفاعل داخل `table-preview` من ضغط البلوكات المطوّل وقائمة سياقها العامة مع استمرار زر إجراءات البلوك.
- **تجربة الاستخدام:** حفظ موضع التمرير الأفقي والعمودي عند إعادة رسم الجدول بعد إضافة صف أو عمود، إظهار تلميح عربي/إنجليزي، والحفاظ على بيانات الخلايا وحدود الباقات. أُضيفت `table_touch_scroll.css` بالأولوية الأخيرة لتتجاوز `overflow-y:visible!important` السابق في نمط سطح المكتب.
- **الملفات:** `app/miniapp_static/app.js` و`interactions.js` و`editor.html` و`table_touch_scroll.css` و`tests/serverless/miniapp-table-scroll.test.mjs`.
- **الفحص:** اختبار تفاعلي بواجهة DOM محاكية لجدول ٢٠×٢٦ نجح: السحب لا يركز الخلية، النقر يركزها، التعديل يغيّر البيانات، والتمرير يخرج من التحرير. أضيفت ٣ اختبارات Node للانحدار؛ **لم يثبت تشغيل Node الكامل أو اختبار WebView على جهاز حقيقي**.
- **النشر:** تعديل GitHub على `serverless-cleanup` فقط؛ تحقق من نجاح نشر Cloudflare Pages تلقائياً، ولا يحتاج تعديل السيرفليس هذا وحده إلى `tgcloud push` أو `migrate`.

## 2026-10-10 — تعميم قيود الباقات وحماية كل الصفحات القديمة
- **التغيير:** تحديث السياسة إلى ٥٠/٢٠٠/٥٠٠ بلوك، ٤/٨/١٦ مستوى تداخل، ١٠/٢٥/٥٠ وسيط، ٨/١٢/٢٠ عموداً، ٢٠٬٠٠٠/٢٥٬٠٠٠/٣٢٬٧٦٨ حرفاً. تطبيق فحص موحد قبل تغيير بيانات جلسة المستخدم وقبل حفظ/نشر/استيراد الصفحات، مع حساب صفوف الجدول وعناصر القوائم والوسائط المتداخلة.
- **حماية القديم:** إضافة `rich_pages.quota_version` الافتراضي `1`: جميع الصفحات الموجودة تبقى لنشر النسخة الأصلية فقط، ولا يُسمح بتعديل محتواها أو أزرارها أو اسمها. صفحات الإنشاء الجديدة في البوت والجسر تكتب الإصدار `2`. إعادة نشر `v1` تستخدم حمولة DB الموثقة، لا بيانات العميل، وتتجاوز حصص المنتج لا الحدود التقنية لتليكرام. النسخ الاحتياطية الخارجية لا ترفع إصدار الصفحة إلى `2`.
- **المسارات:** فحص مركزي في `updateEditorSession` لتغطية مسارات التعديل والتراجع والترتيب التي تتخطى فحوص الأزرار، وحواجز مبكرة لرسائل وأزرار تحرير `v1`. ربط إعادة النشر في البوت وMini App والإنلاين/الضيف والجدولة، وإيقاف المزامنة التلقائية والتسمية للموروث، وعرض تنبيه واضح بدل أخطاء غير متوقعة.
- **Mini App وCloudflare:** واجهة الصفحات القديمة للقراءة/النشر فقط؛ أزرار الإضافة للجدول تقف عند حد المستخدم. تحديث بطاقات الباقات وإزالة أرقامها القديمة. بوابة Cloudflare تكتفي بحدود النقل العامة؛ قرار حصة المستخدم النهائي لدى Serverless.
- **الفحوص:** فحص V8 مباشر نجح في الحدود الأساسية المجاني/Plus/Golden، وأمثلة ٨×٢٦، و٥١ بلوك، و١١ وسيط، والتداخل، والجداول المستوردة، وتمييز `v1/v2`. فحص نحوي نجح للملفات التي فُحصت بتحميل المصدر باستثناء ملف الاختبار الذي يتطلب Module syntax. أُضيف `tests/serverless/editor-unified-limits.test.mjs` لتغطية ٩ حالات، لكن `npm test` الكامل واختبار Telegram/Cloudflare/D1 الحقيقي **غير منفذة/غير مثبتة**.
- **النشر:** GitHub فقط. **لا تنفذ `tgcloud push` قبل مراجعة وتنفيذ `tgcloud migrate`** لإنشاء `quota_version` على بيانات `rich_pages` الحالية. لا تغيير تم في قاعدة الإنتاج أو Webhooks. يلزم اختبار قاعدة مستنسخة وخطة تراجع قبل الترحيل.
- **ما تبقى:** تكامل التزامن المتوازي للصفحات، ربط Plus/Golden الموثق بواجهة Cloudflare بدلاً من عرض سقف المجاني مؤقتاً، فحص عدّ UTF-8 والإيموجي والتداخل النصي على أمثلة حقيقية، وتشغيل الاختبارات الكاملة ومراجعة كل مسارات RCB1 والإنلاين والإضافات بشكل طرفي.

## 2026-10-10 — تطبيق ٨/١٢/٢٠ عموداً حسب باقة المحرر
- **شنو تغيّر:** صار التحقق الخادمي يطبّق على الجداول ٨ أعمدة للمجاني و١٢ لـPlus و٢٠ لـGolden، فوق الحدود التقنية ٢٠ عموداً و٢٦ صفاً للجميع. الاستثناء للمطور يخص حصة الباقة دون حدود الجدول التقنية.
- **عند التجاوز:** رسالة `limits.table_columns` بدل خطأ نصي أو API غير مفهوم في معالجات الإضافة؛ رفض حفظ جدول زائد مع إبقاء المحتوى القديم دون حذف. واجهة Mini App للمجاني تمنع إضافة العمود التاسع وتعرض مقارنة الباقات (التجريبية وغير متاحة للبيع)؛ حد الصف ٢٦ يظهر تنبيهاً واضحاً.
- **قيود قائمة:** `subscription-policy.js` ما زال يطبق البلوكات ٣٠/٦٠/١٢٠؛ الأرقام الجديدة ٥٠/٢٠٠/٥٠٠، التداخل، الوسائط وعدّ صفوف الجدول ضمن ميزانية البلوكات لم تكتمل ضمن هذه المهمة. Cloudflare لا يملك حالياً مزامنة خطة Plus/Golden الموثقة، لذلك يعرض سقف المجاني لكل غير مطوّر؛ الخادم يبقى صاحب القرار عند الحفظ والنشر.
- **الملفات:** `tgcloud/lib/subscription-policy.js`، `tgcloud/lib/editor-blocks.js`، `tgcloud/lib/editor-block-flow.js`، `functions/miniapp/api/me.js`، `app/miniapp_static/app.js`، `app/miniapp_static/subscription_offers.js`، `app/miniapp_static/editor.html`، `tests/serverless/table-limits.test.mjs`، `md_files/sups.md`، `md_files/log.md`.
- **الاختبارات:** أضيف اختبار الباقات ٨/١٢/٢٠، ومنع التحايل بالبيانات المستوردة و`colspan`، وصُحّح الاختبار القديم إلى استحقاق Golden صريح. لا تنفيذ مثبت لكامل `npm test` أو اختبار Telegram/Cloudflare الحي.
- **النشر:** GitHub فقط. `tgcloud push` غير منفّذ، وحالة النشر التلقائي لـCloudflare غير متحققة.

## 2026-10-10 — تدقيق إضافي لمعالجات أخطاء المحرر الغني

- **السبب:** استثناءات غير موصوفة في مسارات الرسائل والأزرار والإيموجي، فشل PreCheckout بلا ضمان رفض، احتمال حفظ دفعة ترخيص قبل إصدار الرخصة، وتسريب نصوص تقنية من Cloudflare عند 5xx.
- **الإصلاحات:** تصنيف مركزي `operational-errors.js` يشرح السبب والإجراء ويخفي التفاصيل التقنية عن المستخدم؛ دعم الرسائل والأزرار، تسجيل فشل `claimUpdate`، رفض مدفوعات غير معروفة، استكمال إصدار التراخيص بعد الحفظ الجزئي، إرشادات للبلاكات/الملفات/النسخ التالفة، ونتائج Cloudflare 5xx آمنة مع `SERVICE_UNAVAILABLE`.
- **التسجيل:** تحسين تنسيق قناة الأخطاء (التصنيف/النوع/السبب/المعالجة/الخطأ التقني)، وتعقيم Bearer والمفاتيح ورموز الدخول من وصف الاستثناء.
- **إضافي:** عرض موضع الاستثناء بعد التعقيم؛ التنبيه على إشعارات الدفع التي لا تطابق تفاصيل الطلب، وعدم إعادة إرسال إشعار شراء إزالة الحقوق عند تكرار نفس العملية، وتسجيل فشل إرسال إيصال الترخيص بعد إصدار الحقوق.
- **الاختبارات:** `operational-errors.test.mjs`، `pre-checkout-recovery.test.mjs`، `managed-bot-payment-recovery.test.mjs`، `http-error-safety.test.mjs`، `static-error-guards.test.mjs` وتوسيع Mock SDK.
- **التأكد:** نجاح فحوص تصنيف وتشغيلات محاكاة محددة، مع نجاح التحليل النحوي للملفات الأساسية. **GitHub Actions ما زال فاشلاً، وكان كذلك في عمليات سابقة لهذه الجولة؛ تعذر جلب Job logs من GitHub.** لا يوجد تأكيد تشغيل كامل `npm test`.
- **الملفات والتفاصيل:** `md_files/docs/error-handling-audit.md`، ملفات المعالجات والاختبارات المذكورة، و`functions/_lib/http.js`.
- **حالة النشر:** GitHub `serverless-cleanup` فقط؛ لا Telegram Serverless push ولا نشر Cloudflare.

## 2026-10-10 — تحسين معالجات الأخطاء في المحرر الغني
- **السبب:** خطأ Showcase كان يستدعي `logError` من دون استيراد، وأخطاء Telegram مثل `TOPIC_CLOSED` و`RICH_MESSAGE_TABLE_COLS_TOO_MANY` لم تكن تعطي سبباً مفهوماً عند النشر.
- **الإصلاح:** وحدة مشتركة لتصنيف أخطاء النشر (المواضيع، الأذونات، حدود الجداول، الملفات، الأزرار، انتهاء الوصول ومعدل الإرسال)، مع شرح عربي/إنكليزي بحسب المستخدم وسبب مستقل لكل وجهة نشر فاشلة.
- **السلامة:** عدم حذف الوجهات المحفوظة بسبب فشل اتصال مؤقت، وعدم اعتبار الفشل الشبكي المجهول رفضاً مؤكداً في الجدولة، ومنع فشل الإحصائيات من إخفاء نتيجة النشر.
- **التسجيل:** تصحيح استيراد Showcase، إظهار سبب الخطأ الأصلي عند توفره، دعم Topic ID في سياق السجل، وتحسين التمييز بين الأخطاء المتشابهة في محادثات مختلفة.
- **الأزرار:** تقديم تنبيه مفهوم عند الفشل غير المتوقع، وتجاهل انتهاء صلاحية جواب الـ Callback بدلاً من إطلاق تنبيهات متكررة؛ إضافة `tgcloud/handlers/callback_query.js` إلى الملفات المعدلة.
- **الاختبارات:** إضافة `tests/serverless/publish-errors.test.mjs` لتغطية ثمانية سيناريوهات، مع فحص نحوي/منطقي مستقل للوحدة. لم يجر اختبار Telegram مباشر أو تشغيل كامل مجموعة CI.
- **الملفات:** `tgcloud/lib/publish-errors.js` و`tgcloud/lib/publish.js` و`tgcloud/lib/scheduled-publish.js` و`tgcloud/lib/showcase.js` و`tgcloud/lib/error-log.js` وملف الاختبارات وهذا السجل.
- **النشر:** رفع GitHub فقط على `serverless-cleanup`؛ لا نشر Telegram Serverless أو Cloudflare.


## 2026-10-10 — تصحيح حدود الجداول ومعالجة خطأ الضغط على البلوك
- **شنو تغيّر:** اعتماد ٢٠ عموداً و٢٦ صفاً كحدين لكل جدول؛ إزالة إعفاء المطور من حدود الجداول فقط مع الإبقاء على إعفائه من حصص الاشتراك. التحقق من النسخة القابلة للتعديل `rows` والنسخة المستوردة `native_data.cells`، وإعادة فحص الجداول في الحمولة النهائية قبل استدعاء Bot API، بما فيها الجداول المتداخلة.
- **السبب:** خطأ `RICH_MESSAGE_TABLE_COLS_TOO_MANY` أبلغ عنه مستخدم عادي عند `r:b:`، وكان الكود القديم يقبل ٢٥ عموداً؛ بعض الجداول المستوردة تحتفظ بنسختين مختلفتين.
- **تجربة المستخدم:** إذا كان جدول قديم متجاوزاً الحد، يعرض المحرر رسالة الحد دون تمرير الجدول المرفوض إلى تليكرام، وتبقى بياناته محفوظة للتعديل. أزرار إضافة صف/عمود في Mini App تتوقف عند السقف.
- **الملفات:** `tgcloud/lib/editor-blocks.js`، `tgcloud/lib/editor-renderer.js`، `tgcloud/lib/editor-block-ui.js`، `tgcloud/lib/editor-extra-blocks.js`، `app/miniapp_static/app.js`، `tests/serverless/table-limits.test.mjs`، `md_files/sups.md`، `md_files/log.md`.
- **الاختبارات:** أضيفت ٦ اختبارات انحدار للحواف، دمج الأعمدة والصفوف، المطور، الجداول المستوردة والمتداخلة. لم يثبت تشغيل مجموعة Node الكاملة أو اختبار Telegram الفعلي ضمن هذه الجلسة.
- **النشر:** GitHub `serverless-cleanup` فقط؛ لا `tgcloud push` أو Cloudflare نشر يدوي أو migration.

هذا الملف يسجل **آخر التعديلات الفعلية وأسبابها** على فرع `serverless-cleanup`.
رتّب الإدخالات من الأحدث إلى الأقدم، وحدّث السجل مع تغييرات الكود أو الواجهة أو المخطط أو الاختبارات أو الوثائق.
الرفع إلى GitHub لا يعني نشر Telegram Serverless أو Cloudflare؛ اذكر حالة النشر صراحةً.

## 2026-10-10 — إصلاحات وقائية على جدولة RCB1
- **شنو تغيّر:** إضافة مخطط تذكيرات D1 للإنشاءات الجديدة أيضاً، مشاركة throttle الجسر عند إرسال ACK، وتصحيح معالجة فشل حفظ موعد الجدولة داخل رسالة المستخدم، وتوضيح أن Cloudflare يحتفظ فقط بمعرّفات وتوقيت المهام.
- **السبب:** منع ازدحام RCB1 ونشوء واجهة تتوقف بصمت، وتوحيد المخطط عند تجهيز بيئة اختبار جديدة.
- **الملفات:** `cloudflare/d1/schema.sql`، `functions/_lib/b2b-bridge.js`، `tgcloud/lib/scheduled-publish.js`، `AGENTS.md`، `md_files/docs/scheduling.md`، `md_files/log.md`.
- **الاختبارات:** فحص نحوي سريع لملفات JS المتأثرة؛ لا اختبار D1/Telegram حي أو نجاح CI شامل مثبت.
- **النشر:** GitHub فقط؛ لا migration، ولا worker deploy، ولا tgcloud push.

## 2026-10-10 — ربط جدولة المحرر بالتذكير B2B (قيد اختبارات التكامل)
- **شنو تغيّر:** إضافة تخزين مهام المنشورات ومحتواها ووجهاتها على Serverless، واستقبال DUE/ACK من relay المُتحقق منه، وزر جدولة في إعدادات النشر، وإدخال موعد بغداد، وأمر /scheduled مع الإلغاء، وCAS/lease لمنع إرسال الوجهات المكررة. ربط Worker بالـ throttle المشتركة مع B2B وتقليل الحمل إلى 10 تذكيرات بالدورة.
- **السبب:** تكملة مسار Cloudflare reminders دون نقل إرسال المنشورات إلى Cloudflare.
- **الملفات:** `tgcloud/lib/scheduled-publish.js`، `tgcloud/lib/publish.js`، `tgcloud/lib/miniapp-bridge.js`، `tgcloud/schema.js`، `tgcloud/handlers/message.js`، `tgcloud/handlers/callback_query.js`، `tgcloud/lib/editor-session.js`، `functions/_lib/b2b-bridge.js`، `functions/_lib/scheduling-reminders.js`، `workers/schedule-reminders/worker.js`، `md_files/docs/scheduling.md`، `md_files/sups.md`، `AGENTS.md`، `md_files/log.md`.
- **الفحص:** فحص نحوي سريع لدوال الملفات المعدلة ببيئة JavaScript مع إزالة الاستيرادات؛ لم يجر اختبار Telegram Serverless أو D1 حي، ولم يثبت اختبار التكامل الطرفي. GitHub Actions كان يُبلغ الفشل في تشغيلات سابقة.
- **النشر:** GitHub فقط. لم تُنفَّذ migrations أو tgcloud push أو نشر Worker. يجب تنفيذ الاختبارات قبل الإطلاق.

## 2026-10-10 — تجهيز توقيت المهام على Cloudflare عبر RCB1 (غير منشور)
- **شنو تغيّر:** تطوير استقبال REGISTER/CANCEL/RESULT من المحرر داخل webhook الحالي بعد التحقق من هوية B2B، وتخزين ID/الموعد/الإصدار في D1 فقط. تجهيز Worker Cron كل دقيقة لإرسال DUE من Relay Bot بالمهمة المستحقة، مع retries وACK، من دون استضافة بوت المحرر على Cloudflare.
- **السبب:** حدود تشغيل المهام المؤجلة على Telegram Serverless؛ Cloudflare للتذكير فقط.
- **الملفات:** `functions/_lib/scheduling-reminders.js`، `functions/_lib/b2b-bridge.js`، `functions/miniapp/api/bridge/webhook.js`، `cloudflare/d1/migrations/0002-schedule-reminders.sql`، `workers/schedule-reminders/*`، `md_files/docs/scheduling.md`، `md_files/log.md`.
- **الاختبارات:** لم يتم تشغيل اختبار Telegram/D1 حي. الملفات بحاجة لاختبارات تكامل قبل نشر Worker.
- **النشر:** GitHub فقط. Worker يحتاج ربط قاعدة D1 نفسها وضبط Secret ونشر مستقل. Migration لم تطبّق، وواجهة وإرسال الجدولة في المحرر لم يكتمل ربطهما.
 
## 2026-10-10 — بدء تأسيس جدولة المنشورات (دون تفعيل)
- **شنو تغيّر:** إضافة سياسة مستقلة لحد محادثتين مجاناً لكل منشور مجدول، واقتراح 5 Plus و15 Golden بانتظار الموافقة، وحراسة الوجهات المكررة والتاريخ خلال 4 أيام؛ توثيق المسار والضمانات.
- **السبب:** طلب جدولة منشور واحد في محادثة أو عدة محادثات، مع عدم تعريض المستخدم لوعد توقيت لا يدعمه منفّذ آلي مثبت.
- **الملفات:** `tgcloud/lib/schedule-policy.js`، `tests/serverless/schedule-policy.test.mjs`، `md_files/docs/scheduling.md`، `md_files/sups.md`، `AGENTS.md`، `md_files/docs/subscription-rollout.md`، `md_files/log.md`.
- **الاختبارات:** 5/5 من اختبارات سياسة الجدولة نجحت محلياً في Node باستعمال نسخة من `schedule-policy.js` و`subscription-policy.js` المطابقتين للمصدر. فحص GitHub Actions لهذا الالتزام فشل قبل إظهار خطوات أو سجل قابل للاسترجاع، كما تكرر في تشغيلات سابقة؛ لا يُعد نجاحاً للاختبارات الشاملة. لا اختبار Telegram حي.
- **النشر:** GitHub فقط؛ لا `tgcloud push` ولا `migrate`، ولا واجهة جدولة فاعلة حتى يعتمد مشغل موثوق.

## 2026-10-10 — رابط عربة إزالة الحقوق المحددة مسبقاً
- **شنو تغيّر:** زر إزالة الحقوق في المحرر يفتح `https://t.me/richDonateBot?start=cart_branding`؛ بوت التبرع يفهم payload ويفتح العربة بقناع 4 (إزالة الحقوق فقط، 99 نجمة)، حسب اللغة المحفوظة. أزرار المحرر القديمة توجه إلى نفس العربة، والدفعات القديمة تبقى مدعومة.
- **السبب:** طلب المالك فتح عربة الشراء وتحديد حزمة إزالة الحقوق تلقائياً.
- **الاختبارات:** 23/23 اختبارات معالجات بوت التبرع و2/2 اختبارات ربط المحرر نجحت محلياً؛ لا اختبار Telegram حي. فتح الرابط لا يصدر فاتورة أو يثبت دفعاً.
- **النشر:** GitHub فقط؛ يلزم نشر التحديث في البوتين على Telegram Serverless. لا schema أو migration.
- **الملفات:** `tgcloud/lib/editor-block-ui.js`، `tgcloud/lib/branding.js`، `tests/serverless/branding-cart-link.test.mjs`، `md_files/log.md`.

## 2026-10-10 — رفض أسماء الصفحات المكررة عند الحفظ وإعادة التسمية
- **شنو تغيّر:** حراسة اسم موحدة ضمن صفحات نفس المالك في حفظ البوت وتغيير الاسم واستعادة الصفحة، وإنشاء/حفظ Mini App في Serverless. الاسم الحالي لنفس الصفحة مستثنى، والأسماء المتطابقة بعد NFC وتوحيد المسافات تعتبر مكررة. رسالة واضحة تطلب اسماً آخر وتبقي المسودة.
- **السبب:** تصحيح فهم الطلب السابق: المطلوب منع التكرار عند إدخال اسم الصفحة، وليس الاكتفاء برفض الاستدعاء الملتبس.
- **التزامن:** قفل المالك نفسه لمسارات إنشاء وتغيير أسماء صفحات البوت وMini App؛ قفل ذو مهلة، لا بديل عن اختبار التزامن الحقيقي. مزامنة محتوى جلسة البوت لا تعيد كتابة اسم قديم بعد إعادة التسمية.
- **الملفات:** `tgcloud/lib/page-names.js`، `editor-pages.js`، `miniapp-bridge.js`، `editor-session.js`، `app/miniapp_static/app.js`، `tests/serverless/page-name-uniqueness.test.mjs`، `md_files/log.md`.
- **الاختبارات:** Node 6/6 نجحت على رفض الاسم المكرر، المسافات وUnicode، استثناء الصفحة نفسها والمالك الآخر، قفل متزامن بمخزن mock، رفض حفظ البوت قبل الكتابة، وفحوص ربط المسارات؛ syntax نجح. لم يُختبر Telegram/D1 الحقيقي.
- **النشر:** GitHub فقط؛ لا Telegram push/migrate، ولا حذف صفحات مكررة قديمة أو تغيير schema. Cloudflare Git integration قد ينشر الواجهة؛ حالته غير متحقق منها.

## 2026-10-10 — استدعاء الصفحة بالاسم في الإنلاين والضيف
- **شنو تغيّر:** إضافة مطابقة كاملة لأسماء الصفحات ضمن صفحات المستخدم المستدعي، مع دعم المسافات والأسماء متعددة الكلمات في الإنلاين والضيف. الاسم المكرر يرجع تنبيهاً لاختيار كود الصفحة، ولا تُختار صفحة عشوائياً. الاستدعاء بالكود والمشاركة به باقيان.
- **السبب:** طلب المالك الاستدعاء بالاسم مع رفض الأسماء المتعارضة؛ المطابقة الجزئية غير مستخدمة، والأسماء عند مستخدم آخر لا تكشف صفحاته.
- **الملفات:** `tgcloud/lib/page-delivery.js`، معالجا `inline_query` و`guest_message`، `tests/serverless/page-name-delivery.test.mjs`، `md_files/log.md`.
- **الاختبارات:** 3/3 اختبارات Node نجحت لمطابقة الاسم الكامل، الأسماء المتداخلة، التكرار، عزل المالك، استمرار مشاركة الأكواد، ونص/تعليق الضيف؛ فحص syntax للملفات الثلاثة نجح. لا اختبار Telegram حي.
- **النشر:** رفع GitHub على `serverless-cleanup` فقط؛ يحتاج المستخدم سحب التعديل ونشره إلى Telegram Serverless.

## 2026-10-10 — حذف زر بوتاتي من الترحيب
- **شنو تغيّر:** حذف صف زر «بوتاتي» من `buildWelcomeKeyboard`، وإزالة مهمة الحذف المعلقة من `md_files/sups.md` وتوثيق تنفيذ حذف زر الترحيب تحديداً.
- **السبب:** طلب المالك إزالة الزر من رسالة الترحيب وتطبيق التغيير على الفرع.
- **الملفات:** `tgcloud/lib/welcome.js`، `md_files/sups.md`، `md_files/log.md`.
- **التحقق:** فحص لوحة الأزرار بعد تنفيذ الدالة باللغتين العربية والإنكليزية: صفان، لا زر بوتاتي ولا رابط managed_bots، مع بقاء أزرار المجموعة والعرض وبدء المحرر.
- **النشر:** GitHub فقط؛ لا Telegram Serverless push/migrate. صفحة Mini App ومساراتها لم تُحذف بهذه المهمة.

## 2026-10-10 — تحديث خطة الباقات وحدود تليكرام
- **شنو تغيّر:** إعادة تنظيم `md_files/sups.md` للاشتراكات الشخصية؛ اعتماد النص 20000/25000/32768، والبلوكات الإجمالية 50/200/500، والتداخل 4/8/16، والوسائط 10/25/50، والأعمدة 8/12/20. الصفحات والحزم والأسعار وإزالة الحقوق باقية حسب القرارات المعتمدة.
- **السبب:** اعتماد المالك توزيعاً جديداً ومطابقته لحدود Rich Message الرسمية؛ تصحيح السقف القديم 25 عموداً وتعريف احتساب النص والبلوكات والحمولة النهائية.
- **النطاق:** إضافة حذف زر «بوتاتي» كمهمة غير منفذة، وإزالة مسار البوتات المدارة من خطة الاشتراكات، والحفاظ على إلغاء القوالب وسجل النسخ وتأجيل الجدولة. لا حذف runtime أو بيانات.
- **الملفات:** `md_files/sups.md` و`md_files/log.md`.
- **التحقق:** مراجعة وثائق Telegram Bot API وجدول الباقات واتساق الخطة؛ لا اختبارات runtime لأن التغيير توثيقي.
- **النشر:** تحديث GitHub فقط؛ لا Telegram push/migrate أو تغيير Webhooks. نجاح Cloudflare Git integration غير متحقق منه.

## 2026-10-09 — إنشاء سجل تغييرات دائم وتعليمات تحديثه
- **شنو تغيّر:** إنشاء `md_files/log.md` وإضافة قاعدة تحديثه إلى `AGENTS.md` لكل تغيير لاحق.
- **السبب:** تسهيل متابعة قرارات المشروع ومعرفة سبب كل تعديل، ومنع تضارب تعليمات الإيجنتات بين الجلسات.
- **الملفات:** `md_files/log.md`، `AGENTS.md`.
- **النشر:** تحديث المستودع فقط؛ هذه الوثائق لا تمثل نشر Telegram Serverless. يتبع Cloudflare إعداد GitHub Integration الخاص بالفرع، ولا نستنتج نجاح نشره دون التحقق منه.

## 2026-10-09 — إلغاء سجل النسخ المحفوظة من باقات المحرر
- **شنو تغيّر:** استبعاد ميزة الاحتفاظ بإصدارات الصفحة من Plus وGolden، وحذف مهمة ترحيل `editor_page_versions` من خطة `md_files/sups.md`. تصحيح مراجع قديمة في `AGENTS.md` كي لا تعيد الإيجنتات طرح الميزة الملغاة.
- **السبب:** قرار المالك إلغاء ميزة سجل النسخ؛ لا يريد تخزين نسخ تاريخية تلقائية لكل صفحة ضمن الاشتراكات.
- **الملفات:** `md_files/sups.md`، `AGENTS.md`.
- **غير مشمول بالإلغاء:** حفظ الصفحة العادي، النسخ الاحتياطية التشغيلية، المراجعة `revision` لحماية الكتابة المتزامنة، والتراجع/الإعادة داخل جلسة التحرير. هذه وظائف أخرى وليست سجل نسخ الاشتراكات.
- **النشر:** لا يوجد تنفيذ نشر Telegram Serverless ضمن هذا التغيير.

## 2026-10-09 — تثبيت حدود الباقات المعتمدة
- **شنو تغيّر:** توثيق حدود Free/Plus/Golden للنص والصفحات والبلوكات وحزم الإيموجي وإزالة الحقوق والوصول المبكر في `md_files/sups.md` و`tgcloud/lib/subscription-policy.js`، مع عرض اشتراكات Mini App.
- **السبب:** وجود مصدر واضح لحدود الاشتراكات قبل الربط النهائي مع استحقاقات الدفع الموثوقة.
- **الحالة:** لا يُعتبر ظهور السعر أو الحدود في الواجهة إثباتاً بتفعيل صلاحيات مدفوعة على الإنتاج.

---

### طريقة توثيق التعديلات القادمة
لكل مهمة منتهية، أضف إدخالاً جديداً **في الأعلى** يتضمن: **التاريخ، شنو تغيّر، السبب، الملفات المتأثرة، الاختبارات (نجحت/لم تُشغّل)، وحالة النشر**. لا توثق نجاح اختبار أو نشر لم يحدث، ولا تدرج أسراراً أو بيانات مستخدمين أو توكنات. تحديث هذا الملف نفسه لا يحتاج إدخالاً متكرراً مستقلاً.
 

## 2026-10-10 — Repository cleanup
- Archived obsolete Python editor docs/tests and retired subscription scaffold.
- Rewrote active documentation around `tgcloud/`, current quotas, and canceled features.
- Fixed CI to run the existing Node regression suite.
- Validation: 99 editor tests passed; runtime/SQL files were not changed.
