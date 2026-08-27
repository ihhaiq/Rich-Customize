from __future__ import annotations

from typing import Any


PHRASES: dict[str, str] = {
    "customize": "Customize message",
    "choose_block": "Choose the block you want to edit:",
    "block_added": "Block added successfully.",
    "welcome": "Welcome to the Rich Message Editor.",
    "start_editor": "Send /editor to start a new message.",
    "send_message": "Send the message you want to customize.",
    "unsupported": "This type is not supported. Send text, media, or a Rich Message.",
    "expired": "The session has expired. Send /editor to start again.",
    "add_block": "➕ Add Block",
    "result": "✅ Result",
    "create_post": "📝 Create Post",
    "save_page": "💾 Save Page",
    "pages": "📚 My Pages",
    "edit": "✏️ Edit",
    "edit_content": "✏️ Edit content",
    "delete": "🗑 Delete",
    "move": "↕️ Change position",
    "back": "🔙 Back",
    "preview_block": "👁 Preview this Block",
    "preview_generating": "Generating preview…",
    "preview_ready": "Preview is ready.",
    "preview_failed": "Preview failed.",
    "add_buttons": "🔘 Add Buttons",
    "buttons_manage": "Manage rich-message buttons",
    "add": "➕ Add",
    "remove": "➖ Remove",
    "color": "🎨 Change color",
    "reorder": "↕️ Reorder",
    "change_content": "🧩 Change action content",
    "change_title": "✏️ Change title",
    "button_preview": "👁 Preview buttons",
    "post_settings": "Post settings",
    "send_now": "📤 Send post now",
    "select_chat": "Select at least one chat.",
    "details": "Details",
    "photo": "Photo",
    "video": "Video",
    "audio": "Audio",
    "voice": "Voice note",
    "document": "Document",
    "table": "Table",
    "list": "List",
    "paragraph": "Paragraph",
    "heading": "Section heading",
    "footer": "Footer",
    "divider": "Divider",
    "map": "Map",
    "invalid": "Invalid selection.",
    "missing_block": "This block no longer exists.",
    "choose_action": "Choose an action:",
    "send_file": "Send a document.",
    "send_photo": "Send a photo.",
    "send_video": "Send a video.",
    "send_audio": "Send an audio file.",
    "send_voice": "Send a voice note.",
    "math.add_prompt": "Send the formula in LaTeX.\n\nTo add a space between text, use: \\ ",
    "math.edit_prompt": "Send the new LaTeX formula.\n\nTo add a space between text, use: \\ ",
    "code.add_prompt": "Send the code.\n\nTo set its language, start with /lang python, then put the code on the following lines. You can also use a fenced block such as ```python ... ```.",
    "code.edit_prompt": "Send the new code.\n\nTo set its language, start with /lang python, then put the code on the following lines. You can also use a fenced block such as ```python ... ```.",
    "editor.closed_hint": "Use the editor buttons, or send /editor to start a new message.",
    "editor.start_button": "▶️ Start editor",
    "editor.new_button": "➕ Start editor",
    "editor.empty_hint": "Customize message\n\nAdd a Block or open one of your saved pages:",
    "pages.rename_prompt": "Send a new name for “{title}”; maximum 64 characters.",
    "pages.delete_confirm": "Permanently delete “{title}”?",
    "pages.delete_yes": "🗑 Yes, delete",
    "common.cancel": "Cancel",
    "pages.deleted": "Page deleted",
    "editor.tools_button": "🛠 More tools",
    "editor.tools_text": "🛠 More tools\n\nChoose the tool you need:",
    "editor.undo_button": "↩️ Undo",
    "editor.undo_empty": "There is no action to undo.",
    "editor.undo_done": "Undone",
    "block.move_up": "⬆️ Move up",
    "block.move_down": "⬇️ Move down",
    "block.manage_title": "Manage {name}",
    "block.position_text": "Current position: {current} of {total}",
    "block.order_text": "Block order:",
    "common.choose_action": "Choose an action:",
    "pages.search_button": "🔎 Search",
    "pages.sort_button": "⚙️ Sort",
    "pages.search_prompt": "Send the page name or code to search. Send /all to show every page.",
    "pages.search_results": "🔎 Results: {query}",
    "pages.search_none": "🔎 No pages match “{query}”.",
    "pages.sort_text": "⚙️ Sort pages\n\nChoose how to order the pages:",
    "pages.sort_updated": "🕘 Last updated",
    "pages.sort_newest": "🆕 Newest created",
    "pages.sort_oldest": "🗓 Oldest created",
    "pages.sort_title": "🔤 By name",
    "pages.sort_done": "Page order changed",

    # Canonical Rich Block keys. These are deliberately semantic keys rather
    # than source-language strings so block names can never get stuck midway
    # in the old Arabic -> English -> locale replacement chain.
    "block.content": "📦 Content",
    "block.text": "📝 Text",
    "block.paragraph": "📝 Paragraph",
    "block.heading": "🔠 Section heading",
    "block.preformatted": "💻 Preformatted",
    "block.footer": "🔻 Footer",
    "block.caption": "💬 Caption",
    "block.photo": "🖼 Photo",
    "block.video": "🎬 Video",
    "block.animation": "🎞 GIF",
    "block.audio": "🎵 Audio",
    "block.voice": "🎙 Voice note",
    "block.document": "📄 Document",
    "block.sticker": "🏷 Sticker",
    "block.video_note": "⭕ Video note",
    "block.divider": "➖ Divider",
    "block.list": "📋 List",
    "block.table": "▦ Table",
    "block.blockquote": "❝ Blockquote",
    "block.pullquote": "💬 Pull quote",
    "block.details": "📂 Details",
    "block.mathematical_expression": "∑ Formula",
    "block.anchor": "⚓ Anchor",
    "block.collage": "🖼 Collage",
    "block.slideshow": "🎞 Slideshow",
    "block.map": "🗺 Map",
    "block.buttons": "🔘 Rich buttons",
}


AR_PHRASES: dict[str, str] = {
    "math.add_prompt": "أرسل المعادلة بصيغة LaTeX.\n\nلإضافة مسافة بين النصوص استخدم: \\ ",
    "math.edit_prompt": "أرسل معادلة LaTeX الجديدة.\n\nلإضافة مسافة بين النصوص استخدم: \\ ",
    "code.add_prompt": "أرسل النص البرمجي.\n\nلتحديد لغة الكود اكتب في أول سطر: /lang python ثم اكتب الكود في الأسطر التالية. وتكدر أيضًا تستخدم: ```python ... ```.",
    "code.edit_prompt": "أرسل النص البرمجي الجديد.\n\nلتحديد لغة الكود اكتب في أول سطر: /lang python ثم اكتب الكود في الأسطر التالية. وتكدر أيضًا تستخدم: ```python ... ```.",
    "editor.closed_hint": "استخدم أزرار المحرّر، أو أرسل /editor لبدء رسالة جديدة.",
    "editor.start_button": "▶️ بدء المحرّر",
    "editor.new_button": "➕ بدء المحرّر",
    "editor.empty_hint": "تخصيص الرسالة\n\nأضف Block أو افتح إحدى صفحاتك المحفوظة:",
    "pages.rename_prompt": "أرسل الاسم الجديد للصفحة «{title}»؛ الحد الأقصى 64 حرفًا.",
    "pages.delete_confirm": "هل تريد حذف الصفحة «{title}» نهائيًا؟",
    "pages.delete_yes": "🗑 نعم، حذف",
    "common.cancel": "إلغاء",
    "pages.deleted": "تم حذف الصفحة",
    "editor.tools_button": "🛠 أدوات إضافية",
    "editor.tools_text": "🛠 أدوات إضافية\n\nاختر الأداة التي تحتاجها:",
    "editor.undo_button": "↩️ تراجع",
    "editor.undo_empty": "ماكو إجراء يمكن التراجع عنه.",
    "editor.undo_done": "تم التراجع",
    "block.move_up": "⬆️ للأعلى",
    "block.move_down": "⬇️ للأسفل",
    "block.manage_title": "إدارة {name}",
    "block.position_text": "الموقع الحالي: {current} من {total}",
    "block.order_text": "ترتيب البلوكات:",
    "common.choose_action": "اختر العملية:",
    "pages.search_button": "🔎 بحث",
    "pages.sort_button": "⚙️ فرز",
    "pages.search_prompt": "أرسل اسم الصفحة أو كودها للبحث. أرسل /all لإظهار جميع الصفحات.",
    "pages.search_results": "🔎 نتائج: {query}",
    "pages.search_none": "🔎 لا توجد صفحات تطابق «{query}».",
    "pages.sort_text": "⚙️ فرز الصفحات\n\nاختر طريقة ترتيب الصفحات:",
    "pages.sort_updated": "🕘 آخر تعديل",
    "pages.sort_newest": "🆕 الأحدث إنشاءً",
    "pages.sort_oldest": "🗓 الأقدم إنشاءً",
    "pages.sort_title": "🔤 حسب الاسم",
    "pages.sort_done": "تم تغيير ترتيب الصفحات",
    "block.content": "📦 محتوى",
    "block.text": "📝 نص",
    "block.paragraph": "📝 فقرة",
    "block.heading": "🔠 عنوان قسم",
    "block.preformatted": "💻 نص برمجي",
    "block.footer": "🔻 تذييل",
    "block.caption": "💬 وصف",
    "block.photo": "🖼 صورة",
    "block.video": "🎬 فيديو",
    "block.animation": "🎞 GIF",
    "block.audio": "🎵 صوت",
    "block.voice": "🎙 بصمة صوتية",
    "block.document": "📄 ملف",
    "block.sticker": "🏷 ملصق",
    "block.video_note": "⭕ فيديو دائري",
    "block.divider": "➖ فاصل",
    "block.list": "📋 قائمة",
    "block.table": "▦ جدول",
    "block.blockquote": "❝ اقتباس",
    "block.pullquote": "💬 اقتباس بارز",
    "block.details": "📂 تفاصيل",
    "block.mathematical_expression": "∑ معادلة",
    "block.anchor": "⚓ مرساة",
    "block.collage": "🖼 كولاج",
    "block.slideshow": "🎞 عرض شرائح",
    "block.map": "🗺 خريطة",
    "block.buttons": "🔘 أزرار غنية",
}


# Keyed translations for labels that were missing from the legacy locale packs.
# Keeping these in one place guarantees complete parity for every supported
# locale and avoids having to duplicate the same semantic keys across files.
BLOCK_KEY_TRANSLATIONS: dict[str, dict[str, str]] = {
    "es": {"content":"📦 Contenido","text":"📝 Texto","paragraph":"📝 Párrafo","heading":"🔠 Encabezado de sección","preformatted":"💻 Preformateado","footer":"🔻 Pie","caption":"💬 Descripción","photo":"🖼 Foto","video":"🎬 Vídeo","animation":"🎞 GIF","audio":"🎵 Audio","voice":"🎙 Nota de voz","document":"📄 Documento","sticker":"🏷 Sticker","video_note":"⭕ Nota de vídeo","divider":"➖ Separador","list":"📋 Lista","table":"▦ Tabla","blockquote":"❝ Cita","pullquote":"💬 Cita destacada","details":"📂 Detalles","mathematical_expression":"∑ Fórmula","anchor":"⚓ Ancla","collage":"🖼 Collage","slideshow":"🎞 Presentación","map":"🗺 Mapa","buttons":"🔘 Botones enriquecidos"},
    "fr": {"content":"📦 Contenu","text":"📝 Texte","paragraph":"📝 Paragraphe","heading":"🔠 Titre de section","preformatted":"💻 Préformaté","footer":"🔻 Pied de page","caption":"💬 Légende","photo":"🖼 Photo","video":"🎬 Vidéo","animation":"🎞 GIF","audio":"🎵 Audio","voice":"🎙 Message vocal","document":"📄 Document","sticker":"🏷 Sticker","video_note":"⭕ Message vidéo","divider":"➖ Séparateur","list":"📋 Liste","table":"▦ Tableau","blockquote":"❝ Citation","pullquote":"💬 Citation mise en avant","details":"📂 Détails","mathematical_expression":"∑ Formule","anchor":"⚓ Ancre","collage":"🖼 Collage","slideshow":"🎞 Diaporama","map":"🗺 Carte","buttons":"🔘 Boutons enrichis"},
    "de": {"content":"📦 Inhalt","text":"📝 Text","paragraph":"📝 Absatz","heading":"🔠 Abschnittsüberschrift","preformatted":"💻 Vorformatiert","footer":"🔻 Fußzeile","caption":"💬 Beschriftung","photo":"🖼 Foto","video":"🎬 Video","animation":"🎞 GIF","audio":"🎵 Audio","voice":"🎙 Sprachnachricht","document":"📄 Dokument","sticker":"🏷 Sticker","video_note":"⭕ Videonachricht","divider":"➖ Trennlinie","list":"📋 Liste","table":"▦ Tabelle","blockquote":"❝ Zitat","pullquote":"💬 Hervorgehobenes Zitat","details":"📂 Details","mathematical_expression":"∑ Formel","anchor":"⚓ Anker","collage":"🖼 Collage","slideshow":"🎞 Diashow","map":"🗺 Karte","buttons":"🔘 Rich-Buttons"},
    "it": {"content":"📦 Contenuto","text":"📝 Testo","paragraph":"📝 Paragrafo","heading":"🔠 Titolo di sezione","preformatted":"💻 Preformattato","footer":"🔻 Piè di pagina","caption":"💬 Didascalia","photo":"🖼 Foto","video":"🎬 Video","animation":"🎞 GIF","audio":"🎵 Audio","voice":"🎙 Messaggio vocale","document":"📄 Documento","sticker":"🏷 Sticker","video_note":"⭕ Videomessaggio","divider":"➖ Divisore","list":"📋 Elenco","table":"▦ Tabella","blockquote":"❝ Citazione","pullquote":"💬 Citazione in evidenza","details":"📂 Dettagli","mathematical_expression":"∑ Formula","anchor":"⚓ Ancora","collage":"🖼 Collage","slideshow":"🎞 Presentazione","map":"🗺 Mappa","buttons":"🔘 Pulsanti avanzati"},
    "pt": {"content":"📦 Conteúdo","text":"📝 Texto","paragraph":"📝 Parágrafo","heading":"🔠 Título de seção","preformatted":"💻 Pré-formatado","footer":"🔻 Rodapé","caption":"💬 Legenda","photo":"🖼 Foto","video":"🎬 Vídeo","animation":"🎞 GIF","audio":"🎵 Áudio","voice":"🎙 Mensagem de voz","document":"📄 Documento","sticker":"🏷 Sticker","video_note":"⭕ Mensagem de vídeo","divider":"➖ Divisor","list":"📋 Lista","table":"▦ Tabela","blockquote":"❝ Citação","pullquote":"💬 Citação destacada","details":"📂 Detalhes","mathematical_expression":"∑ Fórmula","anchor":"⚓ Âncora","collage":"🖼 Colagem","slideshow":"🎞 Apresentação","map":"🗺 Mapa","buttons":"🔘 Botões ricos"},
    "nl": {"content":"📦 Inhoud","text":"📝 Tekst","paragraph":"📝 Alinea","heading":"🔠 Sectiekop","preformatted":"💻 Vooraf opgemaakt","footer":"🔻 Voettekst","caption":"💬 Bijschrift","photo":"🖼 Foto","video":"🎬 Video","animation":"🎞 GIF","audio":"🎵 Audio","voice":"🎙 Spraakbericht","document":"📄 Document","sticker":"🏷 Sticker","video_note":"⭕ Videobericht","divider":"➖ Scheiding","list":"📋 Lijst","table":"▦ Tabel","blockquote":"❝ Citaat","pullquote":"💬 Uitgelicht citaat","details":"📂 Details","mathematical_expression":"∑ Formule","anchor":"⚓ Anker","collage":"🖼 Collage","slideshow":"🎞 Diavoorstelling","map":"🗺 Kaart","buttons":"🔘 Rich-knoppen"},
    "pl": {"content":"📦 Treść","text":"📝 Tekst","paragraph":"📝 Akapit","heading":"🔠 Nagłówek sekcji","preformatted":"💻 Tekst preformatowany","footer":"🔻 Stopka","caption":"💬 Podpis","photo":"🖼 Zdjęcie","video":"🎬 Wideo","animation":"🎞 GIF","audio":"🎵 Audio","voice":"🎙 Wiadomość głosowa","document":"📄 Dokument","sticker":"🏷 Naklejka","video_note":"⭕ Wiadomość wideo","divider":"➖ Separator","list":"📋 Lista","table":"▦ Tabela","blockquote":"❝ Cytat","pullquote":"💬 Wyróżniony cytat","details":"📂 Szczegóły","mathematical_expression":"∑ Wzór","anchor":"⚓ Kotwica","collage":"🖼 Kolaż","slideshow":"🎞 Pokaz slajdów","map":"🗺 Mapa","buttons":"🔘 Przyciski Rich"},
    "uk": {"content":"📦 Вміст","text":"📝 Текст","paragraph":"📝 Абзац","heading":"🔠 Заголовок розділу","preformatted":"💻 Форматований текст","footer":"🔻 Нижній колонтитул","caption":"💬 Підпис","photo":"🖼 Фото","video":"🎬 Відео","animation":"🎞 GIF","audio":"🎵 Аудіо","voice":"🎙 Голосове повідомлення","document":"📄 Документ","sticker":"🏷 Стікер","video_note":"⭕ Відеоповідомлення","divider":"➖ Роздільник","list":"📋 Список","table":"▦ Таблиця","blockquote":"❝ Цитата","pullquote":"💬 Виділена цитата","details":"📂 Деталі","mathematical_expression":"∑ Формула","anchor":"⚓ Якір","collage":"🖼 Колаж","slideshow":"🎞 Слайд-шоу","map":"🗺 Мапа","buttons":"🔘 Rich-кнопки"},
    "ru": {"content":"📦 Содержимое","text":"📝 Текст","paragraph":"📝 Абзац","heading":"🔠 Заголовок раздела","preformatted":"💻 Форматированный текст","footer":"🔻 Подвал","caption":"💬 Подпись","photo":"🖼 Фото","video":"🎬 Видео","animation":"🎞 GIF","audio":"🎵 Аудио","voice":"🎙 Голосовое сообщение","document":"📄 Документ","sticker":"🏷 Стикер","video_note":"⭕ Видеосообщение","divider":"➖ Разделитель","list":"📋 Список","table":"▦ Таблица","blockquote":"❝ Цитата","pullquote":"💬 Выделенная цитата","details":"📂 Детали","mathematical_expression":"∑ Формула","anchor":"⚓ Якорь","collage":"🖼 Коллаж","slideshow":"🎞 Слайд-шоу","map":"🗺 Карта","buttons":"🔘 Rich-кнопки"},
    "tr": {"content":"📦 İçerik","text":"📝 Metin","paragraph":"📝 Paragraf","heading":"🔠 Bölüm başlığı","preformatted":"💻 Ön biçimli metin","footer":"🔻 Alt bilgi","caption":"💬 Açıklama","photo":"🖼 Fotoğraf","video":"🎬 Video","animation":"🎞 GIF","audio":"🎵 Ses","voice":"🎙 Sesli mesaj","document":"📄 Belge","sticker":"🏷 Çıkartma","video_note":"⭕ Video mesajı","divider":"➖ Ayırıcı","list":"📋 Liste","table":"▦ Tablo","blockquote":"❝ Alıntı","pullquote":"💬 Vurgulu alıntı","details":"📂 Detaylar","mathematical_expression":"∑ Formül","anchor":"⚓ Çapa","collage":"🖼 Kolaj","slideshow":"🎞 Slayt gösterisi","map":"🗺 Harita","buttons":"🔘 Zengin düğmeler"},
    "fa": {"content":"📦 محتوا","text":"📝 متن","paragraph":"📝 پاراگراف","heading":"🔠 عنوان بخش","preformatted":"💻 متن قالب‌بندی‌شده","footer":"🔻 پاورقی","caption":"💬 توضیح","photo":"🖼 عکس","video":"🎬 ویدیو","animation":"🎞 GIF","audio":"🎵 صدا","voice":"🎙 پیام صوتی","document":"📄 فایل","sticker":"🏷 استیکر","video_note":"⭕ پیام ویدیویی","divider":"➖ جداکننده","list":"📋 فهرست","table":"▦ جدول","blockquote":"❝ نقل‌قول","pullquote":"💬 نقل‌قول برجسته","details":"📂 جزئیات","mathematical_expression":"∑ فرمول","anchor":"⚓ لنگر","collage":"🖼 کلاژ","slideshow":"🎞 نمایش اسلاید","map":"🗺 نقشه","buttons":"🔘 دکمه‌های غنی"},
    "ku": {"content":"📦 Naverok","text":"📝 Nivîs","paragraph":"📝 Paragraf","heading":"🔠 Sernavê beşê","preformatted":"💻 Nivîsa pêş-formatkirî","footer":"🔻 Binpê","caption":"💬 Şirove","photo":"🖼 Wêne","video":"🎬 Vîdyo","animation":"🎞 GIF","audio":"🎵 Deng","voice":"🎙 Peyama dengî","document":"📄 Belge","sticker":"🏷 Sticker","video_note":"⭕ Peyama vîdyoyî","divider":"➖ Dabeşker","list":"📋 Lîste","table":"▦ Tablo","blockquote":"❝ Vegotin","pullquote":"💬 Vegotina derketî","details":"📂 Hûragahî","mathematical_expression":"∑ Formul","anchor":"⚓ Lenger","collage":"🖼 Kolaj","slideshow":"🎞 Pêşandan","map":"🗺 Nexşe","buttons":"🔘 Bişkokên dewlemend"},
    "ur": {"content":"📦 مواد","text":"📝 متن","paragraph":"📝 پیراگراف","heading":"🔠 حصے کی سرخی","preformatted":"💻 پہلے سے فارمیٹ شدہ متن","footer":"🔻 فٹر","caption":"💬 کیپشن","photo":"🖼 تصویر","video":"🎬 ویڈیو","animation":"🎞 GIF","audio":"🎵 آڈیو","voice":"🎙 صوتی پیغام","document":"📄 دستاویز","sticker":"🏷 اسٹیکر","video_note":"⭕ ویڈیو پیغام","divider":"➖ جداکار","list":"📋 فہرست","table":"▦ جدول","blockquote":"❝ اقتباس","pullquote":"💬 نمایاں اقتباس","details":"📂 تفصیلات","mathematical_expression":"∑ فارمولا","anchor":"⚓ اینکر","collage":"🖼 کولاج","slideshow":"🎞 سلائیڈ شو","map":"🗺 نقشہ","buttons":"🔘 رِچ بٹن"},
    "hi": {"content":"📦 सामग्री","text":"📝 टेक्स्ट","paragraph":"📝 अनुच्छेद","heading":"🔠 सेक्शन शीर्षक","preformatted":"💻 पूर्व-स्वरूपित टेक्स्ट","footer":"🔻 फ़ुटर","caption":"💬 कैप्शन","photo":"🖼 फ़ोटो","video":"🎬 वीडियो","animation":"🎞 GIF","audio":"🎵 ऑडियो","voice":"🎙 वॉइस नोट","document":"📄 दस्तावेज़","sticker":"🏷 स्टिकर","video_note":"⭕ वीडियो संदेश","divider":"➖ विभाजक","list":"📋 सूची","table":"▦ तालिका","blockquote":"❝ उद्धरण","pullquote":"💬 प्रमुख उद्धरण","details":"📂 विवरण","mathematical_expression":"∑ सूत्र","anchor":"⚓ एंकर","collage":"🖼 कोलाज","slideshow":"🎞 स्लाइडशो","map":"🗺 मानचित्र","buttons":"🔘 रिच बटन"},
    "id": {"content":"📦 Konten","text":"📝 Teks","paragraph":"📝 Paragraf","heading":"🔠 Judul bagian","preformatted":"💻 Teks terformat","footer":"🔻 Footer","caption":"💬 Keterangan","photo":"🖼 Foto","video":"🎬 Video","animation":"🎞 GIF","audio":"🎵 Audio","voice":"🎙 Pesan suara","document":"📄 Dokumen","sticker":"🏷 Stiker","video_note":"⭕ Pesan video","divider":"➖ Pemisah","list":"📋 Daftar","table":"▦ Tabel","blockquote":"❝ Kutipan","pullquote":"💬 Kutipan sorotan","details":"📂 Detail","mathematical_expression":"∑ Rumus","anchor":"⚓ Jangkar","collage":"🖼 Kolase","slideshow":"🎞 Tayangan slide","map":"🗺 Peta","buttons":"🔘 Tombol kaya"},
    "ja": {"content":"📦 コンテンツ","text":"📝 テキスト","paragraph":"📝 段落","heading":"🔠 セクション見出し","preformatted":"💻 整形済みテキスト","footer":"🔻 フッター","caption":"💬 キャプション","photo":"🖼 写真","video":"🎬 動画","animation":"🎞 GIF","audio":"🎵 音声","voice":"🎙 ボイスメッセージ","document":"📄 ドキュメント","sticker":"🏷 ステッカー","video_note":"⭕ ビデオメッセージ","divider":"➖ 区切り","list":"📋 リスト","table":"▦ 表","blockquote":"❝ 引用","pullquote":"💬 強調引用","details":"📂 詳細","mathematical_expression":"∑ 数式","anchor":"⚓ アンカー","collage":"🖼 コラージュ","slideshow":"🎞 スライドショー","map":"🗺 地図","buttons":"🔘 リッチボタン"},
    "ko": {"content":"📦 콘텐츠","text":"📝 텍스트","paragraph":"📝 문단","heading":"🔠 섹션 제목","preformatted":"💻 서식 지정 텍스트","footer":"🔻 바닥글","caption":"💬 캡션","photo":"🖼 사진","video":"🎬 동영상","animation":"🎞 GIF","audio":"🎵 오디오","voice":"🎙 음성 메시지","document":"📄 문서","sticker":"🏷 스티커","video_note":"⭕ 비디오 메시지","divider":"➖ 구분선","list":"📋 목록","table":"▦ 표","blockquote":"❝ 인용","pullquote":"💬 강조 인용","details":"📂 세부정보","mathematical_expression":"∑ 수식","anchor":"⚓ 앵커","collage":"🖼 콜라주","slideshow":"🎞 슬라이드쇼","map":"🗺 지도","buttons":"🔘 리치 버튼"},
    "vi": {"content":"📦 Nội dung","text":"📝 Văn bản","paragraph":"📝 Đoạn văn","heading":"🔠 Tiêu đề phần","preformatted":"💻 Văn bản định dạng sẵn","footer":"🔻 Chân trang","caption":"💬 Chú thích","photo":"🖼 Ảnh","video":"🎬 Video","animation":"🎞 GIF","audio":"🎵 Âm thanh","voice":"🎙 Tin nhắn thoại","document":"📄 Tài liệu","sticker":"🏷 Nhãn dán","video_note":"⭕ Tin nhắn video","divider":"➖ Dấu phân cách","list":"📋 Danh sách","table":"▦ Bảng","blockquote":"❝ Trích dẫn","pullquote":"💬 Trích dẫn nổi bật","details":"📂 Chi tiết","mathematical_expression":"∑ Công thức","anchor":"⚓ Neo","collage":"🖼 Ảnh ghép","slideshow":"🎞 Trình chiếu","map":"🗺 Bản đồ","buttons":"🔘 Nút phong phú"},
    "th": {"content":"📦 เนื้อหา","text":"📝 ข้อความ","paragraph":"📝 ย่อหน้า","heading":"🔠 หัวข้อส่วน","preformatted":"💻 ข้อความจัดรูปแบบ","footer":"🔻 ส่วนท้าย","caption":"💬 คำอธิบาย","photo":"🖼 รูปภาพ","video":"🎬 วิดีโอ","animation":"🎞 GIF","audio":"🎵 เสียง","voice":"🎙 ข้อความเสียง","document":"📄 เอกสาร","sticker":"🏷 สติกเกอร์","video_note":"⭕ ข้อความวิดีโอ","divider":"➖ ตัวแบ่ง","list":"📋 รายการ","table":"▦ ตาราง","blockquote":"❝ คำอ้างอิง","pullquote":"💬 คำอ้างอิงเด่น","details":"📂 รายละเอียด","mathematical_expression":"∑ สูตร","anchor":"⚓ จุดยึด","collage":"🖼 ภาพตัดปะ","slideshow":"🎞 สไลด์โชว์","map":"🗺 แผนที่","buttons":"🔘 ปุ่ม Rich"},
    "zh-hans": {"content":"📦 内容","text":"📝 文本","paragraph":"📝 段落","heading":"🔠 章节标题","preformatted":"💻 预格式化","footer":"🔻 页脚","caption":"💬 说明","photo":"🖼 照片","video":"🎬 视频","animation":"🎞 GIF","audio":"🎵 音频","voice":"🎙 语音消息","document":"📄 文件","sticker":"🏷 贴纸","video_note":"⭕ 视频消息","divider":"➖ 分隔线","list":"📋 列表","table":"▦ 表格","blockquote":"❝ 引用块","pullquote":"💬 醒目引用","details":"📂 详情","mathematical_expression":"∑ 公式","anchor":"⚓ 锚点","collage":"🖼 拼贴","slideshow":"🎞 幻灯片","map":"🗺 地图","buttons":"🔘 富按钮"},
    "zh-hant": {"content":"📦 內容","text":"📝 文字","paragraph":"📝 段落","heading":"🔠 章節標題","preformatted":"💻 預格式化","footer":"🔻 頁尾","caption":"💬 說明","photo":"🖼 照片","video":"🎬 影片","animation":"🎞 GIF","audio":"🎵 音訊","voice":"🎙 語音訊息","document":"📄 文件","sticker":"🏷 貼圖","video_note":"⭕ 影片訊息","divider":"➖ 分隔線","list":"📋 列表","table":"▦ 表格","blockquote":"❝ 引用區塊","pullquote":"💬 醒目引用","details":"📂 詳情","mathematical_expression":"∑ 公式","anchor":"⚓ 錨點","collage":"🖼 拼貼","slideshow":"🎞 幻燈片","map":"🗺 地圖","buttons":"🔘 富按鈕"},
}


MATH_PROMPT_TRANSLATIONS: dict[str, dict[str, str]] = {
    "es": {
        "math.add_prompt": "Envía la fórmula en LaTeX.\n\nPara añadir un espacio entre textos, usa: \\ ",
        "math.edit_prompt": "Envía la nueva fórmula en LaTeX.\n\nPara añadir un espacio entre textos, usa: \\ ",
    },
    "fr": {
        "math.add_prompt": "Envoyez la formule en LaTeX.\n\nPour ajouter un espace entre les textes, utilisez : \\ ",
        "math.edit_prompt": "Envoyez la nouvelle formule en LaTeX.\n\nPour ajouter un espace entre les textes, utilisez : \\ ",
    },
    "de": {
        "math.add_prompt": "Sende die Formel in LaTeX.\n\nFür ein Leerzeichen zwischen Texten verwende: \\ ",
        "math.edit_prompt": "Sende die neue LaTeX-Formel.\n\nFür ein Leerzeichen zwischen Texten verwende: \\ ",
    },
    "it": {
        "math.add_prompt": "Invia la formula in LaTeX.\n\nPer aggiungere uno spazio tra i testi, usa: \\ ",
        "math.edit_prompt": "Invia la nuova formula in LaTeX.\n\nPer aggiungere uno spazio tra i testi, usa: \\ ",
    },
    "pt": {
        "math.add_prompt": "Envie a fórmula em LaTeX.\n\nPara adicionar um espaço entre textos, use: \\ ",
        "math.edit_prompt": "Envie a nova fórmula em LaTeX.\n\nPara adicionar um espaço entre textos, use: \\ ",
    },
    "nl": {
        "math.add_prompt": "Stuur de formule in LaTeX.\n\nGebruik voor een spatie tussen teksten: \\ ",
        "math.edit_prompt": "Stuur de nieuwe LaTeX-formule.\n\nGebruik voor een spatie tussen teksten: \\ ",
    },
    "pl": {
        "math.add_prompt": "Wyślij formułę w LaTeX.\n\nAby dodać odstęp między tekstami, użyj: \\ ",
        "math.edit_prompt": "Wyślij nową formułę w LaTeX.\n\nAby dodać odstęp między tekstami, użyj: \\ ",
    },
    "uk": {
        "math.add_prompt": "Надішліть формулу у форматі LaTeX.\n\nЩоб додати пробіл між текстами, використайте: \\ ",
        "math.edit_prompt": "Надішліть нову формулу у форматі LaTeX.\n\nЩоб додати пробіл між текстами, використайте: \\ ",
    },
    "ru": {
        "math.add_prompt": "Отправьте формулу в формате LaTeX.\n\nЧтобы добавить пробел между текстами, используйте: \\ ",
        "math.edit_prompt": "Отправьте новую формулу в формате LaTeX.\n\nЧтобы добавить пробел между текстами, используйте: \\ ",
    },
    "tr": {
        "math.add_prompt": "Formülü LaTeX biçiminde gönderin.\n\nMetinler arasına boşluk eklemek için şunu kullanın: \\ ",
        "math.edit_prompt": "Yeni LaTeX formülünü gönderin.\n\nMetinler arasına boşluk eklemek için şunu kullanın: \\ ",
    },
    "fa": {
        "math.add_prompt": "فرمول را با قالب LaTeX ارسال کنید.\n\nبرای افزودن فاصله بین متن‌ها از این استفاده کنید: \\ ",
        "math.edit_prompt": "فرمول جدید LaTeX را ارسال کنید.\n\nبرای افزودن فاصله بین متن‌ها از این استفاده کنید: \\ ",
    },
    "ku": {
        "math.add_prompt": "Formulê bi formata LaTeX bişînin.\n\nJi bo zêdekirina valahiyê di navbera nivîsan de, vê bikar bînin: \\ ",
        "math.edit_prompt": "Formula nû ya LaTeX bişînin.\n\nJi bo zêdekirina valahiyê di navbera nivîsan de, vê bikar bînin: \\ ",
    },
    "ur": {
        "math.add_prompt": "فارمولا LaTeX میں بھیجیں۔\n\nمتن کے درمیان فاصلہ شامل کرنے کے لیے استعمال کریں: \\ ",
        "math.edit_prompt": "نیا LaTeX فارمولا بھیجیں۔\n\nمتن کے درمیان فاصلہ شامل کرنے کے لیے استعمال کریں: \\ ",
    },
    "hi": {
        "math.add_prompt": "सूत्र LaTeX में भेजें।\n\nटेक्स्ट के बीच स्पेस जोड़ने के लिए इसका उपयोग करें: \\ ",
        "math.edit_prompt": "नया LaTeX सूत्र भेजें।\n\nटेक्स्ट के बीच स्पेस जोड़ने के लिए इसका उपयोग करें: \\ ",
    },
    "id": {
        "math.add_prompt": "Kirim rumus dalam LaTeX.\n\nUntuk menambahkan spasi di antara teks, gunakan: \\ ",
        "math.edit_prompt": "Kirim rumus LaTeX yang baru.\n\nUntuk menambahkan spasi di antara teks, gunakan: \\ ",
    },
    "ja": {
        "math.add_prompt": "LaTeX形式で数式を送信してください。\n\nテキスト間に空白を追加するには、次を使用します: \\ ",
        "math.edit_prompt": "新しいLaTeX数式を送信してください。\n\nテキスト間に空白を追加するには、次を使用します: \\ ",
    },
    "ko": {
        "math.add_prompt": "LaTeX 형식으로 수식을 보내세요.\n\n텍스트 사이에 공백을 추가하려면 다음을 사용하세요: \\ ",
        "math.edit_prompt": "새 LaTeX 수식을 보내세요.\n\n텍스트 사이에 공백을 추가하려면 다음을 사용하세요: \\ ",
    },
    "vi": {
        "math.add_prompt": "Gửi công thức ở định dạng LaTeX.\n\nĐể thêm khoảng trắng giữa các đoạn văn bản, hãy dùng: \\ ",
        "math.edit_prompt": "Gửi công thức LaTeX mới.\n\nĐể thêm khoảng trắng giữa các đoạn văn bản, hãy dùng: \\ ",
    },
    "th": {
        "math.add_prompt": "ส่งสูตรในรูปแบบ LaTeX\n\nหากต้องการเพิ่มช่องว่างระหว่างข้อความ ให้ใช้: \\ ",
        "math.edit_prompt": "ส่งสูตร LaTeX ใหม่\n\nหากต้องการเพิ่มช่องว่างระหว่างข้อความ ให้ใช้: \\ ",
    },
    "zh-hans": {
        "math.add_prompt": "请发送 LaTeX 公式。\n\n要在文本之间添加空格，请使用：\\ ",
        "math.edit_prompt": "请发送新的 LaTeX 公式。\n\n要在文本之间添加空格，请使用：\\ ",
    },
    "zh-hant": {
        "math.add_prompt": "請傳送 LaTeX 公式。\n\n若要在文字之間加入空格，請使用：\\ ",
        "math.edit_prompt": "請傳送新的 LaTeX 公式。\n\n若要在文字之間加入空格，請使用：\\ ",
    },
}

CODE_PROMPT_TRANSLATIONS: dict[str, dict[str, str]] = {
    "es": {"code.add_prompt": "Envía el código.\n\nPara indicar el lenguaje, comienza con /lang python y escribe el código en las líneas siguientes. También puedes usar ```python ... ```.", "code.edit_prompt": "Envía el código nuevo.\n\nPara indicar el lenguaje, comienza con /lang python y escribe el código en las líneas siguientes. También puedes usar ```python ... ```."},
    "fr": {"code.add_prompt": "Envoyez le code.\n\nPour définir le langage, commencez par /lang python puis écrivez le code sur les lignes suivantes. Vous pouvez aussi utiliser ```python ... ```.", "code.edit_prompt": "Envoyez le nouveau code.\n\nPour définir le langage, commencez par /lang python puis écrivez le code sur les lignes suivantes. Vous pouvez aussi utiliser ```python ... ```."},
    "de": {"code.add_prompt": "Sende den Code.\n\nBeginne zur Sprachauswahl mit /lang python und schreibe den Code in die folgenden Zeilen. Du kannst auch ```python ... ``` verwenden.", "code.edit_prompt": "Sende den neuen Code.\n\nBeginne zur Sprachauswahl mit /lang python und schreibe den Code in die folgenden Zeilen. Du kannst auch ```python ... ``` verwenden."},
    "it": {"code.add_prompt": "Invia il codice.\n\nPer impostare il linguaggio, inizia con /lang python e scrivi il codice nelle righe successive. Puoi anche usare ```python ... ```.", "code.edit_prompt": "Invia il nuovo codice.\n\nPer impostare il linguaggio, inizia con /lang python e scrivi il codice nelle righe successive. Puoi anche usare ```python ... ```."},
    "pt": {"code.add_prompt": "Envie o código.\n\nPara definir a linguagem, comece com /lang python e escreva o código nas linhas seguintes. Você também pode usar ```python ... ```.", "code.edit_prompt": "Envie o novo código.\n\nPara definir a linguagem, comece com /lang python e escreva o código nas linhas seguintes. Você também pode usar ```python ... ```."},
    "nl": {"code.add_prompt": "Stuur de code.\n\nBegin met /lang python om de taal in te stellen en zet de code op de volgende regels. Je kunt ook ```python ... ``` gebruiken.", "code.edit_prompt": "Stuur de nieuwe code.\n\nBegin met /lang python om de taal in te stellen en zet de code op de volgende regels. Je kunt ook ```python ... ``` gebruiken."},
    "pl": {"code.add_prompt": "Wyślij kod.\n\nAby ustawić język, zacznij od /lang python i wpisz kod w kolejnych wierszach. Możesz też użyć ```python ... ```.", "code.edit_prompt": "Wyślij nowy kod.\n\nAby ustawić język, zacznij od /lang python i wpisz kod w kolejnych wierszach. Możesz też użyć ```python ... ```."},
    "uk": {"code.add_prompt": "Надішліть код.\n\nЩоб указати мову, почніть з /lang python і напишіть код у наступних рядках. Також можна використати ```python ... ```.", "code.edit_prompt": "Надішліть новий код.\n\nЩоб указати мову, почніть з /lang python і напишіть код у наступних рядках. Також можна використати ```python ... ```."},
    "ru": {"code.add_prompt": "Отправьте код.\n\nЧтобы указать язык, начните с /lang python и напишите код в следующих строках. Также можно использовать ```python ... ```.", "code.edit_prompt": "Отправьте новый код.\n\nЧтобы указать язык, начните с /lang python и напишите код в следующих строках. Также можно использовать ```python ... ```."},
    "tr": {"code.add_prompt": "Kodu gönderin.\n\nDili belirlemek için /lang python ile başlayın ve kodu sonraki satırlara yazın. ```python ... ``` da kullanabilirsiniz.", "code.edit_prompt": "Yeni kodu gönderin.\n\nDili belirlemek için /lang python ile başlayın ve kodu sonraki satırlara yazın. ```python ... ``` da kullanabilirsiniz."},
    "fa": {"code.add_prompt": "کد را ارسال کنید.\n\nبرای تعیین زبان، با /lang python شروع کنید و کد را در خط‌های بعد بنویسید. می‌توانید از ```python ... ``` نیز استفاده کنید.", "code.edit_prompt": "کد جدید را ارسال کنید.\n\nبرای تعیین زبان، با /lang python شروع کنید و کد را در خط‌های بعد بنویسید. می‌توانید از ```python ... ``` نیز استفاده کنید."},
    "ku": {"code.add_prompt": "Kodê bişîne.\n\nJi bo diyarkirina zimanî bi /lang python dest pê bike û kodê li rêzên paşîn binivîse. ```python ... ``` jî dikarî bikar bînî.", "code.edit_prompt": "Koda nû bişîne.\n\nJi bo diyarkirina zimanî bi /lang python dest pê bike û kodê li rêzên paşîn binivîse. ```python ... ``` jî dikarî bikar bînî."},
    "ur": {"code.add_prompt": "کوڈ بھیجیں۔\n\nزبان مقرر کرنے کے لیے /lang python سے شروع کریں اور اگلی سطروں میں کوڈ لکھیں۔ آپ ```python ... ``` بھی استعمال کر سکتے ہیں۔", "code.edit_prompt": "نیا کوڈ بھیجیں۔\n\nزبان مقرر کرنے کے لیے /lang python سے شروع کریں اور اگلی سطروں میں کوڈ لکھیں۔ آپ ```python ... ``` بھی استعمال کر سکتے ہیں۔"},
    "hi": {"code.add_prompt": "कोड भेजें।\n\nभाषा तय करने के लिए /lang python से शुरू करें और अगली पंक्तियों में कोड लिखें। आप ```python ... ``` भी इस्तेमाल कर सकते हैं।", "code.edit_prompt": "नया कोड भेजें।\n\nभाषा तय करने के लिए /lang python से शुरू करें और अगली पंक्तियों में कोड लिखें। आप ```python ... ``` भी इस्तेमाल कर सकते हैं।"},
    "id": {"code.add_prompt": "Kirim kode.\n\nUntuk menentukan bahasa, mulai dengan /lang python lalu tulis kode di baris berikutnya. Anda juga dapat memakai ```python ... ```.", "code.edit_prompt": "Kirim kode baru.\n\nUntuk menentukan bahasa, mulai dengan /lang python lalu tulis kode di baris berikutnya. Anda juga dapat memakai ```python ... ```."},
    "ja": {"code.add_prompt": "コードを送信してください。\n\n言語を指定するには /lang python で始め、次の行からコードを書きます。```python ... ``` も使用できます。", "code.edit_prompt": "新しいコードを送信してください。\n\n言語を指定するには /lang python で始め、次の行からコードを書きます。```python ... ``` も使用できます。"},
    "ko": {"code.add_prompt": "코드를 보내세요.\n\n언어를 지정하려면 /lang python으로 시작하고 다음 줄부터 코드를 작성하세요. ```python ... ```도 사용할 수 있습니다.", "code.edit_prompt": "새 코드를 보내세요.\n\n언어를 지정하려면 /lang python으로 시작하고 다음 줄부터 코드를 작성하세요. ```python ... ```도 사용할 수 있습니다."},
    "vi": {"code.add_prompt": "Gửi mã.\n\nĐể chọn ngôn ngữ, hãy bắt đầu bằng /lang python rồi viết mã ở các dòng tiếp theo. Bạn cũng có thể dùng ```python ... ```.", "code.edit_prompt": "Gửi mã mới.\n\nĐể chọn ngôn ngữ, hãy bắt đầu bằng /lang python rồi viết mã ở các dòng tiếp theo. Bạn cũng có thể dùng ```python ... ```."},
    "th": {"code.add_prompt": "ส่งโค้ด\n\nหากต้องการระบุภาษา ให้เริ่มด้วย /lang python แล้วเขียนโค้ดในบรรทัดถัดไป หรือใช้ ```python ... ```", "code.edit_prompt": "ส่งโค้ดใหม่\n\nหากต้องการระบุภาษา ให้เริ่มด้วย /lang python แล้วเขียนโค้ดในบรรทัดถัดไป หรือใช้ ```python ... ```"},
    "zh-hans": {"code.add_prompt": "请发送代码。\n\n要指定语言，请以 /lang python 开头，并在后续行中编写代码。也可以使用 ```python ... ```。", "code.edit_prompt": "请发送新代码。\n\n要指定语言，请以 /lang python 开头，并在后续行中编写代码。也可以使用 ```python ... ```。"},
    "zh-hant": {"code.add_prompt": "請傳送程式碼。\n\n若要指定語言，請以 /lang python 開頭，並在後續行中撰寫程式碼。也可以使用 ```python ... ```。", "code.edit_prompt": "請傳送新程式碼。\n\n若要指定語言，請以 /lang python 開頭，並在後續行中撰寫程式碼。也可以使用 ```python ... ```。"},
}


EDITOR_START_TRANSLATIONS: dict[str, dict[str, str]] = {
    "es": {"editor.closed_hint": "Usa los botones del editor o envía /editor para comenzar un mensaje nuevo.", "editor.start_button": "▶️ Iniciar editor", "editor.new_button": "➕ Iniciar editor", "editor.empty_hint": "Personalizar mensaje\n\nAñade un Block o abre una de tus páginas guardadas:"},
    "fr": {"editor.closed_hint": "Utilisez les boutons de l’éditeur ou envoyez /editor pour commencer un nouveau message.", "editor.start_button": "▶️ Démarrer l’éditeur", "editor.new_button": "➕ Démarrer l’éditeur", "editor.empty_hint": "Personnaliser le message\n\nAjoutez un Block ou ouvrez l’une de vos pages enregistrées :"},
    "de": {"editor.closed_hint": "Verwende die Editor-Schaltflächen oder sende /editor, um eine neue Nachricht zu beginnen.", "editor.start_button": "▶️ Editor starten", "editor.new_button": "➕ Editor starten", "editor.empty_hint": "Nachricht anpassen\n\nFüge einen Block hinzu oder öffne eine deiner gespeicherten Seiten:"},
    "it": {"editor.closed_hint": "Usa i pulsanti dell’editor oppure invia /editor per iniziare un nuovo messaggio.", "editor.start_button": "▶️ Avvia editor", "editor.new_button": "➕ Avvia editor", "editor.empty_hint": "Personalizza il messaggio\n\nAggiungi un Block o apri una delle pagine salvate:"},
    "pt": {"editor.closed_hint": "Use os botões do editor ou envie /editor para iniciar uma nova mensagem.", "editor.start_button": "▶️ Iniciar editor", "editor.new_button": "➕ Iniciar editor", "editor.empty_hint": "Personalizar mensagem\n\nAdicione um Block ou abra uma das suas páginas salvas:"},
    "nl": {"editor.closed_hint": "Gebruik de editorknoppen of stuur /editor om een nieuw bericht te beginnen.", "editor.start_button": "▶️ Editor starten", "editor.new_button": "➕ Editor starten", "editor.empty_hint": "Bericht aanpassen\n\nVoeg een Block toe of open een van je opgeslagen pagina’s:"},
    "pl": {"editor.closed_hint": "Użyj przycisków edytora lub wyślij /editor, aby rozpocząć nową wiadomość.", "editor.start_button": "▶️ Uruchom edytor", "editor.new_button": "➕ Uruchom edytor", "editor.empty_hint": "Dostosuj wiadomość\n\nDodaj Block lub otwórz jedną z zapisanych stron:"},
    "uk": {"editor.closed_hint": "Скористайтеся кнопками редактора або надішліть /editor, щоб почати нове повідомлення.", "editor.start_button": "▶️ Запустити редактор", "editor.new_button": "➕ Запустити редактор", "editor.empty_hint": "Налаштувати повідомлення\n\nДодайте Block або відкрийте одну зі збережених сторінок:"},
    "ru": {"editor.closed_hint": "Используйте кнопки редактора или отправьте /editor, чтобы начать новое сообщение.", "editor.start_button": "▶️ Запустить редактор", "editor.new_button": "➕ Запустить редактор", "editor.empty_hint": "Настроить сообщение\n\nДобавьте Block или откройте одну из сохранённых страниц:"},
    "tr": {"editor.closed_hint": "Düzenleyici düğmelerini kullanın veya yeni bir mesaj başlatmak için /editor gönderin.", "editor.start_button": "▶️ Düzenleyiciyi başlat", "editor.new_button": "➕ Düzenleyiciyi başlat", "editor.empty_hint": "Mesajı özelleştir\n\nBir Block ekleyin veya kayıtlı sayfalarınızdan birini açın:"},
    "fa": {"editor.closed_hint": "از دکمه‌های ویرایشگر استفاده کنید یا برای شروع پیام جدید /editor را ارسال کنید.", "editor.start_button": "▶️ شروع ویرایشگر", "editor.new_button": "➕ شروع ویرایشگر", "editor.empty_hint": "سفارشی‌سازی پیام\n\nیک Block اضافه کنید یا یکی از صفحه‌های ذخیره‌شده را باز کنید:"},
    "ku": {"editor.closed_hint": "Bişkokên edîtorê bikar bînin an ji bo destpêkirina peyameke nû /editor bişînin.", "editor.start_button": "▶️ Edîtorê dest pê bike", "editor.new_button": "➕ Edîtorê dest pê bike", "editor.empty_hint": "Peyamê taybet bikin\n\nBlockek zêde bikin an yek ji rûpelên tomarkirî vekin:"},
    "ur": {"editor.closed_hint": "ایڈیٹر کے بٹن استعمال کریں یا نیا پیغام شروع کرنے کے لیے /editor بھیجیں۔", "editor.start_button": "▶️ ایڈیٹر شروع کریں", "editor.new_button": "➕ ایڈیٹر شروع کریں", "editor.empty_hint": "پیغام کو حسب ضرورت بنائیں\n\nایک Block شامل کریں یا اپنے محفوظ صفحات میں سے کوئی صفحہ کھولیں:"},
    "hi": {"editor.closed_hint": "एडिटर के बटन इस्तेमाल करें या नया संदेश शुरू करने के लिए /editor भेजें।", "editor.start_button": "▶️ एडिटर शुरू करें", "editor.new_button": "➕ एडिटर शुरू करें", "editor.empty_hint": "संदेश को अनुकूलित करें\n\nएक Block जोड़ें या अपने सहेजे गए पेज में से कोई पेज खोलें:"},
    "id": {"editor.closed_hint": "Gunakan tombol editor atau kirim /editor untuk memulai pesan baru.", "editor.start_button": "▶️ Mulai editor", "editor.new_button": "➕ Mulai editor", "editor.empty_hint": "Sesuaikan pesan\n\nTambahkan Block atau buka salah satu halaman tersimpan Anda:"},
    "ja": {"editor.closed_hint": "エディターのボタンを使用するか、/editor を送信して新しいメッセージを開始してください。", "editor.start_button": "▶️ エディターを開始", "editor.new_button": "➕ エディターを開始", "editor.empty_hint": "メッセージをカスタマイズ\n\nBlockを追加するか、保存済みページを開いてください:"},
    "ko": {"editor.closed_hint": "편집기 버튼을 사용하거나 /editor를 보내 새 메시지를 시작하세요.", "editor.start_button": "▶️ 편집기 시작", "editor.new_button": "➕ 편집기 시작", "editor.empty_hint": "메시지 사용자 지정\n\nBlock을 추가하거나 저장된 페이지 중 하나를 여세요:"},
    "vi": {"editor.closed_hint": "Hãy dùng các nút của trình chỉnh sửa hoặc gửi /editor để bắt đầu tin nhắn mới.", "editor.start_button": "▶️ Bắt đầu trình chỉnh sửa", "editor.new_button": "➕ Bắt đầu trình chỉnh sửa", "editor.empty_hint": "Tùy chỉnh tin nhắn\n\nThêm một Block hoặc mở một trong các trang đã lưu:"},
    "th": {"editor.closed_hint": "ใช้ปุ่มของตัวแก้ไข หรือส่ง /editor เพื่อเริ่มข้อความใหม่", "editor.start_button": "▶️ เริ่มตัวแก้ไข", "editor.new_button": "➕ เริ่มตัวแก้ไข", "editor.empty_hint": "ปรับแต่งข้อความ\n\nเพิ่ม Block หรือเปิดหน้าที่บันทึกไว้:"},
    "zh-hans": {"editor.closed_hint": "请使用编辑器按钮，或发送 /editor 开始新消息。", "editor.start_button": "▶️ 启动编辑器", "editor.new_button": "➕ 启动编辑器", "editor.empty_hint": "自定义消息\n\n添加一个 Block 或打开已保存的页面："},
    "zh-hant": {"editor.closed_hint": "請使用編輯器按鈕，或傳送 /editor 開始新訊息。", "editor.start_button": "▶️ 啟動編輯器", "editor.new_button": "➕ 啟動編輯器", "editor.empty_hint": "自訂訊息\n\n新增一個 Block 或開啟已儲存的頁面："},
}

PAGE_MANAGEMENT_TRANSLATIONS: dict[str, dict[str, str]] = {
    "es": {"pages.rename_prompt": "Envía un nombre nuevo para «{title}»; máximo 64 caracteres.", "pages.delete_confirm": "¿Eliminar «{title}» permanentemente?", "pages.delete_yes": "🗑 Sí, eliminar", "common.cancel": "Cancelar", "pages.deleted": "Página eliminada"},
    "fr": {"pages.rename_prompt": "Envoyez un nouveau nom pour « {title} » ; 64 caractères maximum.", "pages.delete_confirm": "Supprimer définitivement « {title} » ?", "pages.delete_yes": "🗑 Oui, supprimer", "common.cancel": "Annuler", "pages.deleted": "Page supprimée"},
    "de": {"pages.rename_prompt": "Sende einen neuen Namen für „{title}“; maximal 64 Zeichen.", "pages.delete_confirm": "„{title}“ dauerhaft löschen?", "pages.delete_yes": "🗑 Ja, löschen", "common.cancel": "Abbrechen", "pages.deleted": "Seite gelöscht"},
    "it": {"pages.rename_prompt": "Invia un nuovo nome per «{title}»; massimo 64 caratteri.", "pages.delete_confirm": "Eliminare definitivamente «{title}»?", "pages.delete_yes": "🗑 Sì, elimina", "common.cancel": "Annulla", "pages.deleted": "Pagina eliminata"},
    "pt": {"pages.rename_prompt": "Envie um novo nome para “{title}”; máximo de 64 caracteres.", "pages.delete_confirm": "Excluir “{title}” permanentemente?", "pages.delete_yes": "🗑 Sim, excluir", "common.cancel": "Cancelar", "pages.deleted": "Página excluída"},
    "nl": {"pages.rename_prompt": "Stuur een nieuwe naam voor ‘{title}’; maximaal 64 tekens.", "pages.delete_confirm": "‘{title}’ permanent verwijderen?", "pages.delete_yes": "🗑 Ja, verwijderen", "common.cancel": "Annuleren", "pages.deleted": "Pagina verwijderd"},
    "pl": {"pages.rename_prompt": "Wyślij nową nazwę dla „{title}”; maksymalnie 64 znaki.", "pages.delete_confirm": "Trwale usunąć „{title}”?", "pages.delete_yes": "🗑 Tak, usuń", "common.cancel": "Anuluj", "pages.deleted": "Strona usunięta"},
    "uk": {"pages.rename_prompt": "Надішліть нову назву для «{title}»; максимум 64 символи.", "pages.delete_confirm": "Назавжди видалити «{title}»?", "pages.delete_yes": "🗑 Так, видалити", "common.cancel": "Скасувати", "pages.deleted": "Сторінку видалено"},
    "ru": {"pages.rename_prompt": "Отправьте новое название для «{title}»; максимум 64 символа.", "pages.delete_confirm": "Навсегда удалить «{title}»?", "pages.delete_yes": "🗑 Да, удалить", "common.cancel": "Отмена", "pages.deleted": "Страница удалена"},
    "tr": {"pages.rename_prompt": "“{title}” için yeni bir ad gönderin; en fazla 64 karakter.", "pages.delete_confirm": "“{title}” kalıcı olarak silinsin mi?", "pages.delete_yes": "🗑 Evet, sil", "common.cancel": "İptal", "pages.deleted": "Sayfa silindi"},
    "fa": {"pages.rename_prompt": "نام جدید «{title}» را ارسال کنید؛ حداکثر ۶۴ نویسه.", "pages.delete_confirm": "«{title}» برای همیشه حذف شود؟", "pages.delete_yes": "🗑 بله، حذف", "common.cancel": "لغو", "pages.deleted": "صفحه حذف شد"},
    "ku": {"pages.rename_prompt": "Navekî nû ji bo “{title}” bişînin; herî zêde 64 tîp.", "pages.delete_confirm": "“{title}” bi temamî were jêbirin?", "pages.delete_yes": "🗑 Erê, jê bibe", "common.cancel": "Betal", "pages.deleted": "Rûpel hate jêbirin"},
    "ur": {"pages.rename_prompt": "“{title}” کے لیے نیا نام بھیجیں؛ زیادہ سے زیادہ 64 حروف۔", "pages.delete_confirm": "“{title}” کو مستقل حذف کریں؟", "pages.delete_yes": "🗑 ہاں، حذف کریں", "common.cancel": "منسوخ", "pages.deleted": "صفحہ حذف ہوگیا"},
    "hi": {"pages.rename_prompt": "“{title}” के लिए नया नाम भेजें; अधिकतम 64 अक्षर।", "pages.delete_confirm": "“{title}” को हमेशा के लिए हटाएँ?", "pages.delete_yes": "🗑 हाँ, हटाएँ", "common.cancel": "रद्द करें", "pages.deleted": "पेज हटा दिया गया"},
    "id": {"pages.rename_prompt": "Kirim nama baru untuk “{title}”; maksimal 64 karakter.", "pages.delete_confirm": "Hapus “{title}” secara permanen?", "pages.delete_yes": "🗑 Ya, hapus", "common.cancel": "Batal", "pages.deleted": "Halaman dihapus"},
    "ja": {"pages.rename_prompt": "「{title}」の新しい名前を送信してください（最大64文字）。", "pages.delete_confirm": "「{title}」を完全に削除しますか？", "pages.delete_yes": "🗑 はい、削除", "common.cancel": "キャンセル", "pages.deleted": "ページを削除しました"},
    "ko": {"pages.rename_prompt": "‘{title}’의 새 이름을 보내세요. 최대 64자입니다.", "pages.delete_confirm": "‘{title}’을(를) 영구 삭제할까요?", "pages.delete_yes": "🗑 예, 삭제", "common.cancel": "취소", "pages.deleted": "페이지가 삭제되었습니다"},
    "vi": {"pages.rename_prompt": "Gửi tên mới cho “{title}”; tối đa 64 ký tự.", "pages.delete_confirm": "Xóa vĩnh viễn “{title}”?", "pages.delete_yes": "🗑 Có, xóa", "common.cancel": "Hủy", "pages.deleted": "Đã xóa trang"},
    "th": {"pages.rename_prompt": "ส่งชื่อใหม่สำหรับ “{title}” สูงสุด 64 อักขระ", "pages.delete_confirm": "ลบ “{title}” อย่างถาวรหรือไม่", "pages.delete_yes": "🗑 ใช่ ลบ", "common.cancel": "ยกเลิก", "pages.deleted": "ลบหน้าแล้ว"},
    "zh-hans": {"pages.rename_prompt": "请发送“{title}”的新名称，最多 64 个字符。", "pages.delete_confirm": "永久删除“{title}”？", "pages.delete_yes": "🗑 是，删除", "common.cancel": "取消", "pages.deleted": "页面已删除"},
    "zh-hant": {"pages.rename_prompt": "請傳送「{title}」的新名稱，最多 64 個字元。", "pages.delete_confirm": "永久刪除「{title}」？", "pages.delete_yes": "🗑 是，刪除", "common.cancel": "取消", "pages.deleted": "頁面已刪除"},
}

EDITOR_UX_KEYS = (
    "editor.tools_button", "editor.tools_text", "editor.undo_button",
    "editor.undo_empty", "editor.undo_done", "block.move_up", "block.move_down",
    "block.manage_title", "block.position_text", "block.order_text",
    "common.choose_action", "pages.search_button", "pages.sort_button",
    "pages.search_prompt", "pages.search_results", "pages.search_none",
    "pages.sort_text", "pages.sort_updated", "pages.sort_newest",
    "pages.sort_oldest", "pages.sort_title", "pages.sort_done",
)

EDITOR_UX_VALUES: dict[str, tuple[str, ...]] = {
    "es": (
        "🛠 Más herramientas", "🛠 Más herramientas\n\nElige la herramienta que necesitas:", "↩️ Deshacer",
        "No hay ninguna acción que deshacer.", "Acción deshecha", "⬆️ Subir", "⬇️ Bajar",
        "Administrar {name}", "Posición actual: {current} de {total}", "Orden de los bloques:",
        "Elige una acción:", "🔎 Buscar", "⚙️ Ordenar", "Envía el nombre o código de la página. Envía /all para mostrar todas.",
        "🔎 Resultados: {query}", "🔎 No hay páginas que coincidan con «{query}».", "⚙️ Ordenar páginas\n\nElige cómo ordenar las páginas:",
        "🕘 Última actualización", "🆕 Más recientes", "🗓 Más antiguas", "🔤 Por nombre", "Orden de páginas actualizado",
    ),
    "fr": (
        "🛠 Plus d’outils", "🛠 Plus d’outils\n\nChoisissez l’outil nécessaire :", "↩️ Annuler",
        "Aucune action à annuler.", "Action annulée", "⬆️ Monter", "⬇️ Descendre",
        "Gérer {name}", "Position actuelle : {current} sur {total}", "Ordre des blocs :",
        "Choisissez une action :", "🔎 Rechercher", "⚙️ Trier", "Envoyez le nom ou le code de la page. Envoyez /all pour tout afficher.",
        "🔎 Résultats : {query}", "🔎 Aucune page ne correspond à « {query} ».", "⚙️ Trier les pages\n\nChoisissez l’ordre des pages :",
        "🕘 Dernière modification", "🆕 Plus récentes", "🗓 Plus anciennes", "🔤 Par nom", "Ordre des pages modifié",
    ),
    "de": (
        "🛠 Weitere Werkzeuge", "🛠 Weitere Werkzeuge\n\nWähle das benötigte Werkzeug:", "↩️ Rückgängig",
        "Keine Aktion zum Rückgängigmachen.", "Rückgängig gemacht", "⬆️ Nach oben", "⬇️ Nach unten",
        "{name} verwalten", "Aktuelle Position: {current} von {total}", "Blockreihenfolge:",
        "Wähle eine Aktion:", "🔎 Suchen", "⚙️ Sortieren", "Sende Seitenname oder Code. Sende /all für alle Seiten.",
        "🔎 Ergebnisse: {query}", "🔎 Keine Seiten entsprechen „{query}“.", "⚙️ Seiten sortieren\n\nWähle die Reihenfolge:",
        "🕘 Zuletzt geändert", "🆕 Neueste", "🗓 Älteste", "🔤 Nach Name", "Seitenreihenfolge geändert",
    ),
    "it": (
        "🛠 Altri strumenti", "🛠 Altri strumenti\n\nScegli lo strumento necessario:", "↩️ Annulla",
        "Nessuna azione da annullare.", "Azione annullata", "⬆️ Sposta su", "⬇️ Sposta giù",
        "Gestisci {name}", "Posizione attuale: {current} di {total}", "Ordine dei blocchi:",
        "Scegli un’azione:", "🔎 Cerca", "⚙️ Ordina", "Invia il nome o il codice della pagina. Invia /all per mostrarle tutte.",
        "🔎 Risultati: {query}", "🔎 Nessuna pagina corrisponde a «{query}».", "⚙️ Ordina pagine\n\nScegli come ordinare le pagine:",
        "🕘 Ultima modifica", "🆕 Più recenti", "🗓 Più vecchie", "🔤 Per nome", "Ordine delle pagine modificato",
    ),
    "pt": (
        "🛠 Mais ferramentas", "🛠 Mais ferramentas\n\nEscolha a ferramenta necessária:", "↩️ Desfazer",
        "Não há ação para desfazer.", "Ação desfeita", "⬆️ Mover para cima", "⬇️ Mover para baixo",
        "Gerenciar {name}", "Posição atual: {current} de {total}", "Ordem dos blocos:",
        "Escolha uma ação:", "🔎 Pesquisar", "⚙️ Ordenar", "Envie o nome ou código da página. Envie /all para mostrar todas.",
        "🔎 Resultados: {query}", "🔎 Nenhuma página corresponde a “{query}”.", "⚙️ Ordenar páginas\n\nEscolha a ordem das páginas:",
        "🕘 Última atualização", "🆕 Mais recentes", "🗓 Mais antigas", "🔤 Por nome", "Ordem das páginas alterada",
    ),
    "nl": (
        "🛠 Meer hulpmiddelen", "🛠 Meer hulpmiddelen\n\nKies het benodigde hulpmiddel:", "↩️ Ongedaan maken",
        "Er is geen actie om ongedaan te maken.", "Ongedaan gemaakt", "⬆️ Omhoog", "⬇️ Omlaag",
        "{name} beheren", "Huidige positie: {current} van {total}", "Blokvolgorde:",
        "Kies een actie:", "🔎 Zoeken", "⚙️ Sorteren", "Stuur de paginanaam of code. Stuur /all om alles te tonen.",
        "🔎 Resultaten: {query}", "🔎 Geen pagina’s gevonden voor ‘{query}’.", "⚙️ Pagina’s sorteren\n\nKies de volgorde:",
        "🕘 Laatst bijgewerkt", "🆕 Nieuwste", "🗓 Oudste", "🔤 Op naam", "Paginavolgorde gewijzigd",
    ),
    "pl": (
        "🛠 Więcej narzędzi", "🛠 Więcej narzędzi\n\nWybierz potrzebne narzędzie:", "↩️ Cofnij",
        "Brak działania do cofnięcia.", "Cofnięto", "⬆️ Przenieś wyżej", "⬇️ Przenieś niżej",
        "Zarządzaj {name}", "Bieżąca pozycja: {current} z {total}", "Kolejność bloków:",
        "Wybierz działanie:", "🔎 Szukaj", "⚙️ Sortuj", "Wyślij nazwę lub kod strony. Wyślij /all, aby pokazać wszystkie.",
        "🔎 Wyniki: {query}", "🔎 Brak stron pasujących do „{query}”.", "⚙️ Sortuj strony\n\nWybierz kolejność stron:",
        "🕘 Ostatnio zmienione", "🆕 Najnowsze", "🗓 Najstarsze", "🔤 Według nazwy", "Zmieniono kolejność stron",
    ),
    "uk": (
        "🛠 Інші інструменти", "🛠 Інші інструменти\n\nВиберіть потрібний інструмент:", "↩️ Скасувати",
        "Немає дії для скасування.", "Дію скасовано", "⬆️ Перемістити вгору", "⬇️ Перемістити вниз",
        "Керування {name}", "Поточна позиція: {current} з {total}", "Порядок блоків:",
        "Виберіть дію:", "🔎 Пошук", "⚙️ Сортування", "Надішліть назву або код сторінки. Надішліть /all, щоб показати всі.",
        "🔎 Результати: {query}", "🔎 Немає сторінок за запитом «{query}».", "⚙️ Сортування сторінок\n\nВиберіть порядок:",
        "🕘 Остання зміна", "🆕 Найновіші", "🗓 Найстаріші", "🔤 За назвою", "Порядок сторінок змінено",
    ),
    "ru": (
        "🛠 Другие инструменты", "🛠 Другие инструменты\n\nВыберите нужный инструмент:", "↩️ Отменить",
        "Нет действия для отмены.", "Действие отменено", "⬆️ Переместить выше", "⬇️ Переместить ниже",
        "Управление {name}", "Текущая позиция: {current} из {total}", "Порядок блоков:",
        "Выберите действие:", "🔎 Поиск", "⚙️ Сортировка", "Отправьте название или код страницы. Отправьте /all, чтобы показать все.",
        "🔎 Результаты: {query}", "🔎 Нет страниц по запросу «{query}».", "⚙️ Сортировка страниц\n\nВыберите порядок:",
        "🕘 Последнее изменение", "🆕 Самые новые", "🗓 Самые старые", "🔤 По имени", "Порядок страниц изменён",
    ),
    "tr": (
        "🛠 Diğer araçlar", "🛠 Diğer araçlar\n\nİhtiyacınız olan aracı seçin:", "↩️ Geri al",
        "Geri alınacak işlem yok.", "Geri alındı", "⬆️ Yukarı taşı", "⬇️ Aşağı taşı",
        "{name} yönetimi", "Geçerli konum: {current}/{total}", "Blok sırası:",
        "Bir işlem seçin:", "🔎 Ara", "⚙️ Sırala", "Sayfa adını veya kodunu gönderin. Tümünü göstermek için /all gönderin.",
        "🔎 Sonuçlar: {query}", "🔎 “{query}” ile eşleşen sayfa yok.", "⚙️ Sayfaları sırala\n\nSıralama yöntemini seçin:",
        "🕘 Son güncellenen", "🆕 En yeni", "🗓 En eski", "🔤 Ada göre", "Sayfa sırası değiştirildi",
    ),
    "fa": (
        "🛠 ابزارهای بیشتر", "🛠 ابزارهای بیشتر\n\nابزار موردنیاز را انتخاب کنید:", "↩️ واگرد",
        "عملی برای واگرد وجود ندارد.", "واگرد انجام شد", "⬆️ انتقال به بالا", "⬇️ انتقال به پایین",
        "مدیریت {name}", "جایگاه فعلی: {current} از {total}", "ترتیب بلوک‌ها:",
        "یک عملیات انتخاب کنید:", "🔎 جستجو", "⚙️ مرتب‌سازی", "نام یا کد صفحه را بفرستید. برای نمایش همه /all را ارسال کنید.",
        "🔎 نتایج: {query}", "🔎 صفحه‌ای مطابق «{query}» نیست.", "⚙️ مرتب‌سازی صفحه‌ها\n\nروش مرتب‌سازی را انتخاب کنید:",
        "🕘 آخرین ویرایش", "🆕 جدیدترین", "🗓 قدیمی‌ترین", "🔤 بر اساس نام", "ترتیب صفحه‌ها تغییر کرد",
    ),
    "ku": (
        "🛠 Amûrên din", "🛠 Amûrên din\n\nAmûra pêwîst hilbijêre:", "↩️ Vegerîne",
        "Çalakiyek ji bo vegerandinê tune.", "Hat vegerandin", "⬆️ Bibe jor", "⬇️ Bibe jêr",
        "{name} bi rê ve bibe", "Cihê niha: {current} ji {total}", "Rêza blokan:",
        "Çalakiyek hilbijêre:", "🔎 Lêgerîn", "⚙️ Rêzkirin", "Nav an koda rûpelê bişîne. Ji bo hemûyan /all bişîne.",
        "🔎 Encam: {query}", "🔎 Rûpelek bi “{query}” re tune.", "⚙️ Rûpelan rêz bike\n\nAwayê rêzkirinê hilbijêre:",
        "🕘 Guherandina dawî", "🆕 Nûtirîn", "🗓 Kevintirîn", "🔤 Li gor navî", "Rêza rûpelan hat guhertin",
    ),
    "ur": (
        "🛠 مزید ٹولز", "🛠 مزید ٹولز\n\nضروری ٹول منتخب کریں:", "↩️ واپس کریں",
        "واپس کرنے کے لیے کوئی عمل نہیں۔", "عمل واپس ہوگیا", "⬆️ اوپر لے جائیں", "⬇️ نیچے لے جائیں",
        "{name} کا انتظام", "موجودہ مقام: {current} از {total}", "بلاکس کی ترتیب:",
        "ایک عمل منتخب کریں:", "🔎 تلاش", "⚙️ ترتیب", "صفحے کا نام یا کوڈ بھیجیں۔ سب دکھانے کے لیے /all بھیجیں۔",
        "🔎 نتائج: {query}", "🔎 “{query}” سے کوئی صفحہ نہیں ملا۔", "⚙️ صفحات ترتیب دیں\n\nترتیب کا طریقہ منتخب کریں:",
        "🕘 آخری ترمیم", "🆕 تازہ ترین", "🗓 قدیم ترین", "🔤 نام کے مطابق", "صفحات کی ترتیب بدل گئی",
    ),
    "hi": (
        "🛠 अधिक टूल", "🛠 अधिक टूल\n\nज़रूरी टूल चुनें:", "↩️ पूर्ववत करें",
        "पूर्ववत करने के लिए कोई कार्रवाई नहीं है।", "पूर्ववत किया गया", "⬆️ ऊपर ले जाएँ", "⬇️ नीचे ले जाएँ",
        "{name} प्रबंधित करें", "वर्तमान स्थान: {current}/{total}", "ब्लॉक क्रम:",
        "एक कार्रवाई चुनें:", "🔎 खोजें", "⚙️ क्रमबद्ध करें", "पेज का नाम या कोड भेजें। सभी दिखाने के लिए /all भेजें।",
        "🔎 परिणाम: {query}", "🔎 “{query}” से मिलता कोई पेज नहीं।", "⚙️ पेज क्रमबद्ध करें\n\nक्रम चुनें:",
        "🕘 अंतिम अपडेट", "🆕 नवीनतम", "🗓 सबसे पुराने", "🔤 नाम से", "पेज क्रम बदल गया",
    ),
    "id": (
        "🛠 Alat lainnya", "🛠 Alat lainnya\n\nPilih alat yang diperlukan:", "↩️ Urungkan",
        "Tidak ada tindakan untuk diurungkan.", "Tindakan diurungkan", "⬆️ Pindah ke atas", "⬇️ Pindah ke bawah",
        "Kelola {name}", "Posisi saat ini: {current} dari {total}", "Urutan blok:",
        "Pilih tindakan:", "🔎 Cari", "⚙️ Urutkan", "Kirim nama atau kode halaman. Kirim /all untuk menampilkan semua.",
        "🔎 Hasil: {query}", "🔎 Tidak ada halaman yang cocok dengan “{query}”.", "⚙️ Urutkan halaman\n\nPilih urutan halaman:",
        "🕘 Terakhir diperbarui", "🆕 Terbaru", "🗓 Terlama", "🔤 Berdasarkan nama", "Urutan halaman diubah",
    ),
    "ja": (
        "🛠 その他のツール", "🛠 その他のツール\n\n必要なツールを選択してください：", "↩️ 元に戻す",
        "元に戻せる操作はありません。", "元に戻しました", "⬆️ 上へ", "⬇️ 下へ",
        "{name}を管理", "現在の位置：{current}/{total}", "ブロックの順序：",
        "操作を選択：", "🔎 検索", "⚙️ 並べ替え", "ページ名またはコードを送信してください。すべて表示するには /all を送信します。",
        "🔎 結果：{query}", "🔎「{query}」に一致するページはありません。", "⚙️ ページを並べ替え\n\n順序を選択してください：",
        "🕘 最終更新", "🆕 新しい順", "🗓 古い順", "🔤 名前順", "ページの順序を変更しました",
    ),
    "ko": (
        "🛠 추가 도구", "🛠 추가 도구\n\n필요한 도구를 선택하세요:", "↩️ 실행 취소",
        "취소할 작업이 없습니다.", "실행 취소됨", "⬆️ 위로", "⬇️ 아래로",
        "{name} 관리", "현재 위치: {current}/{total}", "블록 순서:",
        "작업 선택:", "🔎 검색", "⚙️ 정렬", "페이지 이름이나 코드를 보내세요. 모두 보려면 /all을 보내세요.",
        "🔎 결과: {query}", "🔎 ‘{query}’와 일치하는 페이지가 없습니다.", "⚙️ 페이지 정렬\n\n정렬 방식을 선택하세요:",
        "🕘 최근 수정", "🆕 최신 생성", "🗓 오래된 생성", "🔤 이름순", "페이지 순서가 변경되었습니다",
    ),
    "vi": (
        "🛠 Công cụ khác", "🛠 Công cụ khác\n\nChọn công cụ bạn cần:", "↩️ Hoàn tác",
        "Không có thao tác để hoàn tác.", "Đã hoàn tác", "⬆️ Di chuyển lên", "⬇️ Di chuyển xuống",
        "Quản lý {name}", "Vị trí hiện tại: {current}/{total}", "Thứ tự Block:",
        "Chọn thao tác:", "🔎 Tìm kiếm", "⚙️ Sắp xếp", "Gửi tên hoặc mã trang. Gửi /all để hiển thị tất cả.",
        "🔎 Kết quả: {query}", "🔎 Không có trang khớp “{query}”.", "⚙️ Sắp xếp trang\n\nChọn thứ tự:",
        "🕘 Cập nhật gần nhất", "🆕 Mới nhất", "🗓 Cũ nhất", "🔤 Theo tên", "Đã đổi thứ tự trang",
    ),
    "th": (
        "🛠 เครื่องมือเพิ่มเติม", "🛠 เครื่องมือเพิ่มเติม\n\nเลือกเครื่องมือที่ต้องการ:", "↩️ เลิกทำ",
        "ไม่มีการทำงานให้เลิกทำ", "เลิกทำแล้ว", "⬆️ เลื่อนขึ้น", "⬇️ เลื่อนลง",
        "จัดการ {name}", "ตำแหน่งปัจจุบัน: {current}/{total}", "ลำดับ Block:",
        "เลือกการทำงาน:", "🔎 ค้นหา", "⚙️ จัดเรียง", "ส่งชื่อหรือรหัสหน้า ส่ง /all เพื่อแสดงทั้งหมด",
        "🔎 ผลลัพธ์: {query}", "🔎 ไม่พบหน้าที่ตรงกับ “{query}”", "⚙️ จัดเรียงหน้า\n\nเลือกลำดับ:",
        "🕘 แก้ไขล่าสุด", "🆕 สร้างล่าสุด", "🗓 สร้างเก่าสุด", "🔤 ตามชื่อ", "เปลี่ยนลำดับหน้าแล้ว",
    ),
    "zh-hans": (
        "🛠 更多工具", "🛠 更多工具\n\n请选择所需工具：", "↩️ 撤销",
        "没有可撤销的操作。", "已撤销", "⬆️ 上移", "⬇️ 下移",
        "管理{name}", "当前位置：{current}/{total}", "Block 顺序：",
        "请选择操作：", "🔎 搜索", "⚙️ 排序", "请发送页面名称或代码。发送 /all 显示全部页面。",
        "🔎 结果：{query}", "🔎 没有与“{query}”匹配的页面。", "⚙️ 页面排序\n\n请选择排序方式：",
        "🕘 最近修改", "🆕 最新创建", "🗓 最早创建", "🔤 按名称", "页面顺序已更改",
    ),
    "zh-hant": (
        "🛠 更多工具", "🛠 更多工具\n\n請選擇所需工具：", "↩️ 復原",
        "沒有可復原的操作。", "已復原", "⬆️ 上移", "⬇️ 下移",
        "管理{name}", "目前位置：{current}/{total}", "Block 順序：",
        "請選擇操作：", "🔎 搜尋", "⚙️ 排序", "請傳送頁面名稱或代碼。傳送 /all 顯示全部頁面。",
        "🔎 結果：{query}", "🔎 沒有與「{query}」相符的頁面。", "⚙️ 頁面排序\n\n請選擇排序方式：",
        "🕘 最近修改", "🆕 最新建立", "🗓 最早建立", "🔤 按名稱", "頁面順序已變更",
    ),
}

EDITOR_UX_TRANSLATIONS = {
    language: dict(zip(EDITOR_UX_KEYS, values, strict=True))
    for language, values in EDITOR_UX_VALUES.items()
}

KEY_TRANSLATIONS: dict[str, dict[str, str]] = {
    language: {f"block.{name}": value for name, value in values.items()}
    for language, values in BLOCK_KEY_TRANSLATIONS.items()
}

for language, translations in MATH_PROMPT_TRANSLATIONS.items():
    KEY_TRANSLATIONS.setdefault(language, {}).update(translations)

for language, translations in CODE_PROMPT_TRANSLATIONS.items():
    KEY_TRANSLATIONS.setdefault(language, {}).update(translations)

for language, translations in EDITOR_START_TRANSLATIONS.items():
    KEY_TRANSLATIONS.setdefault(language, {}).update(translations)

for language, translations in PAGE_MANAGEMENT_TRANSLATIONS.items():
    KEY_TRANSLATIONS.setdefault(language, {}).update(translations)

for language, translations in EDITOR_UX_TRANSLATIONS.items():
    KEY_TRANSLATIONS.setdefault(language, {}).update(translations)


def pack(**values: str) -> dict[str, str]:
    return {
        PHRASES[key]: value
        for key, value in values.items()
        if key in PHRASES and value
    }


def profile(
    name: str,
    description: str,
    short: str,
    editor: str,
    draft: str,
    start: str,
) -> dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "short": short,
        "commands": {
            "editor": editor,
            "draft": draft,
            "start": start,
        },
    }
