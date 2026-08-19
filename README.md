# Telegram Rich Message Editor

محرّر Blocks كامل لرسائل Telegram الغنية باستخدام Python وAiogram 3.30 / Bot API 10+.

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
- زر `🔘 إضافة أزرار` بجانب إضافة الـBlock يفتح لوحة إدارة الأزرار الشفافة: إضافة، إزالة، تغيير اللون
  (شفاف/أزرق/أخضر/أحمر)، تغيير الترتيب، الرابط والعنوان، ومعاينة قابلة للإغلاق بزر رجوع.
- الأزرار التي يضيفها المستخدم تظهر أسفل الـRich Message النهائية، وليس في لوحة الإدارة فقط.
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
- `app/services/chat_registry.py`: حفظ المحادثات المرتبطة بالمشرف والتحقق منها قبل النشر.
- `app/services/renderer.py`: إنشاء `InputRichMessage` والمعاينة الاحتياطية.
- `app/services/factory.py`: إنشاء الأنواع الجديدة وتحويل مدخلات المستخدم إلى بيانات Rich Blocks.
- `app/services/albums.py`: تجميع الألبومات بصورة متزامنة وآمنة.
- `app/keyboards.py`: جميع Keyboard Builders المركزية.
- `app/states.py`: حالات FSM.

## الحالات الجديدة

- `RichEditorStates.waiting_input`
- `RichEditorStates.managing`
- `RichEditorStates.editing_block`
- `RichEditorStates.adding_block`
- `RichEditorStates.editing_button`

## قاعدة البيانات

لا توجد Migration. الجلسات مؤقتة في `MemoryStorage` وتُفقد عند إعادة التشغيل. للإنتاج متعدد النسخ استبدلها بـRedisStorage من Aiogram من دون تغيير منطق المحرّر.

## الاختبارات

```bash
python -m unittest discover -s tests -v
```
