# AGENTS.md — Rich Customize

تعليمات العمل على مستودع `ihhaiq/Rich-Customize`. الهدف من هذا الملف هو توثيق القواعد الثابتة الحالية فقط؛ لا تستخدمه كسجل تغييرات.

## التشغيل

- Python 3.12.
- نقطة التشغيل: `python main.py`.
- الاعتماديات من `requirements.txt` و`requirements-dev.txt`.
- Aiogram مربوط بإصدار/commit يدعم Rich Messages التي يعتمد عليها المشروع.
- Mini App: `/miniapp`.
- فحص الصحة: `/healthz`.
- الأوامر الرئيسية: `/editor` و`/dev` و`/draft`.
- لا تضف أسرارًا أو Cookies أو Tokens إلى المستودع أو السجل.

## خريطة المشروع

| المسار | المسؤولية |
| --- | --- |
| `app/editor/` | نموذج البلوكات، السجل، البناء، المسودات، history وworkflow. |
| `app/routers/` | أوامر Telegram وcallbacks، مقسمة حسب الميزة. |
| `app/keyboards/` | Inline keyboard builders. |
| `app/services/` | parsing/rendering والصفحات والوسائط والنشر والسجلات. |
| `app/webapp/` | Backend الخاص بالـMini App. |
| `app/miniapp_static/` | HTML/CSS/JS للـMini App. |
| `app/lang/` و`app/i18n*.py` | التوطين وحزم اللغات. |
| `app/storage/hybrid.py` | PostgreSQL مع JSON fallback والمزامنة. |
| `tests/` | اختبارات السلوك والـregressions. |

التفاصيل المعمارية: `docs/editor_architecture.md`. قواعد التوطين: `docs/I18N_GUIDE.md` و`app/lang/README.md`.

## قواعد التعديل

1. عدّل الوحدة المسؤولة عن الميزة فقط، ولا تعيد إنشاء ملفات legacy محذوفة.
2. تغييرات البلوكات تمر عبر `app/editor/workflow.py` والحفظ عبر `draft_store.py` مع history عند الحاجة.
3. النصوص الجديدة تستخدم `t("namespace.key")`. لا تترجم محتوى المستخدم أو أسماء الصفحات والقنوات والأكواد.
4. `tr()` مسار توافق قديم فقط؛ لا تضف له UI جديدة.
5. `app/miniapp.py` واجهة public صغيرة، والتنفيذ داخل `app/webapp/`.
6. لا تغيّر ترتيب أزرار أو سلوك ميزة أخرى أثناء التنظيف.
7. عند حذف ملف، ابحث عن imports والاختبارات والتوثيق المرتبط به قبل الحذف.
8. حدّث الاختبارات عند تغيير بنية UI أو callback contracts.

## سلوك يجب الحفاظ عليه

### صفحاتي

- `صفحاتي` تعرض Rich Table مضغوطًا بين فاصلين.
- رأس الجدول يحتوي الحذف، تعديل الاسم، نسخ الكود، واسم الصفحة.
- كل صفحة صف واحد: 🗑️ حذف، ✏️ تعديل الاسم، زر نسخ الكود، واسم الصفحة كزر غني أساسي.
- أسماء الصفحات وأكوادها تبقى كما كتبها المستخدم ولا تُترجم.
- الترقيم **خارج الجدول** كأزرار Inline عادية بالشكل: `⬅️ | 1/9 | ➡️`.
- البحث والفرز والرجوع تبقى Inline عادية.
- البحث يحافظ على prefix الخاص بنتائجه، وتحديث الاسم/الحذف/الاستعادة يعيد عرض لوحة الإدارة نفسها.
- الملفات الرئيسية: `app/services/pages_ui.py`، `app/routers/page_support.py`، `app/keyboards/pages.py`.

### أزرار الرسالة

- قسم إضافة الأزرار يدير `InlineKeyboardButton` تحت الرسالة، وليس Rich Button داخل النص.
- الإضافة تتم بخطوة واحدة بصيغة `{ الاسم - القيمة }`، والقيمة قد تكون URL أو `alert:` أو `popup:` أو `cbd:` أو الأنواع المدعومة الأخرى.
- `richbtn` داخل محتوى Rich Blocks مسار مستقل ولا يُخلط مع Inline keyboard.
- حافظ على ملكية صفحات CBD، وعلى popup/callback limits، وعلى Inline/Guest navigation.

### Rich Table في Mini App

- تحديد الخلية يُظهر أدوات الخلية/الصف/العمود.
- النقاط الست على يمين البلوك للتحريك فقط.
- لا تجعل الضغط المطول الوسيلة الوحيدة لإظهار الأدوات.
- التنفيذ في `app/miniapp_static/live_preview.js` و`editor_features.css`.

### Showcase

- `r:showcase` و`/draft` يبنيان رسالة Rich واحدة عبر `app/services/showcase.py`.
- يستخدم البوت محتوى تجريبيًا ووسائط مكتبة القناة؛ لا يستبدل ذلك بإعادة إرسال منشورات القناة.

### الترحيب والأخطاء

- النص العشوائي في الخاص عندما لا توجد حالة FSM يعرض الترحيب.
- أخطاء المعاينة والقالب وحالات المحرر النشطة تحتفظ برسائلها الخاصة.

### Liquid Glass

- الوضع العادي والداكن يستخدمان Liquid Glass.
- زر الصاعقة يبدل الوضع الأسود ويحفظ الاختيار في `localStorage` بالمفتاح `richCustomizeLiquidGlassDark`.
- لا تكسر `mobile-performance` أو ترتيب تحميل CSS/JS في `index.html`.

### لوحة المطور

- `فحص قاعدة البيانات` و`تحديث قناة المعاينة` Rich Buttons داخل رسالة اللوحة.
- حافظ على callbacks: `dev:database:check` و`dev:showcase:refresh`.

### التخزين

- PostgreSQL هو المخزن الأساسي عند توفره.
- JSON fallback يبقى فعالًا عند انقطاع الاتصال.
- عند عودة PostgreSQL تُزامن التغييرات المحلية قبل الرجوع للوضع الأساسي.
- ملفات JSON لا تصبح دائمة عبر Deployments على Railway بدون Volume.

## الفحوص قبل الدمج

```bash
python -m ruff check .
python -m mypy app main.py
python -m compileall -q app main.py
python -m pytest -q
```

إذا فشل GitHub Actions قبل تشغيل أي Step (بدون runner فعلي)، لا تنسب الفشل إلى الكود ولا تدّع نجاح CI.
