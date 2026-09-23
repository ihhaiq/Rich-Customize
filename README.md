# Telegram Rich Message Editor

بوت Telegram لبناء وتحرير وحفظ ونشر **Rich Messages** عبر Python 3.12 وAiogram، مع محرر داخل البوت، Mini App، صفحات محفوظة، أزرار غنية وInline، نشر للقنوات والمجموعات، وتخزين PostgreSQL مع fallback محلي.

## أهم الميزات

- محرر Rich Blocks يدعم النصوص، العناوين، التفاصيل، الفواصل، القوائم، الجداول، الاقتباسات، الرياضيات، Anchor، Footer، الوسائط، Collage وSlideshow.
- استقبال نصوص/وسائط ورسائل Rich وتحويلها إلى Blocks قابلة للتعديل.
- تعديل، حذف، إعادة ترتيب ونقل البلوكات مع الحفاظ على Telegram entities وCustom Emoji.
- Mini App للمحرر مع أدوات النص والجداول والوسائط وواجهة Liquid Glass.
- صفحات محفوظة بأسماء وأكواد مع بحث وفرز وترقيم وإدارة من داخل `صفحاتي`.
- Rich Buttons داخل محتوى الرسالة، وInlineKeyboardButton تحت الرسالة كمسارين منفصلين.
- نشر إلى القنوات والمجموعات التي يملك المستخدم والبوت صلاحية الإدارة فيها.
- Inline/Guest delivery للصفحات المحفوظة.
- Showcase كامل للبلوكات عبر `/draft`.
- توطين متعدد اللغات.
- PostgreSQL كمخزن أساسي مع JSON fallback وإعادة مزامنة بعد عودة قاعدة البيانات.
- Redis اختياري ومُوصى به لـFSM الدائم، throttling، idempotency، الأقفال الموزعة والكاش.
- Alembic لإدارة schema.
- Prometheus وSentry للمراقبة الاختيارية.
- إحصائيات تشغيل ومستخدمين دائمة داخل لوحة المطور.

## حدود المحرر الحالية

الحدود الفعلية معرفة مركزيًا في `app/editor/limits.py`:

| المورد | الحد |
| --- | ---: |
| الصفحات المحفوظة لكل مستخدم | 12 |
| المطور | بدون حد صفحات |
| عمر جلسة المحرر من آخر نشاط | ساعتان |
| عدد البلوكات في الصفحة | 30 |
| النص الظاهر داخل الصفحة | 25,000 حرف |
| صفوف الجدول | 50 |
| أعمدة الجدول | 25 |
| عناصر Slideshow | 50 |

تُطبّق الحدود على المسارات المشتركة للمحرر، وليست مجرد تحقق واجهة. جلسات المحرر المنتهية تُنظف دوريًا.

## التشغيل المحلي

يتطلب Python 3.12.

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # Windows: copy .env.example .env
python main.py
```

ضع `BOT_TOKEN` و`DEVELOPER_ID` وبقية الإعدادات داخل `.env`. الملف المرجعي للمتغيرات هو `.env.example`.

## الأوامر الرئيسية

- `/editor` — فتح محرر الرسائل.
- `/dev` — لوحة المطور.
- `/draft` — إنشاء Showcase للبلوكات.

## Rich Buttons داخل الرسالة

Rich Buttons جزء من محتوى Rich Message وليست Inline keyboard.

الصيغة:

```text
{اسم الزر:النوع القيمة#اللون}
```

أمثلة:

```text
{الموقع:url https://example.com#b}
{تنفيذ:callback_data action:1#r}
{نسخ:copy النص المطلوب#g}
{الملف الشخصي:user#p}
{التالي:cbd a86d3132#b}
```

الأنواع المدعومة تشمل `url` و`cbd` و`callback_data` و`copy` و`user` و`web_app` و`login_url` وأنواع Inline query والزر المعطل. الألوان الاختيارية تشمل `#r` و`#b`/`#p` و`#g`.

## Inline Buttons تحت الرسالة

قسم إضافة الأزرار في المحرر ينشئ `InlineKeyboardButton` تحت الرسالة. الإضافة تتم برسالة واحدة، مثل:

```text
{ قناتي - https://t.me/Rich_archive }
{ تنبيه - alert: نص التنبيه }
{ تنبيه - popup: نص التنبيه }
{ الصفحة - cbd:كود_الصفحة }
{ نسخ - copy:النص }
```

يمكن تعديل النوع واللون والترتيب وعدد الأزرار في الصف لاحقًا. زر `cbd` يجب أن يشير إلى صفحة محفوظة يملكها المستخدم.

## صفحاتي

الصفحات المحفوظة تُخزن في PostgreSQL كصف مستقل لكل صفحة داخل جدول `rich_pages` عند توفر قاعدة البيانات.

واجهة `صفحاتي` تستخدم Rich Table مضغوطًا:

- كل صفحة في صف واحد.
- الحذف، تعديل الاسم، نسخ الكود واسم الصفحة داخل الجدول.
- الترقيم خارج الجدول كأزرار Inline بالشكل `⬅️ | 1/9 | ➡️`.
- البحث والفرز والرجوع تبقى أزرار Inline عادية.

يوجد حد 12 صفحة لكل مستخدم، والمطور مستثنى من هذا الحد.

الهجرة من التخزين القديم تحافظ على `page_id` نفسه. توجد migration markers لمنع رجوع صفحات قديمة محذوفة من snapshots سابقة.

## Mini App

المسار العام:

```text
/miniapp
```

إذا استخدمت Named Mini App في BotFather فالقيمة الافتراضية لـ`MINI_APP_SHORT_NAME` هي:

```text
editor
```

الواجهة تدعم تحرير Rich Text والجداول والوسائط، إضافة إلى Liquid Glass والوضع الداكن المحفوظ محليًا.

## التخزين وقاعدة البيانات

عند وجود `DATABASE_URL` يستخدم البوت PostgreSQL كمخزن أساسي. إذا تعذر الاتصال، يستمر عبر JSON fallback ثم يعيد مزامنة التغييرات عند عودة PostgreSQL.

مثال Railway:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_POOL_MIN_SIZE=1
DATABASE_POOL_TOTAL_BUDGET=20
DATABASE_CONNECT_TIMEOUT=5
DATABASE_COMMAND_TIMEOUT=5
DATABASE_MIGRATION_TIMEOUT=20
DATABASE_RECONNECT_INTERVAL=30
DATABASE_CIRCUIT_FAILURES=3
DATABASE_CIRCUIT_COOLDOWN=30

REDIS_URL=${{Redis.REDIS_URL}}
REDIS_CONNECT_TIMEOUT=2
REDIS_COMMAND_TIMEOUT=2
REDIS_MAX_CONNECTIONS=20

PAGE_SNAPSHOT_INTERVAL=21600
RESTORE_DRILL_INTERVAL=86400
```

عند وجود `REDIS_URL` تصبح جلسات FSM قابلة للاستمرار عبر restart وتدعم أكثر من instance. إذا لم يتوفر Redis يرجع البوت إلى المسار المدعوم بـPostgreSQL/Memory fallback.

Alembic يشغّل migrations الخاصة بالمشروع عند الاتصال بقاعدة PostgreSQL.

Snapshot الصفحات الكامل يُنشأ دوريًا حسب `PAGE_SNAPSHOT_INTERVAL`، ويُنشأ أيضًا في مسارات الصيانة المناسبة مثل Export والإغلاق الطبيعي. يوجد Restore Drill دوري للتحقق من صلاحية fallback.

لا تعتمد على ملفات JSON بين Deployments في Railway بدون Volume دائم.

## الإحصائيات والمراقبة

لوحة المطور تحتوي إحصائيات تشغيل ومستخدمين، منها:

- uptime.
- requests في الدقيقة ومتوسط 5 دقائق.
- متوسط وأعلى response time.
- أخطاء handlers خلال آخر ساعة.
- نجاح/فشل Preview.
- نجاح/فشل Publish، بما فيه Mini App.
- Telegram rate-limit events.
- DB latency.
- حجم قاعدة البيانات وجدول الصفحات.
- عدد جلسات FSM والمحررات النشطة.
- عدد الصفحات وأصحابها.
- إجمالي المستخدمين المعروفين.
- المستخدمون النشطون خلال 1h / 24h / 7d / 30d.
- المستخدمون الجدد خلال 24h / 7d / 30d.
- إجمالي التفاعلات.
- أكثر اللغات استخدامًا.
- قائمة مستخدمين مقسمة إلى صفحات داخل لوحة المطور.

هذه الإحصائيات دائمة ولا تتصفر بمجرد restart، وتدخل ضمن export/import.

## الصحة والمقاييس

فحص الصحة:

```text
/healthz
```

يعرض حالة PostgreSQL وRedis واستهلاك ذاكرة العملية.

مقاييس Prometheus:

```text
/metrics
```

يمكن تفعيل Sentry عبر `SENTRY_DSN`. التسجيل المنظم يخفي التوكنات ومعرفات Telegram الكاملة من السجلات المهيكلة.

## بنية المشروع

| المسار | المسؤولية |
| --- | --- |
| `app/editor/` | نماذج البلوكات، registry، workflow، draft store، history وحدود المحرر. |
| `app/routers/` | أوامر Telegram والـcallbacks حسب الميزة. |
| `app/keyboards/` | Inline keyboard builders. |
| `app/services/parser.py` | تحويل رسائل Telegram إلى Blocks. |
| `app/services/renderer.py` | بناء Rich Message والمعاينات. |
| `app/services/buttons.py` و`inline_buttons.py` | منطق الأزرار. |
| `app/services/page_registry.py` | إدارة الصفحات المحفوظة. |
| `app/services/page_navigation.py` و`pages_ui.py` | التنقل وواجهة صفحاتي. |
| `app/services/media.py` و`media_library.py` | الوسائط. |
| `app/services/albums.py` | تجميع media groups. |
| `app/services/showcase.py` | Showcase. |
| `app/storage/` | PostgreSQL، fallback، repositories وعمليات التخزين. |
| `app/webapp/` | Backend للـMini App. |
| `app/miniapp_static/` | واجهة Mini App. |
| `app/lang/` و`app/i18n*.py` | التوطين. |
| `alembic/` | migrations قاعدة البيانات. |
| `tests/` | اختبارات الوحدة والـregressions. |

للتفاصيل المعمارية راجع `docs/editor_architecture.md`.

## لوحة المطور

ضع رقم الحساب في `DEVELOPER_ID`. الأمر `/dev` يوفر أدوات الصيانة والإحصائيات وفحص قاعدة البيانات والاستيراد/التصدير وتحديث قناة المعاينة.

لا تضع Tokens أو Secrets داخل ملفات ZIP/JSON أو داخل المستودع.

## خطأ BOT_DOMAIN_INVALID

الخطأ يخص `login_url`. يجب تسجيل الدومين في BotFather عبر `/setdomain` واستخدام HTTPS مطابق. إذا لا تحتاج Telegram Login استخدم زر `url` عادي.

## الاختبارات

```bash
python -m ruff check .
python -m mypy app main.py
python -m compileall -q app main.py
python -m pytest -q
```

إذا فشل GitHub Actions قبل تشغيل أي Step فعليًا، فلا يعني ذلك تلقائيًا أن الكود نفسه فشل.
