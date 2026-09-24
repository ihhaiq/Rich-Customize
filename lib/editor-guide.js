function language(languageCode) {
  return String(languageCode || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

const GUIDE = {
  en: {
    summary: '📘 Inline button guide — tap to open',
    syntax: 'Syntax: {button name - function: content #color}',
    colors: 'Colors: #r red, #b or #p blue, #g green. RED, BLUE, GREEN and Arabic color names are also accepted.',
    sections: [
      ['• Link button:', ['{Button name - T.ME/IHHAI #b}']],
      ['• User or channel button:', ['{Profile - USER #p}']],
      ['• Saved page button:', ['{Next page - CBD:code #color}']],
      ['• Alert button:', ['{Alert - alert: Alert text #color}']],
      ['• Copy button:', ['{Copy - copy: text to copy #g}']],
      ['• Inline search buttons:', [
        '{Search - switch_inline_query: search words}',
        '{Search here - switch_inline_query_current_chat: search words}',
      ]],
      ['• Disabled button:', ['{Disabled - disabled #r}']],
      ['• Two buttons side by side:', [
        '{Website - T.ME/IHHAI #b} {Copy - copy: text #g}',
      ]],
    ],
  },
  ar: {
    summary: '📘 دليل الأزرار داخل النص — اضغط للفتح',
    syntax: 'الصيغة: {اسم الزر - الوظيفة: المحتوى #اللون}',
    colors: 'الألوان: #r أحمر، #b أو #p أزرق، #g أخضر. وتكدر تستعمل أسماء الألوان أيضًا.',
    sections: [
      ['• زر رابط:', ['{اسم الزر - T.ME/IHHAI #b}']],
      ['• زر مستخدم أو قناة:', ['{الملف - USER #p}']],
      ['• زر صفحة محفوظة:', ['{الصفحة التالية - CBD:code #b}']],
      ['• زر تنبيه:', ['{تنبيه - alert: نص التنبيه #b}']],
      ['• زر نسخ:', ['{نسخ - copy: النص #g}']],
      ['• أزرار البحث:', [
        '{بحث - switch_inline_query: كلمات البحث}',
        '{بحث هنا - switch_inline_query_current_chat: كلمات البحث}',
      ]],
      ['• زر معطل:', ['{معطل - disabled #r}']],
      ['• زرين بجانب بعض:', [
        '{الموقع - T.ME/IHHAI #b} {نسخ - copy: النص #g}',
      ]],
    ],
  },
};

function codeText(value) {
  return { type: 'code', text: value };
}

export function buildEditorGuideRichMessage(prompt, languageCode) {
  const copy = GUIDE[language(languageCode)];
  const children = [
    { type: 'paragraph', text: copy.syntax },
  ];
  for (const [heading, examples] of copy.sections) {
    children.push({ type: 'paragraph', text: heading });
    children.push({
      type: 'paragraph',
      text: examples.length === 1
        ? codeText(examples[0])
        : examples.flatMap((line, index) => (
            index === 0 ? [codeText(line)] : ['\n', codeText(line)]
          )),
    });
  }
  children.push({ type: 'paragraph', text: copy.colors });

  return {
    blocks: [
      { type: 'paragraph', text: String(prompt || '') },
      {
        type: 'details',
        summary: copy.summary,
        blocks: children,
      },
    ],
    ...(language(languageCode) === 'ar' ? { is_rtl: true } : {}),
  };
}

export function editorGuideFallback(prompt, languageCode) {
  const copy = GUIDE[language(languageCode)];
  const lines = [String(prompt || ''), '', copy.summary, copy.syntax];
  for (const [heading, examples] of copy.sections) {
    lines.push('', heading, ...examples);
  }
  lines.push('', copy.colors);
  return lines.join('\n');
}
