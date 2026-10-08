import { db } from 'sdk';
import { eq } from 'sdk/db';
import { legacyStates, popupStates } from 'schema';

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function randomToken() {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return String(uuid).replaceAll('-', '').slice(0, 20);
  return (
    Math.random().toString(16).slice(2)
    + Date.now().toString(16)
    + Math.random().toString(16).slice(2)
  ).slice(0, 20);
}

function buttonType(button) {
  const value = String(button?.type || 'url');
  return new Set([
    'url', 'callback_data', 'copy', 'popup', 'web_app', 'login_url',
    'switch_inline', 'switch_inline_current', 'disabled', 'page',
  ]).has(value) ? value : 'url';
}

function buttonValue(button) {
  if (button?.value != null) return String(button.value);
  return String(button?.url || '');
}

function buttonRows(buttons, width = 1) {
  const ordered = [...(Array.isArray(buttons) ? buttons : [])]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  const safeWidth = Math.max(1, Math.min(8, Number.parseInt(String(width), 10) || 1));
  const rows = [];
  let row = [];
  for (const button of ordered) {
    row.push(button);
    const limit = Object.hasOwn(button || {}, 'row_end') ? 8 : safeWidth;
    if (button?.row_end || row.length >= limit) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  return rows;
}

async function rememberPopup(token, text) {
  await db.insert(popupStates).values({
    token,
    text: String(text),
    updatedAt: nowSeconds(),
  }).onConflictDoUpdate({
    target: popupStates.token,
    set: {
      text: String(text),
      updatedAt: nowSeconds(),
    },
  }).run();
}

export async function getPopupText(token) {
  const id = String(token || '');
  if (!id) return null;

  const row = await db.select().from(popupStates)
    .where(eq(popupStates.token, id)).get();
  if (row) return String(row.text || '');

  const legacy = await db.select({ payload: legacyStates.payload })
    .from(legacyStates)
    .where(eq(legacyStates.namespace, 'button_popups')).get();
  const popups = legacy?.payload?.popups;
  const text = popups && typeof popups === 'object' && !Array.isArray(popups)
    ? popups[id]
    : null;
  if (typeof text !== 'string') return null;

  await db.insert(popupStates).values({
    token: id,
    text,
    updatedAt: nowSeconds(),
  }).onConflictDoUpdate({
    target: popupStates.token,
    set: {
      text,
      updatedAt: nowSeconds(),
    },
  }).run();
  return text;
}

export async function prepareMessageButtons(buttons) {
  const prepared = (Array.isArray(buttons) ? buttons : []).map(
    (button) => ({ ...button }),
  );
  for (const button of prepared) {
    if (buttonType(button) !== 'popup') continue;
    const token = randomToken();
    button.popup_token = token;
    await rememberPopup(token, buttonValue(button));
  }
  return prepared;
}

function styleFor(value) {
  const style = String(value || 'default');
  return ['primary', 'success', 'danger'].includes(style) ? style : null;
}

function renderButton(button, sourcePageId = null, navigationToken = null) {
  const common = { text: String(button?.text || '—') };
  const style = styleFor(button?.style);
  if (style) common.style = style;

  const type = buttonType(button);
  const value = buttonValue(button);

  if (type === 'copy') {
    return { ...common, copy_text: { text: value } };
  }
  if (type === 'callback_data') {
    return { ...common, callback_data: value };
  }
  if (type === 'popup') {
    return {
      ...common,
      callback_data: 'r:popup:' + String(button.popup_token || button.id || ''),
    };
  }
  if (type === 'web_app') {
    return { ...common, web_app: { url: value } };
  }
  if (type === 'login_url') {
    return { ...common, login_url: { url: value } };
  }
  if (type === 'switch_inline') {
    return { ...common, switch_inline_query: value };
  }
  if (type === 'switch_inline_current') {
    return { ...common, switch_inline_query_current_chat: value };
  }
  if (type === 'disabled') {
    return { ...common, disabled: {} };
  }
  if (type === 'page') {
    const prefix = button?.audience === 'subscribers' ? 'r:spage' : 'r:page';
    const parts = [prefix, value];
    if (sourcePageId) {
      parts.push(String(sourcePageId));
      if (navigationToken) parts.push(String(navigationToken));
    }
    return { ...common, callback_data: parts.join(':') };
  }
  return { ...common, url: value || 'https://t.me' };
}

export function buildMessageButtonsKeyboard(
  buttons,
  {
    buttonsPerRow = 1,
    sourcePageId = null,
    navigationToken = null,
    includeBack = false,
    backText = '↩',
  } = {},
) {
  const ordered = [...(Array.isArray(buttons) ? buttons : [])]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  const rendered = ordered.map(
    (button) => renderButton(button, sourcePageId, navigationToken),
  );
  const rows = [];
  let offset = 0;
  for (const row of buttonRows(ordered, buttonsPerRow)) {
    rows.push(rendered.slice(offset, offset + row.length));
    offset += row.length;
  }
  if (includeBack) {
    rows.push([{ text: backText, callback_data: 'r:bpback' }]);
  }
  return { inline_keyboard: rows };
}
