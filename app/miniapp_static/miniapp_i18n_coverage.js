// Complete locale coverage for Mini App features that arrived after the original
// locale packs. Explicit translations always win; missing advanced labels get a
// concise native-language semantic fallback instead of silently reverting to English.
(() => {
  const i18n = window.MiniAppI18n;
  if (!i18n || ["en", "ar", "ru"].includes(i18n.language)) return;

  const TERM_KEYS = [
    "button","edit","add","choose","link","copy","search","preview","settings","error",
    "write","location","row","column","cell","selection","upload","open","close","merge","alignment",
    "all","recent","smileys","people","hearts","nature","food","activity","travel","objects","symbols","flags",
  ];
  const TERM_ROWS = {
    es:["Botón","Editar","Añadir","Elegir","Enlace","Copiar","Buscar","Vista previa","Ajustes","Error","Escribir","Ubicación","Fila","Columna","Celda","Selección","Subir","Abrir","Cerrar","Combinar","Alineación","Todos","Recientes","Caritas","Personas","Corazones","Naturaleza","Comida","Actividad","Viajes","Objetos","Símbolos","Banderas"],
    fr:["Bouton","Modifier","Ajouter","Choisir","Lien","Copier","Rechercher","Aperçu","Paramètres","Erreur","Écrire","Emplacement","Ligne","Colonne","Cellule","Sélection","Téléverser","Ouvrir","Fermer","Fusionner","Alignement","Tous","Récents","Émoticônes","Personnes","Cœurs","Nature","Nourriture","Activités","Voyage","Objets","Symboles","Drapeaux"],
    de:["Schaltfläche","Bearbeiten","Hinzufügen","Auswählen","Link","Kopieren","Suchen","Vorschau","Einstellungen","Fehler","Schreiben","Standort","Zeile","Spalte","Zelle","Auswahl","Hochladen","Öffnen","Schließen","Zusammenführen","Ausrichtung","Alle","Zuletzt","Smileys","Personen","Herzen","Natur","Essen","Aktivitäten","Reisen","Objekte","Symbole","Flaggen"],
    it:["Pulsante","Modifica","Aggiungi","Scegli","Link","Copia","Cerca","Anteprima","Impostazioni","Errore","Scrivi","Posizione","Riga","Colonna","Cella","Selezione","Carica","Apri","Chiudi","Unisci","Allineamento","Tutti","Recenti","Faccine","Persone","Cuori","Natura","Cibo","Attività","Viaggi","Oggetti","Simboli","Bandiere"],
    pt:["Botão","Editar","Adicionar","Escolher","Link","Copiar","Pesquisar","Prévia","Configurações","Erro","Escrever","Localização","Linha","Coluna","Célula","Seleção","Carregar","Abrir","Fechar","Mesclar","Alinhamento","Todos","Recentes","Carinhas","Pessoas","Corações","Natureza","Comida","Atividades","Viagens","Objetos","Símbolos","Bandeiras"],
    nl:["Knop","Bewerken","Toevoegen","Kiezen","Link","Kopiëren","Zoeken","Voorbeeld","Instellingen","Fout","Schrijven","Locatie","Rij","Kolom","Cel","Selectie","Uploaden","Openen","Sluiten","Samenvoegen","Uitlijning","Alles","Recent","Smileys","Mensen","Harten","Natuur","Eten","Activiteiten","Reizen","Objecten","Symbolen","Vlaggen"],
    pl:["Przycisk","Edytuj","Dodaj","Wybierz","Link","Kopiuj","Szukaj","Podgląd","Ustawienia","Błąd","Pisz","Lokalizacja","Wiersz","Kolumna","Komórka","Wybór","Prześlij","Otwórz","Zamknij","Scal","Wyrównanie","Wszystkie","Ostatnie","Emotikony","Ludzie","Serca","Natura","Jedzenie","Aktywności","Podróże","Obiekty","Symbole","Flagi"],
    uk:["Кнопка","Редагувати","Додати","Вибрати","Посилання","Копіювати","Пошук","Перегляд","Налаштування","Помилка","Написати","Розташування","Рядок","Стовпець","Комірка","Вибір","Завантажити","Відкрити","Закрити","Об’єднати","Вирівнювання","Усі","Нещодавні","Смайли","Люди","Серця","Природа","Їжа","Активності","Подорожі","Об’єкти","Символи","Прапори"],
    tr:["Düğme","Düzenle","Ekle","Seç","Bağlantı","Kopyala","Ara","Önizleme","Ayarlar","Hata","Yaz","Konum","Satır","Sütun","Hücre","Seçim","Yükle","Aç","Kapat","Birleştir","Hizalama","Tümü","Son kullanılanlar","İfadeler","Kişiler","Kalpler","Doğa","Yiyecek","Etkinlikler","Seyahat","Nesneler","Semboller","Bayraklar"],
    fa:["دکمه","ویرایش","افزودن","انتخاب","پیوند","کپی","جستجو","پیش‌نمایش","تنظیمات","خطا","نوشتن","موقعیت","ردیف","ستون","سلول","انتخاب","بارگذاری","باز کردن","بستن","ادغام","تراز","همه","اخیر","شکلک‌ها","افراد","قلب‌ها","طبیعت","غذا","فعالیت‌ها","سفر","اشیا","نمادها","پرچم‌ها"],
    ku:["Bişkok","Sererast bike","Zêde bike","Hilbijêre","Girêdan","Kopî bike","Lêgerîn","Pêşdîtin","Mîheng","Çewtî","Binivîse","Cih","Rêz","Stûn","Xanê","Hilbijartin","Barkirin","Veke","Bigire","Yek bike","Rêzkirin","Hemû","Dawî","Rûken","Kes","Dil","Xweza","Xwarin","Çalakî","Rêwîtî","Tişt","Nîşan","Ala"],
    ur:["بٹن","ترمیم","شامل کریں","منتخب کریں","لنک","نقل کریں","تلاش","پیش منظر","ترتیبات","خرابی","لکھیں","مقام","قطار","کالم","خانہ","انتخاب","اپ لوڈ","کھولیں","بند کریں","ضم کریں","سیدھ","سب","حالیہ","مسکراہٹیں","لوگ","دل","فطرت","کھانا","سرگرمیاں","سفر","اشیا","علامات","جھنڈے"],
    hi:["बटन","संपादित करें","जोड़ें","चुनें","लिंक","कॉपी करें","खोजें","पूर्वावलोकन","सेटिंग्स","त्रुटि","लिखें","स्थान","पंक्ति","स्तंभ","सेल","चयन","अपलोड","खोलें","बंद करें","मर्ज करें","संरेखण","सभी","हाल के","स्माइली","लोग","दिल","प्रकृति","भोजन","गतिविधियाँ","यात्रा","वस्तुएँ","प्रतीक","झंडे"],
    id:["Tombol","Edit","Tambah","Pilih","Tautan","Salin","Cari","Pratinjau","Pengaturan","Kesalahan","Tulis","Lokasi","Baris","Kolom","Sel","Pilihan","Unggah","Buka","Tutup","Gabungkan","Perataan","Semua","Terbaru","Wajah","Orang","Hati","Alam","Makanan","Aktivitas","Perjalanan","Objek","Simbol","Bendera"],
    ja:["ボタン","編集","追加","選択","リンク","コピー","検索","プレビュー","設定","エラー","入力","位置","行","列","セル","選択","アップロード","開く","閉じる","結合","配置","すべて","最近","顔","人","ハート","自然","食べ物","アクティビティ","旅行","オブジェクト","記号","旗"],
    ko:["버튼","편집","추가","선택","링크","복사","검색","미리보기","설정","오류","작성","위치","행","열","셀","선택","업로드","열기","닫기","병합","정렬","모두","최근","표정","사람","하트","자연","음식","활동","여행","사물","기호","깃발"],
    vi:["Nút","Chỉnh sửa","Thêm","Chọn","Liên kết","Sao chép","Tìm kiếm","Xem trước","Cài đặt","Lỗi","Viết","Vị trí","Hàng","Cột","Ô","Lựa chọn","Tải lên","Mở","Đóng","Gộp","Căn chỉnh","Tất cả","Gần đây","Khuôn mặt","Mọi người","Trái tim","Thiên nhiên","Đồ ăn","Hoạt động","Du lịch","Đồ vật","Biểu tượng","Cờ"],
    th:["ปุ่ม","แก้ไข","เพิ่ม","เลือก","ลิงก์","คัดลอก","ค้นหา","ดูตัวอย่าง","การตั้งค่า","ข้อผิดพลาด","เขียน","ตำแหน่ง","แถว","คอลัมน์","เซลล์","การเลือก","อัปโหลด","เปิด","ปิด","รวม","การจัดแนว","ทั้งหมด","ล่าสุด","ใบหน้า","ผู้คน","หัวใจ","ธรรมชาติ","อาหาร","กิจกรรม","การเดินทาง","สิ่งของ","สัญลักษณ์","ธง"],
    "zh-hans":["按钮","编辑","添加","选择","链接","复制","搜索","预览","设置","错误","输入","位置","行","列","单元格","选择","上传","打开","关闭","合并","对齐","全部","最近","表情","人物","爱心","自然","食物","活动","旅行","物品","符号","旗帜"],
    "zh-hant":["按鈕","編輯","新增","選擇","連結","複製","搜尋","預覽","設定","錯誤","輸入","位置","列","欄","儲存格","選擇","上傳","開啟","關閉","合併","對齊","全部","最近","表情","人物","愛心","自然","食物","活動","旅行","物品","符號","旗幟"],
  };
  const terms = Object.fromEntries(
    TERM_KEYS.map((key, index) => [key, TERM_ROWS[i18n.language]?.[index] || ""]),
  );
  if (!terms.button) return;

  const EXPLICIT_KEYS = new Set([
    "app.title",
    "editor.start_title","editor.start_hint","editor.start_writing","editor.add_photo","editor.input_placeholder","editor.add_block",
    "pages.title","pages.subtitle","pages.new","pages.empty","send.title","send.subtitle",
    "top.more","top.undo","top.redo","top.text","top.media","top.math","top.emoji",
    "editor.untitled","editor.unsaved","common.cancel","common.save","common.delete","common.done","common.loading",
    "block.paragraph","block.heading","block.footer","block.preformatted","block.blockquote","block.pullquote","block.divider","block.anchor",
    "block.list","block.details","block.table","block.math","block.photo","block.video","block.animation","block.audio","block.voice","block.document","block.collage","block.slideshow","block.map",
    "list.bulleted","list.numbered","list.tasks","list.item","action.move_up","action.move_down","details.inside_count",
  ]);
  const ZH_EXTRA_KEYS = new Set([
    "common.all","top.pages","top.list","top.table","editor.canvas","editor.block_actions","editor.close","editor.send",
    "inline.bold","inline.italic","inline.strike","inline.underline","inline.code","inline.highlight","inline.subscript","inline.superscript","inline.spoiler","inline.link","inline.add_link","inline.edit_link","inline.remove_link","inline.create_button","inline.invalid_link",
    "button.add","button.title","button.title_placeholder","button.separate","button.style","button.url","button.copy","button.mention","button.page","button.callback","button.popup","button.value_required","button.title_required","button.create_failed",
    "media.pick_photo","media.pick_video","media.pick_animation","media.pick_audio","media.pick_voice","media.pick_document","media.unsupported","media.no_file","media.too_large","media.uploaded","media.upload_failed","media.uploading_telegram","media.ready","media.picker_hint","media.uploading","media.change","media.choose_images_videos","media.added_count","media.some_failed","media.uploading_multiple","media.container_hint","media.add_images_videos","media.location","media.locating","media.location_set","media.location_hint","media.update_location","media.use_location","media.geolocation_unsupported","media.location_success","media.location_permission","media.location_failed",
  ]);
  if (i18n.language.startsWith("zh-")) ZH_EXTRA_KEYS.forEach(key => EXPLICIT_KEYS.add(key));

  const originalT = i18n.t.bind(i18n);
  const originalApply = i18n.apply.bind(i18n);

  function blockLabel(name) {
    const key = `block.${name}`;
    return EXPLICIT_KEYS.has(key) ? originalT(key) : "";
  }

  const INLINE_LABELS = {
    "inline.bold":"B",
    "inline.italic":"I",
    "inline.strike":"S",
    "inline.underline":"U",
    "inline.code":"</>",
    "inline.highlight":"▣",
    "inline.subscript":"x₂",
    "inline.superscript":"x²",
    "inline.spoiler":"•••",
    "inline.link":terms.link,
  };
  const EMOJI_LABELS = {
    "emoji.recent":terms.recent,
    "emoji.smileys":terms.smileys,
    "emoji.people":terms.people,
    "emoji.hearts":terms.hearts,
    "emoji.nature":terms.nature,
    "emoji.food":terms.food,
    "emoji.activity":terms.activity,
    "emoji.travel":terms.travel,
    "emoji.objects":terms.objects,
    "emoji.symbols":terms.symbols,
    "emoji.flags":terms.flags,
  };

  function directTemplate(key) {
    if (key === "common.all") return terms.all;
    if (key === "top.pages") return originalT("pages.title");
    if (key === "top.list") return blockLabel("list");
    if (key === "top.table") return blockLabel("table");
    if (key === "top.more_blocks") return originalT("editor.add_block");
    if (key === "editor.send") return originalT("send.title");
    if (key === "editor.canvas") return originalT("top.text");
    if (key === "editor.block_actions") return originalT("editor.add_block");
    if (key === "button.url") return terms.link;
    if (key === "button.page" || key === "button.linked_page") return originalT("pages.title");
    if (key === "button.callback" || key === "button.callback_data") return `${terms.write} · ${terms.button}`;
    if (key === "button.popup") return `${terms.open} · ${terms.button}`;
    if (key === "button.disabled") return `${terms.close} · ${terms.button}`;
    if (key === "button.accept") return originalT("common.done");
    if (key === "button.decline") return originalT("common.cancel");
    if (key === "table.align_left") return `< · ${terms.alignment}`;
    if (key === "table.align_center") return `= · ${terms.alignment}`;
    if (key === "table.align_right") return `> · ${terms.alignment}`;
    if (key === "table.align_top") return `^ · ${terms.alignment}`;
    if (key === "table.align_middle") return `| · ${terms.alignment}`;
    if (key === "table.align_bottom") return `v · ${terms.alignment}`;
    if (key === "table.merge_next") return `+ · ${terms.merge} · ${terms.cell}`;
    if (key === "table.unmerge") return `- · ${terms.merge} · ${terms.cell}`;
    if (key === "table.add_row_above") return `${terms.add} · ^ · ${terms.row}`;
    if (key === "table.add_row_below") return `${terms.add} · v · ${terms.row}`;
    if (key === "table.add_column_before") return `${terms.add} · < · ${terms.column}`;
    if (key === "table.add_column_after") return `${terms.add} · > · ${terms.column}`;
    if (INLINE_LABELS[key]) return INLINE_LABELS[key];
    if (EMOJI_LABELS[key]) return EMOJI_LABELS[key];
    return "";
  }

  function subjectFor(key) {
    const [, tail = ""] = String(key).split(".", 2);
    if (tail.includes("cell")) return terms.cell;
    if (tail.includes("row")) return terms.row;
    if (tail.includes("column")) return terms.column;
    if (tail.includes("location")) return terms.location;
    if (key.startsWith("button.")) return terms.button;
    if (key.startsWith("table.")) return blockLabel("table");
    if (key.startsWith("media.")) {
      for (const name of ["photo","video","animation","audio","voice","document","collage","slideshow"]) {
        if (tail.includes(name)) return blockLabel(name);
      }
      return originalT("top.media");
    }
    if (key.startsWith("inline.")) return tail.includes("link") ? terms.link : originalT("top.text");
    if (key.startsWith("details.")) return blockLabel("details");
    if (key.startsWith("list.")) return blockLabel("list");
    if (key.startsWith("math.")) return originalT("top.math");
    if (key.startsWith("emoji.")) return originalT("top.emoji");
    if (key.startsWith("preview.")) return terms.preview;
    if (key.startsWith("multi.")) return terms.selection;
    if (key.startsWith("page.") || key.startsWith("pages.") || key.startsWith("save.")) return originalT("pages.title");
    if (key.startsWith("send.")) return originalT("send.title");
    if (key.startsWith("heading.")) return blockLabel("heading");
    if (key.startsWith("block.")) {
      const name = tail.replace(/_(?:desc|settings|drag|short|select).*$/, "");
      return blockLabel(name) || originalT("top.text");
    }
    if (key.startsWith("session.")) return originalT("editor.start_title");
    if (key.startsWith("editor.")) return originalT("top.text");
    return "";
  }

  function actionFor(key) {
    const value = String(key);
    if (/(?:failed|error|unsupported|invalid|unavailable|not_ready)/.test(value)) return terms.error;
    if (/(?:loading|saving|uploading|locating|sending|discarding)/.test(value)) return originalT("common.loading");
    if (/(?:delete|remove|discard)/.test(value)) return originalT("common.delete");
    if (/(?:saved|save)/.test(value)) return originalT("common.save");
    if (/(?:add|create)/.test(value)) return terms.add;
    if (/(?:edit|update|change)/.test(value)) return terms.edit;
    if (/(?:choose|select|pick)/.test(value)) return terms.choose;
    if (/(?:link)/.test(value)) return terms.link;
    if (/(?:copy)/.test(value)) return terms.copy;
    if (/(?:search)/.test(value)) return terms.search;
    if (/(?:preview)/.test(value)) return terms.preview;
    if (/(?:settings|options|style|color)/.test(value)) return terms.settings;
    if (/(?:write|input|placeholder|required|text)/.test(value)) return terms.write;
    if (/(?:open|expand)/.test(value)) return terms.open;
    if (/(?:close|collapse)/.test(value)) return terms.close;
    if (/(?:upload)/.test(value)) return terms.upload;
    if (/(?:merge)/.test(value)) return terms.merge;
    if (/(?:align)/.test(value)) return terms.alignment;
    return "";
  }

  function placeholdersFor(key) {
    const template = originalT(key);
    return [...String(template).matchAll(/\{(\w+)\}/g)].map(match => match[1]);
  }

  function fallbackTemplate(key) {
    const direct = directTemplate(key);
    if (direct) return direct;
    const parts = [actionFor(key), subjectFor(key)].filter(Boolean);
    const unique = parts.filter((part, index) => parts.indexOf(part) === index);
    const text = unique.join(" · ") || terms.settings;
    const placeholders = [...new Set(placeholdersFor(key))];
    return placeholders.length ? `${text} · ${placeholders.map(name => `{${name}}`).join(" · ")}` : text;
  }

  function format(template, vars = {}) {
    return String(template).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
  }

  function t(key, vars = {}) {
    if (EXPLICIT_KEYS.has(key)) return originalT(key, vars);
    return format(fallbackTemplate(key), vars);
  }

  function reapply(root = document) {
    root.querySelectorAll?.("[data-i18n]").forEach(element => {
      element.textContent = t(element.dataset.i18n);
    });
    root.querySelectorAll?.("[data-i18n-placeholder]").forEach(element => {
      element.placeholder = t(element.dataset.i18nPlaceholder);
    });
    root.querySelectorAll?.("[data-i18n-label]").forEach(element => {
      const value = t(element.dataset.i18nLabel);
      element.setAttribute("aria-label", value);
      if (element.hasAttribute("title")) element.title = value;
    });
  }

  i18n.t = t;
  i18n.apply = root => { originalApply(root); reapply(root); };
  i18n.coverage = Object.freeze({mode:"native-semantic-fallback", language:i18n.language});
  window.mt = t;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => reapply());
  else reapply();
})();
