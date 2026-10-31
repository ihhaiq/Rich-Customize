import { db } from 'sdk';
import { eq } from 'sdk/db';
import { usageUsers } from 'schema';
import { MESSAGE_KEYS, SUPPORTED_LOCALES } from 'lib/i18n-keys';
import { EDITOR_COPY, SOURCE_TRANSLATIONS, UI_TERMS } from 'lib/i18n-source';
import { BOT_PROFILES } from 'lib/bot-profiles';
import { MAIN_AR_BY_EN } from 'lib/main-ar-source';
import enValues from 'lib/lang/en';
import arValues from 'lib/lang/ar';
import { localeValues as germanicValues, tutorialCatalogs as germanicTutorials } from 'lib/lang/germanic';
import { localeValues as romanceValues, tutorialCatalogs as romanceTutorials } from 'lib/lang/romance';
import { localeValues as slavicValues, tutorialCatalogs as slavicTutorials } from 'lib/lang/slavic';
import trValues, { tutorialCatalog as trTutorial } from 'lib/lang/tr';
import urValues, { tutorialCatalog as urTutorial } from 'lib/lang/ur';
import hiValues, { tutorialCatalog as hiTutorial } from 'lib/lang/hi';
import idValues, { tutorialCatalog as idTutorial } from 'lib/lang/id';
import jaValues, { tutorialCatalog as jaTutorial } from 'lib/lang/ja';
import koValues, { tutorialCatalog as koTutorial } from 'lib/lang/ko';
import viValues, { tutorialCatalog as viTutorial } from 'lib/lang/vi';
import thValues, { tutorialCatalog as thTutorial } from 'lib/lang/th';
import zhHansValues, { tutorialCatalog as zhHansTutorial } from 'lib/lang/zh-hans';
import zhHantValues, { tutorialCatalog as zhHantTutorial } from 'lib/lang/zh-hant';

const LANGUAGE_VALUES = Object.freeze({
  en: enValues,
  ar: arValues,
  es: romanceValues.es,
  de: germanicValues.de,
  it: romanceValues.it,
  pt: romanceValues.pt,
  nl: germanicValues.nl,
  pl: slavicValues.pl,
  uk: slavicValues.uk,
  ru: slavicValues.ru,
  tr: trValues,
  ur: urValues,
  hi: hiValues,
  id: idValues,
  ja: jaValues,
  ko: koValues,
  vi: viValues,
  th: thValues,
  'zh-hans': zhHansValues,
  'zh-hant': zhHantValues,
});

export const TUTORIAL_TRANSLATIONS = Object.freeze({
  "de": germanicTutorials.de,
  "es": romanceTutorials.es,
  "hi": hiTutorial,
  "id": idTutorial,
  "it": romanceTutorials.it,
  "ja": jaTutorial,
  "ko": koTutorial,
  "nl": germanicTutorials.nl,
  "pl": slavicTutorials.pl,
  "pt": romanceTutorials.pt,
  "ru": slavicTutorials.ru,
  "th": thTutorial,
  "tr": trTutorial,
  "uk": slavicTutorials.uk,
  "ur": urTutorial,
  "vi": viTutorial,
  "zh-hans": zhHansTutorial,
  "zh-hant": zhHantTutorial,
});

function placeholders(value) {
  return [...String(value ?? '').matchAll(/\{([A-Za-z0-9_]+)\}/g)]
    .map((match) => match[1])
    .sort()
    .join(',');
}

function assertCatalogIntegrity() {
  const expectedCount = MESSAGE_KEYS.length;
  if (new Set(MESSAGE_KEYS).size !== expectedCount) {
    throw new Error('Duplicate localization key detected');
  }

  const supported = [...SUPPORTED_LOCALES].sort();
  const available = Object.keys(LANGUAGE_VALUES).sort();
  if (JSON.stringify(supported) !== JSON.stringify(available)) {
    throw new Error(
      'Localization locale mismatch: supported='
      + supported.join(',')
      + ' available='
      + available.join(','),
    );
  }

  const english = LANGUAGE_VALUES.en;
  if (!Array.isArray(english) || english.length !== expectedCount) {
    throw new Error('English localization catalog is not aligned with MESSAGE_KEYS');
  }

  for (const [locale, values] of Object.entries(LANGUAGE_VALUES)) {
    if (!Array.isArray(values) || values.length !== expectedCount) {
      throw new Error(
        'Localization catalog length mismatch for '
        + locale
        + ': expected '
        + expectedCount
        + ', got '
        + (Array.isArray(values) ? values.length : 'non-array'),
      );
    }
    for (let index = 0; index < expectedCount; index += 1) {
      const value = values[index];
      if (typeof value !== 'string' || !value.length) {
        throw new Error(
          'Missing localization value for '
          + locale
          + ': '
          + MESSAGE_KEYS[index],
        );
      }
      if (placeholders(value) !== placeholders(english[index])) {
        throw new Error(
          'Localization placeholder mismatch for '
          + locale
          + ': '
          + MESSAGE_KEYS[index],
        );
      }
    }
  }
}

assertCatalogIntegrity();

function buildCatalog(values) {
  const catalog = {};
  for (let index = 0; index < MESSAGE_KEYS.length; index += 1) {
    catalog[MESSAGE_KEYS[index]] = values[index];
  }
  return Object.freeze(catalog);
}

const MESSAGES = Object.freeze(Object.fromEntries(
  Object.entries(LANGUAGE_VALUES).map(([locale, values]) => [locale, buildCatalog(values)]),
));

const SUPPORTED = new Set(SUPPORTED_LOCALES);
const RTL = new Set(['ar', 'ur']);

const ENGLISH_KEY_BY_TEXT = new Map(
  Object.entries(MESSAGES.en || {})
    .filter(([, value]) => typeof value === 'string' && value.length)
    .map(([key, value]) => [String(value), key]),
);

function normalizeTag(value) {
  return String(value || '').trim().toLowerCase().replaceAll('_', '-');
}

export function resolveLanguage(languageCode) {
  const code = normalizeTag(languageCode);
  if (!code) return 'en';
  if (code.startsWith('ar')) return 'ar';
  if (code.startsWith('zh')) {
    return /(?:^|[-])(hant|tw|hk|mo)(?:[-]|$)/.test(code) ? 'zh-hant' : 'zh-hans';
  }
  const primary = code.split('-', 1)[0];
  return SUPPORTED.has(primary) ? primary : 'en';
}

export async function resolveUserLanguage(user) {
  const direct = normalizeTag(user?.language_code);
  if (direct) return resolveLanguage(direct);

  const userId = Number(user?.id);
  if (Number.isSafeInteger(userId)) {
    try {
      const row = await db.select({ languageCode: usageUsers.languageCode })
        .from(usageUsers)
        .where(eq(usageUsers.userId, userId))
        .get();
      if (row?.languageCode) return resolveLanguage(row.languageCode);
    } catch (error) {
      console.warn('Could not resolve stored user language', error);
    }
  }
  return 'en';
}

function nativeCommonFallback(language, key) {
  const terms = UI_TERMS[language];
  if (!terms || language === 'en') return null;

  const fixed = {
    customize: terms.settings,
    choose_block: terms.choose + ' · ' + terms.block,
    block_added: terms.add + ' · ' + terms.block,
    welcome: terms.open + ' · ' + terms.settings,
    start_editor: terms.open + ' · /editor',
    send_message: terms.write,
    unsupported: terms.error,
    expired: terms.error,
    add_block: '➕ ' + terms.add + ' · ' + terms.block,
    result: '✅ ' + terms.preview,
    create_post: '📝 ' + terms.write,
    save_page: '💾 ' + terms.page,
    pages: '📚 ' + terms.page,
    edit: '✏️ ' + terms.settings,
    edit_content: '✏️ ' + terms.write,
    delete: '🗑 ' + terms.close,
    move: '↕️ ' + terms.settings,
    back: '🔙 ' + terms.close,
    home: '🏠',
    preview_block: '👁 ' + terms.preview + ' · ' + terms.block,
    preview_generating: terms.preview,
    preview_ready: terms.preview,
    preview_failed: terms.error + ' · ' + terms.preview,
    add_buttons: '🔘 ' + terms.add + ' · ' + terms.button,
    buttons_manage: terms.settings + ' · ' + terms.button,
    add: '➕ ' + terms.add,
    remove: '➖ ' + terms.close,
    color: terms.settings,
    reorder: '↕️ ' + terms.settings,
    change_content: '🧩 ' + terms.write,
    change_title: '✏️ ' + terms.write,
    button_preview: '👁 ' + terms.preview + ' · ' + terms.button,
    post_settings: terms.settings,
    send_now: '📤 ' + terms.write,
    select_chat: terms.choose,
    details: terms.settings,
    photo: '🖼 ' + terms.preview,
    video: '🎬 ' + terms.preview,
    audio: '🎵 ' + terms.preview,
    voice: '🎙 ' + terms.write,
    document: '📄 ' + terms.write,
    table: '▦ ' + terms.settings,
    list: '📋 ' + terms.settings,
    paragraph: '📝 ' + terms.write,
    heading: '🔠 ' + terms.write,
    footer: '🔻 ' + terms.settings,
    divider: '➖',
    map: '🗺 ' + terms.location,
    invalid: terms.error,
    missing_block: terms.error + ' · ' + terms.block,
    choose_action: terms.choose,
    send_file: terms.write,
    send_photo: terms.write + ' · 🖼',
    send_video: terms.write + ' · 🎬',
    send_audio: terms.write + ' · 🎵',
    send_voice: terms.write + ' · 🎙',
    'common.choose_action': terms.choose,
    'common.cancel': terms.close,
    'common.back': '🔙 ' + terms.close,
    'editor.undo_button': '↩️ ' + terms.settings,
    'editor.redo_button': '↪️ ' + terms.settings,
  };
  if (Object.hasOwn(fixed, key)) return fixed[key];

  if (String(key).startsWith('details.')) {
    if (key === 'details.inner_count') return terms.block + ': {count}';
    if (key === 'details.inner_credit') return terms.write;
    return terms.settings;
  }

  if (String(key).startsWith('block.')) {
    const name = String(key).slice('block.'.length);
    const blocks = {
      content: terms.block,
      text: terms.write,
      paragraph: terms.write,
      heading: terms.write,
      preformatted: terms.write,
      footer: terms.settings,
      caption: terms.write,
      photo: '🖼',
      video: '🎬',
      animation: 'GIF',
      audio: '🎵',
      voice: '🎙',
      document: '📄',
      sticker: '🏷',
      video_note: '⭕',
      divider: '➖',
      list: '📋',
      table: '▦',
      blockquote: '❝',
      pullquote: '💬',
      details: terms.settings,
      mathematical_expression: '∑',
      anchor: '⚓',
      collage: '🖼',
      slideshow: '🎞',
      map: '🗺 ' + terms.location,
      buttons: '🔘 ' + terms.button,
    };
    return blocks[name] ?? terms.block;
  }

  if (String(key).startsWith('pages.')) return terms.page;
  return null;
}

function mainArabic(language, englishText) {
  if (language !== 'ar' || englishText == null) return null;
  return MAIN_AR_BY_EN[String(englishText)] ?? null;
}

function localizedCommon(language, key) {
  const english = MESSAGES.en || {};
  const selected = MESSAGES[language] || english;
  const englishText = english[key];
  const direct = selected[key];
  if (language === 'en') return direct ?? englishText;
  const mainText = mainArabic(language, englishText);
  if (mainText != null) return mainText;
  if (direct != null && direct !== englishText) return direct;
  if (englishText != null) {
    const source = SOURCE_TRANSLATIONS[language]?.[String(englishText)];
    if (source != null) return source;
  }
  return nativeCommonFallback(language, key) ?? direct ?? englishText;
}

function detailsFallback(language, key) {
  if (language === 'en' || !String(key).startsWith('details.')) return null;
  const common = (name) => localizedCommon(language, name);
  const values = {
    'details.builder_text': common('details') + '\n\n' + common('details.inner_count') + '\n' + common('common.choose_action'),
    'details.added': common('block_added'),
    'details.summary_prompt': common('details') + ' · ' + common('block.heading'),
    'details.summary_edit_prompt': common('edit') + ' · ' + common('details') + ' · ' + common('block.heading'),
    'details.summary_text_required': common('details') + ' · ' + common('block.heading') + ' · ' + common('invalid'),
    'details.replace_content_prompt': common('edit_content') + ' · ' + common('details'),
    'details.expired': common('expired'),
    'details.choose_child': common('details') + ' · ' + common('add_block'),
    'details.cancelled': common('common.cancel'),
    'details.child_required': common('details') + ' · ' + common('add_block'),
    'details.invalid_child': common('invalid'),
    'details.child_added': common('block_added'),
    'details.choose_heading': common('block.heading') + ' · ' + common('common.choose_action'),
    'details.invalid_heading': common('invalid'),
    'details.heading_selected': 'H{level} · ' + common('block.heading'),
    'details.send_paragraph': common('block.paragraph'),
    'details.send_footer': common('block.footer'),
    'details.send_anchor': common('block.anchor') + ' · ' + common('common.choose_action'),
    'details.send_table': common('block.table'),
    'details.send_quote': common('block.blockquote'),
    'details.send_pullquote': common('block.pullquote'),
    'details.send_collage': common('block.collage'),
    'details.send_slideshow': common('block.slideshow'),
    'details.send_map': common('block.map'),
    'details.send_animation': common('block.animation'),
    'details.send_audio': common('send_audio'),
    'details.send_document': common('send_file'),
    'details.send_photo': common('send_photo'),
    'details.send_video': common('send_video'),
    'details.send_voice': common('send_voice'),
    'details.quote_content_required': common('block.blockquote'),
    'details.quote_credit_prompt': common('details.inner_credit'),
    'details.quote_text_after_media': common('block.blockquote'),
    'details.quote_text_required': common('block.blockquote'),
    'details.quote_credit_required': common('details.inner_credit'),
    'details.wrong_child_content': common('invalid'),
    'details.unsupported_content': common('unsupported'),
  };
  return values[key] ?? null;
}

function uxFallback(language, key) {
  if (language === 'en') return null;
  const terms = UI_TERMS[language];
  if (!terms) return null;
  const common = (name) => localizedCommon(language, name);
  const button = terms.button;
  const pages = common('pages');
  const values = {
    button_preview: '👁 ' + terms.preview + ' · ' + button,
    preview_block: '👁 ' + terms.preview + ' · ' + common('block.content'),
    send_file: terms.write + ' · ' + common('block.document'),
    'ux.editor.title': common('customize'),
    'ux.editor.buttons': button + ': {count}',
    'ux.editor.preview': '👁 ' + terms.preview,
    'ux.buttons.title': common('buttons_manage'),
    'ux.buttons.count': button + ': {count}',
    'ux.buttons.empty': button + ': 0 · ' + common('add_buttons'),
    'ux.buttons.layout': terms.row + ' · ' + button + ': {count}',
    'ux.buttons.summary': button + ' {position} · {title} · {type} · {style}',
    'ux.buttons.edit_title': common('change_title'),
    'ux.buttons.edit_value': common('change_content'),
    'ux.buttons.edit_type': common('edit') + ' · ' + common('common.choose_action'),
    'ux.buttons.delete_confirm': common('delete') + ' “{title}”?',
    'ux.buttons.deleted': common('delete'),
    'ux.buttons.category.links': terms.link,
    'ux.buttons.category.actions': common('common.choose_action'),
    'ux.buttons.category.navigation': '↔ ' + pages,
    'ux.buttons.category.search': terms.search,
    'ux.buttons.category.special': '★',
    'ux.buttons.type.url': '🔗 ' + terms.link,
    'ux.buttons.type.callback': '⚡ callback · ' + button,
    'ux.buttons.type.copy': '📋 ' + terms.copy,
    'ux.buttons.type.popup': '💬 ' + terms.open + ' · ' + button,
    'ux.buttons.type.page': pages,
    'ux.buttons.type.inline': '🔎 ' + terms.search + ' · ' + button,
    'ux.buttons.type.inline_here': '💬 ' + terms.search + ' · ' + terms.location,
    'ux.buttons.type.disabled': '🚫 ' + terms.close + ' · ' + button,
    'ux.buttons.type.web_app': '🌐 ' + terms.open + ' · Web App',
    'ux.buttons.type.login_url': '🔐 Login · ' + terms.link,
    'ux.buttons.style.default': '⚪',
    'ux.buttons.style.primary': '🔵',
    'ux.buttons.style.success': '🟢',
    'ux.buttons.style.danger': '🔴',
    'ux.buttons.style.link': '🔗',
    'ux.buttons.editing': common('edit') + ' · ' + button + ': {title}',
    'ux.buttons.current_type': button + ': {type}',
    'ux.buttons.added': button + ' · ' + common('block_added'),
    'ux.buttons.missing': button + ' · ' + common('missing_block'),
    'ux.buttons.send_new_title': common('change_title'),
    'ux.buttons.send_new_value': common('change_content'),
    'ux.publish.send': common('send_now') + ' · {count}',
    'ux.publish.confirm': common('send_now') + ' · {count}?',
    'ux.publish.confirm_yes': common('send_now'),
    'ux.common.retry': common('editor.redo_button'),
    'ux.pages.restore': common('editor.undo_button') + ' · ' + pages,
    'ux.pages.deleted_recoverable': common('delete') + ' · ' + pages + ' · ' + common('editor.undo_button'),
    'ux.pages.restored': common('editor.undo_button') + ' · ' + pages,
    'ux.pages.restore_unavailable': pages + ' · ' + common('expired'),
    'ux.errors.login_domain': common('invalid') + ' · @BotFather /setdomain',
    'ux.errors.button_data': common('invalid') + ' · callback_data',
    'ux.errors.invalid_url': common('invalid') + ' · HTTPS URL',
    'ux.errors.too_long': common('invalid'),
    'ux.errors.telegram_rejected': terms.error + ': {reason}',
  };
  return values[key] ?? null;
}

function semanticNativeFallback(language, key, englishText) {
  if (language === 'en') return englishText;
  const terms = UI_TERMS[language];
  if (!terms) return null;

  const english = MESSAGES.en || {};
  const common = (name, fallback = terms.settings) => {
    const value = localizedCommon(language, name);
    const source = english[name];
    return value != null && value !== source ? value : fallback;
  };

  const coreFallbacks = {
    customize: terms.settings,
    choose_block: terms.choose + ' · ' + terms.block,
    block_added: terms.add + ' · ' + terms.block,
    welcome: terms.open + ' · ' + terms.settings,
    start_editor: terms.open + ' · /editor',
    send_message: terms.write,
    unsupported: terms.error,
    expired: terms.error,
    add_block: '➕ ' + terms.add + ' · ' + terms.block,
    result: '✅ ' + terms.preview,
    create_post: '📝 ' + terms.write,
    save_page: '💾 ' + terms.page,
    pages: '📚 ' + terms.page,
    edit: '✏️ ' + terms.settings,
    edit_content: '✏️ ' + terms.write,
    delete: '🗑 ' + terms.close,
    move: '↕️ ' + terms.settings,
    back: '🔙 ' + terms.close,
    home: '🏠',
    preview_block: '👁 ' + terms.preview + ' · ' + terms.block,
    preview_generating: terms.preview,
    preview_ready: terms.preview,
    preview_failed: terms.error + ' · ' + terms.preview,
    add_buttons: '🔘 ' + terms.add + ' · ' + terms.button,
    buttons_manage: terms.settings + ' · ' + terms.button,
    add: '➕ ' + terms.add,
    remove: '➖ ' + terms.close,
    color: terms.settings,
    reorder: '↕️ ' + terms.settings,
    change_content: '🧩 ' + terms.write,
    change_title: '✏️ ' + terms.write,
    button_preview: '👁 ' + terms.preview + ' · ' + terms.button,
    post_settings: terms.settings,
    send_now: '📤 ' + terms.write,
    select_chat: terms.choose,
    details: terms.settings,
    photo: '🖼 ' + terms.preview,
    video: '🎬 ' + terms.preview,
    audio: '🎵 ' + terms.preview,
    voice: '🎙 ' + terms.write,
    document: '📄 ' + terms.write,
    table: '▦ ' + terms.settings,
    list: '📋 ' + terms.settings,
    paragraph: '📝 ' + terms.write,
    heading: '🔠 ' + terms.write,
    footer: '🔻 ' + terms.settings,
    divider: '➖',
    map: '🗺 ' + terms.location,
    invalid: terms.error,
    missing_block: terms.error + ' · ' + terms.block,
    choose_action: terms.choose,
    send_file: terms.write,
    send_photo: terms.write + ' · 🖼',
    send_video: terms.write + ' · 🎬',
    send_audio: terms.write + ' · 🎵',
    send_voice: terms.write + ' · 🎙',
  };
  if (Object.hasOwn(coreFallbacks, key)) return coreFallbacks[key];

  const blockMap = {
    content: () => common('paragraph', terms.write),
    text: () => common('paragraph', terms.write),
    paragraph: () => common('paragraph', terms.write),
    heading: () => common('heading', terms.write),
    preformatted: () => terms.write,
    footer: () => common('footer', terms.write),
    caption: () => terms.write,
    photo: () => common('photo', terms.preview),
    video: () => common('video', terms.preview),
    animation: () => '🎞 GIF',
    audio: () => common('audio', terms.preview),
    voice: () => common('voice', terms.preview),
    document: () => common('document', terms.write),
    sticker: () => common('photo', terms.preview),
    video_note: () => common('video', terms.preview),
    divider: () => common('divider', '—'),
    list: () => common('list', terms.settings),
    table: () => common('table', terms.settings),
    blockquote: () => common('paragraph', terms.write),
    pullquote: () => common('paragraph', terms.write),
    details: () => common('details', terms.settings),
    mathematical_expression: () => '∑',
    anchor: () => '⚓ ' + terms.link,
    collage: () => common('photo', terms.preview),
    slideshow: () => common('photo', terms.preview),
    map: () => common('map', terms.location),
    buttons: () => '🔘 ' + terms.button,
  };

  if (String(key).startsWith('block.')) {
    const name = String(key).slice('block.'.length);
    if (blockMap[name]) return blockMap[name]();
    if (name.includes('move_up')) return '⬆️';
    if (name.includes('move_down')) return '⬇️';
    if (name.includes('delete')) return common('delete');
    if (name.includes('edit') || name.includes('manage')) return common('edit');
    return terms.settings;
  }

  if (String(key).startsWith('pages.')) {
    if (key.includes('search')) return '🔎 ' + terms.search + ' · ' + common('pages');
    if (key.includes('sort')) return '⚙️ ' + terms.settings + ' · ' + common('pages');
    if (key.includes('delete')) return common('delete') + ' · ' + common('pages');
    if (key.includes('rename')) return common('edit') + ' · ' + common('pages');
    if (key.includes('copy')) return '📋 ' + terms.copy;
    return common('pages');
  }

  if (String(key).startsWith('list.')) {
    if (key.includes('invalid') || key.includes('missing') || key.includes('empty')) {
      return common('invalid') + ' · ' + common('list');
    }
    if (key.includes('prompt')) return terms.write + ' · ' + common('list');
    if (key.includes('menu') || key.includes('choose')) return terms.choose + ' · ' + common('list');
    return common('list');
  }

  if (String(key).startsWith('anchor.')) {
    if (key.includes('delete')) return common('delete') + ' · ⚓';
    if (key.includes('change') || key.includes('move')) return common('edit') + ' · ⚓';
    if (key.includes('invalid') || key.includes('missing') || key.includes('no_')) return common('invalid') + ' · ⚓';
    if (key.includes('choose')) return terms.choose + ' · ⚓';
    if (key.includes('add')) return terms.add + ' · ⚓';
    return '⚓ ' + terms.link;
  }

  if (String(key).startsWith('table.')) {
    if (key.includes('add')) return terms.add + ' · ' + common('table');
    if (key.includes('edit')) return common('edit') + ' · ' + common('table');
    return terms.settings + ' · ' + common('table');
  }

  if (String(key).startsWith('media.') || String(key).startsWith('quote.')) {
    return common('edit') + ' · ' + terms.settings;
  }

  if (String(key).startsWith('heading.level_')) {
    const level = String(key).split('_').at(-1);
    return 'H' + level + ' · ' + common('heading');
  }

  if (String(key).startsWith('limits.')) {
    return terms.error + ': {limit}';
  }

  if (String(key).startsWith('editor.')) {
    if (key.includes('undo')) return '↩️ ' + common('edit');
    if (key.includes('redo')) return '↪️ ' + common('edit');
    if (key.includes('preview')) return '👁 ' + terms.preview;
    if (key.includes('import')) return terms.add + ' · Rich Message';
    if (key.includes('choose')) return terms.choose;
    if (key.includes('scroll_up')) return '⬆️';
    if (key.includes('scroll_down')) return '⬇️';
    if (key.includes('block_count')) return common('add_block') + ': {count}';
    if (key.includes('tools')) return '🛠 ' + terms.settings;
    if (key.includes('expired')) return common('expired');
    return terms.settings;
  }

  if (String(key).startsWith('publish.')) return common('send_now');
  if (String(key).startsWith('navigation.')) return terms.open;
  if (String(key).startsWith('common.')) {
    if (key.includes('back')) return common('back');
    if (key.includes('cancel')) return common('common.cancel');
    if (key.includes('retry')) return common('editor.redo_button');
    return terms.settings;
  }

  return legacyNativeFallback(language, String(englishText ?? ''));
}

function preserveFallbackContext(text, englishText) {
  let result = String(text ?? '');
  const source = String(englishText ?? '');

  const placeholders = [...new Set(source.match(/\{[A-Za-z0-9_]+\}/g) || [])];
  for (const placeholder of placeholders) {
    if (!result.includes(placeholder)) result += ' · ' + placeholder;
  }

  const technical = [...new Set(
    source.match(/\/[A-Za-z0-9_]+|@[A-Za-z0-9_]+|https?:\/\/[^\s]+|tg:\/\/[^\s]+|callback_data|Web App|CBD|GIF|LaTeX/gi) || [],
  )];
  for (const marker of technical) {
    if (!result.toLowerCase().includes(String(marker).toLowerCase())) {
      result += ' · ' + marker;
    }
  }
  return result;
}

export function t(locale, key, values = null) {
  const language = resolveLanguage(locale);
  const english = MESSAGES.en || {};
  const selected = MESSAGES[language] || english;
  const englishText = english[key];
  let text = mainArabic(language, englishText) ?? selected[key] ?? englishText;
  if (text == null) throw new Error('Unknown i18n key: ' + key);

  if (language !== 'en' && text === englishText) {
    text = preserveFallbackContext(
      SOURCE_TRANSLATIONS[language]?.[String(englishText)]
        ?? detailsFallback(language, key)
        ?? uxFallback(language, key)
        ?? semanticNativeFallback(language, key, englishText)
        ?? legacyNativeFallback(language, String(englishText)),
      englishText,
    );
  }

  text = String(text);
  if (!values || typeof values !== 'object') return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
    Object.hasOwn(values, name) ? String(values[name]) : match
  ));
}

function legacyNativeFallback(language, english) {
  const terms = UI_TERMS[language];
  if (!terms || language === 'en') return english;
  const lowered = String(english).toLowerCase();
  const common = (key) => localizedCommon(language, key) ?? (MESSAGES.en?.[key] || key);

  let feature = lowered.includes('button') ? terms.button : '';
  if (lowered.includes('page')) feature = terms.page;
  else if (lowered.includes('block')) feature = terms.block;
  else if (lowered.includes('table') || lowered.includes('cell') || lowered.includes('row')) {
    feature = common('table');
    if (feature === MESSAGES.en?.table) feature = terms.row;
  }

  let summary;
  if (['invalid','failed',"couldn't",'unavailable','no longer',"doesn't exist"].some((word) => lowered.includes(word))) {
    summary = common('invalid');
  } else if (lowered.includes('choose') || lowered.includes('select')) {
    summary = common('common.choose_action');
  } else if (lowered.includes('send') || lowered.includes('write')) {
    summary = terms.write;
  } else if (lowered.includes('delete') || lowered.includes('remove')) {
    summary = common('delete');
  } else if (lowered.includes('edit') || lowered.includes('change') || lowered.includes('update')) {
    summary = common('edit');
  } else if (lowered.includes('add') || lowered.includes('created')) {
    summary = terms.add;
  } else if (lowered.includes('save') || lowered.includes('saved')) {
    summary = common('save_page');
  } else if (lowered.includes('preview')) {
    summary = terms.preview;
  } else {
    summary = terms.settings;
  }

  if (feature && !summary.includes(feature)) summary += ' · ' + feature;

  const markerRe = /@[A-Za-z0-9_]+|\/[A-Za-z0-9_]+|https?:\/\/|tg:\/\/|callback_data|sendRichMessageDraft|Web App|Inline|Telegram|CBD|Album|GIF|Audio|Ephemeral|Thinking|__VALUE__|\d+(?:[.,]\d+)*(?:\s*(?:MB|bytes?|characters?))?/gi;
  const markers = [...new Set(String(english).match(markerRe) || [])]
    .filter((marker) => !summary.includes(marker));
  if (markers.length) summary += ' · ' + markers.join(' · ');
  return summary;
}

export function tr(locale, source, values = null) {
  const language = resolveLanguage(locale);
  const original = String(source ?? '');
  let text;
  if (language === 'en') {
    text = original;
  } else {
    const exact = mainArabic(language, original)
      ?? EDITOR_COPY[language]?.[original]
      ?? SOURCE_TRANSLATIONS[language]?.[original];
    const semanticKey = ENGLISH_KEY_BY_TEXT.get(original);
    text = exact
      ?? (semanticKey ? t(language, semanticKey) : null)
      ?? legacyNativeFallback(language, original);
  }
  if (!values || typeof values !== 'object') return text;
  return String(text).replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
    Object.hasOwn(values, name) ? String(values[name]) : match
  ));
}

export function hasTranslation(locale, key) {
  const language = resolveLanguage(locale);
  return Object.hasOwn(MESSAGES[language] || {}, key);
}

export function isRtlLocale(locale) {
  return RTL.has(resolveLanguage(locale));
}

export function profileLocale(locale) {
  const language = resolveLanguage(locale);
  if (language === 'zh-hans' || language === 'zh-hant') return 'zh';
  return language;
}

export function botProfile(locale) {
  const language = resolveLanguage(locale);
  return BOT_PROFILES[language] || BOT_PROFILES.en;
}

export function supportedLocales() {
  return [...SUPPORTED_LOCALES];
}


export function tutorialWords(locale, ar, en) {
  const language = resolveLanguage(locale);
  if (language === 'ar') return ar;
  return TUTORIAL_TRANSLATIONS[language]?.[en] ?? en;
}


export function tutorialCopy(locale) {
  const w=(ar,en)=>tutorialWords(locale,ar,en);
  return {
    entry:w('شلون استعمل البوت 🤔','How do I use the bot? 🤔'),
    build:w('أبني منشوري خطوة بخطوة','Build my post step by step'), templates:w('أستعمل قالب جاهز','Use a ready-made layout'), all:w('عرض كل البلوكات 🧩','Explore all blocks 🧩'),
    homeDescription:w('المنشور الغني يتكوّن من بلوكات مثل النص والصورة والجدول. تگدر تضيف أزرار تفتح صفحاتك المحفوظة أو تفعّل وضع الضيف.','A rich post is built from blocks such as text, photos, and tables. Add buttons to open saved pages or enable guest access.'),
    optionsTitle:w('خيارات إضافية','More options'),
    completeOptions:w('منشورك جاهز للمراجعة. افتح «خيارات إضافية» للحفظ وأزرار الصفحات ووضع الضيف، أو أكمل بالمحرر حتى تنشر.','Your post is ready to review. Open “More options” for saving, page buttons, and guest mode, or continue to the editor to publish.'),
    fullPreview:w('هاي معاينة كاملة لمنشورك. عدّل أي بلوك أو أكمل من يصير جاهز.','Full preview of your post. Edit any block, or continue when it is ready.'),
    previewTooLarge:w('المنشور أطول من حد رسالة تليكرام، فما أگدر أعرضه كاملاً هنا. قلّل المحتوى أو كمل تعديله بالمحرر.','This post is too long to show fully in one Telegram message. Edit it to make it shorter, or continue to the editor.'),
    startHint:w('اختَر البداية: نبني منشورك خطوة خطوة، أو تختار قالباً وتعدّله.','Choose a starting point: build step by step or pick a layout to edit.'),
    intro:w('البلوك جزء من منشورك، مثل عنوان أو جدول. اختَر طريقتك، ونرتّب منشورك خطوة بخطوة.','A block is part of your post, such as a heading or table. Choose how you want to begin.'),
    choose:w('شنو تحب تضيف بالبداية؟','What would you like to add first?'),heading:w('عنوان كبير','Large heading'),table:w('جدول','Table'),own:w('أختار بنفسي 🧩','Choose a block 🧩'),
    opinion:w('تريد رأيي؟','Want my suggestion?'),apply:w('طبّق الاقتراح','Apply suggestion'),done:w('أكمل','Continue'),back:w('رجوع','Back'),home:w('قائمة الدليل','Guide menu'),exit:w('أوقف الدليل','Pause guide'),resume:w('كمّل منشوري','Continue my post'),
    preview:w('هاي معاينة منشورك. تگدر تضيف بلوك، أو تعدّل الموجود قبل ما تكمل.','This is your post preview. Add a block or edit the content before continuing.'),
    edit:w('أعدّل المحتوى','Edit content'),undo:w('تراجع عن آخر تعديل','Undo last edit'),select:w('اختَر البلوك اللي تريد تعدّله. التفاصيل والصور الداخلية تظهر أيضاً.','Choose a block to edit, including nested details and images.'),
    template:w('اختَر قالباً حتى تشوف معاينته. محتواه مثال، وتگدر تغيّره بعد الاختيار.','Choose a layout to preview it. You can edit all sample content after selecting it.'),use:w('استعمل هذا القالب','Use this layout'),
    replace:w('عندك منشور بالدليل. استعمال القالب يستبدله؛ تگدر تتراجع عن آخر تغيير. تريد تستبدله؟','You have a guide draft. Applying this layout replaces it; you can undo the last change. Replace it?'),confirm:w('نعم، استبدل','Yes, replace'),
    complete:w('منشورك جاهز للمراجعة. افتح «تريد المزيد👀؟» حتى تتعلّم الحفظ والكود ووضع الضيف، أو انتقل للمحرر للنشر.','Your post is ready to review. Open “Want more? 👀” for saving, page buttons and guest mode, or continue to the editor to publish.'),
    more:w('تريد المزيد👀؟','Want more? 👀'),save:w('حفظ الصفحة','Save page'),cbd:w('استعمال الكود في زر CBD','Use the code in a CBD button'),guest:w('وضع الضيف','Guest mode'),editor:w('أكمل بالمحرر والنشر','Continue in editor / publish'),
    publishHow:w('شلون أنشر؟','How to publish'),publishSteps:w('حتى تنشر: اضغط «أكمل بالمحرر والنشر»، بعدها «أدوات إضافية» ثم «نشر». اختَر قناة أو مجموعة أنت والبوت مشرفين بيها. اضغط «إعدادات وإرسال»، ثم «متابعة إلى التأكيد». راجع المنشور واضغط «نعم، انشر الآن».','To publish: tap “Continue in editor / publish”, then “More tools” > “Publish”. Choose a channel or group where you and the bot are admins. Tap “Settings and Send”, then “Continue to confirmation”. Review the post and tap “Yes, publish now.”'),
    savePrompt:w('الحفظ يخلي منشورك موجود في «صفحاتي». أرسل اسماً واضحاً للصفحة، بحد أقصى 64 حرفاً.','Saving keeps your post in My Pages. Send a clear page name, up to 64 characters.'),saved:w('انحفظت صفحتك ✅ هذا كودها:','Page saved ✅ Your page code:'),
    needSave:w('احفظ الصفحة أولاً حتى تحصل على كودها.','Save the page first to get its code.'),copy:w('نسخ الكود','Copy code'),
    cbdText:w('هذا المثال ينشئ زرّاً يفتح صفحتك المحفوظة. انسخه وضعه داخل نص بلوك، وغيّر اسم الزر إذا تحب. المثال يستعمل كود صفحتك الحقيقي.','This example creates a button that opens your saved page. Copy it into a text block and change the button label if you like. It uses your actual page code.'),
    guestText:w('انسخ المثال وأرسله برسالة داخل مجموعة أو محادثة خاصة غير سرية، والبوت يرد بصفحتك حتى لو مو عضو. المجموعات المحمية من حفظ المحتوى ما تدعم هالطريقة. تگدر تستعمل اسم صفحتك المطابق بدل الكود.','Send this example in a group or a non-secret private chat. The bot replies with your page even if it is not a member. Content-protected groups are not supported. You can also use the exact name of your own page.'),
    paused:w('توقف الدليل، ومنشورك محفوظ حتى ترجع تكمله.','Guide paused. Your draft is kept for your return.'),empty:w('أضف محتوى لمنشورك أولاً.','Add some content first.'),stale:w('هذا الزر من خطوة قديمة. افتح الدليل حتى تكمل آخر خطوة.','This button is from an older step. Open the guide to continue.'),busy:w('لحظة، كاعد نحفظ خطوتك. جرّب مرة ثانية.','Your step is being saved. Please try again.'),
    input:w('أرسل محتوى البلوك حتى تظهر النتيجة هنا.','Send the block content to see the result here.'),tableInput:w('أرسل كل صف بسطر، وافصل الأعمدة بعلامة |. مثال:\nالاسم | السعر\nمنتج | 5000','Send each row on a new line, with | between columns. Example:\nName | Price\nItem | 5000'),
    listInput:w('كل مهمة بسطر. اكتب [x] قبل المهمة المنجزة، و[ ] قبل الباقي.','One task per line. Use [x] for completed tasks and [ ] for pending tasks.'),detailsInput:w('أرسل عنوان التفاصيل. بعدها تگدر تعدّل البلوكات داخلها من «أعدّل المحتوى».','Send the details title. You can then edit its child blocks using Edit content.'),mediaInput:w('أرسل الوسائط المطلوبة. لعرض الشرائح والكولاج أرسل الصور أو الفيديوهات، ثم اضغط «تمت إضافة الصور».','Send the requested media. For slideshows and collages, send photos or videos, then tap Done adding media.'),mediaDone:w('تمت إضافة الصور','Done adding media'),locationInput:w('أرسل موقعاً من مرفقات تليكرام.','Send a location from Telegram attachments.'),
    invalid:w('نوع المحتوى مو مناسب لهالخطوة. اتبع التوضيح وجرب مرة ثانية.','This content does not match the step. Follow the instructions and try again.'),failed:w('تعذّر إكمال العملية. منشورك محفوظ؛ جرّب مرة ثانية.','Could not complete the operation. Your draft is kept; try again.'),limit:w('المحتوى تجاوز حدود باقتك أو حدود الرسالة. قلّل المحتوى وجرب مرة ثانية.','This exceeds your plan or message limits. Reduce the content and try again.'),name:w('اختَر اسماً مختلفاً وغير فارغ، بحد أقصى 64 حرفاً.','Choose a different, non-empty name of up to 64 characters.'),pageLimit:w('وصلت لحد الصفحات المحفوظة. تگدر تكمل بالمحرر وتدير صفحاتك.','You reached the saved-page limit. Continue in the editor to manage your pages.'),
    handoff:w('عندك مسودة مفتوحة بالمحرر. احفظها أو كمّلها أولاً، وبعدها ارجع للدليل. مسودة الدليل باقية.','You have an open editor draft. Save or finish it first, then return here. Your guide draft is kept.'),openExisting:w('افتح مسودتي الحالية','Open my current draft'),
    partial:w('معاينة جزء من المنشور — التنقل ما يغيّر المحتوى المحفوظ.','Preview of part of your post — navigation does not change your draft.'),next:w('التالي','Next'),previous:w('السابق','Previous'),
    templateNames:[w('عنوان وجدول','Heading and table'),w('منشور عادي','Regular post'),w('إعلان','Announcement'),w('عنوان وقائمة مهام','Heading and checklist'),w('وصفة طعام 🍖','Food recipe 🍖')],
  };
}
