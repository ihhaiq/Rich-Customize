const LOCALES = Object.freeze([
  'ar','en','es','de','it','pt','nl','pl','uk','ru','tr','ur','hi','id','ja','ko','vi','th','zh-hans','zh-hant',
]);
const KEYS = ['unknown','id','username','noUsername'];
const VALUES = {
  ar: ['ما اعرف هذا الحساب', 'معرّف الحساب', 'اسم المستخدم', 'لا يوجد'],
  en: ["I don't know this account", 'Account ID', 'Username', 'None'],
  es: ['No conozco esta cuenta', 'ID de cuenta', 'Nombre de usuario', 'Ninguno'],
  de: ['Dieses Konto kenne ich nicht', 'Konto-ID', 'Benutzername', 'Keiner'],
  it: ['Non conosco questo account', 'ID account', 'Nome utente', 'Nessuno'],
  pt: ['Não conheço esta conta', 'ID da conta', 'Nome de usuário', 'Nenhum'],
  nl: ['Ik ken dit account niet', 'Account-ID', 'Gebruikersnaam', 'Geen'],
  pl: ['Nie znam tego konta', 'ID konta', 'Nazwa użytkownika', 'Brak'],
  uk: ['Я не знаю цей обліковий запис', 'ID облікового запису', "Ім'я користувача", 'Немає'],
  ru: ['Я не знаю этот аккаунт', 'ID аккаунта', 'Имя пользователя', 'Нет'],
  tr: ['Bu hesabı tanımıyorum', 'Hesap kimliği', 'Kullanıcı adı', 'Yok'],
  ur: ['میں اس اکاؤنٹ کو نہیں جانتا/جانتی', 'اکاؤنٹ آئی ڈی', 'صارف نام', 'کوئی نہیں'],
  hi: ['मैं इस खाते को नहीं जानता/जानती', 'खाता आईडी', 'उपयोगकर्ता नाम', 'कोई नहीं'],
  id: ['Saya tidak mengenal akun ini', 'ID akun', 'Nama pengguna', 'Tidak ada'],
  ja: ['このアカウントはわかりません', 'アカウント ID', 'ユーザー名', 'なし'],
  ko: ['이 계정을 모르겠습니다', '계정 ID', '사용자 이름', '없음'],
  vi: ['Tôi không biết tài khoản này', 'ID tài khoản', 'Tên người dùng', 'Không có'],
  th: ['ฉันไม่รู้จักบัญชีนี้', 'ID บัญชี', 'ชื่อผู้ใช้', 'ไม่มี'],
  'zh-hans': ['我不认识这个账户', '账户 ID', '用户名', '无'],
  'zh-hant': ['我不認識這個帳戶', '帳戶 ID', '使用者名稱', '無'],
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

export function buildUserInfoMessage(user, languageCode) {
  const id = Number(user?.id);
  const name = [user?.first_name, user?.last_name]
    .filter((part) => typeof part === 'string' && part.trim())
    .map((part) => part.trim())
    .join(' ');
  if (!Number.isSafeInteger(id) || id <= 0 || !name) return null;

  const username = typeof user?.username === 'string'
    ? user.username.trim().replace(/^@/, '')
    : '';
  const idLine = userInfoText(languageCode, 'id') + ': ' + id;
  const text = [
    idLine,
    name,
    userInfoText(languageCode, 'username') + ': '
      + (username ? '@' + username : userInfoText(languageCode, 'noUsername')),
  ].join('\n');

  return {
    text,
    entities: [{
      type: 'text_link',
      offset: idLine.length + 1,
      length: name.length,
      url: 'tg://user?id=' + id,
    }],
  };
}
