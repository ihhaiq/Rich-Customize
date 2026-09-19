from __future__ import annotations


_KEYS = ("button", "title", "footer", "file", "empty", "failed")
_TEXT = {
    "ar": (
        "📋 نسخ HTML", "كود HTML للرسالة", "📋 اضغط مطولًا على النص لنسخه",
        "📄 الكود طويل، لذلك تم إرساله كملف نصي.", "لا يوجد محتوى لتصديره.",
        "تعذر تصدير HTML. حاول مرة ثانية.",
    ),
    "en": ("📋 Copy HTML", "Message HTML", "📋 Long-press the text to copy it", "📄 The code is long, so it was sent as a text file.", "No content to export.", "Couldn't export HTML. Please try again."),
    "es": ("📋 Copiar HTML", "HTML del mensaje", "📋 Mantén pulsado el texto para copiarlo", "📄 El código es largo y se envió como archivo de texto.", "No hay contenido para exportar.", "No se pudo exportar HTML. Inténtalo de nuevo."),
    "fr": ("📋 Copier le HTML", "HTML du message", "📋 Appuyez longuement sur le texte pour le copier", "📄 Le code est long et a été envoyé dans un fichier texte.", "Aucun contenu à exporter.", "Impossible d’exporter le HTML. Réessayez."),
    "de": ("📋 HTML kopieren", "Nachrichten-HTML", "📋 Zum Kopieren den Text lange drücken", "📄 Der Code ist lang und wurde als Textdatei gesendet.", "Kein Inhalt zum Exportieren.", "HTML konnte nicht exportiert werden. Bitte erneut versuchen."),
    "it": ("📋 Copia HTML", "HTML del messaggio", "📋 Tieni premuto il testo per copiarlo", "📄 Il codice è lungo ed è stato inviato come file di testo.", "Nessun contenuto da esportare.", "Impossibile esportare HTML. Riprova."),
    "pt": ("📋 Copiar HTML", "HTML da mensagem", "📋 Mantenha o texto pressionado para copiar", "📄 O código é longo e foi enviado como arquivo de texto.", "Nenhum conteúdo para exportar.", "Não foi possível exportar HTML. Tente novamente."),
    "nl": ("📋 HTML kopiëren", "HTML van het bericht", "📋 Houd de tekst ingedrukt om te kopiëren", "📄 De code is lang en is als tekstbestand verstuurd.", "Geen inhoud om te exporteren.", "HTML exporteren is mislukt. Probeer opnieuw."),
    "pl": ("📋 Kopiuj HTML", "HTML wiadomości", "📋 Przytrzymaj tekst, aby go skopiować", "📄 Kod jest długi i został wysłany jako plik tekstowy.", "Brak treści do wyeksportowania.", "Nie udało się wyeksportować HTML. Spróbuj ponownie."),
    "uk": ("📋 Копіювати HTML", "HTML повідомлення", "📋 Натисніть і утримуйте текст, щоб скопіювати", "📄 Код довгий, тому його надіслано текстовим файлом.", "Немає вмісту для експорту.", "Не вдалося експортувати HTML. Спробуйте ще раз."),
    "ru": ("📋 Копировать HTML", "HTML сообщения", "📋 Нажмите и удерживайте текст для копирования", "📄 Код длинный, поэтому он отправлен текстовым файлом.", "Нет содержимого для экспорта.", "Не удалось экспортировать HTML. Попробуйте ещё раз."),
    "tr": ("📋 HTML kopyala", "Mesajın HTML kodu", "📋 Kopyalamak için metne uzun basın", "📄 Kod uzun olduğu için metin dosyası olarak gönderildi.", "Dışa aktarılacak içerik yok.", "HTML dışa aktarılamadı. Tekrar deneyin."),
    "fa": ("📋 کپی HTML", "کد HTML پیام", "📋 برای کپی، متن را نگه دارید", "📄 کد طولانی است و به‌صورت فایل متنی ارسال شد.", "محتوایی برای خروجی گرفتن وجود ندارد.", "خروجی HTML ناموفق بود. دوباره تلاش کنید."),
    "ku": ("📋 کۆپیکردنی HTML", "کۆدی HTMLی پەیام", "📋 بۆ کۆپیکردن دەستت لەسەر دەقەکە ڕابگرە", "📄 کۆدەکە درێژە، بۆیە وەک فایلێکی دەقی نێردرا.", "هیچ ناوەڕۆکێک نییە بۆ هەناردەکردن.", "هەناردەکردنی HTML سەرکەوتوو نەبوو. دووبارە هەوڵ بدەوە."),
    "ur": ("📋 HTML کاپی کریں", "پیغام کا HTML کوڈ", "📋 کاپی کرنے کے لیے متن کو دیر تک دبائیں", "📄 کوڈ طویل ہے، اس لیے اسے ٹیکسٹ فائل کے طور پر بھیجا گیا ہے۔", "برآمد کرنے کے لیے کوئی مواد نہیں۔", "HTML برآمد نہیں ہو سکا۔ دوبارہ کوشش کریں۔"),
    "hi": ("📋 HTML कॉपी करें", "संदेश का HTML", "📋 कॉपी करने के लिए टेक्स्ट को देर तक दबाएँ", "📄 कोड लंबा है, इसलिए टेक्स्ट फ़ाइल के रूप में भेजा गया है।", "निर्यात करने के लिए कोई सामग्री नहीं है।", "HTML निर्यात नहीं हो सका। दोबारा कोशिश करें।"),
    "id": ("📋 Salin HTML", "HTML pesan", "📋 Tekan lama teks untuk menyalinnya", "📄 Kode panjang, jadi dikirim sebagai berkas teks.", "Tidak ada konten untuk diekspor.", "Gagal mengekspor HTML. Coba lagi."),
    "ja": ("📋 HTMLをコピー", "メッセージのHTML", "📋 テキストを長押ししてコピー", "📄 コードが長いため、テキストファイルで送信しました。", "書き出す内容がありません。", "HTMLを書き出せませんでした。もう一度お試しください。"),
    "ko": ("📋 HTML 복사", "메시지 HTML", "📋 텍스트를 길게 눌러 복사하세요", "📄 코드가 길어 텍스트 파일로 보냈습니다.", "내보낼 내용이 없습니다.", "HTML을 내보내지 못했습니다. 다시 시도하세요."),
    "vi": ("📋 Sao chép HTML", "HTML của tin nhắn", "📋 Nhấn giữ văn bản để sao chép", "📄 Mã dài nên đã được gửi dưới dạng tệp văn bản.", "Không có nội dung để xuất.", "Không thể xuất HTML. Vui lòng thử lại."),
    "th": ("📋 คัดลอก HTML", "HTML ของข้อความ", "📋 กดข้อความค้างไว้เพื่อคัดลอก", "📄 โค้ดยาว จึงส่งเป็นไฟล์ข้อความ", "ไม่มีเนื้อหาที่จะส่งออก", "ส่งออก HTML ไม่สำเร็จ โปรดลองอีกครั้ง"),
    "zh-hans": ("📋 复制 HTML", "消息的 HTML 代码", "📋 长按文本即可复制", "📄 代码较长，已作为文本文件发送。", "没有可导出的内容。", "无法导出 HTML，请重试。"),
    "zh-hant": ("📋 複製 HTML", "訊息的 HTML 程式碼", "📋 長按文字即可複製", "📄 程式碼較長，已作為文字檔傳送。", "沒有可匯出的內容。", "無法匯出 HTML，請重試。"),
}

HTML_EXPORT_TRANSLATIONS = {
    locale: {f"editor.html_export_{key}": text for key, text in zip(_KEYS, values, strict=True)}
    for locale, values in _TEXT.items()
}
