# Language packages

`app.lang` هو المصدر العام لحزم اللغات في البوت.

- كل لغة مدعومة لها package داخل `app/lang/<locale>/`.
- `app/lang/catalogs/welcome_semantic.py` هو المصدر الوحيد لنصوص الترحيب semantic.
- `app/lang/catalogs/ui_semantic.py` يحتوي مفاتيح UI semantic المشتركة التي لا تنتمي إلى catalog متخصص.
- `app/lang/catalogs/legacy_normalization.py` يجمع مسار التوافق القديم للنصوص المصدرية التي ما زالت تستخدم `tr()`.
- `app/lang/catalogs/common_data.py` يحتوي البيانات التاريخية الكبيرة، بينما `common.py` يبقى facade صغيرًا ومستقرًا.
- `app/lang/bundle_loader.py` يجمع المصادر السابقة في `LocaleBundle`.

النصوص الجديدة في التطبيق يجب أن تستخدم `t("namespace.key")`. لا تضف UI جديدة إلى source-string maps أو `tr()`; تلك موجودة فقط للتوافق إلى أن تُرحّل الأسطح القديمة.

رموز Telegram الصينية تبقى `zh-hans` و`zh-hant`، بينما أسماء Python packages هي `zh_hans` و`zh_hant`.

السجلات العامة التي يصدرها `app.lang` — مثل `PHRASES` و`AR_PHRASES` و`KEY_TRANSLATIONS` و`TRANSLATIONS` و`SUPPORTED_LANGUAGES` — تعتبر API داخلية مستقرة ويجب الحفاظ على سلوكها أثناء التنظيف.
