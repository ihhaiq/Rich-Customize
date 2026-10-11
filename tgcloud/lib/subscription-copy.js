// The same complete 20-language catalog is used by /sup and expiry notices.
// The first 19 items of each locale match KEYS in order.
export const SUBSCRIPTION_LOCALES = Object.freeze([
  'ar','en','es','de','it','pt','nl','pl','uk','ru','tr','ur','hi','id','ja','ko','vi','th','zh-hans','zh-hant',
]);
const KEYS = ['free','gift','developer','benefits','text','blocks','depth','media','columns','pages','packs','branding','early','remaining','noExpiry','days','hours','until','warning'];
const VALUES = {
  ar:['المجانية','هدية','المطور','مميزات اشتراكك','حرف','بلوك','مستوى تداخل','وسائط','عمود جدول','صفحة محفوظة','حزمة إيموجي','إزالة الحقوق','الوصول المبكر','المدة المتبقية','بدون انتهاء','يوم','ساعة','ينتهي في','اقترب انتهاء اشتراكك'],
  en:['Free','Gift','Developer','Your subscription benefits','characters','blocks','nesting levels','media items','table columns','saved pages','emoji packs','Branding removed','Early access','Time remaining','No expiry','days','hours','Expires at','Your subscription is ending soon'],
  es:['Gratis','Regalo','Desarrollador','Ventajas de tu suscripción','caracteres','bloques','niveles de anidación','archivos multimedia','columnas de tabla','páginas guardadas','paquetes de emojis','Marca eliminada','Acceso anticipado','Tiempo restante','Sin vencimiento','días','horas','Vence el','Tu suscripción vencerá pronto'],
  de:['Kostenlos','Geschenk','Entwickler','Deine Abo-Vorteile','Zeichen','Blöcke','Verschachtelungsebenen','Medien','Tabellenspalten','gespeicherte Seiten','Emoji-Pakete','Branding entfernt','Frühzugang','Verbleibende Zeit','Kein Ablaufdatum','Tage','Stunden','Läuft ab am','Dein Abo läuft bald ab'],
  it:['Gratis','Regalo','Sviluppatore','Vantaggi del tuo abbonamento','caratteri','blocchi','livelli di annidamento','media','colonne tabella','pagine salvate','pacchetti emoji','Marchio rimosso','Accesso anticipato','Tempo rimanente','Nessuna scadenza','giorni','ore','Scade il','Il tuo abbonamento sta per scadere'],
  pt:['Gratuito','Presente','Desenvolvedor','Benefícios da assinatura','caracteres','blocos','níveis de aninhamento','mídias','colunas de tabela','páginas salvas','pacotes de emojis','Marca removida','Acesso antecipado','Tempo restante','Sem expiração','dias','horas','Expira em','Sua assinatura está perto do fim'],
  nl:['Gratis','Cadeau','Ontwikkelaar','Je abonnementsvoordelen','tekens','blokken','niveaus van nesting','media-items','tabelkolommen','opgeslagen pagina’s','emojipakketten','Branding verwijderd','Vroege toegang','Resterende tijd','Geen vervaldatum','dagen','uur','Verloopt op','Je abonnement verloopt binnenkort'],
  pl:['Bezpłatny','Prezent','Deweloper','Korzyści z subskrypcji','znaków','bloków','poziomów zagnieżdżenia','multimediów','kolumn tabeli','zapisanych stron','pakietów emoji','Usunięty branding','Wczesny dostęp','Pozostały czas','Bez terminu ważności','dni','godzin','Wygasa','Twoja subskrypcja wkrótce wygaśnie'],
  uk:['Безкоштовний','Подарунок','Розробник','Переваги підписки','символів','блоків','рівнів вкладеності','медіафайлів','стовпців таблиці','збережених сторінок','наборів емодзі','Брендування прибрано','Ранній доступ','Залишилось часу','Без терміну дії','днів','годин','Діє до','Ваша підписка скоро закінчиться'],
  ru:['Бесплатный','Подарок','Разработчик','Преимущества подписки','символов','блоков','уровней вложенности','медиафайлов','столбцов таблицы','сохранённых страниц','наборов эмодзи','Брендинг удалён','Ранний доступ','Осталось времени','Бессрочно','дней','часов','Истекает','Ваша подписка скоро закончится'],
  tr:['Ücretsiz','Hediye','Geliştirici','Abonelik avantajların','karakter','blok','iç içe düzey','medya','tablo sütunu','kayıtlı sayfa','emoji paketi','Marka kaldırma','Erken erişim','Kalan süre','Süresiz','gün','saat','Bitiş tarihi','Aboneliğin yakında sona erecek'],
  ur:['مفت','تحفہ','ڈویلپر','آپ کی رکنیت کے فوائد','حروف','بلاکس','اندرونی سطحیں','میڈیا','جدول کالم','محفوظ صفحات','ایموجی پیک','برانڈنگ ہٹانا','ابتدائی رسائی','باقی وقت','کوئی میعاد نہیں','دن','گھنٹے','ختم ہونے کی تاریخ','آپ کی رکنیت جلد ختم ہو رہی ہے'],
  hi:['मुफ़्त','उपहार','डेवलपर','आपकी सदस्यता के लाभ','अक्षर','ब्लॉक','नेस्टिंग स्तर','मीडिया','तालिका कॉलम','सहेजे गए पेज','इमोजी पैक','ब्रांडिंग हटाई गई','शीघ्र पहुँच','शेष समय','कोई समाप्ति नहीं','दिन','घंटे','समाप्ति','आपकी सदस्यता जल्द समाप्त होगी'],
  id:['Gratis','Hadiah','Pengembang','Manfaat langgananmu','karakter','blok','tingkat bersarang','media','kolom tabel','halaman tersimpan','paket emoji','Merek dihapus','Akses awal','Sisa waktu','Tanpa kedaluwarsa','hari','jam','Berakhir pada','Langgananmu akan segera berakhir'],
  ja:['無料','ギフト','開発者','サブスクリプション特典','文字','ブロック','入れ子階層','メディア','表の列','保存ページ','絵文字パック','ブランド表示なし','先行アクセス','残り時間','有効期限なし','日','時間','有効期限','サブスクリプションがまもなく終了します'],
  ko:['무료','선물','개발자','구독 혜택','문자','블록','중첩 단계','미디어','표 열','저장한 페이지','이모지 팩','브랜딩 제거','조기 이용','남은 시간','만료 없음','일','시간','만료일','구독이 곧 만료됩니다'],
  vi:['Miễn phí','Quà tặng','Nhà phát triển','Quyền lợi đăng ký','ký tự','khối','cấp lồng nhau','tệp phương tiện','cột bảng','trang đã lưu','gói emoji','Đã bỏ thương hiệu','Truy cập sớm','Thời gian còn lại','Không hết hạn','ngày','giờ','Hết hạn lúc','Gói đăng ký sắp hết hạn'],
  th:['ฟรี','ของขวัญ','นักพัฒนา','สิทธิประโยชน์การสมัคร','อักขระ','บล็อก','ระดับการซ้อน','สื่อ','คอลัมน์ตาราง','หน้าที่บันทึก','แพ็กอีโมจิ','ลบแบรนด์','เข้าถึงก่อน','เวลาที่เหลือ','ไม่หมดอายุ','วัน','ชั่วโมง','หมดอายุ','การสมัครของคุณใกล้หมดอายุ'],
  'zh-hans':['免费','礼物','开发者','订阅权益','字符','区块','嵌套层级','媒体','表格列','已保存页面','表情包','移除品牌标识','抢先体验','剩余时间','永不过期','天','小时','到期时间','你的订阅即将到期'],
  'zh-hant':['免費','禮物','開發者','訂閱權益','字元','區塊','巢狀層級','媒體','表格欄','已儲存頁面','表情包','移除品牌標誌','搶先體驗','剩餘時間','永不過期','天','小時','到期時間','你的訂閱即將到期'],
};
for (const locale of SUBSCRIPTION_LOCALES) {
  if (!Array.isArray(VALUES[locale]) || VALUES[locale].length !== KEYS.length)
    throw new Error('Incomplete subscription translation: ' + locale);
}
export function subscriptionLocale(languageCode) {
  const tag=String(languageCode||'').trim().toLowerCase().replaceAll('_','-');
  if(tag.startsWith('zh')) return /(?:^|-)(hant|tw|hk|mo)(?:-|$)/.test(tag)?'zh-hant':'zh-hans';
  const code=tag.split('-')[0];
  return Object.hasOwn(VALUES,code)?code:'en';
}
export function subscriptionText(locale,key) {
  const index=KEYS.indexOf(key);
  if(index<0) throw new Error('Unknown subscription copy: '+key);
  return VALUES[subscriptionLocale(locale)][index];
}
export function subscriptionRtl(locale) {return ['ar','ur'].includes(subscriptionLocale(locale));}
