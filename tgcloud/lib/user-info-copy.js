const LOCALES = Object.freeze([
  'ar','en','es','de','it','pt','nl','pl','uk','ru','tr','ur','hi','id','ja','ko','vi','th','zh-hans','zh-hant',
]);
const KEYS = ['unknown','id','username','noUsername','details','name','subscription','noPhoto','free','profilePhoto','photoError','guestDatabaseError','guestTelegramError','guestInternalError','guestErrorReference'];
const VALUES = {
  ar: ['ما اعرف هذا الحساب', 'معرّف الحساب', 'اسم المستخدم', 'لا يوجد', 'تفاصيل المستخدم', 'الاسم', 'رتبة الاشتراك', 'لا توجد صورة ملف شخصي', 'مجاني', 'صورة الحساب', 'حدث خطأ أثناء عرض صورة الحساب', 'تعذر تنفيذ طلب المعلومات لأن قاعدة بيانات البوت غير متاحة مؤقتاً.', 'تعذر تنفيذ طلب المعلومات لأن Telegram رفض الطلب.', 'حدث خطأ أثناء تنفيذ طلب المعلومات.', 'رقم التحديث للمراجعة'],
  en: ["I don't know this account", 'Account ID', 'Username', 'None', 'User details', 'Name', 'Subscription tier', 'No profile photo available', 'Free', 'Account photo', 'An error occurred while displaying the profile photo', 'The info request could not run because the bot database is temporarily unavailable.', 'The info request failed because Telegram rejected the request.', 'An internal error occurred while processing the info request.', 'Update reference'],
  es: ['No conozco esta cuenta', 'ID de cuenta', 'Nombre de usuario', 'Ninguno', 'Detalles del usuario', 'Nombre', 'Nivel de suscripción', 'No hay foto de perfil', 'Gratis', 'Foto de la cuenta', 'Ocurrió un error al mostrar la foto de perfil', 'No se pudo completar la solicitud porque la base de datos del bot no está disponible.', 'La solicitud de información falló porque Telegram la rechazó.', 'Se produjo un error interno al procesar la solicitud.', 'Referencia de actualización'],
  de: ['Dieses Konto kenne ich nicht', 'Konto-ID', 'Benutzername', 'Keiner', 'Benutzerdetails', 'Name', 'Abonnementstufe', 'Kein Profilbild verfügbar', 'Kostenlos', 'Kontofoto', 'Beim Anzeigen des Profilbilds ist ein Fehler aufgetreten', 'Die Anfrage ist fehlgeschlagen, weil die Bot-Datenbank vorübergehend nicht verfügbar ist.', 'Telegram hat die Informationsanfrage abgelehnt.', 'Bei der Verarbeitung der Informationsanfrage ist ein interner Fehler aufgetreten.', 'Update-Referenz'],
  it: ['Non conosco questo account', 'ID account', 'Nome utente', 'Nessuno', 'Dettagli utente', 'Nome', 'Livello abbonamento', 'Nessuna foto profilo disponibile', 'Gratis', 'Foto dell’account', 'Si è verificato un errore durante la visualizzazione della foto profilo', 'La richiesta non è riuscita perché il database del bot non è temporaneamente disponibile.', 'Telegram ha rifiutato la richiesta di informazioni.', 'Si è verificato un errore interno durante l’elaborazione della richiesta.', 'Riferimento aggiornamento'],
  pt: ['Não conheço esta conta', 'ID da conta', 'Nome de usuário', 'Nenhum', 'Detalhes do usuário', 'Nome', 'Nível da assinatura', 'Nenhuma foto de perfil disponível', 'Gratuito', 'Foto da conta', 'Ocorreu um erro ao exibir a foto do perfil', 'Não foi possível processar a solicitação porque o banco de dados do bot está indisponível.', 'O Telegram rejeitou a solicitação de informações.', 'Ocorreu um erro interno ao processar a solicitação.', 'Referência da atualização'],
  nl: ['Ik ken dit account niet', 'Account-ID', 'Gebruikersnaam', 'Geen', 'Gebruikersgegevens', 'Naam', 'Abonnementsniveau', 'Geen profielfoto beschikbaar', 'Gratis', 'Accountfoto', 'Er is een fout opgetreden bij het weergeven van de profielfoto', 'Het verzoek is mislukt omdat de botdatabase tijdelijk niet beschikbaar is.', 'Telegram heeft het informatieverzoek geweigerd.', 'Er is een interne fout opgetreden bij het verwerken van het verzoek.', 'Updateverwijzing'],
  pl: ['Nie znam tego konta', 'ID konta', 'Nazwa użytkownika', 'Brak', 'Szczegóły użytkownika', 'Imię i nazwisko', 'Poziom subskrypcji', 'Brak dostępnego zdjęcia profilowego', 'Bezpłatny', 'Zdjęcie konta', 'Wystąpił błąd podczas wyświetlania zdjęcia profilowego', 'Nie udało się obsłużyć żądania, ponieważ baza danych bota jest chwilowo niedostępna.', 'Telegram odrzucił żądanie informacji.', 'Podczas przetwarzania żądania wystąpił błąd wewnętrzny.', 'Identyfikator aktualizacji'],
  uk: ['Я не знаю цей обліковий запис', 'ID облікового запису', "Ім'я користувача", 'Немає', 'Дані користувача', "Ім'я", 'Рівень підписки', 'Фото профілю недоступне', 'Безкоштовний', 'Фото профілю', 'Під час показу фото профілю сталася помилка', 'Не вдалося виконати запит, оскільки база даних бота тимчасово недоступна.', 'Telegram відхилив запит інформації.', 'Під час обробки запиту сталася внутрішня помилка.', 'Посилання на оновлення'],
  ru: ['Я не знаю этот аккаунт', 'ID аккаунта', 'Имя пользователя', 'Нет', 'Данные пользователя', 'Имя', 'Уровень подписки', 'Фото профиля недоступно', 'Бесплатный', 'Фото аккаунта', 'При отображении фото профиля произошла ошибка', 'Не удалось выполнить запрос: база данных бота временно недоступна.', 'Telegram отклонил запрос информации.', 'При обработке запроса произошла внутренняя ошибка.', 'Ссылка на обновление'],
  tr: ['Bu hesabı tanımıyorum', 'Hesap kimliği', 'Kullanıcı adı', 'Yok', 'Kullanıcı bilgileri', 'Ad', 'Abonelik seviyesi', 'Profil fotoğrafı yok', 'Ücretsiz', 'Hesap fotoğrafı', 'Profil fotoğrafı gösterilirken bir hata oluştu', 'Bot veritabanı geçici olarak kullanılamadığı için bilgi isteği işlenemedi.', 'Telegram bilgi isteğini reddetti.', 'İstek işlenirken dahili bir hata oluştu.', 'Güncelleme referansı'],
  ur: ['میں اس اکاؤنٹ کو نہیں جانتا/جانتی', 'اکاؤنٹ آئی ڈی', 'صارف نام', 'کوئی نہیں', 'صارف کی تفصیلات', 'نام', 'سبسکرپشن کی سطح', 'پروفائل تصویر دستیاب نہیں', 'مفت', 'اکاؤنٹ کی تصویر', 'پروفائل تصویر دکھاتے وقت خرابی پیش آئی', 'بوٹ کا ڈیٹابیس عارضی طور پر دستیاب نہیں، اس لیے معلومات کی درخواست مکمل نہیں ہو سکی۔', 'ٹیلیگرام نے معلومات کی درخواست مسترد کر دی۔', 'درخواست پر کارروائی کے دوران اندرونی خرابی پیش آئی۔', 'اپ ڈیٹ حوالہ'],
  hi: ['मैं इस खाते को नहीं जानता/जानती', 'खाता आईडी', 'उपयोगकर्ता नाम', 'कोई नहीं', 'उपयोगकर्ता विवरण', 'नाम', 'सदस्यता स्तर', 'प्रोफ़ाइल फ़ोटो उपलब्ध नहीं', 'मुफ़्त', 'खाते की फ़ोटो', 'प्रोफ़ाइल फ़ोटो दिखाते समय त्रुटि हुई', 'बॉट डेटाबेस अस्थायी रूप से उपलब्ध नहीं है, इसलिए जानकारी का अनुरोध पूरा नहीं हो सका।', 'टेलीग्राम ने जानकारी के अनुरोध को अस्वीकार कर दिया।', 'अनुरोध संसाधित करते समय आंतरिक त्रुटि हुई।', 'अपडेट संदर्भ'],
  id: ['Saya tidak mengenal akun ini', 'ID akun', 'Nama pengguna', 'Tidak ada', 'Detail pengguna', 'Nama', 'Tingkat langganan', 'Foto profil tidak tersedia', 'Gratis', 'Foto akun', 'Terjadi kesalahan saat menampilkan foto profil', 'Permintaan gagal karena basis data bot sementara tidak tersedia.', 'Telegram menolak permintaan informasi.', 'Terjadi kesalahan internal saat memproses permintaan.', 'Referensi pembaruan'],
  ja: ['このアカウントはわかりません', 'アカウント ID', 'ユーザー名', 'なし', 'ユーザー詳細', '名前', 'サブスクリプションの種類', 'プロフィール写真はありません', '無料', 'アカウントの写真', 'プロフィール写真の表示中にエラーが発生しました', 'ボットのデータベースが一時的に利用できないため、情報リクエストを処理できませんでした。', 'Telegram が情報リクエストを拒否しました。', 'リクエストの処理中に内部エラーが発生しました。', '更新参照番号'],
  ko: ['이 계정을 모르겠습니다', '계정 ID', '사용자 이름', '없음', '사용자 정보', '이름', '구독 등급', '프로필 사진 없음', '무료', '계정 사진', '프로필 사진을 표시하는 중 오류가 발생했습니다', '봇 데이터베이스를 일시적으로 사용할 수 없어 정보 요청을 처리할 수 없습니다.', 'Telegram에서 정보 요청을 거부했습니다.', '요청을 처리하는 중 내부 오류가 발생했습니다.', '업데이트 참조'],
  vi: ['Tôi không biết tài khoản này', 'ID tài khoản', 'Tên người dùng', 'Không có', 'Thông tin người dùng', 'Tên', 'Hạng đăng ký', 'Không có ảnh hồ sơ', 'Miễn phí', 'Ảnh tài khoản', 'Đã xảy ra lỗi khi hiển thị ảnh hồ sơ', 'Không thể xử lý yêu cầu vì cơ sở dữ liệu bot tạm thời không khả dụng.', 'Telegram đã từ chối yêu cầu thông tin.', 'Đã xảy ra lỗi nội bộ khi xử lý yêu cầu.', 'Mã tham chiếu cập nhật'],
  th: ['ฉันไม่รู้จักบัญชีนี้', 'ID บัญชี', 'ชื่อผู้ใช้', 'ไม่มี', 'รายละเอียดผู้ใช้', 'ชื่อ', 'ระดับการสมัครสมาชิก', 'ไม่มีรูปโปรไฟล์', 'ฟรี', 'รูปบัญชี', 'เกิดข้อผิดพลาดขณะแสดงรูปโปรไฟล์', 'ไม่สามารถดำเนินการคำขอได้เนื่องจากฐานข้อมูลบอตไม่พร้อมใช้งานชั่วคราว', 'Telegram ปฏิเสธคำขอข้อมูล', 'เกิดข้อผิดพลาดภายในระหว่างประมวลผลคำขอ', 'หมายเลขอ้างอิงการอัปเดต'],
  'zh-hans': ['我不认识这个账户', '账户 ID', '用户名', '无', '用户详情', '姓名', '订阅等级', '没有可用的个人资料照片', '免费', '账户照片', '显示个人资料照片时发生错误', '机器人数据库暂时不可用，无法处理信息请求。', 'Telegram 拒绝了信息请求。', '处理请求时发生内部错误。', '更新参考编号'],
  'zh-hant': ['我不認識這個帳戶', '帳戶 ID', '使用者名稱', '無', '使用者詳細資料', '姓名', '訂閱等級', '沒有可用的個人資料照片', '免費', '帳戶照片', '顯示個人資料照片時發生錯誤', '機器人資料庫暫時無法使用，無法處理資訊要求。', 'Telegram 拒絕了資訊要求。', '處理要求時發生內部錯誤。', '更新參考編號'],
};

for (const locale of LOCALES) {
  if (!Array.isArray(VALUES[locale]) || VALUES[locale].length !== KEYS.length) {
    throw new Error('Incomplete user info translation: ' + locale);
  }
}

function normalizeLocale(languageCode) {
  const tag = String(languageCode || '').trim().toLowerCase().replaceAll('_', '-');
  if (tag.startsWith('zh')) {
    return /(?:^|-)(hant|tw|hk|mo)(?:-|$)/.test(tag) ? 'zh-hant' : 'zh-hans';
  }
  const language = tag.split('-', 1)[0];
  return Object.hasOwn(VALUES, language) ? language : 'en';
}

export function userInfoText(languageCode, key) {
  const index = KEYS.indexOf(key);
  if (index < 0) throw new Error('Unknown user info copy: ' + key);
  return VALUES[normalizeLocale(languageCode)][index];
}

export function buildUserInfoMessage(user, languageCode, {
  photoFileId = '',
  photoError = false,
  subscription = userInfoText(languageCode, 'free'),
} = {}) {
  const id = Number(user?.id);
  const name = [user?.first_name, user?.last_name]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
    .join(' ');
  if (!Number.isSafeInteger(id) || id <= 0) return null;

  const username = typeof user?.username === 'string'
    ? user.username.trim().replace(/^@/, '')
    : '';
  const displayName = name || (username ? '@' + username : String(id));
  const nameLine = '• 👤 ' + userInfoText(languageCode, 'name') + ': ' + displayName;
  const usernameLine = '• 🔗 ' + userInfoText(languageCode, 'username') + ': '
    + (username ? '@' + username : userInfoText(languageCode, 'noUsername'));
  const idLine = '• 🆔 ' + userInfoText(languageCode, 'id') + ': ' + id;
  const subscriptionLine = '• 🎖 ' + userInfoText(languageCode, 'subscription') + ': ' + subscription;
  const photoBlock = photoFileId
    ? {
      type: 'details',
      summary: userInfoText(languageCode, 'profilePhoto'),
      is_open: true,
      blocks: [{
        type: 'photo',
        photo: { type: 'photo', media: photoFileId },
      }],
    }
    : photoError
      ? { type: 'footer', text: userInfoText(languageCode, 'photoError') }
      : null;
  const locale = normalizeLocale(languageCode);
  const blocks = [
    { type: 'paragraph', text: idLine },
    {
      type: 'paragraph',
      text: {
        type: 'button',
        button: { text: '📋 ' + id, copy_text: { text: String(id) } },
      },
    },
    {
      type: 'paragraph',
      text: [
        '• 👤 ' + userInfoText(languageCode, 'name') + ': ',
        { type: 'url', text: displayName, url: 'tg://user?id=' + id },
      ],
    },
    { type: 'paragraph', text: usernameLine },
    { type: 'paragraph', text: subscriptionLine },
  ];
  if (photoBlock) blocks.push({ type: 'divider' }, photoBlock);
  const text = [
    idLine,
    nameLine,
    usernameLine,
    subscriptionLine,
    photoError ? userInfoText(languageCode, 'photoError') : '',
  ].filter(Boolean).join('\n');

  return {
    text,
    rich_message: {
      blocks,
      ...(locale === 'ar' || locale === 'ur' ? { is_rtl: true } : {}),
    },
  };
}
