from __future__ import annotations


# Small, reusable UI vocabulary shared by the server-side fallback composer.
# The same wording is used by the Mini App's late-feature coverage layer.  Full
# sentence translations remain authoritative; these terms are only used to
# build compact native labels for newer controls that have no dedicated copy.
TERM_KEYS = (
    "button",
    "add",
    "choose",
    "link",
    "copy",
    "search",
    "preview",
    "settings",
    "error",
    "write",
    "location",
    "row",
    "open",
    "close",
)

TERM_ROWS: dict[str, tuple[str, ...]] = {
    "de": ("Schaltfläche", "Hinzufügen", "Auswählen", "Link", "Kopieren", "Suchen", "Vorschau", "Einstellungen", "Fehler", "Schreiben", "Standort", "Zeile", "Öffnen", "Schließen"),
    "es": ("Botón", "Añadir", "Elegir", "Enlace", "Copiar", "Buscar", "Vista previa", "Ajustes", "Error", "Escribir", "Ubicación", "Fila", "Abrir", "Cerrar"),
    "fa": ("دکمه", "افزودن", "انتخاب", "پیوند", "کپی", "جستجو", "پیش‌نمایش", "تنظیمات", "خطا", "نوشتن", "موقعیت", "ردیف", "باز کردن", "بستن"),
    "fr": ("Bouton", "Ajouter", "Choisir", "Lien", "Copier", "Rechercher", "Aperçu", "Paramètres", "Erreur", "Écrire", "Emplacement", "Ligne", "Ouvrir", "Fermer"),
    "hi": ("बटन", "जोड़ें", "चुनें", "लिंक", "कॉपी करें", "खोजें", "पूर्वावलोकन", "सेटिंग्स", "त्रुटि", "लिखें", "स्थान", "पंक्ति", "खोलें", "बंद करें"),
    "id": ("Tombol", "Tambah", "Pilih", "Tautan", "Salin", "Cari", "Pratinjau", "Pengaturan", "Kesalahan", "Tulis", "Lokasi", "Baris", "Buka", "Tutup"),
    "it": ("Pulsante", "Aggiungi", "Scegli", "Link", "Copia", "Cerca", "Anteprima", "Impostazioni", "Errore", "Scrivi", "Posizione", "Riga", "Apri", "Chiudi"),
    "ja": ("ボタン", "追加", "選択", "リンク", "コピー", "検索", "プレビュー", "設定", "エラー", "入力", "位置", "行", "開く", "閉じる"),
    "ko": ("버튼", "추가", "선택", "링크", "복사", "검색", "미리보기", "설정", "오류", "작성", "위치", "행", "열기", "닫기"),
    "ku": ("Bişkok", "Zêde bike", "Hilbijêre", "Girêdan", "Kopî bike", "Lêgerîn", "Pêşdîtin", "Mîheng", "Çewtî", "Binivîse", "Cih", "Rêz", "Veke", "Bigire"),
    "nl": ("Knop", "Toevoegen", "Kiezen", "Link", "Kopiëren", "Zoeken", "Voorbeeld", "Instellingen", "Fout", "Schrijven", "Locatie", "Rij", "Openen", "Sluiten"),
    "pl": ("Przycisk", "Dodaj", "Wybierz", "Link", "Kopiuj", "Szukaj", "Podgląd", "Ustawienia", "Błąd", "Pisz", "Lokalizacja", "Wiersz", "Otwórz", "Zamknij"),
    "pt": ("Botão", "Adicionar", "Escolher", "Link", "Copiar", "Pesquisar", "Prévia", "Configurações", "Erro", "Escrever", "Localização", "Linha", "Abrir", "Fechar"),
    "ru": ("Кнопка", "Добавить", "Выбрать", "Ссылка", "Копировать", "Поиск", "Предпросмотр", "Настройки", "Ошибка", "Написать", "Место", "Строка", "Открыть", "Закрыть"),
    "th": ("ปุ่ม", "เพิ่ม", "เลือก", "ลิงก์", "คัดลอก", "ค้นหา", "ดูตัวอย่าง", "การตั้งค่า", "ข้อผิดพลาด", "เขียน", "ตำแหน่ง", "แถว", "เปิด", "ปิด"),
    "tr": ("Düğme", "Ekle", "Seç", "Bağlantı", "Kopyala", "Ara", "Önizleme", "Ayarlar", "Hata", "Yaz", "Konum", "Satır", "Aç", "Kapat"),
    "uk": ("Кнопка", "Додати", "Вибрати", "Посилання", "Копіювати", "Пошук", "Перегляд", "Налаштування", "Помилка", "Написати", "Розташування", "Рядок", "Відкрити", "Закрити"),
    "ur": ("بٹن", "شامل کریں", "منتخب کریں", "لنک", "نقل کریں", "تلاش", "پیش منظر", "ترتیبات", "خرابی", "لکھیں", "مقام", "قطار", "کھولیں", "بند کریں"),
    "vi": ("Nút", "Thêm", "Chọn", "Liên kết", "Sao chép", "Tìm kiếm", "Xem trước", "Cài đặt", "Lỗi", "Viết", "Vị trí", "Hàng", "Mở", "Đóng"),
    "zh-hans": ("按钮", "添加", "选择", "链接", "复制", "搜索", "预览", "设置", "错误", "输入", "位置", "行", "打开", "关闭"),
    "zh-hant": ("按鈕", "新增", "選擇", "連結", "複製", "搜尋", "預覽", "設定", "錯誤", "輸入", "位置", "列", "開啟", "關閉"),
}


def ui_terms(code: str) -> dict[str, str]:
    values = TERM_ROWS[code]
    return dict(zip(TERM_KEYS, values, strict=True))


__all__ = ["ui_terms"]
