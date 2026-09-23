export const BOT_USERNAME = '@RichCustomizebot';
export const SHOWCASE_URL = 'https://t.me/durov/531';
export const UPDATES_URL = 'https://t.me/RichCustomize';
export const SUPPORT_URL = 'https://t.me/+D4cEzE0V7IIwYTcx';
export const ADD_GROUP_URL = 'https://t.me/RichCustomizebot?startgroup=true';

export function welcomeRichMessage(user) {
  const name = String(
    [user?.first_name, user?.last_name].filter(Boolean).join(' ')
    || user?.username
    || user?.id
    || 'صديقي',
  );
  return {
    blocks: [
      { type: 'heading', text: `أهلًا ${name}!`, size: 3 },
      { type: 'footer', text: `- ${BOT_USERNAME}` },
      {
        type: 'paragraph',
        text: [
          'أنشئ وعدّل رسائل Telegram الغنية بسهولة. ',
          { type: 'button', button: { text: 'عرض مثال', url: SHOWCASE_URL } },
        ],
      },
      { type: 'divider' },
      {
        type: 'footer',
        text: [
          'للمساعدة والتحديثات: ',
          { type: 'button', button: { text: 'التحديثات', url: UPDATES_URL } },
          ' و ',
          { type: 'button', button: { text: 'الدعم', url: SUPPORT_URL } },
        ],
      },
    ],
  };
}

export function welcomeKeyboard() {
  return {
    inline_keyboard: [
      [{ text: 'إضافة إلى مجموعة', url: ADD_GROUP_URL }],
      [
        { text: 'المعرض', callback_data: 'r:showcase' },
        { text: 'بدء المحرر', callback_data: 'r:starteditor', style: 'primary' },
      ],
    ],
  };
}

export function editorDashboard(data = {}, notice = '') {
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const buttons = Array.isArray(data.message_buttons) ? data.message_buttons : [];
  const page = data.current_page_title || data.current_page_id || '—';
  return [
    notice || null,
    'تخصيص الرسالة',
    `البلوكات: ${blocks.length}`,
    `الأزرار: ${buttons.length}`,
    `الصفحة المحفوظة: ${page}`,
    '',
    'اختر إجراء.',
  ].filter((line) => line != null).join('\n');
}

export function editorKeyboard(data = {}) {
  const blocks = Array.isArray(data.blocks) ? data.blocks : [];
  const rows = [];
  if (blocks.length) {
    rows.push([{ text: 'معاينة', callback_data: 'r:result', style: 'primary' }]);
  }
  rows.push([
    { text: 'إضافة بلوك', callback_data: 'r:addmenu', style: 'primary' },
    { text: 'نشر', callback_data: 'r:post', style: 'success' },
  ]);
  rows.push([
    { text: 'صفحاتي', callback_data: 'r:pages' },
    { text: 'الأدوات', callback_data: 'r:tools', style: 'primary' },
  ]);
  if (blocks.length) {
    rows.push([{ text: 'حفظ الصفحة', callback_data: 'r:savepage', style: 'success' }]);
  }
  return { inline_keyboard: rows };
}

export function pagesKeyboard(pages, pageIndex = 0, pageSize = 6) {
  const safeSize = Math.max(1, Number(pageSize) || 6);
  const totalScreens = Math.max(1, Math.ceil(pages.length / safeSize));
  const index = Math.min(Math.max(0, Number(pageIndex) || 0), totalScreens - 1);
  const visible = pages.slice(index * safeSize, (index + 1) * safeSize);
  const rows = visible.map((page) => ([
    {
      text: String(page.title || page.page_id),
      callback_data: `r:pageopen:${page.page_id}`,
      style: 'primary',
    },
    { text: 'تسمية', callback_data: `r:prename:${page.page_id}:${index}` },
    { text: 'حذف', callback_data: `r:pdeleteok:${page.page_id}:${index}`, style: 'danger' },
  ]));
  if (totalScreens > 1) {
    rows.push([
      { text: '⬅️', callback_data: `r:pages:${Math.max(0, index - 1)}` },
      { text: `${index + 1}/${totalScreens}`, callback_data: `r:pages:${index}` },
      { text: '➡️', callback_data: `r:pages:${Math.min(totalScreens - 1, index + 1)}` },
    ]);
  }
  rows.push([
    { text: 'بحث', callback_data: 'r:psearch' },
    { text: 'رجوع', callback_data: 'r:back' },
  ]);
  return { reply_markup: { inline_keyboard: rows }, index, totalScreens, visible };
}

export function pagesText(pages, ownedTotal, query = '') {
  const suffix = query ? ` — بحث: ${query}` : '';
  return `صفحاتي: ${ownedTotal}${suffix}\nاختر صفحة.`;
}
