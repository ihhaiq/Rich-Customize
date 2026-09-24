import { db } from 'sdk';
import { eq } from 'sdk/db';
import { usageUsers } from 'schema';
import { BOT_PROFILES, MESSAGES, SOURCE_TRANSLATIONS, SUPPORTED_LOCALES } from 'lib/i18n-data';

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

export function t(locale, key, values = null) {
  const language = resolveLanguage(locale);
  const english = MESSAGES.en || {};
  const selected = MESSAGES[language] || english;
  let text = selected[key] ?? english[key];
  if (text == null) throw new Error('Unknown i18n key: ' + key);
  text = String(text);
  if (!values || typeof values !== 'object') return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
    Object.hasOwn(values, name) ? String(values[name]) : match
  ));
}

export function tr(locale, source, values = null) {
  const language = resolveLanguage(locale);
  const original = String(source ?? '');
  let text = language === 'en'
    ? original
    : (SOURCE_TRANSLATIONS[language]?.[original] ?? original);
  if (!values || typeof values !== 'object') return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name) => (
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
