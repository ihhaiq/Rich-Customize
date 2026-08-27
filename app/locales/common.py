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
    "editor.closed_hint": "Use the editor buttons, or send /editor to start a new message.",
    "editor.start_button": "▶️ Start editor",
    "editor.new_button": "➕ Start editor",
    "editor.empty_hint": "Customize message\n\nAdd a Block or open one of your saved pages:",

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
    "editor.closed_hint": "استخدم أزرار المحرّر، أو أرسل /editor لبدء رسالة جديدة.",
    "editor.start_button": "▶️ بدء المحرّر",
    "editor.new_button": "➕ بدء المحرّر",
    "editor.empty_hint": "تخصيص الرسالة\n\nأضف Block أو افتح إحدى صفحاتك المحفوظة:",
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

KEY_TRANSLATIONS: dict[str, dict[str, str]] = {
    language: {f"block.{name}": value for name, value in values.items()}
    for language, values in BLOCK_KEY_TRANSLATIONS.items()
}

for language, translations in MATH_PROMPT_TRANSLATIONS.items():
    KEY_TRANSLATIONS.setdefault(language, {}).update(translations)

for language, translations in EDITOR_START_TRANSLATIONS.items():
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
