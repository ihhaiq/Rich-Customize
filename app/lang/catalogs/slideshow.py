"""Slideshow upload prompts, in the same key order for every locale."""

KEYS = (
    "received", "continue", "more", "send_more", "full", "overflow", "busy",
)
TEXTS = {
    "en": (
        "Received {count}/{limit} photos/videos. Continue or add more?", "Continue", "Add more",
        "Send photos/videos in batches of up to 10, up to {limit} in total.",
        "Reached {limit}. Press Continue to save the slideshow.",
        "Extra items not added: {count}.", "Receiving the current batch. Please wait.",
    ),
    "ar": (
        "تم استلام {count} من {limit} صورة/فيديو. تريد تستمر لو تضيف المزيد؟", "استمرار", "أضف المزيد",
        "أرسل صور/فيديو على دفعات، كل دفعة لحد ١٠ والمجموع لحد {limit}.",
        "وصلت للحد {limit}. اضغط استمرار لحفظ عرض الشرائح.",
        "ما انضافت {count} من الوسائط الزائدة.", "بعدني أستلم الدفعة الحالية، انتظر شوي.",
    ),
    "es": (
        "Recibidos {count}/{limit} fotos/vídeos. ¿Continuar o añadir más?", "Continuar", "Añadir más",
        "Envía fotos/vídeos en lotes de hasta 10, hasta {limit} en total.",
        "Límite de {limit} alcanzado. Pulsa Continuar para guardar la presentación.",
        "Elementos adicionales no añadidos: {count}.", "Recibiendo el lote actual. Espera.",
    ),
    "fr": (
        "{count}/{limit} photos/vidéos reçues. Continuer ou en ajouter ?", "Continuer", "Ajouter",
        "Envoyez des photos/vidéos par lots de 10 maximum, jusqu’à {limit} au total.",
        "Limite de {limit} atteinte. Appuyez sur Continuer pour enregistrer le diaporama.",
        "Éléments supplémentaires non ajoutés : {count}.", "Réception du lot en cours. Patientez.",
    ),
    "de": (
        "{count}/{limit} Fotos/Videos empfangen. Fortfahren oder mehr hinzufügen?", "Fortfahren", "Mehr hinzufügen",
        "Sende Fotos/Videos in Gruppen von bis zu 10, insgesamt bis zu {limit}.",
        "{limit} erreicht. Drücke Fortfahren, um die Diashow zu speichern.",
        "Zusätzliche Elemente nicht hinzugefügt: {count}.", "Die aktuelle Gruppe wird empfangen. Bitte warten.",
    ),
    "it": (
        "Ricevuti {count}/{limit} foto/video. Continuare o aggiungerne altri?", "Continua", "Aggiungi altro",
        "Invia foto/video in gruppi di massimo 10, fino a {limit} in totale.",
        "Limite di {limit} raggiunto. Premi Continua per salvare la presentazione.",
        "Elementi extra non aggiunti: {count}.", "Ricezione del gruppo in corso. Attendi.",
    ),
    "pt": (
        "Recebidos {count}/{limit} fotos/vídeos. Continuar ou adicionar mais?", "Continuar", "Adicionar mais",
        "Envie fotos/vídeos em lotes de até 10, até {limit} no total.",
        "Limite de {limit} atingido. Toque em Continuar para guardar a apresentação.",
        "Itens adicionais não adicionados: {count}.", "A receber o lote atual. Aguarde.",
    ),
    "nl": (
        "{count}/{limit} foto’s/video’s ontvangen. Doorgaan of meer toevoegen?", "Doorgaan", "Meer toevoegen",
        "Stuur foto’s/video’s in groepen van maximaal 10, maximaal {limit} in totaal.",
        "{limit} bereikt. Druk op Doorgaan om de diavoorstelling op te slaan.",
        "Extra items niet toegevoegd: {count}.", "De huidige groep wordt ontvangen. Even wachten.",
    ),
    "pl": (
        "Odebrano {count}/{limit} zdjęć/filmów. Kontynuować czy dodać więcej?", "Kontynuuj", "Dodaj więcej",
        "Wysyłaj zdjęcia/filmy w partiach po maksymalnie 10, łącznie do {limit}.",
        "Osiągnięto {limit}. Naciśnij Kontynuuj, aby zapisać pokaz slajdów.",
        "Nie dodano dodatkowych elementów: {count}.", "Odbieranie bieżącej partii. Poczekaj.",
    ),
    "uk": (
        "Отримано {count}/{limit} фото/відео. Продовжити чи додати ще?", "Продовжити", "Додати ще",
        "Надсилайте фото/відео групами до 10, загалом до {limit}.",
        "Досягнуто {limit}. Натисніть Продовжити, щоб зберегти слайд-шоу.",
        "Зайвих елементів не додано: {count}.", "Отримуємо поточну групу. Зачекайте.",
    ),
    "ru": (
        "Получено {count}/{limit} фото/видео. Продолжить или добавить ещё?", "Продолжить", "Добавить ещё",
        "Отправляйте фото/видео группами до 10, всего до {limit}.",
        "Достигнуто {limit}. Нажмите Продолжить, чтобы сохранить слайд-шоу.",
        "Лишних элементов не добавлено: {count}.", "Получаем текущую группу. Подождите.",
    ),
    "tr": (
        "{count}/{limit} fotoğraf/video alındı. Devam mı, daha fazla mı?", "Devam", "Daha fazla ekle",
        "Fotoğraf/videoları en fazla 10’lu gruplarla, toplam {limit} adede kadar gönderin.",
        "{limit} sınırına ulaşıldı. Slayt gösterisini kaydetmek için Devam’a basın.",
        "Eklenmeyen fazla öğe: {count}.", "Geçerli grup alınıyor. Lütfen bekleyin.",
    ),
    "fa": (
        "{count} از {limit} عکس/ویدیو دریافت شد. ادامه می‌دهید یا بیشتر اضافه می‌کنید؟", "ادامه", "افزودن بیشتر",
        "عکس/ویدیو را در دسته‌های حداکثر ۱۰تایی، در مجموع تا {limit} مورد بفرستید.",
        "به حد {limit} رسیدید. برای ذخیره نمایش اسلاید، ادامه را بزنید.",
        "موارد اضافی افزوده نشد: {count}.", "در حال دریافت دسته فعلی. کمی صبر کنید.",
    ),
    "ku": (
        "{count}/{limit} wêne/vîdyo hatin. Berdewam an zêde bike؟", "Berdewam", "Zêde bike",
        "Wêne/vîdyoyan di komên heta 10 de bişîne, bi giştî heta {limit}.",
        "Sînorê {limit} hat. Ji bo tomarkirina pêşandanê Berdewam bitikîne.",
        "Tiştên zêde nehatin zêdekirin: {count}.", "Koma heyî tê wergirtin. Hinekî bisekine.",
    ),
    "ur": (
        "{count}/{limit} تصاویر/ویڈیوز موصول ہوئیں۔ جاری رکھیں یا مزید شامل کریں؟", "جاری رکھیں", "مزید شامل کریں",
        "تصاویر/ویڈیوز زیادہ سے زیادہ ۱۰ کے گروپ میں بھیجیں، کل حد {limit} ہے۔",
        "{limit} کی حد مکمل ہو گئی۔ سلائیڈ شو محفوظ کرنے کے لیے جاری رکھیں دبائیں۔",
        "اضافی اشیا شامل نہیں ہوئیں: {count}۔", "موجودہ گروپ وصول ہو رہا ہے۔ تھوڑا انتظار کریں۔",
    ),
    "hi": (
        "{count}/{limit} फ़ोटो/वीडियो मिले। जारी रखें या और जोड़ें?", "जारी रखें", "और जोड़ें",
        "फ़ोटो/वीडियो अधिकतम 10 के समूह में भेजें, कुल सीमा {limit} है।",
        "{limit} की सीमा पूरी हुई। स्लाइड शो सहेजने के लिए जारी रखें दबाएँ।",
        "अतिरिक्त आइटम नहीं जोड़े गए: {count}।", "मौजूदा समूह मिल रहा है। कृपया प्रतीक्षा करें।",
    ),
    "id": (
        "{count}/{limit} foto/video diterima. Lanjutkan atau tambah lagi?", "Lanjutkan", "Tambah lagi",
        "Kirim foto/video dalam kelompok hingga 10, maksimal {limit} secara total.",
        "Batas {limit} tercapai. Tekan Lanjutkan untuk menyimpan tayangan slide.",
        "Item berlebih tidak ditambahkan: {count}.", "Menerima kelompok saat ini. Harap tunggu.",
    ),
    "ja": (
        "写真・動画を{count}/{limit}件受信しました。続行しますか、追加しますか？", "続行", "追加する",
        "写真・動画を1回につき10件まで、合計{limit}件まで送信してください。",
        "上限の{limit}件に達しました。続行を押すとスライドショーを保存します。",
        "上限を超えたため追加されなかった項目：{count}件。", "現在のグループを受信中です。お待ちください。",
    ),
    "ko": (
        "사진/동영상 {count}/{limit}개를 받았습니다. 계속하거나 더 추가할까요?", "계속", "더 추가",
        "사진/동영상을 한 번에 최대 10개씩, 총 {limit}개까지 보내세요.",
        "{limit}개에 도달했습니다. 계속을 눌러 슬라이드쇼를 저장하세요.",
        "초과하여 추가하지 않은 항목: {count}개.", "현재 묶음을 받는 중입니다. 잠시 기다려 주세요.",
    ),
    "vi": (
        "Đã nhận {count}/{limit} ảnh/video. Tiếp tục hay thêm nữa?", "Tiếp tục", "Thêm nữa",
        "Gửi ảnh/video theo nhóm tối đa 10, tổng cộng tối đa {limit}.",
        "Đã đạt {limit}. Nhấn Tiếp tục để lưu trình chiếu.",
        "Mục vượt quá không được thêm: {count}.", "Đang nhận nhóm hiện tại. Vui lòng chờ.",
    ),
    "th": (
        "ได้รับรูป/วิดีโอ {count}/{limit} รายการ ต้องการดำเนินการต่อหรือเพิ่มอีก?", "ดำเนินการต่อ", "เพิ่มอีก",
        "ส่งรูป/วิดีโอครั้งละไม่เกิน 10 รายการ รวมสูงสุด {limit} รายการ",
        "ครบ {limit} รายการแล้ว กดดำเนินการต่อเพื่อบันทึกสไลด์โชว์",
        "รายการที่เกินและไม่ได้เพิ่ม: {count}", "กำลังรับชุดปัจจุบัน โปรดรอสักครู่",
    ),
    "zh-hans": (
        "已收到 {count}/{limit} 张照片或视频。继续还是添加更多？", "继续", "添加更多",
        "请分批发送照片或视频，每批最多10个，总计最多{limit}个。",
        "已达到{limit}个。点击继续保存幻灯片。",
        "未添加的超出数量：{count}。", "正在接收当前批次，请稍候。",
    ),
    "zh-hant": (
        "已收到 {count}/{limit} 張照片或影片。繼續還是新增更多？", "繼續", "新增更多",
        "請分批傳送照片或影片，每批最多10個，總計最多{limit}個。",
        "已達到{limit}個。點擊繼續儲存幻燈片。",
        "未新增的超出數量：{count}。", "正在接收目前批次，請稍候。",
    ),
}
SLIDESHOW_CATALOGS = {
    language: {f"slideshow.{key}": text for key, text in zip(KEYS, texts, strict=True)}
    for language, texts in TEXTS.items()
}
