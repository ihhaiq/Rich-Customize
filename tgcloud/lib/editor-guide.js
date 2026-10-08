import { isRtlLocale, resolveLanguage, tr } from 'lib/i18n';

function guideCopy(languageCode) {
  const locale = resolveLanguage(languageCode);
  return {
    locale,
    summary: tr(locale, '📘 Inline button guide — tap to open'),
    syntax: tr(locale, 'Syntax: {button name - function: content #color}'),
    colors: tr(locale, 'Colors: #r red, #b or #p blue, #g green. RED, BLUE, GREEN and Arabic color names are also accepted.'),
    sections: [
      [tr(locale, '• Link button:'), [tr(locale, '{Button name - T.ME/IHHAI #b}')]],
      [tr(locale, '• User or channel button:'), [tr(locale, '{Profile - USER #p}')]],
      [tr(locale, '• Saved page button:'), [tr(locale, '{Next page - CBD:code #color}')]],
      [tr(locale, '• Alert button:'), [tr(locale, '{Alert - alert: Alert text #color}')]],
      [tr(locale, '• Copy button:'), [tr(locale, '{Copy - copy: text to copy #g}')]],
      [tr(locale, '• Inline search buttons:'), [
        tr(locale, '{Search - switch_inline_query: search words}'),
        tr(locale, '{Search here - switch_inline_query_current_chat: search words}'),
      ]],
      [tr(locale, '• Disabled button:'), [tr(locale, '{Disabled - disabled #r}')]],
      [tr(locale, '• Two buttons side by side:'), [
        tr(locale, '{Website - T.ME/IHHAI #b} {Copy - copy: text #g}'),
      ]],
    ],
  };
}

function codeText(value) {
  return { type: 'code', text: value };
}

export function buildEditorGuideRichMessage(prompt, languageCode) {
  const copy = guideCopy(languageCode);
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
    ...(isRtlLocale(copy.locale) ? { is_rtl: true } : {}),
  };
}

export function editorGuideFallback(prompt, languageCode) {
  const copy = guideCopy(languageCode);
  const lines = [String(prompt || ''), '', copy.summary, copy.syntax];
  for (const [heading, examples] of copy.sections) {
    lines.push('', heading, ...examples);
  }
  lines.push('', copy.colors);
  return lines.join('\n');
}
