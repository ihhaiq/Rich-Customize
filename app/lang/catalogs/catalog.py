from __future__ import annotations

# Phase-two semantic UI catalog.
#
# New interface text must be added here (or a future domain-specific catalog)
# and consumed through app.i18n.t(). Routers/keyboards should not embed Arabic
# or English UI copy directly.

CATALOG_EN: dict[str, str] = {
    "common.back": "🔙 Back",
    "common.reason": "Reason: {reason}",
    "ux.publish.select": "Select",
    "editor.block_missing": "This block no longer exists.",
    "editor.preview_block": "👁 Preview this Block",
    "editor.preview_generating": "Generating block preview…",
    "editor.preview_failed": "Couldn't preview this block.",
    "editor.preview_failed_single": "Couldn't preview this block by itself.",
    "editor.preview_single_notice": (
        "👁 Preview {label} only.\n"
        "The full preview is unchanged and remains available from the «✅ Result» button."
    ),
}

CATALOG_AR: dict[str, str] = {
    "common.back": "🔙 رجوع",
    "common.reason": "السبب: {reason}",
    "ux.publish.select": "تحديد",
    "editor.block_missing": "هذا الجزء لم يعد موجودًا.",
    "editor.preview_block": "👁 معاينة هذا الـBlock",
    "editor.preview_generating": "جاري إنشاء معاينة الجزء…",
    "editor.preview_failed": "تعذرت معاينة هذا الجزء.",
    "editor.preview_failed_single": "تعذرت معاينة هذا الجزء وحده.",
    "editor.preview_single_notice": (
        "👁 معاينة {label} فقط.\n"
        "المعاينة الشاملة ما تغيرت وتبقى من زر «✅ النتيجة»."
    ),
}

# Complete keyed translations for the first migrated router. Keeping these
# explicit means a supported locale never silently drops to English for these
# keys. Placeholders such as {label} and {reason} must be preserved.
CATALOG_TRANSLATIONS: dict[str, dict[str, str]] = {
    "es": {
        "common.back": "🔙 Atrás",
        "common.reason": "Motivo: {reason}",
        "editor.block_missing": "Este bloque ya no existe.",
        "editor.preview_block": "👁 Vista previa de este bloque",
        "editor.preview_generating": "Generando la vista previa del bloque…",
        "editor.preview_failed": "No se pudo previsualizar este bloque.",
        "editor.preview_failed_single": "No se pudo previsualizar este bloque por separado.",
        "editor.preview_single_notice": "👁 Vista previa solo de {label}.\nLa vista previa completa no cambia y sigue disponible desde «✅ Resultado».",
    },
    "fr": {
        "common.back": "🔙 Retour",
        "common.reason": "Raison : {reason}",
        "editor.block_missing": "Ce bloc n’existe plus.",
        "editor.preview_block": "👁 Aperçu de ce bloc",
        "editor.preview_generating": "Génération de l’aperçu du bloc…",
        "editor.preview_failed": "Impossible d’afficher l’aperçu de ce bloc.",
        "editor.preview_failed_single": "Impossible d’afficher ce bloc seul en aperçu.",
        "editor.preview_single_notice": "👁 Aperçu de {label} uniquement.\nL’aperçu complet reste inchangé et reste disponible via «✅ Résultat».",
    },
    "de": {
        "common.back": "🔙 Zurück",
        "common.reason": "Grund: {reason}",
        "editor.block_missing": "Dieser Block existiert nicht mehr.",
        "editor.preview_block": "👁 Diesen Block ansehen",
        "editor.preview_generating": "Blockvorschau wird erstellt…",
        "editor.preview_failed": "Dieser Block konnte nicht angezeigt werden.",
        "editor.preview_failed_single": "Dieser Block konnte nicht einzeln angezeigt werden.",
        "editor.preview_single_notice": "👁 Vorschau nur für {label}.\nDie vollständige Vorschau bleibt unverändert und ist weiterhin über «✅ Ergebnis» verfügbar.",
    },
    "it": {
        "common.back": "🔙 Indietro",
        "common.reason": "Motivo: {reason}",
        "editor.block_missing": "Questo blocco non esiste più.",
        "editor.preview_block": "👁 Anteprima di questo blocco",
        "editor.preview_generating": "Creazione anteprima del blocco…",
        "editor.preview_failed": "Impossibile mostrare l’anteprima di questo blocco.",
        "editor.preview_failed_single": "Impossibile mostrare questo blocco da solo.",
        "editor.preview_single_notice": "👁 Anteprima solo di {label}.\nL’anteprima completa non cambia e resta disponibile da «✅ Risultato».",
    },
    "pt": {
        "common.back": "🔙 Voltar",
        "common.reason": "Motivo: {reason}",
        "editor.block_missing": "Este bloco não existe mais.",
        "editor.preview_block": "👁 Prévia deste bloco",
        "editor.preview_generating": "Gerando prévia do bloco…",
        "editor.preview_failed": "Não foi possível visualizar este bloco.",
        "editor.preview_failed_single": "Não foi possível visualizar este bloco sozinho.",
        "editor.preview_single_notice": "👁 Prévia apenas de {label}.\nA prévia completa não mudou e continua disponível em «✅ Resultado».",
    },
    "nl": {
        "common.back": "🔙 Terug",
        "common.reason": "Reden: {reason}",
        "editor.block_missing": "Dit blok bestaat niet meer.",
        "editor.preview_block": "👁 Voorbeeld van dit blok",
        "editor.preview_generating": "Blokvoorbeeld wordt gemaakt…",
        "editor.preview_failed": "Voorbeeld van dit blok kon niet worden gemaakt.",
        "editor.preview_failed_single": "Dit blok kon niet afzonderlijk worden bekeken.",
        "editor.preview_single_notice": "👁 Alleen voorbeeld van {label}.\nHet volledige voorbeeld blijft ongewijzigd en beschikbaar via «✅ Resultaat».",
    },
    "pl": {
        "common.back": "🔙 Wstecz",
        "common.reason": "Powód: {reason}",
        "editor.block_missing": "Ten blok już nie istnieje.",
        "editor.preview_block": "👁 Podgląd tego bloku",
        "editor.preview_generating": "Tworzenie podglądu bloku…",
        "editor.preview_failed": "Nie udało się wyświetlić podglądu tego bloku.",
        "editor.preview_failed_single": "Nie udało się wyświetlić tego bloku osobno.",
        "editor.preview_single_notice": "👁 Podgląd tylko {label}.\nPełny podgląd pozostaje bez zmian i nadal jest dostępny przez «✅ Wynik».",
    },
    "uk": {
        "common.back": "🔙 Назад",
        "common.reason": "Причина: {reason}",
        "editor.block_missing": "Цього блоку більше немає.",
        "editor.preview_block": "👁 Перегляд цього блоку",
        "editor.preview_generating": "Створення перегляду блоку…",
        "editor.preview_failed": "Не вдалося переглянути цей блок.",
        "editor.preview_failed_single": "Не вдалося переглянути цей блок окремо.",
        "editor.preview_single_notice": "👁 Перегляд лише {label}.\nПовний перегляд не змінено й він доступний через «✅ Результат».",
    },
    "ru": {
        "common.back": "🔙 Назад",
        "common.reason": "Причина: {reason}",
        "editor.block_missing": "Этот блок больше не существует.",
        "editor.preview_block": "👁 Просмотр этого блока",
        "editor.preview_generating": "Создаётся предпросмотр блока…",
        "editor.preview_failed": "Не удалось показать этот блок.",
        "editor.preview_failed_single": "Не удалось показать этот блок отдельно.",
        "editor.preview_single_notice": "👁 Предпросмотр только {label}.\nПолный предпросмотр не изменился и доступен через «✅ Результат».",
    },
    "tr": {
        "common.back": "🔙 Geri",
        "common.reason": "Neden: {reason}",
        "editor.block_missing": "Bu blok artık mevcut değil.",
        "editor.preview_block": "👁 Bu bloğu önizle",
        "editor.preview_generating": "Blok önizlemesi oluşturuluyor…",
        "editor.preview_failed": "Bu blok önizlenemedi.",
        "editor.preview_failed_single": "Bu blok tek başına önizlenemedi.",
        "editor.preview_single_notice": "👁 Yalnızca {label} önizlemesi.\nTam önizleme değişmedi ve «✅ Sonuç» düğmesinden erişilebilir.",
    },
    "fa": {
        "common.back": "🔙 بازگشت",
        "common.reason": "دلیل: {reason}",
        "editor.block_missing": "این بخش دیگر وجود ندارد.",
        "editor.preview_block": "👁 پیش‌نمایش این بخش",
        "editor.preview_generating": "در حال ساخت پیش‌نمایش بخش…",
        "editor.preview_failed": "پیش‌نمایش این بخش ممکن نشد.",
        "editor.preview_failed_single": "پیش‌نمایش جداگانه این بخش ممکن نشد.",
        "editor.preview_single_notice": "👁 فقط پیش‌نمایش {label}.\nپیش‌نمایش کامل بدون تغییر است و از «✅ نتیجه» در دسترس می‌ماند.",
    },
    "ku": {
        "common.back": "🔙 Vegere",
        "common.reason": "Sedem: {reason}",
        "editor.block_missing": "Ev blok êdî tune ye.",
        "editor.preview_block": "👁 Pêşdîtina vê blokê",
        "editor.preview_generating": "Pêşdîtina blokê tê çêkirin…",
        "editor.preview_failed": "Pêşdîtina vê blokê nehat çêkirin.",
        "editor.preview_failed_single": "Ev blok bi tenê nehat pêşdîtin.",
        "editor.preview_single_notice": "👁 Tenê pêşdîtina {label}.\nPêşdîtina tevahî neguhere û ji «✅ Encam» tê gihîştin.",
    },
    "ur": {
        "common.back": "🔙 واپس",
        "common.reason": "وجہ: {reason}",
        "editor.block_missing": "یہ بلاک اب موجود نہیں ہے۔",
        "editor.preview_block": "👁 اس بلاک کا پیش منظر",
        "editor.preview_generating": "بلاک کا پیش منظر بنایا جا رہا ہے…",
        "editor.preview_failed": "اس بلاک کا پیش منظر نہیں بنایا جا سکا۔",
        "editor.preview_failed_single": "اس بلاک کو الگ سے پیش منظر میں نہیں دکھایا جا سکا۔",
        "editor.preview_single_notice": "👁 صرف {label} کا پیش منظر۔\nمکمل پیش منظر تبدیل نہیں ہوا اور «✅ نتیجہ» سے دستیاب ہے۔",
    },
    "hi": {
        "common.back": "🔙 वापस",
        "common.reason": "कारण: {reason}",
        "editor.block_missing": "यह ब्लॉक अब मौजूद नहीं है।",
        "editor.preview_block": "👁 इस ब्लॉक का पूर्वावलोकन",
        "editor.preview_generating": "ब्लॉक पूर्वावलोकन बनाया जा रहा है…",
        "editor.preview_failed": "इस ब्लॉक का पूर्वावलोकन नहीं हो सका।",
        "editor.preview_failed_single": "इस ब्लॉक का अलग से पूर्वावलोकन नहीं हो सका।",
        "editor.preview_single_notice": "👁 केवल {label} का पूर्वावलोकन।\nपूरा पूर्वावलोकन नहीं बदला है और «✅ परिणाम» से उपलब्ध है।",
    },
    "id": {
        "common.back": "🔙 Kembali",
        "common.reason": "Alasan: {reason}",
        "editor.block_missing": "Blok ini sudah tidak ada.",
        "editor.preview_block": "👁 Pratinjau blok ini",
        "editor.preview_generating": "Membuat pratinjau blok…",
        "editor.preview_failed": "Blok ini tidak dapat dipratinjau.",
        "editor.preview_failed_single": "Blok ini tidak dapat dipratinjau secara terpisah.",
        "editor.preview_single_notice": "👁 Pratinjau hanya {label}.\nPratinjau penuh tidak berubah dan tetap tersedia dari «✅ Hasil».",
    },
    "ja": {
        "common.back": "🔙 戻る",
        "common.reason": "理由: {reason}",
        "editor.block_missing": "このブロックはもう存在しません。",
        "editor.preview_block": "👁 このブロックをプレビュー",
        "editor.preview_generating": "ブロックのプレビューを生成中…",
        "editor.preview_failed": "このブロックをプレビューできませんでした。",
        "editor.preview_failed_single": "このブロック単体をプレビューできませんでした。",
        "editor.preview_single_notice": "👁 {label} のみをプレビューしています。\n全体プレビューは変更されず、「✅ 結果」から引き続き確認できます。",
    },
    "ko": {
        "common.back": "🔙 뒤로",
        "common.reason": "이유: {reason}",
        "editor.block_missing": "이 블록은 더 이상 존재하지 않습니다.",
        "editor.preview_block": "👁 이 블록 미리보기",
        "editor.preview_generating": "블록 미리보기를 생성하는 중…",
        "editor.preview_failed": "이 블록을 미리 볼 수 없습니다.",
        "editor.preview_failed_single": "이 블록만 따로 미리 볼 수 없습니다.",
        "editor.preview_single_notice": "👁 {label}만 미리 봅니다.\n전체 미리보기는 변경되지 않으며 «✅ 결과»에서 계속 확인할 수 있습니다.",
    },
    "vi": {
        "common.back": "🔙 Quay lại",
        "common.reason": "Lý do: {reason}",
        "editor.block_missing": "Khối này không còn tồn tại.",
        "editor.preview_block": "👁 Xem trước khối này",
        "editor.preview_generating": "Đang tạo bản xem trước của khối…",
        "editor.preview_failed": "Không thể xem trước khối này.",
        "editor.preview_failed_single": "Không thể xem trước riêng khối này.",
        "editor.preview_single_notice": "👁 Chỉ xem trước {label}.\nBản xem trước đầy đủ không thay đổi và vẫn có trong «✅ Kết quả».",
    },
    "th": {
        "common.back": "🔙 กลับ",
        "common.reason": "เหตุผล: {reason}",
        "editor.block_missing": "บล็อกนี้ไม่มีอยู่แล้ว",
        "editor.preview_block": "👁 ดูตัวอย่างบล็อกนี้",
        "editor.preview_generating": "กำลังสร้างตัวอย่างบล็อก…",
        "editor.preview_failed": "ไม่สามารถดูตัวอย่างบล็อกนี้ได้",
        "editor.preview_failed_single": "ไม่สามารถดูตัวอย่างบล็อกนี้แยกเดี่ยวได้",
        "editor.preview_single_notice": "👁 ดูตัวอย่างเฉพาะ {label}\nตัวอย่างแบบเต็มไม่เปลี่ยนและยังดูได้จาก «✅ ผลลัพธ์»",
    },
    "zh-hans": {
        "common.back": "🔙 返回",
        "common.reason": "原因：{reason}",
        "editor.block_missing": "此区块已不存在。",
        "editor.preview_block": "👁 预览此区块",
        "editor.preview_generating": "正在生成区块预览…",
        "editor.preview_failed": "无法预览此区块。",
        "editor.preview_failed_single": "无法单独预览此区块。",
        "editor.preview_single_notice": "👁 仅预览 {label}。\n完整预览保持不变，仍可通过“✅ 结果”查看。",
    },
    "zh-hant": {
        "common.back": "🔙 返回",
        "common.reason": "原因：{reason}",
        "editor.block_missing": "此區塊已不存在。",
        "editor.preview_block": "👁 預覽此區塊",
        "editor.preview_generating": "正在產生區塊預覽…",
        "editor.preview_failed": "無法預覽此區塊。",
        "editor.preview_failed_single": "無法單獨預覽此區塊。",
        "editor.preview_single_notice": "👁 僅預覽 {label}。\n完整預覽維持不變，仍可透過「✅ 結果」查看。",
    },
}


_PUBLISH_SELECT_TRANSLATIONS: dict[str, str] = {
    "es": "Seleccionar",
    "fr": "Sélectionner",
    "de": "Auswählen",
    "it": "Seleziona",
    "pt": "Selecionar",
    "nl": "Selecteren",
    "pl": "Wybierz",
    "uk": "Вибрати",
    "ru": "Выбрать",
    "tr": "Seç",
    "fa": "انتخاب",
    "ku": "Hilbijêre",
    "ur": "منتخب کریں",
    "hi": "चुनें",
    "id": "Pilih",
    "ja": "選択",
    "ko": "선택",
    "vi": "Chọn",
    "th": "เลือก",
    "zh-hans": "选择",
    "zh-hant": "選擇",
}

for language, label in _PUBLISH_SELECT_TRANSLATIONS.items():
    CATALOG_TRANSLATIONS[language]["ux.publish.select"] = label


# Single-message input for managed InlineKeyboardButton creation.
_BUTTON_INPUT_TRANSLATIONS: dict[str, tuple[str, str, str]] = {
    "en": (
        "Send the button in this format:\n{label}",
        "button name - URL or alert:text or popup:text or cbd:code",
        "Invalid button format. Send one button in braces with a name, a - separator, and its action.",
    ),
    "ar": (
        "أرسل تنسيق الزر:\n{label}",
        "اسم الزر - الرابط أو alert:النص أو popup:النص أو cbd:الكود",
        "صيغة الزر غير صالحة. أرسل زرًا واحدًا بين القوسين، يتضمن الاسم ثم - ثم وظيفة الزر.",
    ),
    "es": (
        "Envía el botón con este formato:\n{label}",
        "nombre del botón - URL o alert:texto o popup:texto o cbd:código",
        "Formato de botón no válido. Envía un botón entre llaves con un nombre, el separador - y su acción.",
    ),
    "fr": (
        "Envoyez le bouton sous cette forme :\n{label}",
        "nom du bouton - URL ou alert:texte ou popup:texte ou cbd:code",
        "Format du bouton invalide. Envoyez un bouton entre accolades avec un nom, le séparateur - et son action.",
    ),
    "de": (
        "Sende den Button in diesem Format:\n{label}",
        "Buttonname - URL oder alert:Text oder popup:Text oder cbd:Code",
        "Ungültiges Buttonformat. Sende einen Button in geschweiften Klammern mit Name, Trennzeichen - und Aktion.",
    ),
    "it": (
        "Invia il pulsante in questo formato:\n{label}",
        "nome del pulsante - URL oppure alert:testo oppure popup:testo oppure cbd:codice",
        "Formato del pulsante non valido. Invia un pulsante tra parentesi graffe con nome, separatore - e azione.",
    ),
    "pt": (
        "Envie o botão neste formato:\n{label}",
        "nome do botão - URL ou alert:texto ou popup:texto ou cbd:código",
        "Formato de botão inválido. Envie um botão entre chaves com nome, separador - e ação.",
    ),
    "nl": (
        "Stuur de knop in dit formaat:\n{label}",
        "knopnaam - URL of alert:tekst of popup:tekst of cbd:code",
        "Ongeldig knopformaat. Stuur één knop tussen accolades met een naam, het scheidingsteken - en de actie.",
    ),
    "pl": (
        "Wyślij przycisk w tym formacie:\n{label}",
        "nazwa przycisku - URL lub alert:tekst lub popup:tekst lub cbd:kod",
        "Nieprawidłowy format przycisku. Wyślij jeden przycisk w nawiasach klamrowych z nazwą, separatorem - i działaniem.",
    ),
    "uk": (
        "Надішліть кнопку в такому форматі:\n{label}",
        "назва кнопки - URL або alert:текст або popup:текст або cbd:код",
        "Неправильний формат кнопки. Надішліть одну кнопку у фігурних дужках із назвою, роздільником - і дією.",
    ),
    "ru": (
        "Отправьте кнопку в таком формате:\n{label}",
        "название кнопки - URL или alert:текст или popup:текст или cbd:код",
        "Неверный формат кнопки. Отправьте одну кнопку в фигурных скобках с названием, разделителем - и действием.",
    ),
    "tr": (
        "Düğmeyi bu biçimde gönderin:\n{label}",
        "düğme adı - URL veya alert:metin veya popup:metin veya cbd:kod",
        "Geçersiz düğme biçimi. Süslü parantezler içinde ad, - ayırıcı ve eylem içeren tek bir düğme gönderin.",
    ),
    "fa": (
        "دکمه را با این قالب بفرستید:\n{label}",
        "نام دکمه - پیوند یا alert:متن یا popup:متن یا cbd:کد",
        "قالب دکمه نامعتبر است. یک دکمه داخل آکولاد با نام، جداکننده - و عملکرد بفرستید.",
    ),
    "ku": (
        "Bişkojkê bi vî şêweyî bişîne:\n{label}",
        "navê bişkojkê - URL an alert:nivîs an popup:nivîs an cbd:kod",
        "Şêweya bişkojkê nederbasdar e. Yek bişkojkê di nav kevanên kelem de bi nav, veqetînera - û kiryarê bişîne.",
    ),
    "ur": (
        "بٹن اس فارمیٹ میں بھیجیں:\n{label}",
        "بٹن کا نام - لنک یا alert:متن یا popup:متن یا cbd:کوڈ",
        "بٹن کا فارمیٹ درست نہیں۔ بڑے قوسین میں ایک بٹن بھیجیں جس میں نام، - کی علامت اور عمل ہو۔",
    ),
    "hi": (
        "बटन इस प्रारूप में भेजें:\n{label}",
        "बटन का नाम - URL या alert:पाठ या popup:पाठ या cbd:कोड",
        "बटन का प्रारूप अमान्य है। घुंघराले कोष्ठकों में नाम, - विभाजक और क्रिया वाला एक बटन भेजें।",
    ),
    "id": (
        "Kirim tombol dengan format ini:\n{label}",
        "nama tombol - URL atau alert:teks atau popup:teks atau cbd:kode",
        "Format tombol tidak valid. Kirim satu tombol dalam kurung kurawal dengan nama, pemisah -, dan tindakannya.",
    ),
    "ja": (
        "次の形式でボタンを送信してください：\n{label}",
        "ボタン名 - URL または alert:本文 または popup:本文 または cbd:コード",
        "ボタンの形式が正しくありません。名前、区切り文字 -、動作を波括弧で囲んで、ボタンを1つ送信してください。",
    ),
    "ko": (
        "다음 형식으로 버튼을 보내세요:\n{label}",
        "버튼 이름 - URL 또는 alert:내용 또는 popup:내용 또는 cbd:코드",
        "버튼 형식이 올바르지 않습니다. 이름, 구분 기호 -, 동작을 중괄호로 감싼 버튼 하나를 보내세요.",
    ),
    "vi": (
        "Gửi nút theo định dạng này:\n{label}",
        "tên nút - URL hoặc alert:văn bản hoặc popup:văn bản hoặc cbd:mã",
        "Định dạng nút không hợp lệ. Gửi một nút trong dấu ngoặc nhọn gồm tên, dấu phân cách - và hành động.",
    ),
    "th": (
        "ส่งปุ่มในรูปแบบนี้:\n{label}",
        "ชื่อปุ่ม - URL หรือ alert:ข้อความ หรือ popup:ข้อความ หรือ cbd:รหัส",
        "รูปแบบปุ่มไม่ถูกต้อง ส่งปุ่มหนึ่งปุ่มในวงเล็บปีกกา โดยมีชื่อ ตัวคั่น - และการทำงานของปุ่ม",
    ),
    "zh-hans": (
        "请按此格式发送按钮：\n{label}",
        "按钮名称 - 链接 或 alert:文本 或 popup:文本 或 cbd:代码",
        "按钮格式无效。请发送一个用花括号包围的按钮，包含名称、分隔符 - 和按钮功能。",
    ),
    "zh-hant": (
        "請依此格式傳送按鈕：\n{label}",
        "按鈕名稱 - 連結 或 alert:文字 或 popup:文字 或 cbd:代碼",
        "按鈕格式無效。請傳送一個用大括號包圍的按鈕，包含名稱、分隔符 - 和按鈕功能。",
    ),
}

for language, button_input_texts in _BUTTON_INPUT_TRANSLATIONS.items():
    button_catalog = (
        CATALOG_EN if language == "en"
        else CATALOG_AR if language == "ar"
        else CATALOG_TRANSLATIONS[language]
    )
    button_catalog.update(zip(
        ("buttons.send_format", "buttons.format_parts", "buttons.invalid_format"),
        button_input_texts,
        strict=True,
    ))
