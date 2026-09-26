function now() {
  return Math.floor(Date.now() / 1000);
}

function randomToken() {
  const uuid = crypto.randomUUID?.();
  if (uuid) return String(uuid).replaceAll('-', '').slice(0, 20);
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return [...bytes].map((v) => v.toString(16).padStart(2, '0')).join('');
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

function styleFor(value) {
  const style = String(value || 'default');
  return ['primary', 'success', 'danger'].includes(style) ? style : null;
}

async function rememberPopup(db, token, value) {
  await db.prepare(
    'INSERT INTO popup_states(token, text, updated_at) VALUES(?, ?, ?) '
      + 'ON CONFLICT(token) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at'
  ).bind(String(token), String(value), now()).run();
}

export async function prepareMessageButtons(db, buttons) {
  const prepared = (Array.isArray(buttons) ? buttons : []).map((button) => ({ ...button }));
  for (const button of prepared) {
    if (buttonType(button) !== 'popup') continue;
    const token = randomToken();
    button.popup_token = token;
    await rememberPopup(db, token, buttonValue(button));
  }
  return prepared;
}

function renderButton(button, sourcePageId = null) {
  const common = { text: String(button?.text || '—') };
  const style = styleFor(button?.style);
  if (style) common.style = style;
  const type = buttonType(button);
  const value = buttonValue(button);
  if (type === 'copy') return { ...common, copy_text: { text: value } };
  if (type === 'callback_data') return { ...common, callback_data: value };
  if (type === 'popup') return { ...common, callback_data: 'r:popup:' + String(button.popup_token || button.id || '') };
  if (type === 'web_app') return { ...common, web_app: { url: value } };
  if (type === 'login_url') return { ...common, login_url: { url: value } };
  if (type === 'switch_inline') return { ...common, switch_inline_query: value };
  if (type === 'switch_inline_current') return { ...common, switch_inline_query_current_chat: value };
  if (type === 'disabled') return { ...common, disabled: {} };
  if (type === 'page') {
    const prefix = button?.audience === 'subscribers' ? 'r:spage' : 'r:page';
    const parts = [prefix, value];
    if (sourcePageId) parts.push(String(sourcePageId));
    return { ...common, callback_data: parts.join(':') };
  }
  return { ...common, url: value || 'https://t.me' };
}

export function buildMessageButtonsKeyboard(buttons, { buttonsPerRow = 1, sourcePageId = null } = {}) {
  const ordered = [...(Array.isArray(buttons) ? buttons : [])]
    .sort((a, b) => Number(a?.position || 0) - Number(b?.position || 0));
  const width = Math.max(1, Math.min(8, Number.parseInt(String(buttonsPerRow), 10) || 1));
  const rows = [];
  let row = [];
  for (const button of ordered) {
    row.push(renderButton(button, sourcePageId));
    const limit = Object.hasOwn(button || {}, 'row_end') ? 8 : width;
    if (button?.row_end || row.length >= limit) {
      rows.push(row);
      row = [];
    }
  }
  if (row.length) rows.push(row);
  return { inline_keyboard: rows };
}
