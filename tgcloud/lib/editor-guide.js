import { isRtlLocale, resolveLanguage, t, tr } from 'lib/i18n';

function guideCopy(languageCode) {
  const locale = resolveLanguage(languageCode);
  return {
    locale,
    summary: tr(locale, '📘 Inline button guide — tap to open'),
    syntax: tr(locale, 'Syntax: {button name - function: content #color}'),
    colors: tr(locale, 'Colors: #r red, #b or #p blue, #g green. RED, BLUE, GREEN and Arabic color names are also accepted.'),
    userNote: locale === 'ar'
      ? 'زر USER يفتح منتقي الحسابات؛ اختَر حسابًا لديه @username عام.'
      : tr(locale, 'USER opens Telegram’s account picker; select an account with a public @username.'),
    sections: [
      [tr(locale, '• Link button:'), [tr(locale, '{Button name - T.ME/IHHAI #b}')]],
      [tr(locale, '• User or channel button:'), [tr(locale, '{Profile - USER #p}')]],
      [tr(locale, '• Saved page button:'), [tr(locale, '{Next page - CBD:code #color}')]],
      [tr(locale, '• Alert button:'), [tr(locale, '{Alert - alert: Alert text #color}')]],
      [t(locale, 'ux.buttons.type.callback'), [tr(locale, '{Action - callback_data: action:1 #r}')]],
      [tr(locale, '• Copy button:'), [tr(locale, '{Copy - copy: text to copy #g}')]],
      [t(locale, 'ux.buttons.type.web_app'), ['{Open app - web_app: https://example.com #b}']],
      [t(locale, 'ux.buttons.type.login_url'), ['{Sign in - login_url: https://example.com #b}']],
      [tr(locale, '• Inline search buttons:'), [
        tr(locale, '{Search - switch_inline_query: search words}'),
        tr(locale, '{Search here - switch_inline_query_current_chat: search words}'),
      ]],
      [tr(locale, '• Disabled button:'), [tr(locale, '{Disabled - disabled #r}')]],
      [tr(locale, '• Multiple buttons side by side:'), [
        tr(locale, '{Website - T.ME/IHHAI #b} {Copy - copy: text #g}'),
      ]],
    ],
  };
}

function codeText(value) {
  return { type: 'code', text: value };
}

export function buildEditorGuideRichMessage(prompt, languageCode, options = {}) {
  const copy = guideCopy(languageCode);
  if (options.largeButton) {
    const arabic = copy.locale === 'ar';
    const title = arabic ? '🔘 إضافة زر كبير' : tr(copy.locale, '🔘 Add large button');
    const footer = arabic
      ? 'أرسل تنسيق الزر، وتكدر تعتمد على الدليل داخل البلوكة.'
      : tr(copy.locale, 'Send the button format; use the guide inside the details block if needed.');
    const details = [{ type: 'paragraph', text: copy.syntax }];
    for (const [heading, examples] of copy.sections) {
      details.push({ type: 'paragraph', text: heading });
      details.push({
        type: 'paragraph',
        text: examples.length === 1
          ? codeText(examples[0])
          : examples.flatMap((line, index) => (
              index === 0 ? [codeText(line)] : ['\n', codeText(line)]
            )),
      });
    }
    details.push({ type: 'paragraph', text: copy.userNote });
    details.push({ type: 'paragraph', text: copy.colors });
    return {
      blocks: [
        { type: 'heading', size: 2, text: title },
        { type: 'paragraph', text: footer },
        { type: 'divider' },
        {
          type: 'details',
          summary: copy.summary,
          blocks: details,
        },
      ],
      ...(isRtlLocale(copy.locale) ? { is_rtl: true } : {}),
    };
  }
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
  children.push({ type: 'paragraph', text: copy.userNote });
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
    ...(isRtlLocale(copy.locale) ? { is_rtl: true } : {}),
  };
}

export function editorGuideFallback(prompt, languageCode, options = {}) {
  const copy = guideCopy(languageCode);
  if (options.largeButton) {
    const arabic = copy.locale === 'ar';
    return [
      arabic ? '🔘 إضافة زر كبير' : tr(copy.locale, '🔘 Add large button'),
      '',
      arabic
        ? 'أرسل تنسيق الزر، وتكدر تعتمد على الدليل داخل البلوكة.'
        : tr(copy.locale, 'Send the button format; use the guide inside the details block if needed.'),
      '──────────',
      '',
      copy.summary,
      copy.syntax,
      ...copy.sections.flatMap(([heading, examples]) => ['', heading, ...examples]),
      '',
      copy.userNote,
      '',
      copy.colors,
    ].join('\n');
  }
  const lines = [String(prompt || ''), '', copy.summary, copy.syntax];
  for (const [heading, examples] of copy.sections) {
    lines.push('', heading, ...examples);
  }
  lines.push('', copy.userNote, '', copy.colors);
  return lines.join('\n');
}
