# Telegram Rich Message Editor

محرّر Blocks كامل لرسائل Telegram الغنية باستخدام Python وAiogram 3.31 / Bot API 10.3.

## التشغيل

يتطلب Python 3.10 أو أحدث.

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env            # Windows: copy .env.example .env
```

ضع توكن البوت في `.env` ثم شغّل:

```bash
python main.py
```

أرسل `/editor` للبوت، ثم أرسل Rich Message أو نصًا أو ملف وسائط أو Album.

### أزرار داخل النص

يمكن وضع الزر في أي موضع داخل النص بهذه الصيغة:

```text
{اسم الزر:النوع القيمة#اللون}
```

أمثلة:

```text
قبل الزر {الموقع:url https://example.com#b} وبعده
{تنفيذ:callback_data action:1#r}
{نسخ:copy النص المطلوب#g}
{الملف الشخصي:user#p}
{التالي:cbd a86d3132#b}
```

الأنواع المدعومة: `url` (أو `link`)، و`cbd` للصفحات، و`callback_data`، و`copy`، و`web_app`،
و`login_url`، و`switch_inline_query`، و`switch_inline_query_current_chat`، و`disabled`.
الألوان: `#r` أحمر، و`#b` أو `#p` أزرق، و`#g` أخضر، ويمكن حذف اللون لاستعمال الافتراضي.

النوع `cbd` هو الطريقة المبسطة لفتح Rich Message محفوظة: ضع بعده كود الصفحة فقط،
مثل `{التالي:cbd a86d3132#b}`. يحوّله البوت تلقائيًا إلى Callback تنقّل داخلي ويضيف
الصفحة الحالية للرجوع، لذلك لا يحتاج المستخدم إلى كتابة `r:page:` أو `callback_data`.

النوع `user` لا يحتاج إلى قيمة. بعد إرسال النص يوقف البوت العملية ويعرض كيبورد اختيار
مستخدم، ثم يربط الزر بملفه الشخصي ويكمل فتح المحرّر. عند وجود عدة أزرار `user` يطلب
اختيار مستخدم لكل زر بالتسلسل.

## ما يدعمه المشروع

- استقبال `Message.rich_message` الحقيقي وتحويل كل Top-Level Rich Block إلى Block مستقل.
- استقبال النص، الصورة، الفيديو، GIF، Audio، Voice، Document، Sticker وVideo Note.
- فصل Caption العادي كـBlock مستقل قابل للتعديل والحذف والنقل.
- تجميع عناصر `media_group_id` بعد فترة هدوء قصيرة قبل فتح المحرّر.
- معرّفات ثابتة قصيرة للـBlocks بدل الاعتماد على الفهرس.
- تعديل النوع نفسه مع الاحتفاظ بـTelegram entities وCustom Emoji عبر `entities`.
- Block من نوع `details` يقبل نصًا أو أي وسائط أو Album ويستبدل محتواه الداخلي مع إبقاء عنوانه.
- يمكن تعديل عنوان `Details` وحده من صفحة الـBlock.
- يمكن تعديل تذييل الوسائط ومصدرها، وتعديل الكاتب (`credit`) في Blockquote وPullquote.
- زر `➕ إضافة Block` يدعم جميع أنواع Rich Blocks النهائية الرسمية:
  Paragraph، Section Heading، Preformatted، Footer، Divider، Mathematical Expression، Anchor،
  List، Blockquote، Pullquote، Collage، Slideshow، Table، Details، Map، Animation، Audio، Photo،
  Video وVoice Note.
- زر `🔘 إضافة أزرار` ينشئ `InputRichBlockButtons` حقيقيًا داخل الرسالة، مع رابط ونسخ وPopup
  وWeb App وLogin URL وInline Query وزر معطّل، وتخصيص اللون
  (افتراضي/أزرق/أخضر/أحمر/Link للـCallback) والترتيب وعدد الأزرار في الصف.
- تعرض خطوات إضافة الأزرار وتعديلها دليلًا قابلًا للفتح كـ`Details`، وفي داخله أمثلة
  `Preformatted` جاهزة للنسخ لكل صيغ الأزرار داخل النص.
- يمكن تغيير نوع زر موجود مع إبقاء عنوانه ولونه وترتيبه؛ مثل تحويل الرابط إلى زر معطّل
  أو `callback_data` أو نسخ أو Popup أو بقية الأنواع المدعومة.
- يمكن حفظ الرسالة كصفحة باسم واضح من `💾 حفظ الصفحة`، وفتحها لاحقًا من `📚 صفحاتي`،
  ثم ربط أي زر بها من `📄 ربط بصفحة` باختيار الاسم مباشرةً بدل نسخ الكود يدويًا.
- عند الضغط على زر صفحة في مجموعة أو Supergroup، يرسل البوت الصفحة كـEphemeral Message
  لا يراها إلا المستخدم الضاغط، وتُفتح الصفحات التالية وزر الرجوع داخل الرسالة الخاصة نفسها.
  Telegram لا يدعم Ephemeral Messages في القنوات؛ لذلك يرسل البوت الصفحة إلى خاص الضاغط هناك.
- يمكن استدعاء صفحة محفوظة بصيغة `@BotUsername كود_الصفحة`، فيرد البوت نفسه برسالة
  غنية عبر Guest Mode حتى لو لم يكن عضوًا في المحادثة. فعّل `Guest Mode` من إعدادات البوت
  داخل Mini App الخاص بـ`@BotFather`. يدعم المشروع أيضًا نفس الصيغة عبر Inline Mode؛
  لتفعيل طريقة الاختيار التقليدية نفّذ `/setinline` في `@BotFather`.
- إذا احتوت رسالة Guest الغنية زر صفحة، فالضغط عليه يعرض محتوى الصفحة التالية كـRich
  Ephemeral Message للضاغط فقط، ثم تُعدّل نفس الرسالة المؤقتة عند التنقل أو الرجوع.
- يدعم `InputRichBlockDocument` لإضافة الملفات العامة مع التذييل والمصدر.
- يقبل محرّر Pullquote الوسائط والملفات ويضعها داخل إطار الاقتباس مع النص والكاتب مثل
  الصورة المرجعية. يُرسل هذا التركيب كـ`InputRichBlockBlockQuotation` ذي Blocks داخلية؛
  لأن `InputRichBlockPullQuotation` الرسمي نفسه نصي فقط.
- زر `📝 إنشاء منشور` بجانب النتيجة يعرض القنوات والمجموعات المسجلة التي يكون فيها المستخدم
  والبوت مشرفين، ويولد روابط Telegram رسمية لإضافة البوت عند عدم وجود محادثات.
- عند وصول البوت إلى قناة أو مجموعة يرسل إشعارًا في الخاص، ثم يتيح إرسال المنشور بصمت
  (`disable_notification`) أو مع منع التوجيه والحفظ (`protect_content`).
- يظهر Thinking في القائمة للتوضيح فقط؛ Telegram يسمح به في `sendRichMessageDraft` ولا يقبله في النتيجة النهائية.
- حذف مؤكد، إعادة ترتيب صحيحة، رجوع هرمي، وحماية من callbacks القديمة والضغط المكرر.
- زر النتيجة بـ`ButtonStyle.SUCCESS` وإرسال Rich Message حقيقية متى كانت الأنواع قابلة للدمج.
- fallback مرتب للـDocument وSticker وVideo Note أو عند رفض Telegram تركيبًا معينًا.
- قالب Showcase شامل لجميع Rich Blocks والتنسيقات، يُستدعى بالأمر `/draft` أو بكتابة `دريفت` أو من زر رسالة الترحيب.
- واجهة عربية/إنجليزية تلقائية حسب لغة المستخدم، تشمل الرسائل والأزرار واسم البوت والوصف والـBio والأوامر.

## البنية

- `app/routers/rich_editor.py`: جميع Handlers والتنقل بين الصفحات.
- `app/services/parser.py`: تحويل رسائل Telegram إلى Blocks وتحديث بيانات Block.
- `app/services/blocks.py`: البحث والحذف والنقل وتطبيع المواقع.
- `app/services/buttons.py`: التحقق من روابط الأزرار وإضافتها وحذفها وإعادة ترتيبها.
- `app/services/inline_buttons.py`: تحليل أزرار النص وحل أزرار اختيار المستخدم.
- `app/services/chat_registry.py`: حفظ المحادثات المرتبطة بالمشرف والتحقق منها قبل النشر.
- `app/services/page_registry.py`: حفظ الصفحات المسماة وأكواد استدعائها وروابط التنقل بينها.
- `app/services/guest_message_registry.py`: ربط رسالة Guest المؤقتة بالمحادثة حتى تعمل
  أزرار الصفحات كـEphemeral بعد وصول Callback الذي يحتوي `inline_message_id` فقط.
- `app/services/renderer.py`: إنشاء `InputRichMessage` والمعاينة الاحتياطية.
- `app/services/factory.py`: إنشاء الأنواع الجديدة وتحويل مدخلات المستخدم إلى بيانات Rich Blocks.
- `app/services/albums.py`: تجميع الألبومات بصورة متزامنة وآمنة.
- `app/keyboards.py`: جميع Keyboard Builders المركزية.
- `app/states.py`: حالات FSM.

## الحالات الجديدة

- `RichEditorStates.waiting_input`
- `RichEditorStates.selecting_button_user`
- `RichEditorStates.saving_page_name`
- `RichEditorStates.managing`
- `RichEditorStates.editing_block`
- `RichEditorStates.adding_block`
- `RichEditorStates.editing_button`

## قاعدة البيانات

لا توجد Migration. جلسة التحرير الحالية مؤقتة في `MemoryStorage` وتُفقد عند إعادة التشغيل،
لكن الصفحات المحفوظة تبقى افتراضيًا في `data/rich_pages.json`. يمكن تغيير مسارها بمتغير
البيئة `RICH_PAGES_STATE`. للإنتاج متعدد النسخ استبدل `MemoryStorage` وملف JSON بمخزن مشترك.
يُحفظ ربط رسائل Guest افتراضيًا في `data/guest_messages.json`، ويمكن تغيير مساره بمتغير
البيئة `GUEST_MESSAGES_STATE`.

### خطأ `BOT_DOMAIN_INVALID`

هذا الخطأ يخص زر `login_url` عندما لا يطابق دومين الرابط الدومين المسجل للبوت. افتح
`@BotFather`، اختر البوت، نفّذ `/setdomain` وسجّل الدومين فقط مثل `example.com`، ثم استعمل
رابط `https://example.com/...`. إذا لا تحتاج تسجيل دخول Telegram، غيّر نوع الزر إلى `url`
عادي ولا يحتاج `/setdomain`.

## الاختبارات

```bash
python -m unittest discover -s tests -v
```
