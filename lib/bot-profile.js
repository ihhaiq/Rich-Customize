import { api } from 'sdk';
import { getLegacyState, setLegacyState } from 'lib/backup-import';
import { REMOVED_LOCALES } from 'lib/i18n-data';
import { botProfile, profileLocale, supportedLocales } from 'lib/i18n';

const STATE_NAMESPACE = 'i18n_profile';

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function commands(profile) {
  return [
    { command: 'editor', description: String(profile.commands.editor) },
    { command: 'draft', description: String(profile.commands.draft) },
    { command: 'start', description: String(profile.commands.start) },
  ];
}

function sameCommands(current, desired) {
  if (!Array.isArray(current) || current.length !== desired.length) return false;
  return current.every((item, index) => (
    String(item?.command || '') === desired[index].command
    && String(item?.description || '') === desired[index].description
  ));
}

function configuredProfiles() {
  const result = new Map();
  result.set('', botProfile('en'));

  for (const locale of supportedLocales()) {
    if (locale === 'en') continue;
    const languageCode = profileLocale(locale);
    if (result.has(languageCode)) continue;
    result.set(languageCode, botProfile(locale));
  }
  return result;
}

function signature() {
  return fnv1a(JSON.stringify({
    configured: [...configuredProfiles().entries()],
    removed: [...REMOVED_LOCALES],
  }));
}

async function syncOne(languageCode, profile) {
  let changed = 0;
  const args = languageCode ? { language_code: languageCode } : {};

  const currentName = await api.getMyName(args);
  if (String(currentName?.name || '') !== String(profile.name || '')) {
    await api.setMyName({ ...args, name: String(profile.name || '').slice(0, 64) });
    changed += 1;
  }

  const currentDescription = await api.getMyDescription(args);
  if (String(currentDescription?.description || '') !== String(profile.description || '')) {
    await api.setMyDescription({
      ...args,
      description: String(profile.description || '').slice(0, 512),
    });
    changed += 1;
  }

  const currentShort = await api.getMyShortDescription(args);
  if (String(currentShort?.short_description || '') !== String(profile.short || '')) {
    await api.setMyShortDescription({
      ...args,
      short_description: String(profile.short || '').slice(0, 120),
    });
    changed += 1;
  }

  const desiredCommands = commands(profile);
  const currentCommands = await api.getMyCommands(args);
  if (!sameCommands(currentCommands, desiredCommands)) {
    await api.setMyCommands({ ...args, commands: desiredCommands });
    changed += 1;
  }
  return changed;
}

async function clearLocale(languageCode) {
  if (!/^[a-z]{2}$/.test(String(languageCode || ''))) return 0;
  let changed = 0;
  try {
    const current = await api.getMyName({ language_code: languageCode });
    if (current?.name) {
      await api.setMyName({ language_code: languageCode, name: '' });
      changed += 1;
    }
  } catch {}
  try {
    const current = await api.getMyDescription({ language_code: languageCode });
    if (current?.description) {
      await api.setMyDescription({ language_code: languageCode, description: '' });
      changed += 1;
    }
  } catch {}
  try {
    const current = await api.getMyShortDescription({ language_code: languageCode });
    if (current?.short_description) {
      await api.setMyShortDescription({ language_code: languageCode, short_description: '' });
      changed += 1;
    }
  } catch {}
  try {
    const current = await api.getMyCommands({ language_code: languageCode });
    if (Array.isArray(current) && current.length) {
      await api.deleteMyCommands({ language_code: languageCode });
      changed += 1;
    }
  } catch {}
  return changed;
}

export async function syncBotProfiles({ force = false } = {}) {
  const wantedSignature = signature();
  const state = await getLegacyState(STATE_NAMESPACE);
  if (!force && state?.signature === wantedSignature) {
    return {
      skipped: true,
      changed: 0,
      locales: Number(state.locales || configuredProfiles().size),
      signature: wantedSignature,
    };
  }

  let changed = 0;
  let locales = 0;
  for (const [languageCode, profile] of configuredProfiles()) {
    changed += await syncOne(languageCode, profile);
    locales += 1;
  }

  for (const languageCode of REMOVED_LOCALES) {
    changed += await clearLocale(languageCode);
  }

  await setLegacyState(STATE_NAMESPACE, {
    signature: wantedSignature,
    locales,
    changed,
    updated_at: Math.floor(Date.now() / 1000),
    removed: [...REMOVED_LOCALES],
  });

  return { skipped: false, changed, locales, signature: wantedSignature };
}
