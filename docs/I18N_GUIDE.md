# دليل نظام الترجمة بالمفاتيح

هذا المشروع ينتقل من نظام الترجمة القديم المعتمد على استبدال النصوص (`Arabic -> English -> target locale`) إلى نظام مفاتيح دلالية ثابتة.

## الهدف

أي نص واجهة يظهر للمستخدم يجب ألا يكون مكتوبًا مباشرة داخل `routers` أو `keyboards`.

بدلًا من:

```python
await callback.answer("هذا الجزء لم يعد موجودًا.")
```

استخدم:

```python
from app.i18n import t

await callback.answer(t("editor.block_missing"))
```

المفتاح ثابت ولا يعتمد على اللغة. اللغة الحالية يحددها `LocaleMiddleware`، و `t()` ترجع النص الصحيح للمستخدم.

---

## شكل المفاتيح

نستخدم namespace حسب المجال:

- `common.*` — عناصر مشتركة مثل رجوع، إلغاء، سبب الخطأ.
- `editor.*` — واجهة محرر الرسالة والـBlocks.
- `block.*` — أسماء أنواع Rich Blocks.
- `buttons.*` — إدارة الأزرار وأنواعها وألوانها.
- `post.*` — إنشاء المنشور واختيار القنوات والمجموعات.
- `table.*` — إعدادات الجداول والخلايا.
- `pages.*` — الصفحات المحفوظة.
- `guide.*` — دليل صيغة الأزرار.

مثال:

```python
t("block.text")
t("editor.preview_generating")
t("common.reason", reason=error)
```

لا تستخدم مفتاحًا عامًا مثل `text1` أو `button3`.

---

## أين توجد الترجمات؟

### المفاتيح الأساسية القديمة

توجد في:

```text
app/locales/common.py
```

وتشمل حاليًا أسماء الـBlocks وبعض المفاتيح القديمة.

### مفاتيح المرحلة الثانية

توجد في:

```text
app/locales/catalog.py
```

ويحتوي الملف على:

```python
CATALOG_EN
CATALOG_AR
CATALOG_TRANSLATIONS
```

`CATALOG_EN` هو النص الإنجليزي المرجعي للمفتاح.

`CATALOG_AR` يحتوي النسخة العربية.

`CATALOG_TRANSLATIONS` يحتوي نفس المفتاح لكل لغة مدعومة.

مثال:

```python
CATALOG_EN = {
    "editor.preview_failed": "Couldn't preview this block.",
}

CATALOG_AR = {
    "editor.preview_failed": "تعذرت معاينة هذا الجزء.",
}

CATALOG_TRANSLATIONS = {
    "fr": {
        "editor.preview_failed": "Impossible d’afficher l’aperçu de ce bloc.",
    },
}
```

---

## النصوص الديناميكية

لا تركب نصًا مترجمًا من عدة أجزاء إذا كان يمكن أن يتغير ترتيب الكلمات بين اللغات.

خطأ:

```python
text = t("common.reason") + str(error)
```

الصحيح:

```python
t("common.reason", reason=error)
```

ويكون المفتاح:

```python
"common.reason": "Reason: {reason}"
```

يجب الحفاظ على نفس placeholder في كل اللغات.

---

## محتوى المستخدم لا يترجم

لا تمرر أسماء المستخدمين أو عناوين القنوات أو نصوص الرسائل التي كتبها المستخدم إلى الترجمة كمفتاح.

مثال صحيح:

```python
t("editor.preview_single_notice", label=get_block_label(block_type))
```

هنا القالب مترجم، و `label` نفسه يأتي من مفتاح `block.*`.

---

## قواعد إضافة نص جديد

عند إضافة أي واجهة جديدة:

1. اختر namespace مناسبًا.
2. أضف المفتاح والنص الإنجليزي المرجعي.
3. أضف العربية.
4. أضف نفس المفتاح لجميع اللغات المدعومة.
5. استخدم `t("namespace.key")` في الكود.
6. إذا يحتوي النص قيمًا ديناميكية، استخدم `{placeholder}`.
7. شغّل الاختبارات قبل الدمج.

مثال:

```python
# catalog.py
CATALOG_EN["post.sent"] = "Post sent successfully."
CATALOG_AR["post.sent"] = "تم إرسال المنشور بنجاح."

# router
await message.answer(t("post.sent"))
```

---

## ممنوعات

لا تضف كودًا جديدًا بهذه الطريقة:

```python
InlineKeyboardButton(text="🔙 رجوع", ...)
await message.answer("اختيار غير صالح")
```

ولا تعتمد على:

```python
tr("نص عربي ثابت")
```

`tr()` موجود مؤقتًا لتشغيل الأجزاء القديمة أثناء الترحيل فقط.

الكود الجديد يجب أن يستخدم `t()`.

---

## كيف يتم الترحيل؟

الترحيل يتم Router/Feature واحدة في كل مرة:

1. حصر النصوص الظاهرة للمستخدم.
2. تحويلها إلى semantic keys.
3. إضافة الترجمات الكاملة.
4. استبدال `tr()` والنصوص المباشرة بـ `t()`.
5. التأكد من عدم وجود hardcoded UI في الملف.
6. إضافة اختبار regression عند وجود مشكلة سابقة معروفة.

أول ملف تم ترحيله بهذه الطريقة هو:

```text
app/routers/block_preview.py
```

ومن المشاكل التي يغطيها النظام الجديد مشكلة ظهور أسماء مثل `Type: Text` بدل لغة المستخدم.

---

## متى نحذف tr()؟

لا يتم حذف `tr()` الآن.

يُحذف فقط بعد أن تصبح:

- `app/keyboards.py`
- جميع ملفات `app/routers/`
- رسائل الأخطاء والتنبيهات
- دليل الأزرار
- واجهة النشر والصفحات والجداول

كلها معتمدة على `t()` والمفاتيح الدلالية فقط.

بعدها يصبح أي نص واجهة خارج الكتالوج خطأ اختبار بدل أن يصل للمستخدم بلغة خاطئة.
