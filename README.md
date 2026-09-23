# Telegram Rich Message Editor

بوت Telegram لبناء وتحرير ونشر Rich Messages باستخدام Python وAiogram، مع محرر Mini App وصفحات محفوظة وأزرار Inline ونشر إلى القنوات والمجموعات.

## التشغيل

يتطلب Python 3.12 أو أحدث.

```bash
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
cp .env.example .env            # Windows: copy .env.example .env
python main.py
```

ضع `BOT_TOKEN` و`DEVELOPER_ID` وبقية الإعدادات في `.env`. ملف الإعداد المرجعي الوحيد هو `.env.example`.

## أهم الميزات

- محرر Rich Blocks كامل: Paragraph، Heading، Footer، Divider، Preformatted، Math، Anchor، List، Table، Details، Quotes ووسائط Telegram.
- استقبال Rich Message أو نص/وسائط وتحويلها إلى Blocks قابلة للتعديل.
- تعديل وحذف وتحريك البلوكات مع الحفاظ على Telegram entities وCustom Emoji.
- Mini App للمحرر مع أدوات النص والجداول والوسائط وLiquid Glass.
- صفحات محفوظة بأسماء وأكواد، مع بحث وفرز وتنقل وربط الصفحات عبر CBD.
- InlineKeyboardButton تحت الرسالة للروابط والنسخ وcallbacks والتنبيهات والتنقل.
- Rich Buttons داخل محتوى البلوكات كمسار مستقل.
- نشر إلى قنوات ومجموعات يكون المستخدم والبوت مشرفين فيها.
- Inline/Guest delivery للصفحات المحفوظة.
- Showcase لكل Rich Blocks عبر `/draft`.
- توطين متعدد اللغات مع مفاتيح semantic للواجهات الجديدة.
- PostgreSQL كمخزن أساسي مع JSON fallback وإعادة مزامنة.
- Redis اختياري ومُوصى به لـFSM الدائم، throttling، idempotency، الأقفال الموزعة وكاش الإحصائيات.
- Alembic لإدارة schema، وPrometheus/Sentry للمراقبة الاختيارية.

## أوامر مهمة

- `/editor` — فتح المحرر.
- `/dev` — لوحة المطور.
- `/draft` — قالب Showcase لكل البلوكات.

## أزرار داخل النص

Rich Buttons داخل النص لها تنسيق مستقل عن أزرار Inline تحت الرسالة:

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

الأنواع تشمل `url`، `cbd`، `callback_data`، `copy`، `user`، `web_app`، `login_url`، Inline query والزر المعطل. الألوان الاختيارية: `#r` و`#b`/`#p` و`#g`.

## أزرار Inline تحت الرسالة

قسم إضافة الأزرار في المحرر ينشئ `InlineKeyboardButton` تحت الرسالة. الإضافة تتم برسالة واحدة، مثل:

```text
{ قناتي - https://t.me/Rich_archive }
{ تنبيه - alert: نص التنبيه }
{ تنبيه - popup: نص التنبيه }
{ الصفحة - cbd:كود_الصفحة }
{ نسخ - copy:النص }
```

يمكن تعديل النوع واللون والترتيب وعدد الأزرار في الصف لاحقًا. `cbd` يجب أن يشير إلى صفحة محفوظة يملكها المستخدم.

## صفحاتي

واجهة الصفحات المحفوظة تستخدم Rich Table مضغوطًا:
- كل صفحة في صف واحد.
- الحذف، تعديل الاسم، نسخ الكود، واسم الصفحة داخل الجدول.
- الترقيم خارج الجدول كأزرار Inline: `⬅️ | 1/9 | ➡️`.
- البحث والفرز والرجوع أزرار Inline عادية.

يمكن استدعاء صفحة محفوظة أيضًا عبر Inline/Guest حسب إعدادات Telegram المتاحة.

## Mini App

المسار العام هو `/miniapp`. إذا استخدمت Named Mini App في BotFather فالقيمة الافتراضية لـ`MINI_APP_SHORT_NAME` هي `editor`.

فحص الصحة:

```text
/healthz
```

يعرض حالة PostgreSQL وRedis واستهلاك ذاكرة العملية. مقاييس Prometheus متوفرة على:

```text
/metrics
```

ولـSentry أضف `SENTRY_DSN` اختياريًا؛ التسجيل الافتراضي JSON ويخفي التوكنات ومعرفات Telegram الكاملة من الرسائل المنظمة.

## البنية

- `app/editor/` — نماذج البلوكات، registry، workflow، draft store وhistory.
- `app/routers/` — Telegram handlers وcallbacks حسب الميزة.
- `app/keyboards/` — Inline keyboard builders.
- `app/services/parser.py` — تحويل رسائل Telegram إلى Blocks.
- `app/services/renderer.py` — بناء Rich Message والمعاينات.
- `app/services/buttons.py` و`inline_buttons.py` — منطق الأزرار.
- `app/services/page_registry.py` و`page_navigation.py` و`pages_ui.py` — الصفحات المحفوظة.
- `app/services/media.py` و`media_library.py` — الوسائط.
- `app/services/albums.py` — تجميع media groups.
- `app/services/showcase.py` — قالب Showcase.
- `app/storage/hybrid.py` — PostgreSQL + JSON fallback.
- `app/webapp/` — Backend للـMini App.
- `app/miniapp_static/` — واجهة Mini App.
- `app/lang/` و`app/i18n*.py` — التوطين.
- `tests/` — اختبارات الوحدة والـregressions.

للتفاصيل المعمارية راجع `docs/editor_architecture.md`.

## قاعدة البيانات

عند وجود `DATABASE_URL` يستخدم البوت PostgreSQL كمخزن أساسي. إذا تعذر الاتصال يستمر على JSON fallback ثم يعيد المزامنة عند عودة PostgreSQL.

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

# اربطه بخدمة Redis في Railway عند إضافتها.
REDIS_URL=${{Redis.REDIS_URL}}
REDIS_CONNECT_TIMEOUT=2
REDIS_COMMAND_TIMEOUT=2
REDIS_MAX_CONNECTIONS=20

PAGE_SNAPSHOT_INTERVAL=21600
RESTORE_DRILL_INTERVAL=86400
```

عند وجود `REDIS_URL` تصبح جلسات FSM في Redis وتبقى عبر restart وتدعم أكثر من instance. إذا Redis غير متوفر عند التشغيل يرجع البوت تلقائيًا لمسار FSM الحالي المدعوم بـPostgreSQL/Memory fallback.

Alembic يشغّل `upgrade head` عند أول اتصال PostgreSQL، والجداول الموجودة من الإصدارات السابقة تبقى متوافقة لأن migration الأولى تستخدم إنشاءً آمنًا غير هدّام.

Snapshot الصفحات الكامل الافتراضي كل 6 ساعات، ويُنشأ أيضًا عند Export وعند الإغلاق الطبيعي ويمكن إنشاؤه يدويًا من لوحة المطور. يوجد Restore Drill افتراضي كل 24 ساعة للتحقق أن JSON fallback قابل للقراءة ويطابق page IDs في PostgreSQL.

تبقى متغيرات `*_STATE` مهمة لمسارات fallback. لاستمرار ملفات JSON بين Deployments على Railway استخدم Volume دائمًا.

## لوحة المطور

ضع رقم الحساب في `DEVELOPER_ID` (أو القيم التي يدعمها إعداد المشروع). الأمر `/dev` يوفر أدوات المطور، ومنها فحص قاعدة البيانات والاستيراد/التصدير وتحديث قناة المعاينة.

لا تضع Tokens أو Secrets داخل ملفات ZIP/JSON التي ترفعها للمستودع.

## خطأ BOT_DOMAIN_INVALID

يخص `login_url`. يجب تسجيل الدومين في BotFather عبر `/setdomain` واستخدام HTTPS مطابق. إذا لا تحتاج Telegram Login استخدم زر `url` عادي.

## الاختبارات

```bash
python -m ruff check .
python -m mypy app main.py
python -m compileall -q app main.py
python -m pytest -q
```
