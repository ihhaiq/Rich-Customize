import { db } from 'sdk';
import { eq } from 'sdk/db';
import { usageUsers } from 'schema';
import { BOT_PROFILES, MESSAGES, SOURCE_TRANSLATIONS, SUPPORTED_LOCALES, UI_TERMS } from 'lib/i18n-data';

const SUPPORTED = new Set(SUPPORTED_LOCALES);
const RTL = new Set(['ar', 'ur']);

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

function localizedCommon(language, key) {
  const english = MESSAGES.en || {};
  const selected = MESSAGES[language] || english;
  const englishText = english[key];
  const direct = selected[key];
  if (language === 'en') return direct ?? englishText;
  if (direct != null && direct !== englishText) return direct;
  if (englishText != null) {
    const source = SOURCE_TRANSLATIONS[language]?.[String(englishText)];
    if (source != null) return source;
  }
  return direct ?? englishText;
}

function detailsFallback(language, key) {
  if (language === 'en' || language === 'ar' || !String(key).startsWith('details.')) return null;
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
  if (language === 'en' || language === 'ar') return null;
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

export function t(locale, key, values = null) {
  const language = resolveLanguage(locale);
  const english = MESSAGES.en || {};
  const selected = MESSAGES[language] || english;
  const englishText = english[key];
  let text = selected[key] ?? englishText;
  if (text == null) throw new Error('Unknown i18n key: ' + key);

  if (language !== 'en' && text === englishText) {
    text = detailsFallback(language, key)
      ?? uxFallback(language, key)
      ?? SOURCE_TRANSLATIONS[language]?.[String(englishText)]
      ?? text;
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
  if (lowered.includes('page')) feature = common('pages');
  else if (lowered.includes('block')) feature = common('add_block');
  else if (lowered.includes('table') || lowered.includes('cell') || lowered.includes('row')) feature = common('table');

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
    const exact = SOURCE_TRANSLATIONS[language]?.[original];
    text = exact ?? legacyNativeFallback(language, original);
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
